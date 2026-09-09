import { db } from '@/db/dexie';
import type { Credentials } from '@/types';

/**
 * 云同步配置（settings 表 key='credentials'，仅本机 IndexedDB）
 * 绝不导出进备份、绝不写进代码、绝不上传云端
 */

export async function getCredentials(): Promise<Credentials> {
  const row = await db.settings.get('credentials');
  if (!row || row.key !== 'credentials') return {};
  return row.value;
}

export async function saveCredentials(patch: Partial<Credentials>): Promise<Credentials> {
  const current = await getCredentials();
  const next: Credentials = { ...current, ...patch };
  await db.settings.put({ key: 'credentials', value: next });
  return next;
}

/** 当前模式所需字段都已填写（未配置时同步静默跳过，指示器显示"未开启"） */
export function isCredentialsComplete(credentials: Credentials): boolean {
  if (credentials.mode === 'direct') {
    return Boolean(
      credentials.s3Endpoint?.trim() &&
        credentials.s3Bucket?.trim() &&
        credentials.s3AccessKeyId?.trim() &&
        credentials.s3SecretAccessKey,
    );
  }
  // worker 模式（默认）
  return Boolean(credentials.syncPassword);
}
