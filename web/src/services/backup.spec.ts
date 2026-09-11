import { describe, expect, it } from 'vitest';
import { planRestore, planWatchlistRestore } from './backup';
import type { SyncState, WatchRecord, WatchlistItem } from '@/types';

function record(overrides: Partial<WatchRecord>): WatchRecord {
  return {
    id: 'r1',
    mediaType: 'movie',
    tmdbId: 10478,
    titleSnapshot: '崖上的波妞',
    watchedDate: '2026-09-09',
    location: '家里',
    members: ['爸爸'],
    rating: 5,
    createdAt: '2026-09-09T10:00:00Z',
    updatedAt: '2026-09-09T10:00:00Z',
    deleted: false,
    ...overrides,
  };
}

function state(overrides: Partial<SyncState>): SyncState {
  return {
    recordId: 'r1',
    cloudFile: 'records/2026-09-09_r1.json',
    cloudEtag: 'v1',
    status: 'synced',
    pendingOp: 'update',
    ...overrides,
  };
}

describe('planRestore', () => {
  it('本地不存在 → 新增；本地底账 etag 随行供 update 乐观锁', () => {
    const plan = planRestore([record({ id: 'new' })], [record({ id: 'other' })], [
      state({ recordId: 'new', cloudEtag: 'v9' }),
    ]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0]?.cloudEtag).toBe('v9');
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.skipped).toBe(0);
    expect(plan.invalid).toBe(0);
  });

  it('同 id 且导入方 updatedAt 更新 → 更新', () => {
    const plan = planRestore([record({ updatedAt: '2026-09-10T00:00:00Z' })], [record({})], []);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]?.record.updatedAt).toBe('2026-09-10T00:00:00Z');
  });

  it('同 id 且本地 updatedAt 相同或更新 → 跳过（重复导入幂等）', () => {
    const same = planRestore([record({})], [record({})], []);
    expect(same.skipped).toBe(1);
    const olderImport = planRestore([record({ updatedAt: '2026-09-01T00:00:00Z' })], [record({})], []);
    expect(olderImport.skipped).toBe(1);
  });

  it('脏数据 / 墓碑 / 文件内重复 id → invalid', () => {
    const plan = planRestore(
      [null, { id: 'x' }, record({ deleted: true, id: 'tomb' }), record({ id: 'dup' }), record({ id: 'dup' })],
      [],
      [],
    );
    // null、缺字段、墓碑、重复 id 的第二条为无效；重复 id 的第一条仍正常裁决为新增
    expect(plan.invalid).toBe(4);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0]?.record.id).toBe('dup');
  });
});

/* ---------------- 想看清单导入 ---------------- */

function wish(overrides: Partial<WatchlistItem>): WatchlistItem {
  return {
    id: 'w1',
    mediaType: 'movie',
    tmdbId: 10478,
    titleSnapshot: '崖上的波妞',
    addedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

describe('planWatchlistRestore', () => {
  it('本地不存在 → 全部新增', () => {
    const plan = planWatchlistRestore([wish({ id: 'a', tmdbId: 1 }), wish({ id: 'b', tmdbId: 2 })], []);
    expect(plan.changed).toBe(2);
    expect(plan.toWrite).toHaveLength(2);
    expect(plan.invalid).toBe(0);
  });

  it('同片本地已有且导入方 addedAt 更早 → 保留导入方（最初想看时间），changed+1', () => {
    const plan = planWatchlistRestore(
      [wish({ id: 'imported', addedAt: '2026-08-01T00:00:00Z' })],
      [wish({ id: 'local', addedAt: '2026-09-01T00:00:00Z' })],
    );
    expect(plan.changed).toBe(1);
    expect(plan.toWrite[0]).toEqual(wish({ id: 'imported', addedAt: '2026-08-01T00:00:00Z' }));
  });

  it('同片本地已有且本地更早 → 保持本地不变（重复导入幂等）', () => {
    const plan = planWatchlistRestore(
      [wish({ id: 'imported', addedAt: '2026-09-05T00:00:00Z' })],
      [wish({ id: 'local', addedAt: '2026-09-01T00:00:00Z' })],
    );
    expect(plan.changed).toBe(0);
    expect(plan.toWrite[0]?.id).toBe('local');
  });

  it('导入不删除本地条目（合并式）', () => {
    const plan = planWatchlistRestore([], [wish({ id: 'local', tmdbId: 1 })]);
    expect(plan.changed).toBe(0);
    expect(plan.toWrite).toHaveLength(1);
  });

  it('脏数据 / 文件内同片重复 → invalid（重复只计一次新增）', () => {
    const plan = planWatchlistRestore(
      [null, 'junk', wish({ id: 'a' }), wish({ id: 'b' })],
      [],
    );
    // null、'junk' 脏数据 + 同片第二条重复，共 3 条无效
    expect(plan.invalid).toBe(3);
    expect(plan.changed).toBe(1);
  });

  it('输出按 addedAt 升序', () => {
    const plan = planWatchlistRestore(
      [
        wish({ id: 'late', tmdbId: 2, addedAt: '2026-09-05T00:00:00Z' }),
        wish({ id: 'early', tmdbId: 1, addedAt: '2026-09-01T00:00:00Z' }),
      ],
      [],
    );
    expect(plan.toWrite.map((item) => item.id)).toEqual(['early', 'late']);
  });
});
