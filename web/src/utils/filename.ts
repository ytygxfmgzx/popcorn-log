import type { WatchRecord } from '@/types';

/**
 * 云端文件路径：一事件一文件
 * 日期前缀 = 观影日期（非创建日），人眼可读、天然按时间排序、供去重规则使用
 */
export function recordCloudFile(record: Pick<WatchRecord, 'watchedDate' | 'id'>): string {
  return `records/${record.watchedDate}_${record.id}.json`;
}
