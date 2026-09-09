import { db } from '@/db/dexie';
import type { Credentials } from '@/types';

/**
 * WebDAV 凭据（settings 表 key='credentials'，仅本机 IndexedDB）
 * 绝不导出进备份、绝不写进代码、绝不上传云端
 */

export const DEFAULT_WEBDAV_URL = 'https://dav.jianguoyun.com/dav/';

/** 旧版坚果云专属字段 → 通用 WebDAV 字段（一次性迁移，幂等） */
function migrateLegacy(raw: Credentials): Credentials {
  if (raw.webdavAccount || raw.webdavPassword || raw.webdavUrl) return raw;
  if (!raw.jianguoyunAccount && !raw.jianguoyunAppPassword) return raw;
  return {
    webdavUrl: DEFAULT_WEBDAV_URL,
    webdavAccount: raw.jianguoyunAccount,
    webdavPassword: raw.jianguoyunAppPassword,
  };
}

export async function getCredentials(): Promise<Credentials> {
  const row = await db.settings.get('credentials');
  if (!row || row.key !== 'credentials') return {};
  return migrateLegacy(row.value);
}

export async function saveCredentials(patch: Partial<Credentials>): Promise<Credentials> {
  const current = await getCredentials();
  const next: Credentials = { ...current, ...patch };
  // 保存通用字段后清掉旧字段，避免双写
  delete next.jianguoyunAccount;
  delete next.jianguoyunAppPassword;
  await db.settings.put({ key: 'credentials', value: next });
  return next;
}

/** 三项都非空才算已配置（缺一项视为未配置，同步静默跳过） */
export function isCredentialsComplete(credentials: Credentials): boolean {
  return Boolean(
    credentials.webdavUrl?.trim() && credentials.webdavAccount?.trim() && credentials.webdavPassword,
  );
}

/** 规范化服务器地址：去尾部斜杠（拼接路径统一 `${base}/popcorn-log/...`） */
export function normalizeWebdavUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
