<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { db } from '@/db/dexie';
import { tombstoneRecord } from '@/db/records';
import { useLiveQuery } from '@/composables/useLiveQuery';
import PosterImage from '@/components/PosterImage.vue';
import { getCachedMovie } from '@/services/tmdb';
import { formatDateFull, formatRuntime } from '@/utils/date';
import { LOCATION_EMOJI, type MovieMeta, type WatchRecord } from '@/types';

const route = useRoute();
const router = useRouter();
const recordId = computed(() => String(route.params.id ?? ''));

const { data: record } = useLiveQuery<WatchRecord | undefined>(
  () => db.records.get(recordId.value),
  undefined,
);

const meta = ref<MovieMeta>();

void (async () => {
  const current = await db.records.get(recordId.value);
  if (current && !current.deleted) {
    meta.value = await getCachedMovie(current.mediaType, current.tmdbId);
  }
})();

const stars = computed(() => '★★★★★'.slice(0, record.value?.rating ?? 0));

const metaLine = computed(() => {
  if (!meta.value) return '';
  const parts: string[] = [];
  if (meta.value.releaseYear) parts.push(String(meta.value.releaseYear));
  if (meta.value.genres.length) parts.push(meta.value.genres.slice(0, 3).join('/'));
  if (meta.value.runtime) parts.push(formatRuntime(meta.value.runtime));
  return parts.join(' · ');
});

function edit(): void {
  void router.push(`/record/${recordId.value}/edit`);
}

async function remove(): Promise<void> {
  const current = record.value;
  if (!current) return;
  try {
    await showConfirmDialog({
      title: '删除这条观影记忆？',
      message: '删除后仍保留云端档案，可恢复',
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--c-danger)',
      cancelButtonText: '再想想',
    });
  } catch {
    return; // 用户取消
  }
  await tombstoneRecord(current);
  showToast('已删除');
  void router.replace('/');
}
</script>

<template>
  <div v-if="record && !record.deleted">
    <header class="sub-navbar">
      <span class="back" @click="router.back()">‹</span>
      <h1>观影记忆</h1>
      <span class="edit" @click="edit">编辑</span>
    </header>

    <main class="page">
      <!-- 元数据头部 -->
      <div class="card meta-card">
        <PosterImage class="poster" :poster-path="meta?.posterPath" :alt="record.titleSnapshot" />
        <div class="meta-info">
          <h2>{{ record.titleSnapshot }}</h2>
          <p v-if="metaLine" class="sub">{{ metaLine }}</p>
          <p v-if="meta?.director" class="sub">导演：{{ meta.director }}</p>
          <span class="auto-badge">✨ 影片信息自动填充</span>
        </div>
      </div>

      <!-- 手账信息 -->
      <div class="card info-card">
        <div class="row">
          <span class="label">日期</span>
          <span>{{ formatDateFull(record.watchedDate) }}</span>
        </div>
        <div class="row">
          <span class="label">地点</span>
          <span>{{ LOCATION_EMOJI[record.location] ?? '📍' }} {{ record.location }}</span>
        </div>
        <div v-if="record.members.length" class="row">
          <span class="label">成员</span>
          <span class="members">
            <em v-for="member in record.members" :key="member">{{ member }}</em>
          </span>
        </div>
        <div v-if="record.rating" class="row">
          <span class="label">评分</span>
          <span class="stars">{{ stars }}</span>
        </div>
      </div>

      <!-- 孩子原话（核心情感点） -->
      <div v-if="record.quote" class="card quote-card">
        <span class="label">孩子的原话</span>
        <p>“{{ record.quote }}”</p>
      </div>

      <!-- 手记 -->
      <div v-if="record.note" class="card note-card">
        <span class="label">手记</span>
        <p>{{ record.note }}</p>
      </div>

      <button class="delete-btn" @click="remove">删除这条记忆</button>
    </main>
  </div>

  <div v-else class="page">
    <p class="loading-hint">记录加载中…</p>
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

.edit {
  font-size: var(--t-14);
  color: var(--c-primary);
  cursor: pointer;
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

.auto-badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--t-12);
  color: var(--c-primary-active);
  background: var(--c-primary-weak);
  border-radius: 999px;
  padding: 2px 8px;
  margin-top: auto;
}

.info-card {
  margin-top: 12px;
  padding: 4px 16px;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 10px 0;
  font-size: var(--t-15);
}

.row + .row {
  border-top: 1px solid var(--c-bg);
}

.label {
  flex: none;
  width: 44px;
  font-size: var(--t-14);
  color: var(--c-text-3);
}

.members {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.members em {
  font-style: normal;
  font-size: var(--t-12);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
}

.stars {
  color: var(--c-star);
  letter-spacing: 2px;
}

.quote-card,
.note-card {
  margin-top: 12px;
  padding: 14px 16px;
}

.quote-card {
  border-left: 3px solid var(--c-primary);
}

.quote-card p {
  font-size: var(--t-17);
  font-weight: 500;
  margin-top: 6px;
  line-height: 1.7;
}

.note-card p {
  font-size: var(--t-15);
  color: var(--c-text-2);
  margin-top: 6px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.card .label {
  font-size: var(--t-12);
  color: var(--c-text-3);
  width: auto;
}

.delete-btn {
  display: block;
  margin: 24px auto 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: var(--t-14);
  color: var(--c-danger);
  cursor: pointer;
  padding: 8px 16px;
}

.loading-hint {
  text-align: center;
  padding-top: 40vh;
  font-size: var(--t-14);
  color: var(--c-text-3);
}
</style>
