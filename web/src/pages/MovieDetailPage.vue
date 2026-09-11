<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { db } from '@/db/dexie';
import { addToWatchlist, removeFromWatchlist } from '@/db/watchlist';
import { useLiveQuery } from '@/composables/useLiveQuery';
import PosterImage from '@/components/PosterImage.vue';
import { fetchAndCacheMovie } from '@/services/tmdb';
import { formatDateShort, formatRuntime } from '@/utils/date';
import { watchlistKey, type MediaType, type MovieMeta } from '@/types';

const route = useRoute();
const router = useRouter();

const mediaType = computed(() => (route.params.mediaType === 'tv' ? 'tv' : 'movie') as MediaType);
const tmdbId = computed(() => Number(route.params.tmdbId));
const brief = computed(() => ({
  mediaType: mediaType.value,
  tmdbId: tmdbId.value,
  title: meta.value?.title ?? '',
}));

const meta = ref<MovieMeta>();
const loadingMeta = ref(true);

/* 缓存优先秒显，无缓存在线拉取（想看入列时已预拉过，这里多为兜底） */
void (async () => {
  try {
    meta.value = await fetchAndCacheMovie(mediaType.value, tmdbId.value);
  } catch (error) {
    showToast(error instanceof Error ? error.message : '影片信息获取失败');
  } finally {
    loadingMeta.value = false;
  }
})();

/* 是否已在想看清单 */
const { data: watchlistItems } = useLiveQuery(() => db.watchlist.toArray(), []);
const inWatchlist = computed(() =>
  watchlistItems.value.some((item) => watchlistKey(item) === watchlistKey(brief.value)),
);

/* 同片观看记录（手帐），点击直达 */
const { data: allRecords } = useLiveQuery(() => db.records.toArray(), []);
const viewings = computed(() =>
  allRecords.value
    .filter(
      (record) => !record.deleted && record.mediaType === mediaType.value && record.tmdbId === tmdbId.value,
    )
    .sort((a, b) =>
      a.watchedDate === b.watchedDate
        ? a.updatedAt.localeCompare(b.updatedAt)
        : b.watchedDate.localeCompare(a.watchedDate),
    ),
);

const metaLine = computed(() => {
  if (!meta.value) return '';
  const parts: string[] = [];
  if (meta.value.releaseYear) parts.push(String(meta.value.releaseYear));
  if (meta.value.genres.length) parts.push(meta.value.genres.slice(0, 3).join('/'));
  if (meta.value.runtime) parts.push(formatRuntime(meta.value.runtime));
  return parts.join(' · ');
});

async function toggleWatchlist(): Promise<void> {
  if (!meta.value) return;
  if (inWatchlist.value) {
    await removeFromWatchlist(mediaType.value, tmdbId.value);
    showToast('已移除想看');
  } else {
    const added = await addToWatchlist({ ...brief.value, title: meta.value.title });
    showToast(added ? '已加入想看 ⭐' : '已经在想看清单里啦');
  }
}

function markWatched(): void {
  void router.push({
    path: '/record/new',
    query: { mediaType: mediaType.value, tmdbId: String(tmdbId.value), from: 'movie' },
  });
}

function starsOf(rating: number | null): string {
  return rating ? '★★★★★'.slice(0, rating) : '';
}
</script>

<template>
  <div>
    <header class="sub-navbar">
      <span class="back" @click="router.back()">‹</span>
      <h1>影片详情</h1>
    </header>

    <main class="page detail-page">
      <p v-if="loadingMeta" class="loading-hint">加载中…</p>

      <template v-else-if="meta">
        <!-- 元数据头部 -->
        <div class="card meta-card">
          <PosterImage class="poster" :poster-path="meta.posterPath" :alt="meta.title" />
          <div class="meta-info">
            <h2>{{ meta.title }}</h2>
            <p v-if="metaLine" class="sub">{{ metaLine }}</p>
            <p v-if="meta.director" class="sub">导演：{{ meta.director }}</p>
          </div>
        </div>

        <!-- 简介 -->
        <div v-if="meta.overview" class="card text-card">
          <span class="label">简介</span>
          <p>{{ meta.overview }}</p>
        </div>

        <!-- 主演 -->
        <div v-if="meta.cast.length" class="card text-card">
          <span class="label">主演</span>
          <p class="cast">{{ meta.cast.join(' · ') }}</p>
        </div>

        <!-- 同片观看记录 -->
        <div v-if="viewings.length" class="card text-card">
          <span class="label">看过 {{ viewings.length }} 次</span>
          <span
            v-for="record in viewings"
            :key="record.id"
            class="viewing-item"
            @click="router.push(`/record/${record.id}`)"
          >
            {{ formatDateShort(record.watchedDate) }} · {{ record.members.join('、') || '—' }}
            <i v-if="starsOf(record.rating)" class="stars">{{ starsOf(record.rating) }}</i>
            ›
          </span>
        </div>
      </template>

      <p v-else class="loading-hint">暂无影片信息</p>
    </main>

    <!-- 底部操作栏：看过快速记手帐 + 想看开关 -->
    <div v-if="meta" class="action-bar">
      <button class="secondary-btn" :class="{ active: inWatchlist }" @click="toggleWatchlist">
        {{ inWatchlist ? '★ 在想看清单' : '☆ 加入想看' }}
      </button>
      <button class="primary-btn" @click="markWatched">✓ 看过了，去记录</button>
    </div>
  </div>
</template>

<style scoped>
.sub-navbar {
  display: flex;
  align-items: center;
  padding: 12px 16px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  gap: 10px;
}

.sub-navbar h1 {
  font-size: var(--t-17);
  font-weight: 600;
  flex: 1;
}

.back {
  font-size: 22px;
  color: var(--c-text);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  margin-left: -6px;
}

.detail-page {
  padding-bottom: 84px;
}

.meta-card {
  display: flex;
  gap: 14px;
  padding: 14px;
}

.poster {
  width: 110px;
}

.meta-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-info h2 {
  font-size: var(--t-17);
  font-weight: 600;
}

.sub {
  font-size: var(--t-14);
  color: var(--c-text-2);
}

.text-card {
  margin-top: 12px;
  padding: 14px 16px;
}

.text-card .label {
  font-size: var(--t-12);
  color: var(--c-text-3);
  display: block;
}

.text-card p {
  font-size: var(--t-15);
  color: var(--c-text-2);
  line-height: 1.7;
  margin-top: 6px;
}

.cast {
  color: var(--c-text-2);
}

.viewing-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: var(--t-14);
  color: var(--c-text-2);
  margin-top: 8px;
  cursor: pointer;
}

.stars {
  font-style: normal;
  color: var(--c-star);
  letter-spacing: 1px;
  font-size: var(--t-12);
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: var(--c-bg);
  border-top: 1px solid var(--c-border);
}

.primary-btn,
.secondary-btn {
  height: 44px;
  border-radius: var(--r-btn);
  font-family: inherit;
  font-size: var(--t-15);
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease-out;
}

.primary-btn {
  flex: 1;
  border: none;
  background: var(--c-primary);
  color: var(--c-card);
}

.primary-btn:active {
  background: var(--c-primary-active);
}

.secondary-btn {
  flex: none;
  padding: 0 16px;
  background: var(--c-card);
  border: 1px solid var(--c-border);
  color: var(--c-text-2);
}

.secondary-btn.active {
  border-color: var(--c-primary);
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
}

.loading-hint {
  text-align: center;
  padding-top: 30vh;
  font-size: var(--t-14);
  color: var(--c-text-3);
}
</style>
