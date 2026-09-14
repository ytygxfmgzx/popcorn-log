<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useAppSettings } from '@/composables/useAppSettings';
import StatsFilterBar from '@/components/StatsFilterBar.vue';
import { statsFilter, filterToQuery } from '@/stats/filter-state';
import { computeStats, type RewatchItem, type StatsFilter } from '@/stats/aggregate';
import { computeCalendarYear, type CalendarDay } from '@/stats/calendar';
import { formatDateShort, todayStr } from '@/utils/date';
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

/* ---------- 筛选状态：filter-state 单例（StatsFilterBar 读写，与明细页共享） ---------- */
// 统计页不支持主创/影片筛选；从明细页返回时清掉残留，避免图表被带上 person/movie 条件
onMounted(() => {
  statsFilter.person = undefined;
  statsFilter.movie = undefined;
});

/* ---------- 聚合 ---------- */
const stats = computed(() =>
  computeStats(records.value, movies.value, statsFilter, settings.value.members, today),
);

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

/* ---------- 观影日历（条件筛选生效、时间窗不裁剪；自带年份维度） ---------- */
const CAL_CELL = 11;
const CAL_GAP = 2;
const thisYear = Number(today.slice(0, 4));
const calScrollRef = ref<HTMLElement | null>(null);

const earliestYear = computed(() => {
  let earliest = thisYear;
  for (const record of records.value) {
    if (record.deleted) continue;
    const year = Number(record.watchedDate.slice(0, 4));
    if (year < earliest) earliest = year;
  }
  return earliest;
});

const calYear = ref(thisYear);
const calendar = computed(() =>
  computeCalendarYear(records.value, movies.value, statsFilter, calYear.value, today),
);

/** 月份标签：每月 1 号所在列（列宽 = 格子 11 + 间隔 2） */
const calMonthMarks = computed(() => {
  const marks: { label: string; col: number }[] = [];
  calendar.value.weeks.forEach((week, col) => {
    const first = week.find((day) => day.inYear && day.date.endsWith('-01'));
    if (first) marks.push({ label: `${Number(first.date.slice(5, 7))}月`, col });
  });
  return marks;
});

function calHeatClass(day: CalendarDay): string[] {
  const level = day.count === 0 ? 0 : day.count === 1 ? 1 : day.count === 2 ? 2 : 3;
  const classes = [`cal-${level}`];
  if (!day.inYear) classes.push('out');
  if (day.future) classes.push('future');
  return classes;
}

// 年份切换/数据就绪后滚动定位：今年滚到今天所在列，往年回到开头
// （监听 calendar：首屏 liveQuery 异步到数后也要重新定位）
watch(
  [calYear, calendar],
  () => {
    const el = calScrollRef.value;
    if (!el) return;
    if (calYear.value !== thisYear) {
      el.scrollLeft = 0;
      return;
    }
    const col = calendar.value.weeks.findIndex((week) => week.some((day) => day.date >= today));
    if (col >= 0) el.scrollLeft = Math.max(0, col * (CAL_CELL + CAL_GAP) - el.clientWidth / 2);
  },
  { immediate: true, flush: 'post' },
);

/* ---------- 观影习惯（星期偏好 / 影剧比 / 新老片） ---------- */
const weekdayMax = computed(() => Math.max(...stats.value.weekdayDist.map((w) => w.count), 1));

/** 唯一最高才点名（并列第一就不猜了） */
const weekdayTop = computed(() => {
  const dist = stats.value.weekdayDist;
  const max = Math.max(...dist.map((w) => w.count));
  if (!max) return null;
  const ties = dist.filter((w) => w.count === max);
  return ties.length === 1 ? ties[0] : null;
});

const mediaTotal = computed(() => stats.value.mediaDist.movie + stats.value.mediaDist.tv);
const moviePct = computed(() =>
  mediaTotal.value ? `${(stats.value.mediaDist.movie / mediaTotal.value) * 100}%` : '0%',
);
const tvPct = computed(() =>
  mediaTotal.value ? `${(stats.value.mediaDist.tv / mediaTotal.value) * 100}%` : '0%',
);

const retroLabel = computed(() => {
  const { retroCount, total } = stats.value.eraStat;
  if (!total) return '';
  return `${Math.round((retroCount / total) * 100)}% 是老片`;
});

function wdBarHeight(count: number): string {
  if (!count) return '3px';
  return `${Math.max(12, Math.round((count / weekdayMax.value) * 56))}px`;
}

/* ---------- 小纪录（连击 / 空窗 / 年代跨度；够有意思才显示） ---------- */
const recordLines = computed(() => {
  const lines: string[] = [];
  const { streakMonths, longestGap, eraStat } = stats.value;
  if (streakMonths >= 2) lines.push(`🔥 最长连续 ${streakMonths} 个月，每月都看`);
  if (longestGap && longestGap.days >= 7) {
    const comeback = longestGap.comebackTitle
      ? `，回来第一部是《${longestGap.comebackTitle}》`
      : '';
    lines.push(`⏳ 最长隔了 ${longestGap.days} 天没看${comeback}`);
  }
  if (eraStat.oldest && eraStat.newest && eraStat.oldest.year !== eraStat.newest.year) {
    lines.push(
      `🎞️ 跨度 ${eraStat.newest.year - eraStat.oldest.year} 年：最老《${eraStat.oldest.title}》(${eraStat.oldest.year}) · 最新《${eraStat.newest.title}》(${eraStat.newest.year})`,
    );
  }
  return lines;
});

function fmtWatched(date: string): string {
  return formatDateShort(date, today);
}

/**
 * 分布榜条目 → 明细列表：携带统计页完整筛选（时间窗 + 成员/地点/类型），
 * 保证明细条数与卡片数字一致。被点击维度按榜单口径合并：
 * 成员 = 并加（且语义）；地点/类型 = 替换为点击项（单值维度，数字不变）；主创 = 单选。
 */
function openDetail(
  kind: 'member' | 'location' | 'genre' | 'cast' | 'director',
  value: string,
): void {
  const next: StatsFilter = {
    ...statsFilter,
    members: kind === 'member' ? [...new Set([...statsFilter.members, value])] : statsFilter.members,
    locations: kind === 'location' ? [value] : statsFilter.locations,
    genres: kind === 'genre' ? [value] : statsFilter.genres,
    person: kind === 'cast' || kind === 'director' ? { name: value, type: kind } : statsFilter.person,
  };
  const query: Record<string, string | string[]> = filterToQuery(next);
  // 单值 key 标记被点击项，供明细页标题使用
  if (kind === 'member') query.member = value;
  if (kind === 'location') query.location = value;
  if (kind === 'genre') query.genre = value;
  void router.push({ path: '/stats/list', query });
}

/** 重温榜条目 → 该片全部场次（movie 筛选随 filterToQuery 序列化，标题用 movieTitle 快照） */
function openMovieDetail(item: RewatchItem): void {
  const next: StatsFilter = {
    ...statsFilter,
    movie: { mediaType: item.mediaType, tmdbId: item.tmdbId, title: item.title },
  };
  void router.push({ path: '/stats/list', query: filterToQuery(next) });
}

/** 日历格子 → 那天的明细（时间窗锁定当天，条件筛选保留） */
function openDateDetail(date: string): void {
  const next: StatsFilter = {
    ...statsFilter,
    range: 'custom',
    customStart: date,
    customEnd: date,
  };
  const query: Record<string, string | string[]> = filterToQuery(next);
  query.date = date; // 单值 key：明细页标题快照
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
        <!-- 时间窗 + 筛选 + 生效条件（与明细页共用组件，状态为模块级单例） -->
        <StatsFilterBar />

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

        <!-- 观影日历：一年格子墙，点亮一起看片的日子（条件筛选生效、时间窗不裁剪） -->
        <div class="card block">
          <h3 class="block-title cal-title">
            观影日历 <i class="title-note">{{ calendar.total }} 场</i>
            <span class="cal-navs">
              <button class="cal-nav" :disabled="calYear <= earliestYear" @click="calYear--">‹</button>
              <b>{{ calYear }}</b>
              <button class="cal-nav" :disabled="calYear >= thisYear" @click="calYear++">›</button>
            </span>
          </h3>
          <div class="cal-wrap">
            <div class="cal-wd" aria-hidden="true">
              <span>一</span><i></i><span>三</span><i></i><span>五</span><i></i><i></i>
            </div>
            <div ref="calScrollRef" class="cal-scroll">
              <div class="cal-inner">
                <div class="cal-months">
                  <span
                    v-for="mark in calMonthMarks"
                    :key="mark.label"
                    class="cal-month"
                    :style="{ left: `${mark.col * (CAL_CELL + CAL_GAP)}px` }"
                  >
                    {{ mark.label }}
                  </span>
                </div>
                <div class="cal-grid">
                  <div v-for="(week, col) in calendar.weeks" :key="col" class="cal-col">
                    <span
                      v-for="day in week"
                      :key="day.date"
                      class="cal-cell"
                      :class="calHeatClass(day)"
                      :title="`${day.date}${day.count ? ` · ${day.count} 场` : ''}`"
                      @click="day.count && !day.future && openDateDetail(day.date)"
                    ></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="cal-legend" aria-hidden="true">
            <i>少</i>
            <span class="cal-cell cal-0 demo"></span>
            <span class="cal-cell cal-1 demo"></span>
            <span class="cal-cell cal-2 demo"></span>
            <span class="cal-cell cal-3 demo"></span>
            <i>多</i>
          </div>
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

        <!-- 观影习惯：星期偏好 + 电影/剧集 + 新老片 -->
        <div v-if="mediaTotal" class="card block">
          <h3 class="block-title">观影习惯</h3>
          <div class="wd-chart">
            <div
              v-for="(item, index) in stats.weekdayDist"
              :key="item.name"
              class="wd-col"
            >
              <span class="wd-num" :class="{ off: !item.count }">{{ item.count || '0' }}</span>
              <span
                class="wd-bar"
                :class="{ on: item.count, weekend: index >= 5 }"
                :style="{ height: wdBarHeight(item.count) }"
              ></span>
              <span class="wd-label">{{ item.name.slice(1) }}</span>
            </div>
          </div>
          <p v-if="weekdayTop" class="habit-line">🕘 最爱在{{ weekdayTop.name }}看 · ×{{ weekdayTop.count }}</p>
          <div class="media-row">
            <div class="ratio-bar">
              <span class="bar-movie" :style="{ width: moviePct }"></span>
              <span class="bar-tv" :style="{ width: tvPct }"></span>
            </div>
            <span class="media-label">🎬 {{ stats.mediaDist.movie }} · 📺 {{ stats.mediaDist.tv }}</span>
          </div>
          <p v-if="retroLabel" class="habit-line">🕰 {{ retroLabel }}（上映满 10 年）</p>
        </div>

        <!-- 重温榜：看过 ≥2 次的真爱（点击看该片全部场次） -->
        <div v-if="stats.rewatchBoard.length" class="card block">
          <h3 class="block-title">重温榜 <i class="title-note">看过两次以上的真爱</i></h3>
          <div
            v-for="(item, index) in stats.rewatchBoard"
            :key="`${item.mediaType}:${item.tmdbId}`"
            class="rank-row"
            @click="openMovieDetail(item)"
          >
            <span class="rank-badge">{{ rankBadge(index) }}</span>
            <span class="rank-name">{{ item.title }}</span>
            <span class="rank-count">×{{ item.count }} · {{ fmtWatched(item.lastWatched) }} ›</span>
          </div>
        </div>

        <!-- 小纪录：连击 / 空窗 / 年代跨度（够有意思才出现） -->
        <div v-if="recordLines.length" class="card block">
          <h3 class="block-title">小纪录</h3>
          <p v-for="(line, index) in recordLines" :key="index" class="record-line">{{ line }}</p>
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

/* 观影日历 · GitHub 风格格子墙（横向滚动，周列对齐） */
.cal-title {
  display: flex;
  align-items: center;
}

.cal-navs {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.cal-navs b {
  font-size: var(--t-13);
  font-weight: 600;
  color: var(--c-text);
  min-width: 34px;
  text-align: center;
}

.cal-nav {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 8px;
  background: var(--c-bg);
  color: var(--c-text-2);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.cal-nav:disabled {
  opacity: 0.35;
  cursor: default;
}

.cal-nav:not(:disabled):active {
  opacity: 0.75;
}

.cal-wrap {
  display: flex;
  gap: 4px;
}

.cal-wd {
  flex: none;
  width: 12px;
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 2px;
  padding-top: 18px;
}

.cal-wd span {
  font-size: 9px;
  color: var(--c-text-3);
  line-height: 11px;
}

.cal-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.cal-scroll::-webkit-scrollbar {
  display: none;
}

.cal-inner {
  display: inline-block;
  min-width: 100%;
  padding-right: 2px;
}

.cal-months {
  position: relative;
  height: 16px;
  margin-bottom: 2px;
}

.cal-month {
  position: absolute;
  top: 3px;
  font-size: 9px;
  color: var(--c-text-3);
}

.cal-grid {
  display: flex;
  gap: 2px;
}

.cal-col {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 2px;
}

.cal-cell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--c-bg);
}

.cal-cell.cal-1 {
  background: var(--c-primary-weak);
}

.cal-cell.cal-2 {
  background: var(--c-primary);
}

.cal-cell.cal-3 {
  background: var(--c-primary-active);
}

.cal-cell.out {
  opacity: 0.3;
}

.cal-cell.future {
  opacity: 0.35;
}

.cal-cell:not(.cal-0) {
  cursor: pointer;
}

.cal-cell:not(.cal-0):active {
  transform: scale(0.85);
}

.cal-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-top: 10px;
  font-size: 10px;
  font-style: normal;
  color: var(--c-text-3);
}

.cal-legend .demo {
  width: 9px;
  height: 9px;
}

/* 观影习惯 · 星期柱状 / 影剧比例条 */
.wd-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 82px;
  padding: 0 2px;
}

.wd-col {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
}

.wd-num {
  font-size: 10px;
  font-weight: 600;
  color: var(--c-primary-active);
  line-height: 1;
  min-height: 10px;
}

.wd-num.off {
  visibility: hidden;
}

.wd-bar {
  width: 100%;
  max-width: 26px;
  border-radius: 4px 4px 2px 2px;
  background: var(--c-bg);
}

.wd-bar.on {
  background: var(--c-primary-weak);
}

.wd-bar.on.weekend {
  background: var(--c-primary);
}

.wd-label {
  font-size: 10px;
  color: var(--c-text-3);
}

.habit-line {
  font-size: var(--t-13);
  color: var(--c-text-2);
  margin-top: 10px;
}

.media-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.ratio-bar {
  flex: 1;
  display: flex;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--c-bg);
}

.bar-movie {
  background: var(--c-primary);
}

.bar-tv {
  background: var(--chart-2);
}

.media-label {
  flex: none;
  font-size: var(--t-12);
  color: var(--c-text-3);
  white-space: nowrap;
}

/* 小纪录 · 趣味文案行 */
.record-line {
  font-size: var(--t-14);
  color: var(--c-text-2);
  line-height: 1.7;
  margin-top: 6px;
}

.record-line:first-of-type {
  margin-top: 0;
}

.empty {
  padding: 32px 20px;
  text-align: center;
  font-size: var(--t-14);
  color: var(--c-text-3);
  line-height: 1.8;
}
</style>
