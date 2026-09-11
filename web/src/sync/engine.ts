import { db } from '@/db/dexie';
import { getCredentials, isCredentialsComplete } from '@/db/credentials';
import { getAppSettings, saveAppSettings } from '@/db/settings';
import { migrateLegacyTombstones } from '@/db/records';
import { applyWatchlist } from '@/db/watchlist';
import { getCloudStore, withBackoff, CloudError, type CloudStore, type FetchedFile, type PutResult } from '@/services/cloud';
import { fetchAndCacheMovie } from '@/services/tmdb';
import { chunk, diffRemote, planRemoteDeletions } from './diff';
import { mergeConfig, mergeWatchlist, normalizeRemoteConfig, normalizeRemoteRecord, normalizeRemoteWatchlist } from './merge';
import { recordCloudFile } from '@/utils/filename';
import { movieKey, watchlistKey, type CloudConfig, type SyncState, type WatchRecord, type WatchlistItem } from '@/types';

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

/** 推送参数：create 直接 PUT；update 携带 If-Match 乐观锁（etag 缺失退化为无锁直推）。
 *  delete 意向不经此函数，由 pushPhase 直接物理删除云端对象。 */
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
    await migrateLegacyTombstones(); // 旧协议墓碑 → 物理删除意向，随本轮 push 清理
    const store = await getCloudStore();
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0 };
    await pullPhase(store, summary);
    await pushPhase(store, summary);
    await configPhase(store);
    await watchlistPhase(store);
    await saveAppSettings({ lastSyncedAt: new Date().toISOString() });
    return summary;
  } finally {
    running = false;
  }
}

/** 拉取：1 次清单 → 与底账 diff → 仅下载新增/变更（分批 + 退避）→ 云端已消失的 synced 记录跟随删除本地 */
async function pullPhase(store: CloudStore, summary: SyncSummary): Promise<void> {
  const remote = await withBackoff(() => store.listRecords());
  const localStates = await db.syncStates.toArray();
  const { toDownload } = diffRemote(remote, localStates);

  // 云端删除跟随：synced 且清单中已消失 → 物理删本地（安全阀与 pending/conflict 例外见 planRemoteDeletions）
  for (const recordId of planRemoteDeletions(remote, localStates)) {
    await db.transaction('rw', db.records, db.syncStates, async () => {
      await db.records.delete(recordId);
      await db.syncStates.delete(recordId);
    });
  }

  const batches = chunk(toDownload, 20);
  for (const [index, batch] of batches.entries()) {
    if (index > 0) await sleep(300); // 首次全量批间停顿，防打满存储服务限额
    for (const meta of batch) {
      await withBackoff(async () => {
        const fetched = await store.fetchFile(meta.file);
        if (!fetched.text) return; // 清单后、下载前被对方删掉，本轮跳过，下轮对账跟随
        const record = normalizeRemoteRecord(safeJsonParse(fetched.text));
        if (!record) return; // 脏数据跳过，不炸整轮同步

        if (record.deleted) {
          // 遗留墓碑文件：物理清掉云端；本地 synced/不存在则一并删净，pending 则留给 push 转 412 冲突
          await store.deleteFile(meta.file);
          const localState = await db.syncStates.get(record.id);
          if (!localState || localState.status !== 'pending') {
            await db.transaction('rw', db.records, db.syncStates, async () => {
              await db.records.delete(record.id);
              await db.syncStates.delete(record.id);
            });
          }
          return;
        }

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

/** 推送：pending 逐条上传；delete 意向物理删云端对象；412 → 标 conflict 等人工裁决 */
async function pushPhase(store: CloudStore, summary: SyncSummary): Promise<void> {
  const pendingStates = await db.syncStates.filter((state) => state.status === 'pending').toArray();
  for (const state of pendingStates) {
    if (state.pendingOp === 'delete') {
      // 删除意向：物理删云端对象（404 = 本就不存在，幂等成功），成功后清底账；
      // 失败抛错保留底账下轮重试（防云端残留被下轮 pull 拉回复活）
      await withBackoff(async () => {
        if (state.cloudFile) await store.deleteFile(state.cloudFile);
        await db.syncStates.delete(state.recordId);
      });
      continue;
    }
    const record = await db.records.get(state.recordId);
    if (!record) {
      // 底账有、记录无且非删除意向的异常残留，清掉
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
 * config.json 对账（members + customLocations，三向合并，删除可传播）：
 * 以 configSyncedSnapshot 为基准合并本地与云端——单边删除跟随删除、单边新增保留（无快照=首次，退化为并集）；
 * 合并结果与本地不一致 → 写本地（liveQuery 自动刷 UI）；
 * 本地有变化、或合并结果与云端不同 → 整文件上传（If-Match），412 重拉以同一基准再合并重试一次。
 */
async function configPhase(store: CloudStore): Promise<void> {
  const app = await getAppSettings();
  const local: CloudConfig = { members: app.members, customLocations: app.customLocations };
  const base: CloudConfig = app.configSyncedSnapshot ?? EMPTY_CONFIG;
  const fetched = await store.fetchFile('config.json');
  const remote: CloudConfig | null = fetched.text
    ? normalizeRemoteConfig(safeJsonParse(fetched.text))
    : null;

  const merged = mergeConfig(local, remote ?? EMPTY_CONFIG, base);
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
  let uploaded = finalConfig;
  let uploadedEtag = fetched.etag;
  if (result.conflict) {
    // 对方刚改过：重拉 → 以同一基准再合并 → 带新 etag 重试一次
    const fresh = await store.fetchFile('config.json');
    const freshRemote = fresh.text ? normalizeRemoteConfig(safeJsonParse(fresh.text)) : null;
    const retry = mergeConfig(finalConfig, freshRemote ?? EMPTY_CONFIG, base);
    await saveAppSettings({
      members: retry.members,
      customLocations: retry.customLocations,
    });
    uploaded = retry;
    uploadedEtag = fresh.etag;
    result = await store.putFileText('config.json', JSON.stringify(retry), fresh.etag);
  }
  if (result.ok) {
    await saveAppSettings({
      configEtag: result.etag ?? uploadedEtag,
      configSyncedSnapshot: uploaded,
    });
  }
  // 再冲突就留给下一轮（数据无损）
}

const EMPTY_CONFIG: CloudConfig = { members: [], customLocations: [] };

/**
 * watchlist.json 对账（想看清单，三向合并，删除可传播）：
 * 语义同 configPhase——以 watchlistSyncedSnapshot 为基准合并本地与云端，
 * 合并结果与本地不一致 → 重写本地表（liveQuery 自动刷 UI）；
 * 本地有变化、或合并结果与云端不同 → 整文件上传（If-Match），412 重拉同基准再合并重试一次。
 * 403 = 旧版 Worker 尚未放行 watchlist.json：静默跳过本轮（本地数据无损，部署后自动恢复）。
 */
async function watchlistPhase(store: CloudStore): Promise<void> {
  const fetched = await fetchWatchlistFile(store);
  if (fetched === null) return; // 旧版 Worker 不认识该 key，等部署后下轮再试

  const app = await getAppSettings();
  const local = await db.watchlist.toArray();
  const base = app.watchlistSyncedSnapshot ?? [];
  const remote = fetched.text ? normalizeRemoteWatchlist(safeJsonParse(fetched.text)) : null;

  const merged = mergeWatchlist(local, remote ?? [], base);
  const remoteHasNew = !watchlistEquals(merged, local);
  if (remoteHasNew) {
    await applyWatchlist(merged);
  }
  const finalList = remoteHasNew ? merged : local;

  const localDirty =
    !app.watchlistSyncedSnapshot || !watchlistEquals(local, app.watchlistSyncedSnapshot);
  const remoteExists = remote !== null;
  const cloudUpToDate = remoteExists && watchlistEquals(finalList, remote) && !localDirty;
  if (cloudUpToDate) {
    if (fetched.etag !== app.watchlistEtag) {
      await saveAppSettings({ watchlistEtag: fetched.etag, watchlistSyncedSnapshot: finalList });
    }
    return;
  }
  if (!remoteExists && !localDirty) return; // 两边都空，无需上传

  // 云端已有文件 → If-Match；新建 → 无锁创建；403 = 旧版 Worker，静默跳过
  const ifMatch = remoteExists ? (fetched.etag ?? app.watchlistEtag) : undefined;
  let result = await putWatchlistFile(store, finalList, ifMatch);
  if (!result) return;
  let uploaded = finalList;
  let uploadedEtag = fetched.etag;
  if (result.conflict) {
    // 对方刚改过：重拉 → 以同一基准再合并 → 带新 etag 重试一次
    const fresh = await store.fetchFile('watchlist.json');
    const freshRemote = fresh.text ? normalizeRemoteWatchlist(safeJsonParse(fresh.text)) : null;
    const retry = mergeWatchlist(finalList, freshRemote ?? [], base);
    if (!watchlistEquals(retry, finalList)) {
      await applyWatchlist(retry);
    }
    uploaded = retry;
    uploadedEtag = fresh.etag;
    result = await putWatchlistFile(store, retry, fresh.etag);
    if (!result) return;
  }
  if (result.ok) {
    await saveAppSettings({
      watchlistEtag: result.etag ?? uploadedEtag,
      watchlistSyncedSnapshot: uploaded,
    });
  }
  // 再冲突就留给下一轮（数据无损）
}

/** GET watchlist.json；403（旧版 Worker 未放行该 key）返回 null 跳过本轮 */
async function fetchWatchlistFile(store: CloudStore): Promise<FetchedFile | null> {
  try {
    return await store.fetchFile('watchlist.json');
  } catch (error) {
    if (error instanceof CloudError && error.status === 403) return null;
    throw error;
  }
}

/** PUT watchlist.json；403 同上，返回 null 静默跳过 */
async function putWatchlistFile(
  store: CloudStore,
  items: WatchlistItem[],
  ifMatch?: string,
): Promise<PutResult | null> {
  try {
    return await store.putFileText('watchlist.json', JSON.stringify(items), ifMatch);
  } catch (error) {
    if (error instanceof CloudError && error.status === 403) return null;
    throw error;
  }
}

/** 清单比对：业务键集合 + addedAt 一致即视为相同（顺序无关，字段顺序不影响） */
function watchlistEquals(a: WatchlistItem[], b: WatchlistItem[]): boolean {
  if (a.length !== b.length) return false;
  const signature = (items: WatchlistItem[]) =>
    items
      .map((item) => `${watchlistKey(item)}\u0000${item.addedAt}`)
      .sort()
      .join('\u0001');
  return signature(a) === signature(b);
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
