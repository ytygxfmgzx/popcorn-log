import { db } from '@/db/dexie';
import type { Credentials } from '@/types';

/**
 * 坚果云凭据（settings 表 key='credentials'，仅本机 IndexedDB）
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

/** 两项都非空才算已配置（只填了一半视为未配置，同步静默跳过） */
export function isCredentialsComplete(credentials: Credentials): boolean {
  return Boolean(credentials.jianguayunAccount && credentials.jianguayunAppPassword);
}
