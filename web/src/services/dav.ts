import { requireApiBase } from '@/services/api';
import { getCredentials } from '@/db/credentials';
import { parsePropfind } from '@/sync/propfind';
import type { CloudFileMeta } from '@/types';

/**
 * 坚果云 WebDAV 访问层（经 Worker /dav/* 无状态转发，解决坚果云无 CORS 的硬伤）
 * 协议约定：一事件一文件；etag 由坚果云维护，客户端只"抄下指纹、下次对比"。
 */

const CLOUD_ROOT = '/dav/popcorn-log';

export class DavError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** Basic Auth 头；凭据不完整时抛错（引擎入口已确保不会走到） */
async function authHeader(): Promise<string> {
  const { jianguayunAccount, jianguayunAppPassword } = await getCredentials();
  if (!jianguayunAccount || !jianguayunAppPassword) {
    throw new Error('未配置坚果云账号');
  }
  return `Basic ${btoa(`${jianguayunAccount}:${jianguayunAppPassword}`)}`;
}

async function davFetch(path: string, init: RequestInit & { method: string }): Promise<Response> {
  const base = await requireApiBase();
  const resp = await fetch(`${base}${CLOUD_ROOT}${path}`, {
    ...init,
    headers: { Authorization: await authHeader(), ...init.headers },
  });
  if (resp.status === 401) {
    throw new DavError('坚果云账号或应用密码不对', 401);
  }
  return resp;
}

/** 凭据连通性校验（设置页「测试连接」用） */
export async function verifyCredentials(): Promise<void> {
  const resp = await davFetch('/', { method: 'PROPFIND', headers: { Depth: '0' } });
  if (!resp.ok && resp.status !== 404) {
    throw new DavError(`坚果云连接失败（${resp.status}）`, resp.status);
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
  /** 响应 ETag（底账更新用；坚果云 GET 响应带） */
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
