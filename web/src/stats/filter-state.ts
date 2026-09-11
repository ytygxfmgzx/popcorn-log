import { reactive } from 'vue';
import type { StatsFilter, StatsRange } from './aggregate';

/**
 * 统计筛选状态（模块级单例）：统计页与明细列表页共享的唯一真源。
 * 离开页面不销毁——明细页返回、切 tab 回来筛选保持；在明细页调整后返回，图表同步反映。
 */
export const statsFilter: StatsFilter = reactive<StatsFilter>({
  range: 'all',
  members: [],
  locations: [],
  genres: [],
});

export function resetStatsFilter(): void {
  statsFilter.members = [];
  statsFilter.locations = [];
  statsFilter.genres = [];
  statsFilter.person = undefined;
}

/** 筛选状态 → URL query（多选维度序列化为重复 key：?members=a&members=b） */
export function filterToQuery(filter: StatsFilter = statsFilter): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = { range: filter.range };
  if (filter.members.length) query.members = [...filter.members];
  if (filter.locations.length) query.locations = [...filter.locations];
  if (filter.genres.length) query.genres = [...filter.genres];
  if (filter.person) {
    query.person = filter.person.name;
    query.personType = filter.person.type;
  }
  if (filter.range === 'custom') {
    query.start = filter.customStart ?? '';
    query.end = filter.customEnd ?? '';
  }
  return query;
}

/** query 字段值 → string[]（null/undefined → []；单值 → [v]；数组 → 过滤非字符串与空串） */
export function queryStrArray(value: unknown): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is string => typeof item === 'string' && item !== '');
}

const RANGE_KEYS: readonly StatsRange[] = ['week', 'month', 'halfYear', 'year', 'all', 'custom'];
/** 出现过任一筛选 key 才视为"筛选链接"，否则返回 null（调用方保持现状） */
const FILTER_KEYS = [
  'range',
  'members',
  'locations',
  'genres',
  'person',
  // 旧版单值 key（明细页标题用），兼容回退
  'member',
  'location',
  'genre',
] as const;

/** URL query → 筛选条件（脏值回退默认；不含任何筛选 key 时返回 null） */
export function queryToFilter(query: Record<string, unknown>): StatsFilter | null {
  if (!FILTER_KEYS.some((key) => query[key] != null)) return null;

  const single = (key: string): string => (typeof query[key] === 'string' ? (query[key] as string) : '');
  const range = RANGE_KEYS.includes(query.range as StatsRange) ? (query.range as StatsRange) : 'all';

  const members = queryStrArray(query.members);
  const locations = queryStrArray(query.locations);
  const genres = queryStrArray(query.genres);
  const personName = single('person');
  const personType =
    query.personType === 'director' || query.personType === 'cast'
      ? (query.personType as 'cast' | 'director')
      : 'cast';

  return {
    range,
    customStart: single('start') || undefined,
    customEnd: single('end') || undefined,
    // 多值 key 优先；缺失时回退旧版单值 key（?member=妈妈 → ['妈妈']）
    members: members.length ? members : single('member') ? [single('member')] : [],
    locations: locations.length ? locations : single('location') ? [single('location')] : [],
    genres: genres.length ? genres : single('genre') ? [single('genre')] : [],
    person: personName ? { name: personName, type: personType } : undefined,
  };
}

/** 把一份筛选条件写入共享状态（明细页挂载时从 query 恢复用） */
export function applyStatsFilter(next: StatsFilter): void {
  statsFilter.range = next.range;
  statsFilter.customStart = next.customStart;
  statsFilter.customEnd = next.customEnd;
  statsFilter.members = [...next.members];
  statsFilter.locations = [...next.locations];
  statsFilter.genres = [...next.genres];
  statsFilter.person = next.person;
}
