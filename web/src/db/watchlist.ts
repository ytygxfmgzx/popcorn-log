import { db } from '@/db/dexie';
import { fetchAndCacheMovie, type MovieBrief } from '@/services/tmdb';
import { notifyLocalChange } from '@/sync/schedule';
import { newId } from '@/utils/id';
import { watchlistKey, type MediaType, type WatchlistItem } from '@/types';

/**
 * 想看清单本地增删（写入后 notifyLocalChange 触发云同步的 watchlistPhase 对账）。
 * 同步落库走 applyWatchlist（不触发通知，防同步回环）。
 */

/** 搜片入列：同片已在列则跳过；元数据后台补齐，失败不阻塞（详情页会再试） */
export async function addToWatchlist(brief: MovieBrief): Promise<boolean> {
  const existing = await findWatchlistItem(brief.mediaType, brief.tmdbId);
  if (existing) return false;

  const item: WatchlistItem = {
    id: newId(),
    mediaType: brief.mediaType,
    tmdbId: brief.tmdbId,
    titleSnapshot: brief.title,
    addedAt: new Date().toISOString(),
  };
  await db.watchlist.put(item);
  notifyLocalChange();
  void fetchAndCacheMovie(brief.mediaType, brief.tmdbId).catch(() => undefined);
  return true;
}

/** 移除想看（记手帐后自动移除 / 用户左滑移除共用） */
export async function removeFromWatchlist(mediaType: MediaType, tmdbId: number): Promise<void> {
  const existing = await findWatchlistItem(mediaType, tmdbId);
  if (!existing) return;
  await db.watchlist.delete(existing.id);
  notifyLocalChange();
}

async function findWatchlistItem(
  mediaType: MediaType,
  tmdbId: number,
): Promise<WatchlistItem | undefined> {
  const key = watchlistKey({ mediaType, tmdbId });
  const all = await db.watchlist.toArray();
  return all.find((item) => watchlistKey(item) === key);
}

/** 同步合并结果整体落库（清空重写；调用方已比对无差异时不调） */
export async function applyWatchlist(items: WatchlistItem[]): Promise<void> {
  await db.transaction('rw', db.watchlist, async () => {
    await db.watchlist.clear();
    if (items.length) await db.watchlist.bulkPut(items);
  });
}
