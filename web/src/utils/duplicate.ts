import type { MediaType, WatchRecord } from '@/types';

export interface DuplicateGroup {
  watchedDate: string;
  mediaType: MediaType;
  tmdbId: number;
  records: WatchRecord[];
}

/**
 * 疑似重复判定：同一观影日期 + 同一部影片 + 均未删除 + 不同 id
 * （Sync 阶段对账后用于"合并为全家记录 / 保留两条"软合并提示）
 */
export function findDuplicateGroups(records: WatchRecord[]): DuplicateGroup[] {
  const groups = new Map<string, WatchRecord[]>();
  for (const record of records) {
    if (record.deleted) continue;
    const key = `${record.watchedDate}|${record.mediaType}|${record.tmdbId}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  const result: DuplicateGroup[] = [];
  for (const [key, bucket] of groups) {
    if (bucket.length < 2) continue;
    const [watchedDate, mediaType, tmdbId] = key.split('|');
    result.push({
      watchedDate,
      mediaType: mediaType as MediaType,
      tmdbId: Number(tmdbId),
      records: bucket,
    });
  }
  return result;
}
