import { apiFetch } from '@/services/api';
import { db } from '@/db/dexie';

/** 同一海报并发加载去重（多卡片同时挂载时只发一次请求） */
const inflight = new Map<string, Promise<Blob | null>>();

/**
 * 海报经 Worker 加载成功后 blob 永久缓存进 IndexedDB：
 * 只求成功一次，之后离线可用、不再请求。
 */
export function ensurePoster(posterPath: string): Promise<Blob | null> {
  const pending = inflight.get(posterPath);
  if (pending) return pending;

  const task = (async () => {
    const cached = await db.posters.get(posterPath);
    if (cached) return cached.blob;

    const resp = await apiFetch(`/image/t/p/w500${posterPath}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    await db.posters.put({ posterPath, blob });
    return blob;
  })()
    .catch(() => null)
    .finally(() => {
      inflight.delete(posterPath);
    });

  inflight.set(posterPath, task);
  return task;
}
