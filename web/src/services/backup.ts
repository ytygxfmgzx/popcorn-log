import { db } from '@/db/dexie';
import { getAppSettings, saveAppSettings } from '@/db/settings';
import { normalizeRemoteRecord, normalizeRemoteWatchlist } from '@/sync/merge';
import { notifyLocalChange } from '@/sync/schedule';
import { recordCloudFile } from '@/utils/filename';
import { toDateStr } from '@/utils/date';
import { watchlistKey, type MovieMeta, type SyncState, type WatchRecord, type WatchlistItem } from '@/types';

/**
 * 本地数据导出 JSON 备份（IndexedDB 有被系统清除风险，云同步之外的兜底）
 * 不含：WebDAV 凭据（绝不导出）、海报 blob（体积大，可从 TMDB 重新拉取）
 */
export interface BackupFile {
  app: 'popcorn-log';
  /** v2：新增 watchlist；导入侧同时接受 v1（无 watchlist 字段视为空） */
  backupVersion: 2;
  exportedAt: string;
  records: WatchRecord[];
  movies: MovieMeta[];
  watchlist: WatchlistItem[];
  settings: {
    members: string[];
    customLocations: string[];
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const [records, movies, watchlist, appSettings] = await Promise.all([
    db.records.toArray(),
    db.movies.toArray(),
    db.watchlist.toArray(),
    getAppSettings(),
  ]);
  return {
    app: 'popcorn-log',
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    records,
    movies,
    watchlist: [...watchlist].sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    settings: {
      members: appSettings.members,
      customLocations: appSettings.customLocations,
    },
  };
}

export function downloadBackup(backup: BackupFile): void {
  const now = new Date();
  const stamp = `${toDateStr(now).replaceAll('-', '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `popcorn-log-backup-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ---------- 导入（合并式恢复，不清空现有数据） ---------- */

/** 一条待写入的导入记录 */
export interface RestoreItem {
  record: WatchRecord;
  /** 本地底账残留的 etag（该记录曾同步上过云）：push 时走 update 乐观锁 */
  cloudEtag?: string;
}

export interface RestorePlan {
  /** 本地不存在的记录 */
  toAdd: RestoreItem[];
  /** 同 id 且导入方 updatedAt 更新的记录 */
  toUpdate: RestoreItem[];
  /** 同 id 但本地已是相同或更新版本 */
  skipped: number;
  /** 校验失败 / 墓碑 / 文件内重复 id */
  invalid: number;
}

/**
 * 导入裁决（纯函数）：updatedAt 新者胜，与云同步冲突语义一致。
 * 写入侧只需按 toAdd/toUpdate 落库并标 pending，随下一轮 push 上云。
 */
export function planRestore(
  importedRaw: unknown[],
  localRecords: WatchRecord[],
  localSyncStates: SyncState[],
): RestorePlan {
  const localById = new Map(localRecords.map((record) => [record.id, record]));
  const stateById = new Map(localSyncStates.map((state) => [state.recordId, state]));
  const toAdd: RestoreItem[] = [];
  const toUpdate: RestoreItem[] = [];
  let skipped = 0;
  let invalid = 0;
  const seen = new Set<string>();

  for (const raw of importedRaw) {
    const record = normalizeRemoteRecord(raw);
    if (!record || record.deleted || seen.has(record.id)) {
      invalid++;
      continue;
    }
    seen.add(record.id);

    const item: RestoreItem = { record, cloudEtag: stateById.get(record.id)?.cloudEtag };
    const local = localById.get(record.id);
    if (!local) toAdd.push(item);
    else if (record.updatedAt > local.updatedAt) toUpdate.push(item);
    else skipped++;
  }
  return { toAdd, toUpdate, skipped, invalid };
}

export interface RestoreResult {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
  /** 想看清单新增/更新的条数（v1 备份无此数据，恒为 0） */
  watchlistChanged: number;
}

/* ---------- 想看清单导入裁决（纯函数） ---------- */

export interface WatchlistRestorePlan {
  /** 合并后的完整清单（本地 ∪ 导入，同键取 addedAt 较早者），需写库 */
  toWrite: WatchlistItem[];
  /** 导入条数新增/更新了本地（有变化才写库与触发同步） */
  changed: number;
  invalid: number;
}

/** 想看导入（合并式，不删除本地条目）：同片已在列 → 保留最初想看时间（addedAt 较早者） */
export function planWatchlistRestore(
  importedRaw: unknown[],
  localWatchlist: WatchlistItem[],
): WatchlistRestorePlan {
  const byKey = new Map(localWatchlist.map((item) => [watchlistKey(item), item]));
  const imported = normalizeRemoteWatchlist(importedRaw);
  let changed = 0;
  let invalid = importedRaw.length - imported.length;

  for (const item of imported) {
    const key = watchlistKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      changed++;
    } else if (item.addedAt < existing.addedAt) {
      byKey.set(key, item); // 导入方更早想看，保留导入的 addedAt（其余快照字段随之）
      changed++;
    }
  }
  return {
    toWrite: [...byKey.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt)),
    changed,
    invalid,
  };
}

/**
 * 导入 JSON 备份（合并式）：
 * - 记录按 planRestore 裁决落库，底账标 pending（同 saveRecord 模式），自动触发云同步 push；
 * - 想看清单按业务键并入本地（同片取较早 addedAt），随 watchlist 对账上云；
 * - 影片元数据为纯缓存，轻校验后直接覆盖；
 * - 成员/地点并入本地设置（本地顺序在前），随 config 对账上云。
 */
export async function restoreBackup(file: File): Promise<RestoreResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('备份文件解析失败，请确认选择的是导出的 JSON 备份');
  }
  const raw = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (
    raw.app !== 'popcorn-log' ||
    (raw.backupVersion !== 1 && raw.backupVersion !== 2) ||
    !Array.isArray(raw.records)
  ) {
    throw new Error('不是有效的 Popcorn Log 备份文件');
  }
  const importedSettings = (typeof raw.settings === 'object' && raw.settings !== null
    ? raw.settings
    : {}) as Record<string, unknown>;
  const strList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

  const [localRecords, localSyncStates] = await Promise.all([
    db.records.toArray(),
    db.syncStates.toArray(),
  ]);
  const plan = planRestore(raw.records, localRecords, localSyncStates);

  const items = [...plan.toAdd, ...plan.toUpdate];
  await db.transaction('rw', db.records, db.syncStates, async () => {
    if (!items.length) return;
    await db.records.bulkPut(items.map(({ record }) => record));
    await db.syncStates.bulkPut(
      items.map(({ record, cloudEtag }) => ({
        recordId: record.id,
        cloudFile: recordCloudFile(record),
        cloudEtag,
        status: 'pending',
        pendingOp: cloudEtag ? ('update' as const) : ('create' as const),
      })),
    );
  });

  const validMovies = (Array.isArray(raw.movies) ? raw.movies : []).filter(
    (movie): movie is MovieMeta =>
      typeof movie === 'object' &&
      movie !== null &&
      typeof (movie as MovieMeta).key === 'string' &&
      (movie as MovieMeta).key !== '' &&
      typeof (movie as MovieMeta).tmdbId === 'number',
  );
  if (validMovies.length) await db.movies.bulkPut(validMovies);

  // 想看清单并入本地（v1 备份无 watchlist 字段 → 空数组，仅跳过）
  const watchlistPlan = planWatchlistRestore(
    Array.isArray(raw.watchlist) ? raw.watchlist : [],
    await db.watchlist.toArray(),
  );
  if (watchlistPlan.changed) {
    await db.watchlist.bulkPut(watchlistPlan.toWrite);
  }

  const current = await getAppSettings();
  const members = [...current.members];
  for (const member of strList(importedSettings.members)) {
    if (!members.includes(member)) members.push(member);
  }
  const customLocations = [...current.customLocations];
  for (const location of strList(importedSettings.customLocations)) {
    if (!customLocations.includes(location)) customLocations.push(location);
  }
  await saveAppSettings({ members, customLocations });

  if (items.length || watchlistPlan.changed) notifyLocalChange();

  return {
    added: plan.toAdd.length,
    updated: plan.toUpdate.length,
    skipped: plan.skipped,
    invalid: plan.invalid,
    watchlistChanged: watchlistPlan.changed,
  };
}
