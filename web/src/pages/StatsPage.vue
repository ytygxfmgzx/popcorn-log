<script setup lang="ts">
import { computed, defineComponent, h, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useAppSettings } from '@/composables/useAppSettings';
import { computeStats, type StatsRange } from '@/stats/aggregate';
import { todayStr, formatDateFull } from '@/utils/date';
import { LOCATION_EMOJI } from '@/types';

/** 无记录空态（局部小组件，避免占用 components 目录） */
const EmptyHint = defineComponent({
  name: 'StatsEmptyHint',
  setup() {
    return () =>
      h('div', { class: 'card empty' }, '还没有观影记录，先去记一场电影，回来这里看你们的足迹 🎬');
  },
});

const { settings } = useAppSettings();
const router = useRouter();
const today = todayStr();

const { data: records } = useLiveQuery(() => db.records.toArray(), []);
const { data: movies } = useLiveQuery(() => db.movies.toArray(), []);

/* ---------- 筛选状态（时间窗单选 + 成员/地点/类型多选） ---------- */
const filter = reactive<{
  range: StatsRange;
  customStart?: string;
  customEnd?: string;
  members: string[];
  locations: string[];
  genres: string[];
}>({ range: 'all', members: [], locations: [], genres: [] });

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'halfYear', label: '半年' },
  { value: 'year', label: '一年' },
  { value: 'all', label: '全部' },
  { value: 'custom', label: '自定义…' },
];

const locationOptions = computed(() => settings.value.customLocations);
const genreOptions = computed(() => {
  const set = new Set<string>();
  for (const movie of movies.value) movie.genres.forEach((genre) => set.add(genre));
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'));
});

const timeDrop = ref();
const filterDrop = ref();

function pickRange(range: StatsRange): void {
  if (range === 'custom') {
    showCustom.value = true;
    return;
  }
  filter.range = range;
  timeDrop.value?.toggle(false);
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function toggleMember(member: string): void {
  filter.members = toggleIn(filter.members, member);
}

function toggleLocation(location: string): void {
  filter.locations = toggleIn(filter.locations, location);
}

function toggleGenre(genre: string): void {
  filter.genres = toggleIn(filter.genres, genre);
}

const activeFilterCount = computed(
  () => filter.members.length + filter.locations.length + filter.genres.length,
);

const filterTitle = computed(() =>
  activeFilterCount.value ? `筛选 · ${activeFilterCount.value}` : '筛选',
);

function resetFilter(): void {
  filter.members = [];
  filter.locations = [];
  filter.genres = [];
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
  timeDrop.value?.toggle(false);
}

/* ---------- 聚合 ---------- */
const stats = computed(() =>
  computeStats(records.value, movies.value, filter, settings.value.members, today),
);

const rangeLabel = computed(() => {
  if (filter.range === 'custom' && filter.customStart && filter.customEnd) {
    return `${filter.customStart} ~ ${filter.customEnd}`;
  }
  return RANGE_OPTIONS.find((option) => option.value === filter.range)?.label ?? '时间';
});

const hasRecords = computed(() => records.value.some((record) => !record.deleted));

const hoursLabel = computed(() => {
  const hours = stats.value.totalMinutes / 60;
  return hours >= 100 ? String(Math.round(hours)) : hours.toFixed(1);
});

/* ---------- 趋势折线（粒度随时间窗联动） ---------- */
const TREND_W = 320;
const TREND_H = 148;
const TREND_PAD = { top: 20, right: 14, bottom: 24, left: 14 };

const trendTitle = computed(() => {
  const map: Record<string, string> = { week: '周趋势', month: '月度趋势', year: '年度趋势' };
  return map[stats.value.trend.granularity] ?? '趋势';
});

const trendNote = computed(() => {
  const map: Record<string, string> = { week: '近 12 周', month: '近 12 个月', year: '按年' };
  return map[stats.value.trend.granularity] ?? '';
});

const trendTotal = computed(() =>
  stats.value.trend.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
);

const trendPoints = computed(() => {
  const buckets = stats.value.trend.buckets;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const innerW = TREND_W - TREND_PAD.left - TREND_PAD.right;
  const innerH = TREND_H - TREND_PAD.top - TREND_PAD.bottom;
  const step = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  return buckets.map((bucket, index) => ({
    ...bucket,
    x: TREND_PAD.left + step * index,
    y: TREND_PAD.top + innerH * (1 - bucket.count / max),
  }));
});

const trendPolyline = computed(() =>
  trendPoints.value.map((point) => `${point.x},${point.y}`).join(' '),
);

/* ---------- 在哪看 · 圆环 ---------- */
const DONUT_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
];

const locationDonut = computed(() => {
  const items = stats.value.locationDist;
  const total = items.reduce((sum, item) => sum + item.count, 0);
  let acc = 0;
  const segments = items.map((item, index) => {
    const start = total ? (acc / total) * 100 : 0;
    acc += item.count;
    const end = total ? (acc / total) * 100 : 0;
    return { ...item, color: DONUT_COLORS[index % DONUT_COLORS.length], start, end };
  });
  return { segments, total };
});

const donutStyle = computed(() => {
  const stops = locationDonut.value.segments
    .map((s) => `${s.color} ${s.start}% ${s.end}%`)
    .join(', ');
  return { background: `conic-gradient(${stops || 'var(--c-bg) 0% 100%'})` };
});

/* ---------- 类型 · 热力胶囊 ---------- */
const genreMax = computed(() => Math.max(...stats.value.genreDist.map((g) => g.count), 1));

function heatLevel(count: number): string {
  const ratio = count / genreMax.value;
  return ratio > 0.66 ? 'heat-3' : ratio > 0.33 ? 'heat-2' : 'heat-1';
}

/* ---------- 常看主创（去重影片数口径） ---------- */
const CAST_TOP = 10;
const DIRECTOR_TOP = 5;
const castTop = computed(() => stats.value.castBoard.slice(0, CAST_TOP));
const directorTop = computed(() => stats.value.directorBoard.slice(0, DIRECTOR_TOP));
const MEDALS = ['🥇', '🥈', '🥉'];

function rankBadge(index: number): string {
  return MEDALS[index] ?? String(index + 1);
}

function fmtDay(date: string): string {
  return formatDateFull(date).replace(/\s.*/, '');
}

/** 分布榜条目 → 明细列表（继承当前时间窗） */
function openDetail(
  kind: 'member' | 'location' | 'genre' | 'cast' | 'director',
  value: string,
): void {
  const query: Record<string, string> = { range: filter.range };
  if (kind === 'member') query.member = value;
  if (kind === 'location') query.location = value;
  if (kind === 'genre') query.genre = value;
  if (kind === 'cast' || kind === 'director') {
    query.person = value;
    query.personType = kind;
  }
  if (filter.range === 'custom') {
    query.start = filter.customStart ?? '';
    query.end = filter.customEnd ?? '';
  }
  void router.push({ path: '/stats/list', query });
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
        <!-- 时间窗 + 筛选（下拉，移动端省空间） -->
        <van-dropdown-menu class="drop-bar">
          <van-dropdown-item ref="timeDrop" :title="`时间 · ${rangeLabel}`">
            <div class="drop-list">
              <span
                v-for="option in RANGE_OPTIONS"
                :key="option.value"
                class="drop-row"
                :class="{ on: filter.range === option.value }"
                @click="pickRange(option.value)"
              >
                {{ option.label }}
                <em v-if="filter.range === option.value">✓</em>
              </span>
            </div>
          </van-dropdown-item>
          <van-dropdown-item ref="filterDrop" :title="filterTitle">
            <div class="drop-filter">
              <p class="drop-label">一起看<em class="drop-note">选多个 = 都在场</em></p>
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
              </div>
              <p class="drop-label">在哪看</p>
              <div class="chip-row">
                <span
                  v-for="location in locationOptions"
                  :key="location"
                  class="chip-btn"
                  :class="{ on: filter.locations.includes(location) }"
                  @click="toggleLocation(location)"
                >
                  {{ location }}
                </span>
              </div>
              <p class="drop-label">类型</p>
              <div class="chip-row">
                <span
                  v-for="genre in genreOptions"
                  :key="genre"
                  class="chip-btn"
                  :class="{ on: filter.genres.includes(genre) }"
                  @click="toggleGenre(genre)"
                >
                  {{ genre }}
                </span>
              </div>
              <div class="drop-actions">
                <van-button size="small" round @click="resetFilter">重置</van-button>
                <van-button size="small" round type="primary" @click="filterDrop?.toggle(false)">
                  完成
                </van-button>
              </div>
            </div>
          </van-dropdown-item>
        </van-dropdown-menu>

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
        </div>

        <!-- 趋势（粒度随时间窗联动：周/月/年折线） -->
        <div v-if="trendTotal" class="card block">
          <h3 class="block-title">
            {{ trendTitle }} <i class="title-note">{{ trendNote }}</i>
          </h3>
          <svg :viewBox="`0 0 ${TREND_W} ${TREND_H}`" class="trend-svg">
            <polyline
              :points="trendPolyline"
              fill="none"
              stroke="var(--c-primary)"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
            <template v-for="(point, index) in trendPoints" :key="point.key">
              <circle
                :cx="point.x"
                :cy="point.y"
                :r="point.count ? 3.2 : 2"
                :fill="point.count ? 'var(--c-primary-active)' : 'var(--c-border)'"
              />
              <text
                v-if="point.count"
                :x="point.x"
                :y="point.y - 8"
                class="trend-num"
              >
                {{ point.count }}
              </text>
              <text
                :x="point.x"
                :y="TREND_H - 6"
                class="trend-label"
                :text-anchor="index === 0 ? 'start' : index === trendPoints.length - 1 ? 'end' : 'middle'"
              >
                {{ point.label }}
              </text>
            </template>
          </svg>
        </div>

        <!-- 成员参与榜：胶囊按钮流（点击看明细） -->
        <div v-if="stats.memberBoard.length" class="card block">
          <h3 class="block-title">一起看 · 参与榜</h3>
          <div class="pill-wrap">
            <span
              v-for="item in stats.memberBoard"
              :key="item.name"
              class="pill"
              @click="openDetail('member', item.name)"
            >
              {{ item.name }}<em>×{{ item.count }}</em>
            </span>
          </div>
        </div>

        <!-- 地点分布：圆环 + 图例（图例点击看明细） -->
        <div v-if="stats.locationDist.length" class="card block">
          <h3 class="block-title">在哪看 · 分布</h3>
          <div class="donut-wrap">
            <div class="donut" :style="donutStyle">
              <div class="donut-hole">
                <b>{{ locationDonut.total }}</b>
                <i>场</i>
              </div>
            </div>
            <div class="donut-legend">
              <div
                v-for="segment in locationDonut.segments"
                :key="segment.name"
                class="legend-row"
                @click="openDetail('location', segment.name)"
              >
                <span class="legend-dot" :style="{ background: segment.color }"></span>
                <span class="legend-name">
                  {{ LOCATION_EMOJI[segment.name] ?? '📍' }} {{ segment.name }}
                </span>
                <span class="legend-count">{{ segment.count }} ›</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 类型分布：热力胶囊（浓度随次数，点击看明细） -->
        <div v-if="stats.genreDist.length" class="card block">
          <h3 class="block-title">
            类型分布 <i class="title-note">来自影片信息（TMDB）自动标记</i>
          </h3>
          <div class="heat-wrap">
            <span
              v-for="item in stats.genreDist"
              :key="item.name"
              class="heat-pill"
              :class="heatLevel(item.count)"
              @click="openDetail('genre', item.name)"
            >
              {{ item.name }}<em>{{ item.count }}</em>
            </span>
          </div>
        </div>

        <!-- 常看主创：演员/导演 TOP（去重影片数，点击看明细） -->
        <div v-if="castTop.length || directorTop.length" class="card block">
          <h3 class="block-title">
            常看主创 <i class="title-note">按看过的影片数</i>
          </h3>
          <template v-if="castTop.length">
            <p class="rank-label">演员 TOP{{ CAST_TOP }}</p>
            <div
              v-for="(item, index) in castTop"
              :key="`cast-${item.name}`"
              class="rank-row"
              @click="openDetail('cast', item.name)"
            >
              <span class="rank-badge">{{ rankBadge(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-count">{{ item.count }} 部 ›</span>
            </div>
          </template>
          <template v-if="directorTop.length">
            <p class="rank-label" :class="{ 'with-top': castTop.length }">导演 TOP{{ DIRECTOR_TOP }}</p>
            <div
              v-for="(item, index) in directorTop"
              :key="`director-${item.name}`"
              class="rank-row"
              @click="openDetail('director', item.name)"
            >
              <span class="rank-badge">{{ rankBadge(index) }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-count">{{ item.count }} 部 ›</span>
            </div>
          </template>
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

.drop-bar {
  border-radius: var(--r-btn);
  overflow: hidden;
  margin-bottom: 12px;
  --van-dropdown-menu-height: 40px;
}

.drop-list {
  padding: 4px 0;
}

.drop-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  font-size: var(--t-15);
  color: var(--c-text);
}

.drop-row.on {
  color: var(--c-primary-active);
  font-weight: 600;
}

.drop-row em {
  font-style: normal;
}

.drop-filter {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
}

.drop-label {
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin: 10px 0 6px;
}

.drop-label:first-child {
  margin-top: 0;
}

.drop-note {
  font-style: normal;
  font-size: 11px;
  margin-left: 6px;
  color: var(--c-text-3);
  opacity: 0.85;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.drop-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
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

.block {
  padding: 14px 16px;
  margin-top: 12px;
}

.block-title {
  font-size: var(--t-14);
  font-weight: 600;
  margin-bottom: 12px;
}

.block-title .title-note {
  font-style: normal;
  font-weight: 400;
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin-left: 6px;
}

/* 趋势折线（SVG 等比缩放自适应容器宽） */
.trend-svg {
  display: block;
  width: 100%;
  height: auto;
}

.trend-svg .trend-num {
  font-size: 9px;
  font-weight: 600;
  fill: var(--c-primary-active);
  text-anchor: middle;
}

.trend-svg .trend-label {
  font-size: 9px;
  fill: var(--c-text-3);
}

/* 参与榜 · 胶囊按钮流 */
.pill-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
  font-size: var(--t-14);
  font-weight: 600;
  cursor: pointer;
}

.pill em {
  font-style: normal;
  font-size: var(--t-12);
  font-weight: 400;
  color: var(--c-text-2);
}

.pill:active {
  opacity: 0.75;
}

/* 地点分布 · 圆环 + 图例 */
.donut-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
}

.donut {
  flex: none;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.donut-hole {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--c-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.donut-hole b {
  font-size: var(--t-20);
  font-weight: 700;
  color: var(--c-text);
  line-height: 1;
}

.donut-hole i {
  font-style: normal;
  font-size: 11px;
  color: var(--c-text-3);
}

.donut-legend {
  flex: 1;
  min-width: 0;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
}

.legend-row:active {
  opacity: 0.75;
}

.legend-dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.legend-name {
  flex: 1;
  min-width: 0;
  font-size: var(--t-14);
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-count {
  flex: none;
  font-size: var(--t-12);
  color: var(--c-text-3);
}

/* 类型分布 · 热力胶囊（浓度/字号随次数分档） */
.heat-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.heat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 150ms ease-out;
}

.heat-pill:active {
  transform: scale(0.94);
}

.heat-pill em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.8;
}

.heat-pill.heat-1 {
  background: var(--c-bg);
  color: var(--c-text-2);
  font-size: var(--t-12);
}

.heat-pill.heat-2 {
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
  font-size: var(--t-14);
}

.heat-pill.heat-3 {
  background: var(--c-primary);
  color: #fff;
  font-size: var(--t-15);
  font-weight: 600;
}

/* 常看主创 · 奖牌排行榜 */
.rank-label {
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin: 4px 0 6px;
}

.rank-label.with-top {
  margin-top: 14px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  cursor: pointer;
}

.rank-row:active {
  opacity: 0.75;
}

.rank-badge {
  flex: none;
  width: 24px;
  text-align: center;
  font-size: var(--t-14);
  font-weight: 700;
  color: var(--c-text-3);
}

.rank-name {
  flex: 1;
  min-width: 0;
  font-size: var(--t-15);
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-count {
  flex: none;
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
