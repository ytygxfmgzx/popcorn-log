import { requireApiBase } from '@/services/api';
import { getCredentials, isCredentialsComplete, normalizeWebdavUrl } from '@/db/credentials';
import { parsePropfind } from '@/sync/propfind';
import type { CloudFileMeta } from '@/types';

/**
 * WebDAV 访问层（经 Worker /dav/* 无状态转发，解决 WebDAV 服务普遍无 CORS 头的问题）
 * 目标 = 用户配置的 WebDAV 服务器 + /popcorn-log；经 X-Dav-Url 头告知 Worker 转发目标
 * （Worker 侧按 DAV_ALLOWED_HOSTS 白名单校验，防开放代理）。
 * 协议约定：一事件一文件；etag 由服务器维护，客户端只"抄下指纹、下次对比"。
 */

/** 应用数据在网盘里的根目录（相对 WebDAV 服务器地址） */
const CLOUD_ROOT_PATH = '/popcorn-log';

export class DavError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function davFetch(path: string, init: RequestInit & { method: string }): Promise<Response> {
  const base = await requireApiBase();
  const credentials = await getCredentials();
  if (!isCredentialsComplete(credentials)) {
    throw new Error('未配置 WebDAV 同步');
  }
  const target = `${normalizeWebdavUrl(credentials.webdavUrl as string)}${CLOUD_ROOT_PATH}${path}`;
  const resp = await fetch(`${base}/dav${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${credentials.webdavAccount}:${credentials.webdavPassword}`)}`,
      'X-Dav-Url': target,
      ...init.headers,
    },
  });
  if (resp.status === 401) {
    throw new DavError('WebDAV 账号或密码不对', 401);
  }
  return resp;
}

/** 凭据与地址连通性校验（设置页「测试并保存」用） */
export async function verifyCredentials(): Promise<void> {
  const resp = await davFetch('/', { method: 'PROPFIND', headers: { Depth: '0' } });
  if (resp.status === 403) {
    throw new DavError('该账号没有此目录的访问权限', 403);
  }
  // 404 = 凭据有效、目录未建（首次使用，同步时会自动创建）
  if (!resp.ok && resp.status !== 404) {
    throw new DavError(`WebDAV 连接失败（${resp.status}）`, resp.status);
  }
}

/**
 * 列出云端全部记录文件清单（只拿 文件名+etag，不含内容）
 * 目录不存在（首次使用）返回空清单
 */
export async function propfindRecords(): Promise<CloudFileMeta[]> {
  const resp = await davFetch('/records/', { method: 'PROPFIND', headers: { Depth: '1' } });
  if (resp.status === 404) return [];
  if (!resp.ok) throw new DavError(`拉取云端清单失败（${resp.status}）`, resp.status);
  return parsePropfind(await resp.text());
}

export interface FetchedFile {
  /** 404 时为 null（文件不存在，由调用方决定策略） */
  text: string | null;
  /** 响应 ETag（底账更新用） */
  etag?: string;
}

/** 下载文件内容与 etag */
export async function fetchFile(path: string): Promise<FetchedFile> {
  const resp = await davFetch(`/${path}`, { method: 'GET' });
  if (resp.status === 404) return { text: null };
  if (!resp.ok) throw new DavError(`下载 ${path} 失败（${resp.status}）`, resp.status);
  return { text: await resp.text(), etag: resp.headers.get('ETag') ?? undefined };
}

export interface PutResult {
  ok: boolean;
  /** 上传成功后的云端新 etag（底账更新用） */
  etag?: string;
  /** true = If-Match 不匹配，云端已被对方先改（冲突，交人工处理） */
  conflict: boolean;
}

/** 上传文件；update 携带 If-Match 乐观锁，412 映射为 conflict 而非异常 */
export async function putFileText(
  path: string,
  body: string,
  ifMatch?: string,
): Promise<PutResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ifMatch) headers['If-Match'] = ifMatch;
  const resp = await davFetch(`/${path}`, { method: 'PUT', headers, body });
  if (resp.status === 412) return { ok: false, conflict: true };
  if (!resp.ok && resp.status !== 201 && resp.status !== 204) {
    throw new DavError(`上传 ${path} 失败（${resp.status}）`, resp.status);
  }
  return { ok: true, etag: resp.headers.get('ETag') ?? undefined, conflict: false };
}

/** 确保云端目录存在（MKCOL；405 = 已存在，幂等忽略） */
async function ensureDir(path: string): Promise<void> {
  const resp = await davFetch(path, { method: 'MKCOL' });
  if (!resp.ok && resp.status !== 405) {
    throw new DavError(`创建云端目录 ${path} 失败（${resp.status}）`, resp.status);
  }
}

export async function ensureCloudDirs(): Promise<void> {
  await ensureDir('/');
  await ensureDir('/records/');
}

/** 退避重试：429/503 按 1s/2s/4s 指数退避，上限 3 次；其余异常直接抛出 */
export async function withBackoff<T>(op: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (error) {
      const status = error instanceof DavError ? error.status : -1;
      const retriable = status === 429 || status === 503;
      if (!retriable || attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}
