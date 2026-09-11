import { describe, expect, it } from 'vitest';
import { planRestore } from './backup';
import type { SyncState, WatchRecord } from '@/types';

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
