/** 领域类型定义，与 docs/design.md 第 6 节一一对应 */

export type MediaType = 'movie' | 'tv';

/** 观影事件（一事件一云端文件） */
export interface WatchRecord {
  /** uuid v4，保存时本地生成（离线可用） */
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  /** 片名快照：元数据丢失后历史记录仍可读 */
  titleSnapshot: string;
  /** 本地日期 YYYY-MM-DD（观影日期，非创建日，支持补记） */
  watchedDate: string;
  location: string;
  members: string[];
  /** 1-5，可不评 */
  rating: number | null;
  /** 孩子原话（核心情感点） */
  quote?: string;
  /** 手记 */
  note?: string;
  /** ISO UTC */
  createdAt: string;
  /** ISO UTC */
  updatedAt: string;
  /** 墓碑：删除 = 标记 true 上传，永不物理删除云端文件 */
  deleted: boolean;
}

/** TMDB 元数据本地缓存（key = `${mediaType}:${tmdbId}`） */
export interface MovieMeta {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath?: string;
  releaseYear?: number;
  /** 分钟；tv 取单集时长 */
  runtime?: number;
  /** 中文名（language=zh-CN） */
  genres: string[];
  overview?: string;
  director?: string;
  /** 主演前 12（统计榜单口径） */
  cast: string[];
  cachedAt: string;
}

export function movieKey(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/** 海报 blob 永久缓存 */
export interface PosterBlob {
  posterPath: string;
  blob: Blob;
}

export type SyncStatus = 'pending' | 'synced' | 'conflict';
export type PendingOp = 'create' | 'update' | 'delete';

/** 同步底账：MVP 即写入 pending，Sync 阶段上线后存量数据自动待推送 */
export interface SyncState {
  /** 主键 = records.id */
  recordId: string;
  /** records/YYYY-MM-DD_<uuid>.json */
  cloudFile?: string;
  cloudEtag?: string;
  status: SyncStatus;
  pendingOp?: PendingOp;
}

/** 应用设置（存 settings 表 key='app'） */
export interface AppSettings {
  /** 空 = 同源（开发经 vite proxy；生产填 workers.dev 域名） */
  workerUrl?: string;
  /** MVP 存本地，Sync 迁移 members.json */
  members: string[];
  customLocations: string[];
  lastMembersCombo?: string[];
}

/** 坚果云凭据（存 settings 表 key='credentials'，仅本机；Sync 阶段使用） */
export interface Credentials {
  jianguayunAccount?: string;
  jianguayunAppPassword?: string;
}

export type SettingRow =
  | { key: 'app'; value: AppSettings }
  | { key: 'credentials'; value: Credentials };

/** 想看清单（Enhance 阶段） */
export interface WatchlistItem {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  titleSnapshot: string;
  addedAt: string;
  removed: boolean;
}

/** 预设地点（不可删除），自定义地点存 AppSettings.customLocations */
export const PRESET_LOCATIONS = ['家里', '旅行途中', '影院'] as const;

export const LOCATION_EMOJI: Record<string, string> = {
  家里: '🏠',
  旅行途中: '🚄',
  影院: '🎬',
};
