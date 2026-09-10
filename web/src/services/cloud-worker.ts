import { requireApiBase } from '@/services/api';
import { CloudError, type CloudStore } from '@/services/cloud';
import type { CloudFileMeta, Credentials } from '@/types';

/**
 * 模式 A（默认）：经自家 Worker 的 /sync/* JSON API 访问 R2。
 * 前端只持有同步密码（Bearer），R2 密钥/绑定全在服务端；无 CORS 问题。
 */

/** Worker 清单响应 {key,etag} → 前端 CloudFileMeta {file,etag}（字段映射独立成纯函数，spec 防字段名回归） */
export function mapWorkerListResponse(body: { files?: { key?: unknown; etag?: unknown }[] }): CloudFileMeta[] {
  return (body.files ?? []).map((item) => ({
    file: typeof item.key === 'string' ? item.key : '',
    etag: typeof item.etag === 'string' ? item.etag : undefined,
  }));
}

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

  /** 请求前防御：key 必须是合法形态，杜绝 undefined/空串流向网络层 */
  function assertKey(key: string): void {
    if (!key || (key !== 'config.json' && !key.startsWith('records/'))) {
      throw new CloudError(`内部错误：非法文件名 ${String(key)}`, 0);
    }
  }

  return {
    async listRecords(): Promise<CloudFileMeta[]> {
      const resp = await syncFetch('/sync/list?prefix=records/');
      if (!resp.ok) await parseError(resp, '拉取云端清单');
      return mapWorkerListResponse(await resp.json());
    },

    async fetchFile(key) {
      assertKey(key);
      const resp = await syncFetch(`/sync/file?key=${encodeURIComponent(key)}`);
      if (resp.status === 404) return { text: null };
      if (!resp.ok) await parseError(resp, `下载 ${key}`);
      const body = (await resp.json()) as { etag?: string; content: string };
      return { text: body.content, etag: body.etag };
    },

    async putFileText(key, body, ifMatch) {
      assertKey(key);
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

    async deleteFile(key) {
      assertKey(key);
      const resp = await syncFetch(`/sync/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      // 404 = 对象本就不存在，删除幂等视为成功
      if (!resp.ok && resp.status !== 404) await parseError(resp, `删除 ${key}`);
    },

    async verify(): Promise<void> {
      const resp = await syncFetch('/sync/list?prefix=records/');
      if (!resp.ok) await parseError(resp, '连接');
    },
  };
}
