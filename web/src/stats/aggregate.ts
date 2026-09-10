import type { MovieMeta, WatchRecord } from '@/types';

/**
 * 统计聚合纯函数：本地内存计算（毫秒级、零网络、离线可用）。
 * records join movies；时间窗基于 watchedDate（本地日期字符串比较）。
 */

export type StatsRange = 'week' | 'month' | 'halfYear' | 'year' | 'all' | 'custom';

export interface StatsFilter {
  range: StatsRange;
  /** range = custom 时生效（YYYY-MM-DD，含两端） */
  customStart?: string;
  customEnd?: string;
  /** 成员多选，任一命中保留（空 = 不筛） */
  members: string[];
  /** 地点多选，任一命中保留（空 = 不筛） */
  locations: string[];
  /** 类型多选，任一命中保留（空 = 不筛） */
  genres: string[];
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface StatsResult {
  /** 场次（事件数） */
  viewings: number;
  /** 去重部数（mediaType+tmdbId） */
  uniqueMovies: number;
  /** 累计时长（分钟；无元数据的场次不计） */
  totalMinutes: number;
  /** 平均评分（有评分场次的均值；无评分记录返回 null） */
  avgRating: number | null;
  /** 全家同看：members 覆盖设置里全部成员的场次（allMembers 空/单人不统计） */
  familyCount: number;
  /** 成员参与榜（记录中出现过的所有成员，含历史成员） */
  memberBoard: NamedCount[];
  /** 月度趋势（近 12 个月含当月，空月计 0） */
  monthly: NamedCount[];
  /** 类型分布（join movies.genres，场次×类型计数） */
  genreDist: NamedCount[];
  /** 地点分布 */
  locationDist: NamedCount[];
}

/** 时间窗起点（YYYY-MM-DD）；all/custom 由调用方处理 */
export function rangeStartDate(range: Exclude<StatsRange, 'all' | 'custom'>, today: string): string {
  const d = new Date(`${today}T00:00:00`);
  if (range === 'week') {
    // ISO 周：周一为一周之始
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
  } else if (range === 'month') {
    d.setDate(1);
  } else if (range === 'halfYear') {
    d.setMonth(d.getMonth() - 6);
  } else {
    d.setFullYear(d.getFullYear() - 1);
  }
  return toLocalDate(d);
}

function toLocalDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function inTimeWindow(record: WatchRecord, filter: StatsFilter, today: string): boolean {
  if (filter.range === 'all') return true;
  if (filter.range === 'custom') {
    if (filter.customStart && record.watchedDate < filter.customStart) return false;
    if (filter.customEnd && record.watchedDate > filter.customEnd) return false;
    return true;
  }
  return record.watchedDate >= rangeStartDate(filter.range, today);
}

/** 按筛选条件过滤记录（明细列表页与 computeStats 共用；墓碑剔除） */
export function filterRecords(
  records: WatchRecord[],
  movies: MovieMeta[],
  filter: StatsFilter,
  today: string,
): WatchRecord[] {
  const genresByKey = new Map(movies.map((movie) => [movie.key, movie.genres]));
  return records.filter((record) => {
    if (record.deleted) return false;
    if (!inTimeWindow(record, filter, today)) return false;
    if (filter.members.length && !record.members.some((m) => filter.members.includes(m))) return false;
    if (filter.locations.length && !filter.locations.includes(record.location)) return false;
    if (filter.genres.length) {
      const genres = genresByKey.get(`${record.mediaType}:${record.tmdbId}`) ?? [];
      if (!filter.genres.some((genre) => genres.includes(genre))) return false;
    }
    return true;
  });
}

/** 主入口：全量未筛记录 + movies 元数据 + 筛选条件 → 聚合结果 */
export function computeStats(
  records: WatchRecord[],
  movies: MovieMeta[],
  filter: StatsFilter,
  allMembers: string[],
  today: string,
): StatsResult {
  const filtered = filterRecords(records, movies, filter, today);

  const uniqueMovies = new Set(filtered.map((r) => `${r.mediaType}:${r.tmdbId}`)).size;

  let totalMinutes = 0;
  for (const record of filtered) {
    const meta = movies.find((m) => m.key === `${record.mediaType}:${record.tmdbId}`);
    totalMinutes += meta?.runtime ?? 0;
  }

  const rated = filtered.filter((r) => r.rating !== null);
  const avgRating = rated.length
    ? Math.round((rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length) * 10) / 10
    : null;

  const familyCount =
    allMembers.length >= 2
      ? filtered.filter((r) => allMembers.every((m) => r.members.includes(m))).length
      : 0;

  const memberBoard = countBy(filtered.flatMap((r) => r.members));
  const locationDist = countBy(filtered.map((r) => r.location).filter(Boolean));
  const genreDist = countBy(
    filtered.flatMap(
      (r) => movies.find((m) => m.key === `${r.mediaType}:${r.tmdbId}`)?.genres ?? [],
    ),
  );

  return {
    viewings: filtered.length,
    uniqueMovies,
    totalMinutes,
    avgRating,
    familyCount,
    memberBoard,
    monthly: monthlyTrend(filtered, today),
    genreDist,
    locationDist,
  };
}

/** 近 12 个月（含当月）每月场次，月标签 YYYY-MM，空月计 0 保证柱状连续 */
function monthlyTrend(filtered: WatchRecord[], today: string): NamedCount[] {
  const buckets = new Map<string, number>();
  const anchor = new Date(`${today}T00:00:00`);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  for (const record of filtered) {
    const month = record.watchedDate.slice(0, 7);
    buckets.set(month, (buckets.get(month) ?? 0) + 1);
  }
  return months.map((month) => ({ name: month, count: buckets.get(month) ?? 0 }));
}

function countBy(items: string[]): NamedCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
