import { describe, expect, it } from 'vitest';
import { decidePull, planPush } from './engine';
import type { SyncState, WatchRecord } from '@/types';

describe('planPush', () => {
  const record = { watchedDate: '2026-09-09', id: 'r1' } as Pick<WatchRecord, 'watchedDate' | 'id'>;

  it('create：直接 PUT，不带 If-Match', () => {
    const state: SyncState = { recordId: 'r1', cloudFile: 'records/2026-09-09_r1.json', status: 'pending', pendingOp: 'create' };
    expect(planPush(state, record)).toEqual({ file: 'records/2026-09-09_r1.json', ifMatch: undefined });
  });

  it('update：携带本地 etag 乐观锁（delete 意向不经 planPush，由 pushPhase 直接 DELETE）', () => {
    const state: SyncState = { recordId: 'r1', cloudFile: 'records/x.json', cloudEtag: 'v1', status: 'pending', pendingOp: 'update' };
    expect(planPush(state, record)).toEqual({ file: 'records/x.json', ifMatch: 'v1' });
  });

  it('底账缺 cloudFile 时按记录现算（MVP 存量数据）', () => {
    const state: SyncState = { recordId: 'r1', status: 'pending', pendingOp: 'create' };
    expect(planPush(state, record).file).toBe('records/2026-09-09_r1.json');
  });
});

describe('decidePull', () => {
  it('本地无底账 / 已同步 / 冲突态 → 云端版直接生效', () => {
    expect(decidePull(undefined)).toBe('apply');
    const synced: SyncState = { recordId: 'r1', status: 'synced' };
    expect(decidePull(synced)).toBe('apply');
  });

  it('本地有未推送修改 → 冲突，绝不静默覆盖', () => {
    const pending: SyncState = { recordId: 'r1', status: 'pending', pendingOp: 'update' };
    expect(decidePull(pending)).toBe('conflict');
  });
});
