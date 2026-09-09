<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref } from 'vue';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useAppSettings } from '@/composables/useAppSettings';
import { computeStats, type StatsRange } from '@/stats/aggregate';
import { todayStr, formatDateFull } from '@/utils/date';
import { PRESET_LOCATIONS } from '@/types';

/** 无记录空态（局部小组件，避免占用 components 目录） */
const EmptyHint = defineComponent({
  name: 'StatsEmptyHint',
  setup() {
    return () =>
      h('div', { class: 'card empty' }, '还没有观影记录，先去记一场电影，回来这里看你们的足迹 🎬');
  },
});

const { settings } = useAppSettings();
const today = todayStr();

const { data: records } = useLiveQuery(() => db.records.toArray(), []);
const { data: movies } = useLiveQuery(() => db.movies.toArray(), []);

/* ---------- 筛选状态 ---------- */
const filter = reactive<{
  range: StatsRange;
  customStart?: string;
  customEnd?: string;
  members: string[];
  location?: string;
  genre?: string;
}>({ range: 'all', members: [] });

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'halfYear', label: '半年' },
  { value: 'year', label: '一年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义' },
];

const locationOptions = computed(() => [...PRESET_LOCATIONS, ...settings.value.customLocations]);
const genreOptions = computed(() => {
  const set = new Set<string>();
  for (const movie of movies.value) movie.genres.forEach((genre) => set.add(genre));
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
});

function pickRange(range: StatsRange): void {
  if (range === 'custom') {
    showCustom.value = true;
    return;
  }
  filter.range = range;
}

function toggleMember(member: string): void {
  filter.members = filter.members.includes(member)
    ? filter.members.filter((item) => item !== member)
    : [...filter.members, member];
}

function toggleOptional(key: 'location' | 'genre', value: string): void {
  filter[key] = filter[key] === value ? undefined : value;
}

/* ---------- 自定义时间段 ---------- */
const showCustom = ref(false);
const showDatePicker = ref(false);
const picking = ref<'start' | 'end'>('start');
const dateModel = ref<string[]>(today.split('-'));

function openDatePicker(which: 'start' | 'end'): void {
  picking.value = which;
  const base = which === 'start' ? filter.customStart : filter.customEnd;
  dateModel.value = (base ?? today).split('-');
  showDatePicker.value = true;
}

function confirmDate(): void {
  const value = dateModel.value.join('-');
  if (picking.value === 'start') filter.customStart = value;
  else filter.customEnd = value;
  showDatePicker.value = false;
}

function applyCustom(): void {
  if (!filter.customStart || !filter.customEnd || filter.customStart > filter.customEnd) return;
  filter.range = 'custom';
  showCustom.value = false;
}

/* ---------- 聚合 ---------- */
const stats = computed(() =>
  computeStats(records.value, movies.value, filter, settings.value.members, today),
);

const rangeLabel = computed(() => {
  if (filter.range === 'custom' && filter.customStart && filter.customEnd) {
    return `${filter.customStart} ~ ${filter.customEnd}`;
  }
  return RANGE_OPTIONS.find((option) => option.value === filter.range)?.label ?? '';
});

const hasRecords = computed(() => records.value.some((record) => !record.deleted));

const hoursLabel = computed(() => {
  const hours = stats.value.totalMinutes / 60;
  return hours >= 100 ? String(Math.round(hours)) : hours.toFixed(1);
});

/* 月度柱状：高度百分比（max 归一） */
const monthlyMax = computed(() => Math.max(...stats.value.monthly.map((m) => m.count), 1));

function barHeight(count: number): string {
  return `${Math.round((count / monthlyMax.value) * 100)}%`;
}

function barDistMax(list: { count: number }[]): number {
  return Math.max(...list.map((item) => item.count), 1);
}

function fmtDay(date: string): string {
  return formatDateFull(date).replace(/\s.*/, '');
}
</script>

<template>
  <div>
    <header class="navbar">
      <h1>统计</h1>
    </header>

    <main class="page">
      <EmptyHint v-if="!hasRecords" />

      <template v-else>
        <!-- 时间窗 -->
        <div class="chip-row">
          <span
            v-for="option in RANGE_OPTIONS"
            :key="option.value"
            class="chip-btn"
            :class="{ on: filter.range === option.value }"
            @click="pickRange(option.value)"
          >
            {{ option.label }}
          </span>
        </div>

        <!-- 筛选：成员（多选）/ 地点 / 类型（反查入口） -->
        <div class="chip-row">
          <span
            v-for="member in settings.members"
            :key="member"
            class="chip-btn"
            :class="{ on: filter.members.includes(member) }"
            @click="toggleMember(member)"
          >
            {{ member }}
          </span>
          <span
            v-for="location in locationOptions"
            :key="location"
            class="chip-btn"
            :class="{ on: filter.location === location }"
            @click="toggleOptional('location', location)"
          >
            {{ location }}
          </span>
          <span
            v-for="genre in genreOptions"
            :key="genre"
            class="chip-btn"
            :class="{ on: filter.genre === genre }"
            @click="toggleOptional('genre', genre)"
          >
            {{ genre }}
          </span>
        </div>

        <!-- 总览卡 -->
        <div class="card overview">
          <div class="ov-grid">
            <div class="ov-cell">
              <b>{{ stats.viewings }}</b>
              <i>场次 · {{ stats.uniqueMovies }} 部</i>
            </div>
            <div class="ov-cell">
              <b>{{ hoursLabel }}<em>小时</em></b>
              <i>累计观影</i>
            </div>
            <div class="ov-cell">
              <b>{{ stats.avgRating ?? '—' }}</b>
              <i>平均评分</i>
            </div>
            <div class="ov-cell">
              <b>{{ stats.familyCount }}</b>
              <i>全家同看</i>
            </div>
          </div>
          <p class="ov-range">{{ rangeLabel }}</p>
        </div>

        <!-- 月度趋势 -->
        <div v-if="stats.viewings" class="card block">
          <h3 class="block-title">月度趋势</h3>
          <div class="bars">
            <div v-for="month in stats.monthly" :key="month.name" class="bar-col">
              <div class="bar-track">
                <div
                  class="bar"
                  :class="{ dim: month.count === 0 }"
                  :style="{ height: barHeight(month.count) }"
                ></div>
              </div>
              <span class="bar-label">{{ month.name.slice(5) }}</span>
            </div>
          </div>
        </div>

        <!-- 成员参与榜（点击反查） -->
        <div v-if="stats.memberBoard.length" class="card block">
          <h3 class="block-title">一起看 · 参与榜</h3>
          <div
            v-for="item in stats.memberBoard"
            :key="item.name"
            class="hbar-row"
            @click="toggleMember(item.name)"
          >
            <span class="hbar-name">{{ item.name }}</span>
            <div class="hbar-track">
              <div
                class="hbar-fill"
                :style="{ width: `${(item.count / barDistMax(stats.memberBoard)) * 100}%` }"
              ></div>
            </div>
            <span class="hbar-count">{{ item.count }}</span>
          </div>
        </div>

        <!-- 类型分布 -->
        <div v-if="stats.genreDist.length" class="card block">
          <h3 class="block-title">类型分布</h3>
          <div
            v-for="item in stats.genreDist"
            :key="item.name"
            class="hbar-row"
            @click="toggleOptional('genre', item.name)"
          >
            <span class="hbar-name">{{ item.name }}</span>
            <div class="hbar-track">
              <div
                class="hbar-fill"
                :style="{ width: `${(item.count / barDistMax(stats.genreDist)) * 100}%` }"
              ></div>
            </div>
            <span class="hbar-count">{{ item.count }}</span>
          </div>
        </div>

        <!-- 地点分布 -->
        <div v-if="stats.locationDist.length" class="card block">
          <h3 class="block-title">在哪看 · 分布</h3>
          <div
            v-for="item in stats.locationDist"
            :key="item.name"
            class="hbar-row"
            @click="toggleOptional('location', item.name)"
          >
            <span class="hbar-name">{{ item.name }}</span>
            <div class="hbar-track">
              <div
                class="hbar-fill"
                :style="{ width: `${(item.count / barDistMax(stats.locationDist)) * 100}%` }"
              ></div>
            </div>
            <span class="hbar-count">{{ item.count }}</span>
          </div>
        </div>
      </template>
    </main>

    <!-- 自定义时间段 -->
    <van-popup
      v-model:show="showCustom"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <div class="sheet">
        <h3>自定义时间段</h3>
        <div class="field-like" @click="openDatePicker('start')">
          🗓 {{ filter.customStart ? fmtDay(filter.customStart) : '开始日期' }}
        </div>
        <div class="field-like" @click="openDatePicker('end')">
          🗓 {{ filter.customEnd ? fmtDay(filter.customEnd) : '结束日期' }}
        </div>
        <van-button block round type="primary" class="sheet-btn" @click="applyCustom">
          确定
        </van-button>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showDatePicker"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <van-date-picker
        v-model="dateModel"
        :title="picking === 'start' ? '开始日期' : '结束日期'"
        :min-date="new Date(2000, 0, 1)"
        :max-date="new Date()"
        @confirm="confirmDate"
        @cancel="showDatePicker = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  padding: 12px 16px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}

.navbar h1 {
  font-size: var(--t-20);
  font-weight: 600;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.overview {
  padding: 16px;
}

.ov-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ov-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.ov-cell b {
  font-size: 22px;
  font-weight: 700;
  color: var(--c-primary-active);
  line-height: 1.1;
}

.ov-cell b em {
  font-style: normal;
  font-size: var(--t-12);
  font-weight: 400;
  margin-left: 2px;
}

.ov-cell i {
  font-style: normal;
  font-size: var(--t-12);
  color: var(--c-text-3);
}

.ov-range {
  margin-top: 12px;
  text-align: center;
  font-size: var(--t-12);
  color: var(--c-text-3);
}

.block {
  padding: 14px 16px;
  margin-top: 12px;
}

.block-title {
  font-size: var(--t-14);
  font-weight: 600;
  margin-bottom: 12px;
}

/* 月度柱状 */
.bars {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.bar-track {
  height: 96px;
  display: flex;
  align-items: flex-end;
}

.bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  background: var(--c-primary);
  min-height: 2px;
  transition: height 200ms ease-out;
}

.bar.dim {
  background: var(--c-bg);
  min-height: 2px;
}

.bar-label {
  text-align: center;
  font-size: 10px;
  color: var(--c-text-3);
}

/* 横向条形 */
.hbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  cursor: pointer;
}

.hbar-name {
  flex: none;
  width: 64px;
  font-size: var(--t-13);
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hbar-track {
  flex: 1;
  height: 10px;
  background: var(--c-bg);
  border-radius: 999px;
  overflow: hidden;
}

.hbar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--c-primary), var(--c-primary-active));
  transition: width 200ms ease-out;
}

.hbar-count {
  flex: none;
  width: 28px;
  text-align: right;
  font-size: var(--t-12);
  color: var(--c-text-3);
}

/* 自定义时间段弹层 */
.sheet {
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
}

.sheet h3 {
  font-size: var(--t-17);
  font-weight: 600;
  margin-bottom: 12px;
  text-align: center;
}

.field-like {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  background: var(--c-bg);
  border-radius: var(--r-btn);
  padding: 0 14px;
  font-size: var(--t-15);
  color: var(--c-text);
  cursor: pointer;
  margin-bottom: 12px;
}

.sheet-btn {
  margin-top: 4px;
}

.empty {
  padding: 32px 20px;
  text-align: center;
  font-size: var(--t-14);
  color: var(--c-text-3);
  line-height: 1.8;
}
</style>
