import { describe, expect, it } from 'vitest';
import { computeStats, rangeStartDate } from './aggregate';
import type { MovieMeta, WatchRecord } from '@/types';

const TODAY = '2026-09-09'; // 周三

function record(id: string, overrides: Partial<WatchRecord> = {}): WatchRecord {
  return {
    id,
    mediaType: 'movie',
    tmdbId: 1,
    titleSnapshot: '片名',
    watchedDate: '2026-09-01',
    location: '家里',
    members: ['爸爸'],
    rating: 4,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
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
    cachedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const noFilter = { range: 'all' as const, members: [] };

describe('rangeStartDate', () => {
  it('本周 = 周一（2026-09-09 周三 → 09-07）', () => {
    expect(rangeStartDate('week', TODAY)).toBe('2026-09-07');
  });
  it('本月 = 1 号；半年/一年按日期回退', () => {
    expect(rangeStartDate('month', TODAY)).toBe('2026-09-01');
    expect(rangeStartDate('halfYear', TODAY)).toBe('2026-03-09');
    expect(rangeStartDate('year', TODAY)).toBe('2025-09-09');
  });
});

describe('computeStats', () => {
  const records = [
    record('a', { watchedDate: '2026-09-01', tmdbId: 1, members: ['爸爸', '妈妈', '妹妹'], rating: 5 }),
    record('b', { watchedDate: '2026-09-02', tmdbId: 1, members: ['妹妹'], rating: 3 }), // 同片重刷
    record('c', { watchedDate: '2026-08-15', tmdbId: 2, location: '影院', rating: null }),
    record('d', { watchedDate: '2025-01-01', tmdbId: 3, deleted: true }), // 墓碑不计
  ];
  const movies = [
    meta('movie:1', { runtime: 100, genres: ['动画', '奇幻'] }),
    meta('movie:2', { runtime: 120, genres: ['纪录片'] }),
    // movie:3 无元数据
  ];

  it('全量：场次/去重部数/时长/均分/墓碑排除', () => {
    const stats = computeStats(records, movies, noFilter, ['爸爸', '妈妈', '妹妹'], TODAY);
    expect(stats.viewings).toBe(3);
    expect(stats.uniqueMovies).toBe(2); // tmdbId 1,2（重刷去重）
    expect(stats.totalMinutes).toBe(320); // 100×2 + 120
    expect(stats.avgRating).toBe(4); // (5+3)/2
  });

  it('全家同看 = 覆盖全部成员的场次', () => {
    const stats = computeStats(records, movies, noFilter, ['爸爸', '妈妈', '妹妹'], TODAY);
    expect(stats.familyCount).toBe(1); // 只有 a
  });

  it('成员筛选：任一命中', () => {
    const stats = computeStats(records, movies, { ...noFilter, members: ['妹妹'] }, [], TODAY);
    expect(stats.viewings).toBe(2); // a、b
  });

  it('类型筛选：join movies.genres', () => {
    const stats = computeStats(records, movies, { ...noFilter, genre: '奇幻' }, [], TODAY);
    expect(stats.viewings).toBe(2); // a、b（movie:1 有奇幻）
  });

  it('时间窗：本月只剩 9 月的两场（8 月与更早被窗口排除）', () => {
    const stats = computeStats(records, movies, { range: 'month', members: [] }, [], TODAY);
    expect(stats.viewings).toBe(2);
  });

  it('时间窗：本周（09-07 起）9 月初的记录被排除', () => {
    const stats = computeStats(records, movies, { range: 'week', members: [] }, [], TODAY);
    expect(stats.viewings).toBe(0);
  });

  it('自定义起止（含两端）', () => {
    const stats = computeStats(
      records,
      movies,
      { range: 'custom', members: [], customStart: '2026-08-15', customEnd: '2026-09-01' },
      [],
      TODAY,
    );
    expect(stats.viewings).toBe(2); // a + c
  });

  it('月度趋势 12 桶含空月，当月在前 11 位之后', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.monthly).toHaveLength(12);
    expect(stats.monthly[11]).toEqual({ name: '2026-09', count: 2 });
    expect(stats.monthly[10]).toEqual({ name: '2026-08', count: 1 });
    expect(stats.monthly[0].name).toBe('2025-10');
  });

  it('分布按次数降序', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.locationDist[0]).toEqual({ name: '家里', count: 2 });
    expect(stats.genreDist[0]).toEqual({ name: '动画', count: 2 });
  });

  it('无评分记录 avgRating 为 null', () => {
    const stats = computeStats([record('x', { rating: null })], [], noFilter, [], TODAY);
    expect(stats.avgRating).toBeNull();
  });
});
