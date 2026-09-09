import { db } from '@/db/dexie';
import { getAppSettings } from '@/db/settings';
import { toDateStr } from '@/utils/date';
import type { MovieMeta, WatchRecord } from '@/types';

/**
 * 本地数据导出 JSON 备份（MVP 阶段 IndexedDB 有被系统清除风险，云同步上线前的兜底）
 * 不含：坚果云凭据（绝不导出）、海报 blob（体积大，可从 TMDB 重新拉取）
 */
export interface BackupFile {
  app: 'popcorn-log';
  backupVersion: 1;
  exportedAt: string;
  records: WatchRecord[];
  movies: MovieMeta[];
  settings: {
    members: string[];
    customLocations: string[];
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const [records, movies, appSettings] = await Promise.all([
    db.records.toArray(),
    db.movies.toArray(),
    getAppSettings(),
  ]);
  return {
    app: 'popcorn-log',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    records,
    movies,
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
