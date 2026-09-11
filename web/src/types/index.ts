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
  /** 遗留墓碑标记（旧协议数据）：物理删除协议下不再写入，仅迁移与脏数据防御时读取 */
  deleted?: boolean;
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
  /** 与云端 config.json 对账（三向合并：单边删除跟随、单边新增保留），非本地独占 */
  members: string[];
  customLocations: string[];
  lastMembersCombo?: string[];
  /** 云端 config.json 的 etag 底账（整文件 If-Match 用） */
  configEtag?: string;
  /** 上次 config 对账完成时的本地快照，用于脏检测（相对快照有变化才上传） */
  configSyncedSnapshot?: CloudConfig;
  /** 用户已确认「是两场，都保留」的疑似重复组 key（watchedDate|mediaType|tmdbId），不再提示 */
  hiddenDuplicateKeys?: string[];
  /** 云端 watchlist.json 的 etag 底账（整文件 If-Match 用） */
  watchlistEtag?: string;
  /** 上次想看清单对账完成时的本地快照，用于脏检测（相对快照有变化才上传） */
  watchlistSyncedSnapshot?: WatchlistItem[];
  /** 最近一次同步完成时间（ISO UTC，仅簿记展示） */
  lastSyncedAt?: string;
}

/** 云端共享配置（/popcorn-log/config.json，低频整文件 + If-Match） */
export interface CloudConfig {
  members: string[];
  customLocations: string[];
}

/** 云端文件清单条目（PROPFIND Depth:1 解析结果） */
export interface CloudFileMeta {
  /** records/YYYY-MM-DD_<uuid>.json 或 config.json */
  file: string;
  etag?: string;
}

/** 云同步方式：默认走自家 Worker（R2 绑定，零密钥零 CORS）；高级直连任意 S3 兼容存储 */
export type SyncMode = 'worker' | 'direct';

/**
 * 云同步配置（存 settings 表 key='credentials'，仅本机）
 * worker 模式：只填同步密码（两台手机同一个，Worker secret 里存同一个值）
 * direct 模式：S3 兼容四件套（阿里 OSS / 腾讯 COS / R2 S3 API / B2…），浏览器签名直连
 */
export interface Credentials {
  mode?: SyncMode;
  syncPassword?: string;
  s3Endpoint?: string;
  s3Bucket?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
}

export type SettingRow =
  | { key: 'app'; value: AppSettings }
  | { key: 'credentials'; value: Credentials };

/** 想看清单条目（业务键 = mediaType:tmdbId；同步走云端 watchlist.json 整文件三向合并，无需墓碑） */
export interface WatchlistItem {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  titleSnapshot: string;
  /** ISO UTC，加入想看的时间 */
  addedAt: string;
}

export function watchlistKey(item: Pick<WatchlistItem, 'mediaType' | 'tmdbId'>): string {
  return `${item.mediaType}:${item.tmdbId}`;
}

/** 初始默认地点（新装默认值与 v2 迁移源）；入库后即普通数据，可删可同步 */
export const PRESET_LOCATIONS = ['家里', '旅行途中', '影院'] as const;

export const LOCATION_EMOJI: Record<string, string> = {
  家里: '🏠',
  旅行途中: '🚄',
  影院: '🎬',
};
