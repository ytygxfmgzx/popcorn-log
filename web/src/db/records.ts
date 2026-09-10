import { db } from '@/db/dexie';
import { recordCloudFile } from '@/utils/filename';
import { notifyLocalChange } from '@/sync/schedule';
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
  notifyLocalChange();
}

/**
 * 删除记录 = 物理删除：本地删行，底账转 delete 意向（保留 cloudFile 供 push 删云端对象）。
 * 从未上过云（底账无 cloudFile）则无需意向，直接删净。
 */
export async function deleteRecord(id: string): Promise<void> {
  await applyDelete(id);
  notifyLocalChange();
}

/** 删除的事务主体（deleteRecord 与存量墓碑迁移共用；不触发自动同步） */
async function applyDelete(id: string): Promise<void> {
  await db.transaction('rw', db.records, db.syncStates, async () => {
    const existing = await db.syncStates.get(id);
    await db.records.delete(id);
    if (existing?.cloudFile) {
      await db.syncStates.put({
        recordId: id,
        cloudFile: existing.cloudFile,
        cloudEtag: existing.cloudEtag,
        status: 'pending',
        pendingOp: 'delete',
      });
    } else {
      await db.syncStates.delete(id);
    }
  });
}

/**
 * 存量墓碑迁移（幂等）：旧协议的 deleted:true 记录 → 物理删除本地，
 * 底账转 delete 意向，随下一轮 push 物理清掉云端墓碑文件。
 */
export async function migrateLegacyTombstones(): Promise<void> {
  const legacy = await db.records.filter((record) => record.deleted === true).toArray();
  for (const record of legacy) {
    await applyDelete(record.id);
  }
}
