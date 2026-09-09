import { describe, expect, it } from 'vitest';
import { buildViewingRanks, groupViewingsByMovie, viewingGroupKey } from './viewings';
import type { WatchRecord } from '@/types';

function record(id: string, overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id,
    mediaType: 'movie',
    tmdbId: 1,
    titleSnapshot: '片名',
    watchedDate: '2026-09-09',
    location: '家里',
    members: [],
    rating: null,
    createdAt: '2026-09-09T00:00:00Z',
    updatedAt: '2026-09-09T00:00:00Z',
    deleted: false,
    ...overrides,
  };
}

describe('viewingGroupKey', () => {
  it('movie 与 tv 同 id 视为不同影片', () => {
    expect(viewingGroupKey({ mediaType: 'movie', tmdbId: 1 })).toBe('movie:1');
    expect(viewingGroupKey({ mediaType: 'tv', tmdbId: 1 })).toBe('tv:1');
  });
});

describe('groupViewingsByMovie / buildViewingRanks', () => {
  it('同片多次：按日期升序编号，墓碑不计入', () => {
    const records = [
      record('r3', { watchedDate: '2026-10-01', tmdbId: 7 }),
      record('r1', { watchedDate: '2026-05-01', tmdbId: 7 }),
      record('r2', { watchedDate: '2026-09-09', tmdbId: 7 }),
      record('r4', { watchedDate: '2026-11-01', tmdbId: 7, deleted: true }), // 墓碑
      record('x1', { watchedDate: '2026-05-01', tmdbId: 9 }), // 另一部
    ];
    const ranks = buildViewingRanks(records);
    expect(ranks.get('r1')).toEqual({ rank: 1, total: 3 });
    expect(ranks.get('r2')).toEqual({ rank: 2, total: 3 });
    expect(ranks.get('r3')).toEqual({ rank: 3, total: 3 });
    expect(ranks.has('r4')).toBe(false);
    expect(ranks.get('x1')).toEqual({ rank: 1, total: 1 });
  });

  it('同日两场：按 updatedAt 稳定排序', () => {
    const records = [
      record('late', { watchedDate: '2026-09-09', updatedAt: '2026-09-09T12:00:00Z', tmdbId: 3 }),
      record('early', { watchedDate: '2026-09-09', updatedAt: '2026-09-09T08:00:00Z', tmdbId: 3 }),
    ];
    const groups = groupViewingsByMovie(records);
    expect([...groups.values()][0].map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('只看过一次的记录 total=1（UI 判断 ≥2 才显示徽章）', () => {
    const ranks = buildViewingRanks([record('solo', {})]);
    expect(ranks.get('solo')).toEqual({ rank: 1, total: 1 });
  });
});
