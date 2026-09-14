import type { MovieMeta, WatchRecord } from '@/types';
import { addDays, matchesConditions, mondayOf, type StatsFilter } from './aggregate';

/**
 * 观影日历热力图（GitHub 贡献图风格）：
 * 条件筛选生效（成员/地点/类型/主创/影片）、时间窗不裁剪——与趋势同口径；
 * 一年铺成若干周列（每列周一~周日），跨年格子置灰。
 */

/** 日历格子（一天） */
export interface CalendarDay {
  date: string;
  count: number;
  /** 属于目标年份（年初/年末跨年格子为 false，置灰展示） */
  inYear: boolean;
  /** 未来日期（更淡、不可点） */
  future: boolean;
}

export interface CalendarYear {
  year: number;
  /** 周列：从 1/1 所在周的周一到 12/31 所在周的周日 */
  weeks: CalendarDay[][];
  /** 该年总场次 */
  total: number;
}

export function computeCalendarYear(
  records: WatchRecord[],
  movies: MovieMeta[],
  filter: StatsFilter,
  year: number,
  today: string,
): CalendarYear {
  const metaByKey = new Map(movies.map((movie) => [movie.key, movie]));
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.deleted || !matchesConditions(record, metaByKey, filter)) continue;
    counts.set(record.watchedDate, (counts.get(record.watchedDate) ?? 0) + 1);
  }

  const weeks: CalendarDay[][] = [];
  let total = 0;
  // 首列 = 1/1 所在周的周一；末列 = 12/31 所在周的周日
  const start = mondayOf(`${year}-01-01`);
  const end = addDays(mondayOf(`${year}-12-31`), 6);
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      const count = counts.get(date) ?? 0;
      const inYear = Number(date.slice(0, 4)) === year;
      // total 只算目标年份（跨年格子仅作视觉补齐，场次归属其自然年份的视图）
      if (inYear) total += count;
      week.push({ date, count, inYear, future: date > today });
    }
    weeks.push(week);
  }
  return { year, weeks, total };
}
