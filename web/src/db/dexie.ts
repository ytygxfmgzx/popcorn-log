import Dexie, { type Table } from 'dexie';
import { PRESET_LOCATIONS, type SettingRow } from '@/types';
import type {
  WatchRecord,
  MovieMeta,
  PosterBlob,
  SyncState,
  WatchlistItem,
} from '@/types';

export class PopcornDB extends Dexie {
  records!: Table<WatchRecord, string>;
  movies!: Table<MovieMeta, string>;
  posters!: Table<PosterBlob, string>;
  syncStates!: Table<SyncState, string>;
  settings!: Table<SettingRow, string>;
  watchlist!: Table<WatchlistItem, string>;

  constructor() {
    super('popcorn-log');
    this.version(1).stores({
      records: 'id, watchedDate, updatedAt, deleted',
      movies: 'key',
      posters: 'posterPath',
      syncStates: 'recordId',
      settings: 'key',
      watchlist: 'id, addedAt',
    });
    // v2：预置地点从编译期常量转为普通数据（可删、可同步、进备份）。
    // 已有 'app' 行补入预置（一次性迁移，用户之后删除不会复活）；无行的新装用户由 DEFAULT_APP_SETTINGS 兜底。
    this.version(2)
      .stores({
        records: 'id, watchedDate, updatedAt, deleted',
        movies: 'key',
        posters: 'posterPath',
        syncStates: 'recordId',
        settings: 'key',
        watchlist: 'id, addedAt',
      })
      .upgrade(async (tx) => {
        const settings = tx.table('settings') as Table<SettingRow, string>;
        const row = await settings.get('app');
        if (!row || row.key !== 'app') return;
        const merged = [...row.value.customLocations];
        for (const location of PRESET_LOCATIONS) {
          if (!merged.includes(location)) merged.push(location);
        }
        await settings.put({ ...row, value: { ...row.value, customLocations: merged } });
      });
  }
}

export const db = new PopcornDB();
