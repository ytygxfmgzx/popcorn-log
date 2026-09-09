import type { WatchRecord } from '@/types';

/**
 * 同片观看序列（纯本地，不依赖同步）：
 * 影片唯一标识 = mediaType + tmdbId；同片多次观看 = 多条独立记录。
 */

export function viewingGroupKey(record: Pick<WatchRecord, 'mediaType' | 'tmdbId'>): string {
  return `${record.mediaType}:${record.tmdbId}`;
}

/**
 * 按影片分组，组内按观看日期升序（同日按 updatedAt 稳定排序）。
 * 墓碑记录不参与（删除的场次不算次数）。
 */
export function groupViewingsByMovie(records: WatchRecord[]): Map<string, WatchRecord[]> {
  const groups = new Map<string, WatchRecord[]>();
  for (const record of records) {
    if (record.deleted) continue;
    const key = viewingGroupKey(record);
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) =>
      a.watchedDate === b.watchedDate
        ? a.updatedAt.localeCompare(b.updatedAt)
        : a.watchedDate.localeCompare(b.watchedDate),
    );
  }
  return groups;
}

export interface ViewingRank {
  /** 第几次观看（从 1 起，按观看日期排序） */
  rank: number;
  /** 这部片一共看了几次 */
  total: number;
}

/** recordId → 名次映射：首页徽章「第 N 次」与详情页「第 N 次看这部片」共用 */
export function buildViewingRanks(records: WatchRecord[]): Map<string, ViewingRank> {
  const ranks = new Map<string, ViewingRank>();
  for (const bucket of groupViewingsByMovie(records).values()) {
    bucket.forEach((record, index) => {
      ranks.set(record.id, { rank: index + 1, total: bucket.length });
    });
  }
  return ranks;
}
