import { watchlistKey, type CloudConfig, type WatchRecord, type WatchlistItem } from '@/types';

/**
 * 远端 JSON → WatchRecord 规范化：
 * 只挑已知字段（未知字段忽略，向后兼容），必填项缺失/类型不对返回 null（脏数据跳过不炸同步）。
 */
export function normalizeRemoteRecord(raw: unknown): WatchRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id : '';
  const tmdbId = typeof r.tmdbId === 'number' ? r.tmdbId : NaN;
  const mediaType = r.mediaType === 'movie' || r.mediaType === 'tv' ? r.mediaType : null;
  if (!id || !Number.isFinite(tmdbId) || !mediaType) return null;

  const watchedDate = typeof r.watchedDate === 'string' ? r.watchedDate : '';
  const titleSnapshot = typeof r.titleSnapshot === 'string' ? r.titleSnapshot : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(watchedDate) || !titleSnapshot) return null;

  return {
    id,
    mediaType,
    tmdbId,
    titleSnapshot,
    watchedDate,
    location: typeof r.location === 'string' ? r.location : '',
    members: Array.isArray(r.members) ? r.members.filter((m): m is string => typeof m === 'string') : [],
    rating: typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5 ? r.rating : null,
    quote: typeof r.quote === 'string' && r.quote ? r.quote : undefined,
    note: typeof r.note === 'string' && r.note ? r.note : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    deleted: r.deleted === true,
  };
}

/** 远端 config.json → CloudConfig；缺失字段按空数组（首次/半配状态） */
export function normalizeRemoteConfig(raw: unknown): CloudConfig {
  if (typeof raw !== 'object' || raw === null) return { members: [], customLocations: [] };
  const r = raw as Record<string, unknown>;
  const members = Array.isArray(r.members) ? r.members.filter((m): m is string => typeof m === 'string') : [];
  const customLocations = Array.isArray(r.customLocations)
    ? r.customLocations.filter((m): m is string => typeof m === 'string')
    : [];
  return { members, customLocations };
}

/**
 * 软合并（同 id 编辑冲突 / 同日同片疑似重复共用）：
 * updatedAt 较新者为主体；成员并集；note/quote 两边都保留（主体在前，去重拼接）。
 */
export function softMerge(local: WatchRecord, remote: WatchRecord): WatchRecord {
  const [main, other] = local.updatedAt >= remote.updatedAt ? [local, remote] : [remote, local];

  const members = [...main.members];
  for (const member of other.members) {
    if (!members.includes(member)) members.push(member);
  }

  function joinText(a: string | undefined, b: string | undefined): string | undefined {
    if (a && b && a !== b) return `${a}\n${b}`;
    return a ?? b;
  }

  return {
    ...main,
    members,
    note: joinText(main.note, other.note),
    quote: joinText(main.quote, other.quote),
    // 合并产物标记更新时间，作为新版本推上云
    updatedAt: new Date().toISOString(),
  };
}

/**
 * config 三向合并（base = 上次同步快照，缺省视为空 = 首次同步退化为并集）：
 * (local ∩ remote) ∪ (local \ base) ∪ (remote \ base)——
 * 基准内条目任一方删除即跟随删除（删除可跨设备传播），基准外条目任一方新增即保留。
 * 顺序：本地顺序在前，云端新增追加到末尾。
 */
export function mergeConfig(
  local: CloudConfig,
  remote: CloudConfig,
  base: CloudConfig = { members: [], customLocations: [] },
): CloudConfig {
  function merge(localList: string[], remoteList: string[], baseList: string[]): string[] {
    const baseSet = new Set(baseList);
    // 两边都在的保留；基准外（新增）的任一边有即保留；基准内单边删除的剔除
    const keep = (item: string) =>
      (localList.includes(item) && remoteList.includes(item)) || !baseSet.has(item);
    const result = localList.filter(keep);
    for (const item of remoteList) {
      if (keep(item) && !result.includes(item)) result.push(item);
    }
    return result;
  }
  return {
    members: merge(local.members, remote.members, base.members),
    customLocations: merge(local.customLocations, remote.customLocations, base.customLocations),
  };
}

/* ---------------- 想看清单（watchlist.json 整文件） ---------------- */

/** 远端 watchlist.json → 规范化清单：逐条校验必填字段，脏数据整条丢弃（不炸同步） */
export function normalizeRemoteWatchlist(raw: unknown): WatchlistItem[] {
  if (!Array.isArray(raw)) return [];
  const items: WatchlistItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const r = entry as Record<string, unknown>;
    const tmdbId = typeof r.tmdbId === 'number' ? r.tmdbId : NaN;
    const mediaType = r.mediaType === 'movie' || r.mediaType === 'tv' ? r.mediaType : null;
    const titleSnapshot = typeof r.titleSnapshot === 'string' ? r.titleSnapshot : '';
    const addedAt = typeof r.addedAt === 'string' ? r.addedAt : '';
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id || !Number.isFinite(tmdbId) || !mediaType || !titleSnapshot || !addedAt) continue;
    const key = watchlistKey({ mediaType, tmdbId });
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id,
      mediaType,
      tmdbId,
      titleSnapshot,
      addedAt,
    });
  }
  return items;
}

/**
 * 想看清单三向合并（base = 上次同步快照，缺省视为空 = 首次同步退化为并集）：
 * 业务键 = mediaType:tmdbId，(local ∩ remote) ∪ (local \ base) ∪ (remote \ base)——
 * 基准内条目任一方删除即跟随删除（跨设备传播），基准外任一方新增即保留；
 * 两边都在的同键条目取 addedAt 较早者（保留最初想看时间）。
 * 输出按 addedAt 升序（稳定序列化，供相等比对与云端存储）。
 */
export function mergeWatchlist(
  local: WatchlistItem[],
  remote: WatchlistItem[],
  base: WatchlistItem[] = [],
): WatchlistItem[] {
  const byKey = (items: WatchlistItem[]) => new Map(items.map((item) => [watchlistKey(item), item]));
  const localMap = byKey(local);
  const remoteMap = byKey(remote);
  const baseKeys = new Set(base.map((item) => watchlistKey(item)));

  const merged = new Map<string, WatchlistItem>();
  for (const [key, item] of localMap) {
    const other = remoteMap.get(key);
    if (other) {
      merged.set(key, earlier(item, other));
    } else if (!baseKeys.has(key)) {
      // 基准外 = 本地新增 → 保留；基准内 = 云端单边删除 → 跟随删除
      merged.set(key, item);
    }
  }
  for (const [key, item] of remoteMap) {
    if (merged.has(key)) continue;
    // 云端独有：基准内 = 本地单边删除 → 跟随删除；基准外 = 云端新增 → 保留
    if (!baseKeys.has(key)) merged.set(key, item);
  }
  return [...merged.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

function earlier(a: WatchlistItem, b: WatchlistItem): WatchlistItem {
  return a.addedAt <= b.addedAt ? a : b;
}
