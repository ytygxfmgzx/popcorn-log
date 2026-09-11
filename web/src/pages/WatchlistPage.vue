<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { db } from '@/db/dexie';
import { addToWatchlist, removeFromWatchlist } from '@/db/watchlist';
import { useLiveQuery } from '@/composables/useLiveQuery';
import MoviePicker from '@/components/MoviePicker.vue';
import PosterImage from '@/components/PosterImage.vue';
import EmptyState from '@/components/EmptyState.vue';
import { formatDateShort, formatRuntime, toDateStr } from '@/utils/date';
import { movieKey, type MovieMeta, type WatchlistItem } from '@/types';
import type { MovieBrief } from '@/services/tmdb';

const router = useRouter();

/** 列表行 = 想看条目 + 元数据缓存 + 同片已看次数（一次 join，liveQuery 三表联动刷新） */
interface WatchlistRow {
  item: WatchlistItem;
  meta?: MovieMeta;
  viewedCount: number;
}

const { data: rows, isLoading } = useLiveQuery<WatchlistRow[]>(async () => {
  const [items, records] = await Promise.all([
    db.watchlist.orderBy('addedAt').reverse().toArray(),
    db.records.toArray(),
  ]);
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.deleted) continue;
    const key = movieKey(record.mediaType, record.tmdbId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Promise.all(
    items.map(async (item) => ({
      item,
      meta: await db.movies.get(movieKey(item.mediaType, item.tmdbId)),
      viewedCount: counts.get(movieKey(item.mediaType, item.tmdbId)) ?? 0,
    })),
  );
}, []);

/* 筛选：默认全部；「未看过」隐藏已看过（本地已有同片手帐）的条目 */
type Filter = 'all' | 'pending';
const filter = ref<Filter>('all');
const pendingCount = computed(() => rows.value.filter((row) => !row.viewedCount).length);
const visible = computed(() =>
  filter.value === 'pending' ? rows.value.filter((row) => !row.viewedCount) : rows.value,
);

async function onAdd(brief: MovieBrief): Promise<void> {
  const added = await addToWatchlist(brief);
  showToast(added ? '已加入想看 ⭐' : '已经在想看清单里啦');
}

function markWatched(row: WatchlistRow): void {
  void router.push({
    path: '/record/new',
    query: {
      mediaType: row.item.mediaType,
      tmdbId: String(row.item.tmdbId),
      from: 'watchlist',
    },
  });
}

function openDetail(row: WatchlistRow): void {
  void router.push(`/movie/${row.item.mediaType}/${row.item.tmdbId}`);
}

async function remove(row: WatchlistRow): Promise<void> {
  await removeFromWatchlist(row.item.mediaType, row.item.tmdbId);
  showToast('已移除想看');
}

function addedAtShort(item: WatchlistItem): string {
  return formatDateShort(toDateStr(new Date(item.addedAt)));
}

function metaLine(meta?: MovieMeta): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.releaseYear) parts.push(String(meta.releaseYear));
  if (meta.genres.length) parts.push(meta.genres.slice(0, 2).join('/'));
  if (meta.runtime) parts.push(formatRuntime(meta.runtime));
  return parts.join(' · ');
}
</script>

<template>
  <div>
    <header class="navbar">
      <h1>想看</h1>
    </header>

    <main class="page">
      <!-- 搜片即入列 -->
      <MoviePicker placeholder="搜片名，加入想看" @select="onAdd" />

      <!-- 筛选：全部 / 未看过（已看过 = 本地已有同片手帐） -->
      <div v-if="rows.length" class="filter">
        <button
          class="filter-btn"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          全部 {{ rows.length }}
        </button>
        <button
          class="filter-btn"
          :class="{ active: filter === 'pending' }"
          @click="filter = 'pending'"
        >
          未看过 {{ pendingCount }}
        </button>
      </div>

      <template v-if="isLoading">
        <div v-for="n in 3" :key="n" class="skeleton card">
          <van-skeleton :row="2" round />
        </div>
      </template>

      <template v-else>
        <van-swipe-cell v-for="row in visible" :key="row.item.id" class="swipe-row">
          <div class="card wish-card" @click="openDetail(row)">
            <PosterImage class="poster" :poster-path="row.meta?.posterPath" :alt="row.item.titleSnapshot" />
            <div class="wish-info">
              <div class="title-line">
                <h3>{{ row.meta?.title ?? row.item.titleSnapshot }}</h3>
                <span v-if="row.viewedCount" class="seen-badge">
                  ✓ {{ row.viewedCount >= 2 ? `已看 ${row.viewedCount} 次` : '已看过' }}
                </span>
              </div>
              <p v-if="metaLine(row.meta)" class="sub">{{ metaLine(row.meta) }}</p>
              <p class="sub">想看于 {{ addedAtShort(row.item) }}</p>
            </div>
            <button
              class="watched-btn"
              :class="{ rewatch: row.viewedCount > 0 }"
              @click.stop="markWatched(row)"
            >
              {{ row.viewedCount ? '再记一次' : '✓ 看过' }}
            </button>
          </div>
          <template #right>
            <van-button square type="danger" text="移除" class="remove-btn" @click="remove(row)" />
          </template>
        </van-swipe-cell>

        <EmptyState
          v-if="!visible.length"
          :emoji="filter === 'pending' ? '🍿' : '⭐'"
          :title="filter === 'pending' ? '清单里的都看过啦' : '想看清单还是空的'"
          :subtitle="filter === 'pending' ? '去「全部」里回看，或搜下一部想看的' : '搜一部电影，安排下一次家庭观影'"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}

.navbar h1 {
  font-size: var(--t-20);
  font-weight: 600;
}

.filter {
  display: flex;
  gap: 8px;
  margin: 14px 0 12px;
}

.filter-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--c-border);
  border-radius: 999px;
  background: var(--c-card);
  color: var(--c-text-2);
  font-family: inherit;
  font-size: var(--t-13);
  cursor: pointer;
  transition: all 150ms ease-out;
}

.filter-btn.active {
  border-color: var(--c-primary);
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
  font-weight: 500;
}

.swipe-row {
  display: block;
  margin-bottom: 12px;
  border-radius: var(--r-card, 14px);
  overflow: hidden;
}

.wish-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
}

.poster {
  width: 72px;
  flex: none;
}

.wish-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.title-line h3 {
  font-size: var(--t-15);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seen-badge {
  flex: none;
  font-size: var(--t-11);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--c-bg);
  color: var(--c-text-3);
}

.sub {
  font-size: var(--t-12);
  color: var(--c-text-3);
}

.watched-btn {
  flex: none;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--c-primary);
  color: var(--c-card);
  font-family: inherit;
  font-size: var(--t-13);
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.watched-btn:active {
  background: var(--c-primary-active);
}

/* 已看过的：弱化为主色描边，弱化「再记一次」的重刷语义 */
.watched-btn.rewatch {
  background: var(--c-card);
  border: 1px solid var(--c-primary);
  color: var(--c-primary-active);
}

.remove-btn {
  height: 100%;
}

.skeleton {
  padding: 16px;
  margin-bottom: 12px;
}
</style>
