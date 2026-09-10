import { db } from '@/db/dexie';
import { getAppSettings, saveAppSettings } from '@/db/settings';
import { saveRecord, deleteRecord } from '@/db/records';
import { getCloudStore } from '@/services/cloud';
import { normalizeRemoteRecord, softMerge } from './merge';
import { recordCloudFile } from '@/utils/filename';
import type { SyncState, WatchRecord } from '@/types';

/**
 * 冲突与疑似重复的人工裁决动作（/conflicts 页调用）
 * 三条铁律：绝不静默丢数据；裁决后即恢复该条同步；删除即物理删除。
 */

async function loadPair(recordId: string): Promise<{
  state: SyncState;
  record: WatchRecord;
  file: string;
}> {
  const state = await db.syncStates.get(recordId);
  const record = await db.records.get(recordId);
  if (!state || !record) throw new Error('记录不存在');
  return { state, record, file: state.cloudFile ?? recordCloudFile(record) };
}

/** 编辑冲突-用云端：云端版写回本地，清 conflict 标 synced */
export async function resolveConflictUseCloud(recordId: string): Promise<void> {
  const { state, file } = await loadPair(recordId);
  const store = await getCloudStore();
  const fetched = await store.fetchFile(file);
  if (!fetched.text) throw new Error('云端文件不存在，请先同步一次');
  const remote = normalizeRemoteRecord(JSON.parse(fetched.text));
  if (!remote) throw new Error('云端数据损坏');
  await db.transaction('rw', db.records, db.syncStates, async () => {
    await db.records.put(remote);
    await db.syncStates.put({
      recordId,
      cloudFile: file,
      cloudEtag: fetched.etag ?? state.cloudEtag,
      status: 'synced',
    });
  });
}

/** 编辑冲突-用本地：取云端当前 etag 强推覆盖（云端文件已消失则无锁重建） */
export async function resolveConflictUseLocal(recordId: string): Promise<void> {
  const { record, file } = await loadPair(recordId);
  const store = await getCloudStore();
  const fetched = await store.fetchFile(file);
  const result = await store.putFileText(file, JSON.stringify(record), fetched.etag ?? undefined);
  if (!result.ok) throw new Error('云端刚被更新，请重试');
  await db.syncStates.put({
    recordId,
    cloudFile: file,
    cloudEtag: result.etag ?? fetched.etag,
    status: 'synced',
  });
}

/** 编辑冲突-软合并：拉云端 → softMerge → 写本地并推云端（两边编辑都保留） */
export async function resolveConflictMerge(recordId: string): Promise<void> {
  const { record, file } = await loadPair(recordId);
  const store = await getCloudStore();
  const fetched = await store.fetchFile(file);
  if (!fetched.text) throw new Error('云端文件不存在，请先同步一次');
  const remote = normalizeRemoteRecord(JSON.parse(fetched.text));
  if (!remote) throw new Error('云端数据损坏');
  const merged = softMerge(record, remote);
  const result = await store.putFileText(file, JSON.stringify(merged), fetched.etag ?? undefined);
  if (!result.ok) throw new Error('云端刚被更新，请重试');
  await db.transaction('rw', db.records, db.syncStates, async () => {
    await db.records.put(merged);
    await db.syncStates.put({
      recordId,
      cloudFile: file,
      cloudEtag: result.etag ?? fetched.etag,
      status: 'synced',
    });
  });
}

/**
 * 疑似重复-软合并：组内逐对 softMerge（较新者为主体，成员并集、手记拼接），
 * 其余全部物理删除；复用 saveRecord/deleteRecord 标 pending，随下轮同步上云/删云端。
 * 支持三人各记一场的 >2 条场景。
 */
export async function mergeDuplicate(recordIds: string[]): Promise<void> {
  if (recordIds.length < 2) throw new Error('至少两条才能合并');
  const records = await db.records.bulkGet(recordIds);
  if (records.some((record) => !record)) throw new Error('记录不存在');

  let keep = records[0] as WatchRecord;
  for (const next of records.slice(1)) {
    const current = next as WatchRecord;
    const merged = softMerge(keep, current);
    const drop = keep.id === merged.id ? current : keep;
    await saveRecord(merged);
    await deleteRecord(drop.id);
    keep = merged;
  }
}

/** 疑似重复-是两场都保留：该组记入 hiddenDuplicateKeys，永不再提示 */
export async function dismissDuplicateGroup(key: string): Promise<void> {
  const app = await getAppSettings();
  const hidden = app.hiddenDuplicateKeys ?? [];
  if (!hidden.includes(key)) {
    await saveAppSettings({ hiddenDuplicateKeys: [...hidden, key] });
  }
}
