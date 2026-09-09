import Dexie, { type Table } from 'dexie';
import type {
  WatchRecord,
  MovieMeta,
  PosterBlob,
  SyncState,
  SettingRow,
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
  }
}

export const db = new PopcornDB();
