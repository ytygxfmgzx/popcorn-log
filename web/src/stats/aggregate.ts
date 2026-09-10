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
  /** 成员多选：所选成员须全部在场（且；空 = 不筛） */
  members: string[];
  /** 地点多选，任一命中保留（或；空 = 不筛） */
  locations: string[];
  /** 类型多选，任一命中保留（或；空 = 不筛） */
  genres: string[];
  /** 演员/导演单选（榜单点击反查明细用） */
  person?: { name: string; type: 'cast' | 'director' };
}

export interface NamedCount {
  name: string;
  count: number;
}

export type TrendGranularity = 'week' | 'month' | 'year';

export interface TrendBucket {
  /** 桶 key：周 = 该周周一日期 / 月 = YYYY-MM / 年 = YYYY */
  key: string;
  /** 展示标签：周 = M/D / 月 = M月 / 年 = YYYY */
  label: string;
  count: number;
}

export interface Trend {
  granularity: TrendGranularity;
  buckets: TrendBucket[];
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
  /** 趋势（粒度随时间窗联动：周/月/年，空桶计 0 保持连续） */
  trend: Trend;
  /** 类型分布（join movies.genres，场次×类型计数） */
  genreDist: NamedCount[];
  /** 地点分布 */
  locationDist: NamedCount[];
  /** 演员榜（去重影片数，主演前 12 口径：同一部看多次只计一次） */
  castBoard: NamedCount[];
  /** 导演榜（去重影片数） */
  directorBoard: NamedCount[];
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

/** 条件过滤（成员/地点/类型/人物；时间窗另算，供趋势复用） */
function matchesConditions(record: WatchRecord, metaByKey: Map<string, MovieMeta>, filter: StatsFilter): boolean {
  if (filter.members.length && !filter.members.every((m) => record.members.includes(m))) {
    return false;
  }
  if (filter.locations.length && !filter.locations.includes(record.location)) return false;
  const meta = metaByKey.get(`${record.mediaType}:${record.tmdbId}`);
  if (filter.genres.length) {
    if (!filter.genres.some((genre) => (meta?.genres ?? []).includes(genre))) return false;
  }
  if (filter.person) {
    const hit =
      filter.person.type === 'director'
        ? meta?.director === filter.person.name
        : (meta?.cast ?? []).includes(filter.person.name);
    if (!hit) return false;
  }
  return true;
}

/** 按筛选条件过滤记录（明细列表页与 computeStats 共用；墓碑剔除） */
export function filterRecords(
  records: WatchRecord[],
  movies: MovieMeta[],
  filter: StatsFilter,
  today: string,
): WatchRecord[] {
  const metaByKey = new Map(movies.map((movie) => [movie.key, movie]));
  return records.filter(
    (record) =>
      !record.deleted &&
      inTimeWindow(record, filter, today) &&
      matchesConditions(record, metaByKey, filter),
  );
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
  const metaByKey = new Map(movies.map((movie) => [movie.key, movie]));

  // 趋势数据：条件筛选（成员/地点/类型）生效，时间窗不裁剪——
  // 时间筛选只决定趋势的粒度与桶范围（如选「本周」看近 12 周的整体起伏，而非只剩本周一点）
  const trendRecords = records.filter(
    (record) => !record.deleted && matchesConditions(record, metaByKey, filter),
  );

  const uniqueMovieKeys = new Set(filtered.map((r) => `${r.mediaType}:${r.tmdbId}`));

  let totalMinutes = 0;
  for (const record of filtered) {
    totalMinutes += metaByKey.get(`${record.mediaType}:${record.tmdbId}`)?.runtime ?? 0;
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
    filtered.flatMap((r) => metaByKey.get(`${r.mediaType}:${r.tmdbId}`)?.genres ?? []),
  );

  // 演员/导演榜：去重影片后计数（同一部看多次只计一次，「看过他的 N 部」）
  const castCounts = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  for (const key of uniqueMovieKeys) {
    const meta = metaByKey.get(key);
    if (!meta) continue;
    for (const name of meta.cast) {
      castCounts.set(name, (castCounts.get(name) ?? 0) + 1);
    }
    if (meta.director) {
      directorCounts.set(meta.director, (directorCounts.get(meta.director) ?? 0) + 1);
    }
  }

  return {
    viewings: filtered.length,
    uniqueMovies: uniqueMovieKeys.size,
    totalMinutes,
    avgRating,
    familyCount,
    memberBoard,
    trend: computeTrend(trendRecords, filter, records, today),
    genreDist,
    locationDist,
    castBoard: sortedCounts(castCounts),
    directorBoard: sortedCounts(directorCounts),
  };
}

/* ---------------- 趋势 ---------------- */

/** 趋势粒度随时间窗联动：本周→周 / 本月→月 / 半年·一年·全部→年 / 自定义按跨度自动（桶数超限升档） */
function trendGranularity(filter: StatsFilter): TrendGranularity {
  if (filter.range === 'week') return 'week';
  if (filter.range === 'month') return 'month';
  if (filter.range === 'halfYear' || filter.range === 'year' || filter.range === 'all') {
    return 'year';
  }
  // custom：跨度 ≤ 92 天→周（≤14 桶）、≤ 24 月→月、更长→年
  if (!filter.customStart || !filter.customEnd || filter.customStart > filter.customEnd) {
    return 'month';
  }
  const start = new Date(`${filter.customStart}T00:00:00`);
  const end = new Date(`${filter.customEnd}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days <= 92) {
    const startOffset = (start.getDay() + 6) % 7; // 起点 到其所在周一的天数
    const weeks = Math.ceil((days + startOffset) / 7);
    return weeks <= 14 ? 'week' : 'month';
  }
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return months <= 24 ? 'month' : 'year';
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDate(d);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** 桶 key 序列：周 = 周一日期 / 月 = YYYY-MM / 年 = YYYY */
function buildTrendKeys(
  granularity: TrendGranularity,
  filter: StatsFilter,
  allRecords: WatchRecord[],
  today: string,
): string[] {
  const custom = filter.range === 'custom' && filter.customStart && filter.customEnd
    && filter.customStart <= filter.customEnd;

  if (granularity === 'week') {
    if (custom) {
      const keys: string[] = [];
      for (let cursor = mondayOf(filter.customStart!); cursor <= filter.customEnd!; ) {
        keys.push(cursor);
        cursor = addDays(cursor, 7);
      }
      return keys;
    }
    const keys: string[] = [];
    let cursor = mondayOf(today);
    for (let i = 0; i < 12; i++) {
      keys.unshift(cursor);
      cursor = addDays(cursor, -7);
    }
    return keys;
  }

  if (granularity === 'month') {
    if (custom) {
      const keys: string[] = [];
      let cursor = filter.customStart!.slice(0, 7);
      const end = filter.customEnd!.slice(0, 7);
      while (cursor <= end) {
        keys.push(cursor);
        cursor = nextMonth(cursor);
      }
      return keys;
    }
    const anchor = new Date(`${today}T00:00:00`);
    const keys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
  }

  // 年：今年往回到最早有数据的年份，最多 12 年（无数据仅今年）
  const thisYear = Number(today.slice(0, 4));
  let earliest = thisYear;
  for (const record of allRecords) {
    if (record.deleted) continue;
    const year = Number(record.watchedDate.slice(0, 4));
    if (year < earliest) earliest = year;
  }
  const keys: string[] = [];
  for (let y = Math.max(earliest, thisYear - 11); y <= thisYear; y++) keys.push(String(y));
  return keys;
}

/** 趋势聚合：粒度随时间窗联动，空桶计 0 保证折线连续 */
export function computeTrend(
  filtered: WatchRecord[],
  filter: StatsFilter,
  allRecords: WatchRecord[],
  today: string,
): Trend {
  const granularity = trendGranularity(filter);
  const keys = buildTrendKeys(granularity, filter, allRecords, today);
  const keyOf = (watchedDate: string) =>
    granularity === 'week'
      ? mondayOf(watchedDate)
      : watchedDate.slice(0, granularity === 'month' ? 7 : 4);
  const counts = new Map<string, number>();
  for (const record of filtered) {
    const key = keyOf(record.watchedDate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const labelOf = (key: string) => {
    if (granularity === 'week') {
      const [, m, d] = key.split('-');
      return `${Number(m)}/${Number(d)}`;
    }
    if (granularity === 'month') return `${Number(key.slice(5))}月`;
    return key;
  };
  return {
    granularity,
    buckets: keys.map((key) => ({ key, label: labelOf(key), count: counts.get(key) ?? 0 })),
  };
}

/* ---------------- 计数工具 ---------------- */

function sortedCounts(counts: Map<string, number>): NamedCount[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function countBy(items: string[]): NamedCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return sortedCounts(counts);
}
