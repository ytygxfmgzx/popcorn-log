import type { MediaType, WatchRecord } from '@/types';

export interface DuplicateGroup {
  watchedDate: string;
  mediaType: MediaType;
  tmdbId: number;
  records: WatchRecord[];
}

/** 疑似重复组 key：watchedDate|mediaType|tmdbId（设置页 hiddenDuplicateKeys 存同款 key） */
export function duplicateGroupKey(record: Pick<WatchRecord, 'watchedDate' | 'mediaType' | 'tmdbId'>): string {
  return `${record.watchedDate}|${record.mediaType}|${record.tmdbId}`;
}

/**
 * 疑似重复判定：同一观影日期 + 同一部影片 + 均未删除 + 不同 id
 * （Sync 阶段对账后用于"合并为全家记录 / 保留两条"软合并提示）
 * hiddenKeys：用户已确认「是两场，都保留」的组，不再提示
 */
export function findDuplicateGroups(records: WatchRecord[], hiddenKeys: string[] = []): DuplicateGroup[] {
  const groups = new Map<string, WatchRecord[]>();
  for (const record of records) {
    if (record.deleted) continue;
    const key = duplicateGroupKey(record);
    if (hiddenKeys.includes(key)) continue;
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
