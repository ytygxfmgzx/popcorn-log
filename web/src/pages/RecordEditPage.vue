<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { db } from '@/db/dexie';
import { saveRecord } from '@/db/records';
import { removeFromWatchlist } from '@/db/watchlist';
import { getAppSettings, saveAppSettings } from '@/db/settings';
import { fetchAndCacheMovie, getCachedMovie, type MovieBrief } from '@/services/tmdb';
import MoviePicker from '@/components/MoviePicker.vue';
import MemberChips from '@/components/MemberChips.vue';
import LocationPicker from '@/components/LocationPicker.vue';
import StarRating from '@/components/StarRating.vue';
import PosterImage from '@/components/PosterImage.vue';
import { todayStr, formatRuntime } from '@/utils/date';
import { newId } from '@/utils/id';
import type { MediaType, MovieMeta, WatchRecord } from '@/types';

const route = useRoute();
const router = useRouter();

const editingId = computed(() => (route.params.id ? String(route.params.id) : null));
const isEdit = computed(() => editingId.value !== null);

/** 编辑前的原始记录（保存时保留 id/createdAt 等不可变字段） */
let original: WatchRecord | undefined;

const selected = ref<MovieBrief | null>(null);
const meta = ref<MovieMeta | null>(null);
const loadingMeta = ref(false);

const form = reactive({
  watchedDate: todayStr(),
  location: '家里',
  members: [] as string[],
  rating: 0,
  note: '',
  quote: '',
});

onMounted(async () => {
  if (!editingId.value) {
    // 新记录：默认记住上次成员组合（直接查库，liveQuery 挂载瞬间尚未就绪）
    const appSettings = await getAppSettings();
    if (appSettings.lastMembersCombo?.length) {
      form.members = [...appSettings.lastMembersCombo];
    }
    // 想看列表 / 影片详情的「看过」入口：query 带片直接预填
    const queryType = route.query.mediaType;
    const preMediaType =
      queryType === 'movie' || queryType === 'tv' ? (queryType as MediaType) : null;
    const preTmdbId = Number(route.query.tmdbId);
    if (preMediaType && Number.isFinite(preTmdbId) && preTmdbId > 0) {
      await preselect(preMediaType, preTmdbId);
    }
    return;
  }
  const record = await db.records.get(editingId.value);
  if (!record || record.deleted) {
    showToast('记录不存在');
    void router.replace('/');
    return;
  }
  original = record;
  selected.value = {
    mediaType: record.mediaType,
    tmdbId: record.tmdbId,
    title: record.titleSnapshot,
  };
  meta.value = (await getCachedMovie(record.mediaType, record.tmdbId)) ?? null;
  form.watchedDate = record.watchedDate;
  form.location = record.location;
  form.members = [...record.members];
  form.rating = record.rating ?? 0;
  form.note = record.note ?? '';
  form.quote = record.quote ?? '';
});

async function onSelect(brief: MovieBrief): Promise<void> {
  loadingMeta.value = true;
  try {
    meta.value = await fetchAndCacheMovie(brief.mediaType, brief.tmdbId);
    selected.value = brief;
  } catch (error) {
    showToast(error instanceof Error ? error.message : '影片信息获取失败');
  } finally {
    loadingMeta.value = false;
  }
}

/** query 预填（等价搜索选中，失败留在空表单由用户手动搜） */
async function preselect(mediaType: MediaType, tmdbId: number): Promise<void> {
  loadingMeta.value = true;
  try {
    const loaded = await fetchAndCacheMovie(mediaType, tmdbId);
    meta.value = loaded;
    selected.value = { mediaType, tmdbId, title: loaded.title };
  } catch (error) {
    showToast(error instanceof Error ? error.message : '影片信息获取失败');
  } finally {
    loadingMeta.value = false;
  }
}

/** 日期选择弹层 */
const showDatePicker = ref(false);
const pickerModel = ref<string[]>(todayStr().split('-'));

function openDatePicker(): void {
  pickerModel.value = form.watchedDate.split('-');
  showDatePicker.value = true;
}

function confirmDate(): void {
  form.watchedDate = pickerModel.value.join('-');
  showDatePicker.value = false;
}

const dateLabel = computed(() =>
  form.watchedDate === todayStr() ? `${form.watchedDate}（今天）` : form.watchedDate,
);

const metaLine = computed(() => {
  if (!meta.value) return '';
  const parts: string[] = [];
  if (meta.value.releaseYear) parts.push(String(meta.value.releaseYear));
  if (meta.value.genres.length) parts.push(meta.value.genres.slice(0, 3).join('/'));
  if (meta.value.runtime) parts.push(formatRuntime(meta.value.runtime));
  return parts.join(' · ');
});

async function save(): Promise<void> {
  const currentMeta = meta.value;
  const brief = selected.value;
  if (!brief || !currentMeta) {
    showToast('先搜索并选择影片');
    return;
  }
  const now = new Date().toISOString();
  const base = isEdit.value && original
    ? original
    : {
        id: newId(),
        mediaType: brief.mediaType,
        tmdbId: brief.tmdbId,
        titleSnapshot: currentMeta.title,
        createdAt: now,
      };

  const record: WatchRecord = {
    ...base,
    titleSnapshot: currentMeta.title,
    watchedDate: form.watchedDate,
    location: form.location,
    members: [...form.members],
    rating: form.rating || null,
    note: form.note.trim() || undefined,
    quote: form.quote.trim() || undefined,
    updatedAt: now,
  };

  await saveRecord(record);
  await saveAppSettings({ lastMembersCombo: [...form.members] });
  // 新增手帐 = 看过了：自动移出想看清单（不在列时为 no-op；编辑旧手帐不动，防误删）
  if (!isEdit.value) {
    await removeFromWatchlist(brief.mediaType, brief.tmdbId);
  }
  showToast('已保存');
  if (isEdit.value) {
    router.back();
  } else if (route.query.from === 'watchlist') {
    void router.replace('/watchlist');
  } else if (route.query.from === 'movie') {
    router.back();
  } else {
    void router.replace('/');
  }
}
</script>

<template>
  <div>
    <header class="sub-navbar">
      <span class="back" @click="router.back()">‹</span>
      <h1>{{ isEdit ? '编辑观影记忆' : '记一场电影' }}</h1>
    </header>

    <main class="page">
      <!-- ① 搜片（唯一必打字段） -->
      <MoviePicker @select="onSelect" />

      <!-- ② 选片后自动填充的元数据卡（零输入） -->
      <div v-if="selected" class="card meta-card">
        <PosterImage class="poster" :poster-path="meta?.posterPath" :alt="selected.title" />
        <div class="meta-info">
          <h3>{{ meta?.title ?? selected.title }}</h3>
          <p v-if="metaLine" class="sub">{{ metaLine }}</p>
          <p v-if="meta?.director" class="sub">导演：{{ meta.director }}</p>
          <p v-if="loadingMeta" class="sub"><van-loading size="14" /> 拉取影片信息…</p>
        </div>
      </div>

      <!-- ③ 观影日期 -->
      <section class="form-block">
        <label>观影日期 <i>默认今天 · 支持补记</i></label>
        <div class="field-like" @click="openDatePicker">📅&nbsp; {{ dateLabel }}</div>
      </section>

      <!-- ④ 在哪看 -->
      <section class="form-block">
        <label>在哪看</label>
        <LocationPicker v-model="form.location" />
      </section>

      <!-- ⑤ 一起看 -->
      <section class="form-block">
        <label>一起看 <i>记住上次组合</i></label>
        <MemberChips v-model="form.members" />
      </section>

      <!-- ⑥ 评分 -->
      <section class="form-block">
        <label>评分 <i>可不评</i></label>
        <StarRating v-model="form.rating" />
      </section>

      <!-- ⑦ 手记 -->
      <section class="form-block">
        <label>手记</label>
        <div class="textarea-wrap">
          <textarea
            v-model="form.note"
            placeholder="全家第一次一起看，妹妹全程目不转睛…"
            rows="3"
          ></textarea>
        </div>
      </section>

      <!-- ⑧ 孩子原话（核心情感点） -->
      <section class="form-block">
        <label>孩子的原话 <i>值得记住的瞬间</i></label>
        <div class="textarea-wrap quote">
          <textarea
            v-model="form.quote"
            placeholder="妹妹：&quot;波妞来我们家住好不好呀？&quot;"
            rows="2"
          ></textarea>
        </div>
      </section>

      <button class="save-btn" :disabled="loadingMeta" @click="save">保存这条记忆</button>
    </main>

    <!-- 日期选择弹层 -->
    <van-popup
      v-model:show="showDatePicker"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <van-date-picker
        v-model="pickerModel"
        title="选择观影日期"
        :min-date="new Date(2000, 0, 1)"
        :max-date="new Date()"
        @confirm="confirmDate"
        @cancel="showDatePicker = false"
      />
    </van-popup>
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
}

.back {
  font-size: 22px;
  color: var(--c-text);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  margin-left: -6px;
}

.meta-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  margin-top: 12px;
}

.poster {
  width: 92px;
}

.meta-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-info h3 {
  font-size: var(--t-17);
  font-weight: 600;
}

.sub {
  font-size: var(--t-12);
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 4px;
}

.form-block {
  margin-top: 16px;
}

.form-block > label {
  display: block;
  font-size: var(--t-15);
  font-weight: 600;
  margin-bottom: 8px;
}

.form-block > label i {
  font-style: normal;
  font-weight: 400;
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin-left: 6px;
}

.field-like {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  padding: 0 14px;
  font-size: var(--t-15);
  color: var(--c-text);
  cursor: pointer;
}

.textarea-wrap {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--r-btn);
  padding: 10px 14px;
}

.textarea-wrap.quote {
  border-left: 3px solid var(--c-primary);
}

.textarea-wrap textarea {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--t-15);
  color: var(--c-text);
  resize: none;
}

.textarea-wrap textarea::placeholder {
  color: var(--c-text-3);
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 46px;
  margin-top: 20px;
  border: none;
  border-radius: var(--r-btn);
  background: var(--c-primary);
  color: var(--c-card);
  font-family: inherit;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.save-btn:active {
  background: var(--c-primary-active);
}

.save-btn:disabled {
  opacity: 0.5;
}
</style>
