import { requireApiBase } from '@/services/api';
import { CloudError, type CloudStore } from '@/services/cloud';
import type { CloudFileMeta, Credentials } from '@/types';

/**
 * 模式 A（默认）：经自家 Worker 的 /sync/* JSON API 访问 R2。
 * 前端只持有同步密码（Bearer），R2 密钥/绑定全在服务端；无 CORS 问题。
 */

export function createWorkerStore(credentials: Credentials): CloudStore {
  const password = credentials.syncPassword as string;

  async function syncFetch(path: string, init?: RequestInit): Promise<Response> {
    const base = await requireApiBase();
    const resp = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${password}`, ...init?.headers },
    });
    if (resp.status === 401) throw new CloudError('同步密码不对', 401);
    if (resp.status === 503) {
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new CloudError(body.error ?? 'Worker 未完成同步配置（SYNC_PASSWORD / R2）', 503);
    }
    return resp;
  }

  async function parseError(resp: Response, action: string): Promise<never> {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new CloudError(body.error ?? `${action}失败（${resp.status}）`, resp.status);
  }

  return {
    async listRecords(): Promise<CloudFileMeta[]> {
      const resp = await syncFetch('/sync/list?prefix=records/');
      if (!resp.ok) await parseError(resp, '拉取云端清单');
      const body = (await resp.json()) as { files: CloudFileMeta[] };
      return body.files;
    },

    async fetchFile(key) {
      const resp = await syncFetch(`/sync/file?key=${encodeURIComponent(key)}`);
      if (resp.status === 404) return { text: null };
      if (!resp.ok) await parseError(resp, `下载 ${key}`);
      const body = (await resp.json()) as { etag?: string; content: string };
      return { text: body.content, etag: body.etag };
    },

    async putFileText(key, body, ifMatch) {
      const query = `key=${encodeURIComponent(key)}${ifMatch ? `&ifMatch=${encodeURIComponent(ifMatch)}` : ''}`;
      const resp = await syncFetch(`/sync/file?${query}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (resp.status === 412) return { ok: false, conflict: true };
      if (!resp.ok) await parseError(resp, `上传 ${key}`);
      const result = (await resp.json()) as { etag?: string };
      return { ok: true, etag: result.etag, conflict: false };
    },

    async verify(): Promise<void> {
      const resp = await syncFetch('/sync/list?prefix=records/');
      if (!resp.ok) await parseError(resp, '连接');
    },
  };
}
