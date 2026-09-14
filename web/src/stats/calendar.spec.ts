import { describe, expect, it } from 'vitest';
import { computeCalendarYear } from './calendar';
import type { MovieMeta, WatchRecord } from '@/types';

const TODAY = '2026-06-01';

function record(id: string, overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    id,
    mediaType: 'movie',
    tmdbId: 1,
    titleSnapshot: '片名',
    watchedDate: '2026-01-10',
    location: '家里',
    members: ['爸爸'],
    rating: 4,
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-10T00:00:00Z',
    deleted: false,
    ...overrides,
  };
}

function meta(key: string, overrides: Partial<MovieMeta> = {}): MovieMeta {
  return {
    key,
    mediaType: 'movie',
    tmdbId: Number(key.split(':')[1]),
    title: '片名',
    genres: ['动画'],
    cast: [],
    cachedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const noFilter = { range: 'all' as const, members: [], locations: [], genres: [] };

describe('computeCalendarYear', () => {
  it('周对齐：首列从 1/1 所在周的周一开始（2026-01-01 周四 → 首格 2025-12-29 置灰）', () => {
    const cal = computeCalendarYear([record('a', { watchedDate: '2026-01-10' })], [], noFilter, 2026, TODAY);
    const first = cal.weeks[0];
    expect(first).toHaveLength(7);
    expect(first.map((d) => d.date)).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(first[0].inYear).toBe(false); // 跨年格子置灰
    expect(first[3].inYear).toBe(true);
    expect(first.every((d) => d.count === 0)).toBe(true);
  });

  it('末列到 12/31 所在周的周日（2026-12-31 周四 → 末格 2027-01-03 置灰）', () => {
    const cal = computeCalendarYear([], [], noFilter, 2026, TODAY);
    const last = cal.weeks[cal.weeks.length - 1];
    expect(last[6]).toMatchObject({ date: '2027-01-03', inYear: false });
  });

  it('按天计数：同日两场 count=2；total 只算目标年份', () => {
    const records = [
      record('a', { watchedDate: '2026-01-10' }),
      record('b', { watchedDate: '2026-01-10' }),
      record('c', { watchedDate: '2026-03-08' }),
      record('d', { watchedDate: '2027-01-01' }), // 他年不计入 total（跨年格仍可显示）
    ];
    const cal = computeCalendarYear(records, [], noFilter, 2026, TODAY);
    expect(cal.total).toBe(3);
    const jan10 = cal.weeks.flatMap((w) => w).find((d) => d.date === '2026-01-10');
    expect(jan10?.count).toBe(2);
  });

  it('条件筛选生效（成员）、时间窗不裁剪', () => {
    const records = [
      record('a', { watchedDate: '2026-01-10', members: ['爸爸'] }),
      record('b', { watchedDate: '2026-01-11', members: ['妈妈'] }),
    ];
    const cal = computeCalendarYear(records, [], { ...noFilter, members: ['妈妈'] }, 2026, TODAY);
    expect(cal.total).toBe(1);
    const jan10 = cal.weeks.flatMap((w) => w).find((d) => d.date === '2026-01-10');
    expect(jan10?.count).toBe(0);
  });

  it('类型筛选经元数据命中', () => {
    const records = [record('a', { watchedDate: '2026-01-10' })];
    const movies = [meta('movie:1', { genres: ['纪录片'] })];
    const hit = computeCalendarYear(records, movies, { ...noFilter, genres: ['纪录片'] }, 2026, TODAY);
    expect(hit.total).toBe(1);
    const miss = computeCalendarYear(records, movies, { ...noFilter, genres: ['动画'] }, 2026, TODAY);
    expect(miss.total).toBe(0);
  });

  it('未来日期标记 future（today=06-01 → 06-02 起为未来）', () => {
    const cal = computeCalendarYear([], [], noFilter, 2026, TODAY);
    const days = cal.weeks.flatMap((w) => w);
    expect(days.find((d) => d.date === '2026-05-31')?.future).toBe(false);
    expect(days.find((d) => d.date === '2026-06-02')?.future).toBe(true);
  });

  it('墓碑记录不计', () => {
    const cal = computeCalendarYear([record('a', { deleted: true })], [], noFilter, 2026, TODAY);
    expect(cal.total).toBe(0);
  });
});
