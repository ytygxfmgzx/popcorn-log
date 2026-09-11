<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { apiBase } from '@/services/api';
import { searchTitles, type MovieBrief } from '@/services/tmdb';

/**
 * 搜片联想：唯一必打字段。防抖 300ms → 经 Worker 调 TMDB multi 搜索。
 * 搜索结果小图直连 Worker（w92，不入 blob 库）；选中后的海报由元数据卡负责缓存。
 */
const props = defineProps<{
  placeholder?: string;
}>();

const emit = defineEmits<{
  select: [brief: MovieBrief];
}>();

const query = ref('');
const results = ref<MovieBrief[]>([]);
const searching = ref(false);
const searched = ref(false);
const errorMessage = ref('');

const workerBase = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  workerBase.value = await apiBase();
});

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!value.trim()) {
    results.value = [];
    searched.value = false;
    errorMessage.value = '';
    return;
  }
  debounceTimer = setTimeout(() => void doSearch(value), 300);
});

async function doSearch(value: string): Promise<void> {
  searching.value = true;
  errorMessage.value = '';
  try {
    results.value = await searchTitles(value);
    searched.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '搜索失败，请检查网络';
    results.value = [];
  } finally {
    searching.value = false;
  }
}

function pick(brief: MovieBrief): void {
  query.value = '';
  emit('select', brief);
}

function posterUrl(posterPath?: string): string | undefined {
  if (!posterPath) return undefined;
  return `${workerBase.value}/image/t/p/w92${posterPath}`;
}
</script>

<template>
  <div class="movie-picker">
    <div class="search-field" :class="{ focus: query }">
      <span class="icon">🎬</span>
      <input
        v-model="query"
        type="search"
        :placeholder="props.placeholder ?? '搜片名，如“波妞”'"
        enterkeyhint="search"
      />
      <span v-if="searching" class="loading"><van-loading size="16" /></span>
    </div>

    <div v-if="results.length" class="result-panel">
      <button
        v-for="brief in results"
        :key="`${brief.mediaType}-${brief.tmdbId}`"
        class="result-row"
        @click="pick(brief)"
      >
        <img v-if="posterUrl(brief.posterPath)" :src="posterUrl(brief.posterPath)" alt="" />
        <span v-else class="mini-placeholder">🎞</span>
        <span class="brief">
          <b>{{ brief.title }}</b>
          <em>{{ brief.releaseYear ?? '' }} · {{ brief.mediaType === 'tv' ? '剧' : '电影' }}</em>
        </span>
      </button>
    </div>
    <p v-else-if="searched && !searching && !errorMessage" class="hint">
      没找到「{{ query }}」，换个关键词试试
    </p>
    <p v-else-if="errorMessage" class="hint error">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  padding: 0 14px;
  color: var(--c-text-2);
  transition: border-color 150ms ease-out;
}

.search-field.focus {
  border-color: var(--c-primary);
  color: var(--c-text);
  background: var(--c-card);
}

.search-field input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--t-15);
  color: var(--c-text);
}

.search-field input::placeholder {
  color: var(--c-text-3);
}

.result-panel {
  margin-top: 8px;
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  padding: 4px 10px;
}

.result-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 8px 4px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.result-row + .result-row {
  border-top: 1px solid var(--c-bg);
}

.result-row img,
.mini-placeholder {
  flex: none;
  width: 34px;
  height: 50px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--c-primary-weak);
  display: flex;
  align-items: center;
  justify-content: center;
}

.brief {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.brief b {
  font-size: var(--t-15);
  font-weight: 500;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brief em {
  font-style: normal;
  font-size: var(--t-12);
  color: var(--c-text-3);
  flex: none;
}

.hint {
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin-top: 8px;
}

.hint.error {
  color: var(--c-danger);
}
</style>
