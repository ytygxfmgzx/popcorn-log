import { describe, expect, it } from 'vitest';
import { findDuplicateGroups } from '@/utils/duplicate';
import type { WatchRecord } from '@/types';

function makeRecord(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: 'id-1',
    mediaType: 'movie',
    tmdbId: 12477,
    titleSnapshot: '崖上的波妞',
    watchedDate: '2026-09-07',
    location: '家里',
    members: ['爸爸'],
    rating: null,
    createdAt: '2026-09-07T10:00:00Z',
    updatedAt: '2026-09-07T10:00:00Z',
    deleted: false,
    ...overrides,
  };
}

describe('findDuplicateGroups', () => {
  it('同日同片不同 id 判为疑似重复', () => {
    const groups = findDuplicateGroups([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.watchedDate).toBe('2026-09-07');
    expect(groups[0]?.tmdbId).toBe(12477);
    expect(groups[0]?.records.map((record) => record.id)).toEqual(['a', 'b']);
  });

  it('不同日期或不同片不算重复', () => {
    const groups = findDuplicateGroups([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', watchedDate: '2026-09-08' }),
      makeRecord({ id: 'c', tmdbId: 999 }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('movie 与 tv 同 tmdbId 不算同一部', () => {
    const groups = findDuplicateGroups([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', mediaType: 'tv' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('墓碑记录不参与判定', () => {
    const groups = findDuplicateGroups([
      makeRecord({ id: 'a' }),
      makeRecord({ id: 'b', deleted: true }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('空列表与单条记录', () => {
    expect(findDuplicateGroups([])).toHaveLength(0);
    expect(findDuplicateGroups([makeRecord({})])).toHaveLength(0);
  });
});
