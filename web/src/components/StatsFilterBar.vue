<script setup lang="ts">
import { computed, ref } from 'vue';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useAppSettings } from '@/composables/useAppSettings';
import { statsFilter, resetStatsFilter } from '@/stats/filter-state';
import type { StatsRange } from '@/stats/aggregate';
import { formatDateFull, todayStr } from '@/utils/date';
import { LOCATION_EMOJI } from '@/types';

/**
 * 统计筛选栏：时间窗下拉 + 成员/地点/类型多选下拉 + 生效条件 chips。
 * 统计页与明细列表页共用；筛选状态读写 filter-state 单例。
 */

const { settings } = useAppSettings();
const { data: movies } = useLiveQuery(() => db.movies.toArray(), []);

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
  statsFilter.range = range;
  timeDrop.value?.toggle(false);
}

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function toggleMember(member: string): void {
  statsFilter.members = toggleIn(statsFilter.members, member);
}

function toggleLocation(location: string): void {
  statsFilter.locations = toggleIn(statsFilter.locations, location);
}

function toggleGenre(genre: string): void {
  statsFilter.genres = toggleIn(statsFilter.genres, genre);
}

const activeFilterCount = computed(
  () =>
    statsFilter.members.length + statsFilter.locations.length + statsFilter.genres.length +
    (statsFilter.person ? 1 : 0),
);

const filterTitle = computed(() =>
  activeFilterCount.value ? `筛选 · ${activeFilterCount.value}` : '筛选',
);

const rangeLabel = computed(() => {
  if (statsFilter.range === 'custom' && statsFilter.customStart && statsFilter.customEnd) {
    return `${statsFilter.customStart} ~ ${statsFilter.customEnd}`;
  }
  return RANGE_OPTIONS.find((option) => option.value === statsFilter.range)?.label ?? '时间';
});

/* ---------- 生效条件 chips（点击移除） ---------- */
const conditionChips = computed(() => {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  for (const member of statsFilter.members) {
    chips.push({ key: `m-${member}`, label: member, remove: () => toggleMember(member) });
  }
  for (const location of statsFilter.locations) {
    chips.push({
      key: `l-${location}`,
      label: `${LOCATION_EMOJI[location] ?? '📍'} ${location}`,
      remove: () => toggleLocation(location),
    });
  }
  for (const genre of statsFilter.genres) {
    chips.push({ key: `g-${genre}`, label: `# ${genre}`, remove: () => toggleGenre(genre) });
  }
  if (statsFilter.person) {
    const person = statsFilter.person;
    chips.push({
      key: `p-${person.type}-${person.name}`,
      label: `${person.type === 'director' ? '导演' : '演员'} · ${person.name}`,
      remove: () => {
        statsFilter.person = undefined;
      },
    });
  }
  return chips;
});

/* ---------- 自定义时间段 ---------- */
const showCustom = ref(false);
const showDatePicker = ref(false);
const picking = ref<'start' | 'end'>('start');
const dateModel = ref<string[]>(todayStr().split('-'));

function fmtDay(date: string): string {
  return formatDateFull(date).replace(/\s.*/, '');
}

function openDatePicker(which: 'start' | 'end'): void {
  picking.value = which;
  const base = which === 'start' ? statsFilter.customStart : statsFilter.customEnd;
  dateModel.value = (base ?? todayStr()).split('-');
  showDatePicker.value = true;
}

function confirmDate(): void {
  const value = dateModel.value.join('-');
  if (picking.value === 'start') statsFilter.customStart = value;
  else statsFilter.customEnd = value;
  showDatePicker.value = false;
}

function applyCustom(): void {
  if (!statsFilter.customStart || !statsFilter.customEnd || statsFilter.customStart > statsFilter.customEnd)
    return;
  statsFilter.range = 'custom';
  showCustom.value = false;
  timeDrop.value?.toggle(false);
}
</script>

<template>
  <div>
    <!-- 时间窗 + 筛选（下拉，移动端省空间） -->
    <van-dropdown-menu class="drop-bar">
      <van-dropdown-item ref="timeDrop" :title="`时间 · ${rangeLabel}`">
        <div class="drop-list">
          <span
            v-for="option in RANGE_OPTIONS"
            :key="option.value"
            class="drop-row"
            :class="{ on: statsFilter.range === option.value }"
            @click="pickRange(option.value)"
          >
            {{ option.label }}
            <em v-if="statsFilter.range === option.value">✓</em>
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
              :class="{ on: statsFilter.members.includes(member) }"
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
              :class="{ on: statsFilter.locations.includes(location) }"
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
              :class="{ on: statsFilter.genres.includes(genre) }"
              @click="toggleGenre(genre)"
            >
              {{ genre }}
            </span>
          </div>
          <div class="drop-actions">
            <van-button size="small" round @click="resetStatsFilter">重置</van-button>
            <van-button size="small" round type="primary" @click="filterDrop?.toggle(false)">
              完成
            </van-button>
          </div>
        </div>
      </van-dropdown-item>
    </van-dropdown-menu>

    <!-- 生效条件（点击移除） -->
    <div v-if="conditionChips.length" class="cond-row">
      <span v-for="chip in conditionChips" :key="chip.key" class="cond-chip" @click="chip.remove()">
        {{ chip.label }}<em>×</em>
      </span>
    </div>

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
          🗓 {{ statsFilter.customStart ? fmtDay(statsFilter.customStart) : '开始日期' }}
        </div>
        <div class="field-like" @click="openDatePicker('end')">
          🗓 {{ statsFilter.customEnd ? fmtDay(statsFilter.customEnd) : '结束日期' }}
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

/* 生效条件 chips */
.cond-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 12px;
}

.cond-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
  font-size: var(--t-12);
  font-weight: 600;
  cursor: pointer;
}

.cond-chip em {
  font-style: normal;
  font-weight: 400;
  opacity: 0.7;
}

.cond-chip:active {
  opacity: 0.75;
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
</style>
