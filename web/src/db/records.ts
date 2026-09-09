import { db } from '@/db/dexie';
import { recordCloudFile } from '@/utils/filename';
import type { WatchRecord } from '@/types';

/**
 * 保存记录（新增/编辑统一入口）：
 * 本地写入 + 同步底账标记 pending（为 Sync 阶段预埋，存量数据自动待推送）
 */
export async function saveRecord(record: WatchRecord): Promise<void> {
  await db.transaction('rw', db.records, db.syncStates, async () => {
    const existing = await db.syncStates.get(record.id);
    // 曾同步成功（有 etag）→ update；否则一律视为 create
    const pendingOp = existing?.cloudEtag ? 'update' : 'create';
    await db.records.put(record);
    await db.syncStates.put({
      recordId: record.id,
      cloudFile: recordCloudFile(record),
      cloudEtag: existing?.cloudEtag,
      status: 'pending',
      pendingOp,
    });
  });
}

/**
 * 删除记录 = 墓碑标记（deleted: true 上传云端，永不物理删除云端文件，可恢复）
 */
export async function tombstoneRecord(record: WatchRecord): Promise<void> {
  const deleted: WatchRecord = {
    ...record,
    deleted: true,
    updatedAt: new Date().toISOString(),
  };
  await db.transaction('rw', db.records, db.syncStates, async () => {
    const existing = await db.syncStates.get(record.id);
    await db.records.put(deleted);
    await db.syncStates.put({
      recordId: record.id,
      cloudFile: recordCloudFile(deleted),
      cloudEtag: existing?.cloudEtag,
      status: 'pending',
      pendingOp: 'delete',
    });
  });
}
