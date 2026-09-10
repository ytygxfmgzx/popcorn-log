import { describe, expect, it } from 'vitest';
import { computeStats, filterRecords, rangeStartDate } from './aggregate';
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

const noFilter = { range: 'all' as const, members: [], locations: [], genres: [] };

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
    meta('movie:1', {
      runtime: 100,
      genres: ['动画', '奇幻'],
      cast: ['声优A', '声优B'],
      director: '导演X',
    }),
    meta('movie:2', { runtime: 120, genres: ['纪录片'], cast: ['声优A'], director: '导演Y' }),
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

  it('成员筛选（单选）：命中即在', () => {
    const stats = computeStats(records, movies, { ...noFilter, members: ['妹妹'] }, [], TODAY);
    expect(stats.viewings).toBe(2); // a、b
  });

  it('成员筛选（多选 AND）：所选成员须全部在场', () => {
    const stats = computeStats(
      records,
      movies,
      { ...noFilter, members: ['妹妹', '爸爸'] },
      [],
      TODAY,
    );
    expect(stats.viewings).toBe(1); // 只有 a 两人都在
    const statsSolo = computeStats(records, movies, { ...noFilter, members: ['爸爸'] }, [], TODAY);
    expect(statsSolo.viewings).toBe(2); // a、c（c 默认成员即爸爸）；b 只有妹妹
  });

  it('类型筛选（多选 OR）：动画+纪录片', () => {
    const stats = computeStats(
      records,
      movies,
      { ...noFilter, genres: ['动画', '纪录片'] },
      [],
      TODAY,
    );
    expect(stats.viewings).toBe(3);
  });

  it('类型筛选：奇幻只命中 movie:1 的两场', () => {
    const stats = computeStats(records, movies, { ...noFilter, genres: ['奇幻'] }, [], TODAY);
    expect(stats.viewings).toBe(2);
  });

  it('地点多选 OR', () => {
    const stats = computeStats(
      records,
      movies,
      { ...noFilter, locations: ['影院'] },
      [],
      TODAY,
    );
    expect(stats.viewings).toBe(1);
  });

  it('时间窗：本月只剩 9 月的两场（8 月与更早被窗口排除）', () => {
    const stats = computeStats(records, movies, { range: 'month', members: [], locations: [], genres: [] }, [], TODAY);
    expect(stats.viewings).toBe(2);
  });

  it('时间窗：本周（09-07 起）9 月初的记录被排除', () => {
    const stats = computeStats(records, movies, { range: 'week', members: [], locations: [], genres: [] }, [], TODAY);
    expect(stats.viewings).toBe(0);
  });

  it('自定义起止（含两端）', () => {
    const stats = computeStats(
      records,
      movies,
      { range: 'custom', members: [], locations: [], genres: [], customStart: '2026-08-15', customEnd: '2026-09-01' },
      [],
      TODAY,
    );
    expect(stats.viewings).toBe(2); // a + c
  });

  it('月粒度趋势：12 桶含空月；时间窗只定粒度不裁剪数据（8 月记录仍在）', () => {
    const stats = computeStats(records, movies, { range: 'month', members: [], locations: [], genres: [] }, [], TODAY);
    expect(stats.trend.granularity).toBe('month');
    expect(stats.trend.buckets).toHaveLength(12);
    expect(stats.trend.buckets[11]).toEqual({ key: '2026-09', label: '9月', count: 2 });
    expect(stats.trend.buckets[10]).toEqual({ key: '2026-08', label: '8月', count: 1 });
    expect(stats.trend.buckets[0].key).toBe('2025-10');
  });

  it('条件筛选影响趋势：只看妹妹参与的场次', () => {
    const stats = computeStats(records, movies, { range: 'month', members: ['妹妹'], locations: [], genres: [] }, [], TODAY);
    expect(stats.trend.buckets[11].count).toBe(2); // a、b
    expect(stats.trend.buckets[10].count).toBe(0); // c（妹妹不在场）被条件筛掉
  });

  it('年粒度趋势：全部时间 → 从最早有数据年份到今年', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.trend.granularity).toBe('year');
    expect(stats.trend.buckets).toEqual([{ key: '2026', label: '2026', count: 3 }]);
  });

  it('年粒度趋势：最早数据超过 11 年前 → 最多 12 桶', () => {
    const oldRecords = [...records, record('old', { watchedDate: '2013-01-01' })];
    const stats = computeStats(oldRecords, movies, noFilter, [], TODAY);
    expect(stats.trend.granularity).toBe('year');
    expect(stats.trend.buckets).toHaveLength(12);
    expect(stats.trend.buckets[0].key).toBe('2015'); // 2026-11
    expect(stats.trend.buckets[11].key).toBe('2026');
  });

  it('周粒度趋势：近 12 周（含本周），按周一归桶', () => {
    const stats = computeStats(records, movies, { range: 'week', members: [], locations: [], genres: [] }, [], TODAY);
    expect(stats.trend.granularity).toBe('week');
    expect(stats.trend.buckets).toHaveLength(12);
    expect(stats.trend.buckets[0].key).toBe('2026-06-22');
    expect(stats.trend.buckets[10]).toEqual({ key: '2026-08-31', label: '8/31', count: 2 }); // a、b
    expect(stats.trend.buckets[9]).toEqual({ key: '2026-08-24', label: '8/24', count: 0 });
    expect(stats.trend.buckets[11]).toEqual({ key: '2026-09-07', label: '9/7', count: 0 });
  });

  it('自定义短跨度 → 周粒度，从起点所在周到终点', () => {
    const stats = computeStats(
      records,
      movies,
      { range: 'custom', members: [], locations: [], genres: [], customStart: '2026-08-15', customEnd: '2026-09-01' },
      [],
      TODAY,
    );
    expect(stats.trend.granularity).toBe('week');
    expect(stats.trend.buckets.map((b) => b.key)).toEqual([
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
    expect(stats.trend.buckets[0].count).toBe(1); // c 08-15
    expect(stats.trend.buckets[3].count).toBe(2); // a 09-01、b 09-02（趋势不被时间窗裁剪）
  });

  it('分布按次数降序', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.locationDist[0]).toEqual({ name: '家里', count: 2 });
    expect(stats.genreDist[0]).toEqual({ name: '动画', count: 2 });
  });

  it('演员榜：去重影片数（重刷不重复计），降序', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.castBoard[0]).toEqual({ name: '声优A', count: 2 }); // movie:1 + movie:2
    expect(stats.castBoard[1]).toEqual({ name: '声优B', count: 1 }); // movie:1（b 重刷不重复计）
  });

  it('导演榜：去重影片数', () => {
    const stats = computeStats(records, movies, noFilter, [], TODAY);
    expect(stats.directorBoard).toEqual([
      { name: '导演X', count: 1 },
      { name: '导演Y', count: 1 },
    ]); // 同数按名字排序
  });

  it('演员/导演反查：filterRecords person 命中该人参演的影片场次', () => {
    const castHit = filterRecords(
      records,
      movies,
      { ...noFilter, person: { name: '声优B', type: 'cast' } },
      TODAY,
    );
    expect(castHit.map((r) => r.id)).toEqual(['a', 'b']); // movie:1 的两场
    const directorHit = filterRecords(
      records,
      movies,
      { ...noFilter, person: { name: '导演Y', type: 'director' } },
      TODAY,
    );
    expect(directorHit.map((r) => r.id)).toEqual(['c']);
  });

  it('无评分记录 avgRating 为 null', () => {
    const stats = computeStats([record('x', { rating: null })], [], noFilter, [], TODAY);
    expect(stats.avgRating).toBeNull();
  });
});
