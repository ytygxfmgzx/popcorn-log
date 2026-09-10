import { db } from '@/db/dexie';
import { getCredentials, isCredentialsComplete } from '@/db/credentials';
import { getAppSettings, saveAppSettings } from '@/db/settings';
import { getCloudStore, withBackoff, CloudError, type CloudStore, type PutResult } from '@/services/cloud';
import { fetchAndCacheMovie } from '@/services/tmdb';
import { chunk, diffRemote } from './diff';
import { mergeConfig, normalizeRemoteConfig, normalizeRemoteRecord } from './merge';
import { recordCloudFile } from '@/utils/filename';
import { movieKey, type CloudConfig, type SyncState, type WatchRecord } from '@/types';

/** 一轮同步的结果汇总（手动同步后 toast 展示用） */
export interface SyncSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
}

export function isSyncing(): boolean {
  return running;
}

/* ---------------- 决策纯函数（spec 覆盖） ---------------- */

/** 推送参数：create 直接 PUT；update/delete 携带 If-Match 乐观锁（etag 缺失退化为无锁直推） */
export function planPush(state: SyncState, record: Pick<WatchRecord, 'watchedDate' | 'id'>): {
  file: string;
  ifMatch?: string;
} {
  const file = state.cloudFile ?? recordCloudFile(record);
  const isCreate = state.pendingOp === 'create';
  const ifMatch = !isCreate ? state.cloudEtag : undefined;
  return { file, ifMatch };
}

/** 拉取入库决策：本地同 id 有未推送的修改 → 冲突待裁决（绝不静默覆盖）；否则云端版直接生效 */
export function decidePull(localState: SyncState | undefined): 'apply' | 'conflict' {
  return localState?.status === 'pending' ? 'conflict' : 'apply';
}

/* ---------------- 同步引擎 ---------------- */

let running = false;

/**
 * 一轮完整同步（先拉后推 + config 对账）。执行互斥：已在跑则直接返回 null。
 * 未配置云同步返回 null（调用方静默，不打扰）。
 */
export async function runSync(): Promise<SyncSummary | null> {
  if (running) return null;
  const credentials = await getCredentials();
  if (!isCredentialsComplete(credentials)) return null;

  running = true;
  try {
    const store = await getCloudStore();
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0 };
    await pullPhase(store, summary);
    await pushPhase(store, summary);
    await configPhase(store);
    await saveAppSettings({ lastSyncedAt: new Date().toISOString() });
    return summary;
  } finally {
    running = false;
  }
}

/** 拉取：1 次清单 → 与底账 diff → 仅下载新增/变更（分批 + 退避） */
async function pullPhase(store: CloudStore, summary: SyncSummary): Promise<void> {
  const remote = await withBackoff(() => store.listRecords());
  const localStates = await db.syncStates.toArray();
  const { toDownload } = diffRemote(remote, localStates);

  const batches = chunk(toDownload, 20);
  for (const [index, batch] of batches.entries()) {
    if (index > 0) await sleep(300); // 首次全量批间停顿，防打满存储服务限额
    for (const meta of batch) {
      await withBackoff(async () => {
        const fetched = await store.fetchFile(meta.file);
        if (!fetched.text) return; // 对方物理删除（协议内不会，防御）
        const record = normalizeRemoteRecord(safeJsonParse(fetched.text));
        if (!record) return; // 脏数据跳过，不炸整轮同步

        const localState = await db.syncStates.get(record.id);
        if (localState && decidePull(localState) === 'conflict') {
          await db.syncStates.put({ ...localState, cloudFile: meta.file, status: 'conflict' });
          summary.conflicts++;
          return;
        }
        await db.transaction('rw', db.records, db.syncStates, async () => {
          await db.records.put(record);
          await db.syncStates.put({
            recordId: record.id,
            cloudFile: meta.file,
            cloudEtag: meta.etag ?? fetched.etag,
            status: 'synced',
          });
        });
        summary.pulled++;
        void ensureMovieMeta(record); // 元数据/海报后台补齐，失败不阻塞
      });
    }
  }
}

/** 推送：pending 逐条上传；412 → 标 conflict 等人工裁决 */
async function pushPhase(store: CloudStore, summary: SyncSummary): Promise<void> {
  const pendingStates = await db.syncStates.filter((state) => state.status === 'pending').toArray();
  for (const state of pendingStates) {
    const record = await db.records.get(state.recordId);
    if (!record) {
      // 底账有、记录无的异常残留，清掉
      await db.syncStates.delete(state.recordId);
      continue;
    }
    const { file, ifMatch } = planPush(state, record);
    await withBackoff(async () => {
      let usedFile = file;
      let result: PutResult;
      try {
        result = await store.putFileText(file, JSON.stringify(record), ifMatch);
      } catch (error) {
        // 403 = key 非法：底账 cloudFile 疑为历史脏值，按记录现算文件名无锁重试一次（自愈）
        if (error instanceof CloudError && error.status === 403) {
          usedFile = recordCloudFile(record);
          result = await store.putFileText(usedFile, JSON.stringify(record), undefined);
        } else {
          throw error;
        }
      }
      if (result.conflict) {
        await db.syncStates.put({ ...state, status: 'conflict' });
        summary.conflicts++;
        return;
      }
      await db.syncStates.put({
        recordId: state.recordId,
        cloudFile: usedFile,
        // 上传响应缺 etag 时保留旧值 → 下轮清单比对会多拉一次自愈
        cloudEtag: result.etag ?? state.cloudEtag,
        status: 'synced',
      });
      summary.pushed++;
    });
  }
}

/**
 * config.json 对账（members + customLocations，并集合并）：
 * 云端有本地没有的条目 → 写本地（liveQuery 自动刷 UI）；
 * 本地相对上次快照有变化、或云端有更新 → 整文件上传（If-Match），412 重拉并集重试一次。
 */
async function configPhase(store: CloudStore): Promise<void> {
  const app = await getAppSettings();
  const local: CloudConfig = { members: app.members, customLocations: app.customLocations };
  const fetched = await store.fetchFile('config.json');
  const remote: CloudConfig | null = fetched.text
    ? normalizeRemoteConfig(safeJsonParse(fetched.text))
    : null;

  const merged = mergeConfig(local, remote ?? { members: [], customLocations: [] });
  const remoteHasNew = !configEquals(merged, local);
  if (remoteHasNew) {
    await saveAppSettings({ members: merged.members, customLocations: merged.customLocations });
  }
  const finalConfig = remoteHasNew ? merged : local;

  const localDirty = !app.configSyncedSnapshot || !configEquals(local, app.configSyncedSnapshot);
  const remoteExists = remote !== null;
  const cloudUpToDate = remoteExists && configEquals(finalConfig, remote) && !localDirty;
  if (cloudUpToDate) {
    // 云端内容与本地一致，仅刷新底账 etag 与快照
    if (fetched.etag !== app.configEtag) {
      await saveAppSettings({ configEtag: fetched.etag, configSyncedSnapshot: finalConfig });
    }
    return;
  }
  if (!remoteExists && !localDirty) return; // 两边都空，无需上传

  // 云端已有文件 → If-Match；新建 → 无锁创建
  const ifMatch = remoteExists ? (fetched.etag ?? app.configEtag) : undefined;
  let result = await store.putFileText('config.json', JSON.stringify(finalConfig), ifMatch);
  if (result.conflict) {
    // 对方刚改过：重拉 → 再并集 → 带新 etag 重试一次
    const fresh = await store.fetchFile('config.json');
    const freshRemote = fresh.text ? normalizeRemoteConfig(safeJsonParse(fresh.text)) : null;
    const retry = mergeConfig(finalConfig, freshRemote ?? { members: [], customLocations: [] });
    await saveAppSettings({
      members: retry.members,
      customLocations: retry.customLocations,
    });
    result = await store.putFileText('config.json', JSON.stringify(retry), fresh.etag);
    if (result.conflict) return; // 再冲突就留给下一轮（数据无损）
  }
  if (result.ok) {
    await saveAppSettings({
      configEtag: result.etag ?? fetched.etag,
      configSyncedSnapshot: remoteHasNew ? merged : local,
    });
  }
}

function configEquals(a: CloudConfig, b: CloudConfig): boolean {
  return (
    a.members.join('\u0000') === b.members.join('\u0000') &&
    a.customLocations.join('\u0000') === b.customLocations.join('\u0000')
  );
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 新入库记录若无本地元数据缓存 → 后台拉 TMDB（离线/弱网静默跳过） */
async function ensureMovieMeta(record: WatchRecord): Promise<void> {
  try {
    const cached = await db.movies.get(movieKey(record.mediaType, record.tmdbId));
    if (!cached) {
      await fetchAndCacheMovie(record.mediaType, record.tmdbId);
    }
  } catch {
    // 元数据补齐失败不影响同步正确性，下次同步还会再试
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
