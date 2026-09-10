<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { buildViewingRanks } from '@/stats/viewings';
import { filterRecords, type StatsFilter, type StatsRange } from '@/stats/aggregate';
import { todayStr } from '@/utils/date';
import RecordCard from '@/components/RecordCard.vue';
import type { WatchRecord } from '@/types';

/**
 * 统计明细列表：从统计页分布榜点进来，展示某个筛选组合下的全部记录。
 * query: member / location / genre / person(+personType)（单值）+ range / start / end（时间窗继承统计页）
 */
const route = useRoute();
const router = useRouter();

const { data: records } = useLiveQuery<WatchRecord[]>(() => db.records.toArray(), []);
const { data: movies } = useLiveQuery(() => db.movies.toArray(), []);

const filter = computed<StatsFilter>(() => {
  const member = route.query.member ? String(route.query.member) : '';
  const location = route.query.location ? String(route.query.location) : '';
  const genre = route.query.genre ? String(route.query.genre) : '';
  const personName = route.query.person ? String(route.query.person) : '';
  const personType =
    route.query.personType === 'director' || route.query.personType === 'cast'
      ? (route.query.personType as 'cast' | 'director')
      : 'cast';
  return {
    range: (['week', 'month', 'halfYear', 'year', 'all', 'custom'] as const).includes(
      route.query.range as StatsRange,
    )
      ? (route.query.range as StatsRange)
      : 'all',
    customStart: route.query.start ? String(route.query.start) : undefined,
    customEnd: route.query.end ? String(route.query.end) : undefined,
    members: member ? [member] : [],
    locations: location ? [location] : [],
    genres: genre ? [genre] : [],
    person: personName ? { name: personName, type: personType } : undefined,
  };
});

const title = computed(() => {
  const member = route.query.member ? String(route.query.member) : '';
  const location = route.query.location ? String(route.query.location) : '';
  const genre = route.query.genre ? String(route.query.genre) : '';
  const person = route.query.person ? String(route.query.person) : '';
  const personKind =
    route.query.personType === 'director' ? '导演' : route.query.personType === 'cast' ? '演员' : '';
  const kind = member
    ? '成员'
    : location
      ? '在哪看'
      : genre
        ? '类型'
        : person
          ? personKind
          : '记录';
  const value = member || location || genre || person || '';
  return value ? `${kind} · ${value}` : '记录明细';
});

const subLabel = computed(() => {
  const rangeMap: Record<string, string> = {
    week: '本周',
    month: '本月',
    halfYear: '半年',
    year: '一年',
    all: '全部时间',
  };
  const range = filter.value.range;
  if (range === 'custom' && filter.value.customStart && filter.value.customEnd) {
    return `${filter.value.customStart} ~ ${filter.value.customEnd}`;
  }
  return rangeMap[range] ?? '全部时间';
});

const visible = computed(() => {
  const list = filterRecords(records.value, movies.value, filter.value, todayStr());
  return list.sort((a, b) => b.watchedDate.localeCompare(a.watchedDate));
});

const viewingRanks = computed(() => buildViewingRanks(records.value));
</script>

<template>
  <div>
    <header class="sub-navbar">
      <span class="back" @click="router.back()">‹</span>
      <div class="titles">
        <h1>{{ title }}</h1>
        <p>{{ subLabel }} · 共 {{ visible.length }} 条</p>
      </div>
    </header>

    <main class="page">
      <template v-if="visible.length">
        <RecordCard
          v-for="record in visible"
          :key="record.id"
          :record="record"
          :viewing-rank="viewingRanks.get(record.id)"
          @click="router.push(`/record/${record.id}`)"
        />
      </template>
      <div v-else class="card empty">这个筛选下还没有记录</div>
    </main>
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

.back {
  font-size: 22px;
  color: var(--c-text);
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  margin-left: -6px;
}

.titles h1 {
  font-size: var(--t-17);
  font-weight: 600;
}

.titles p {
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin-top: 2px;
}

.empty {
  padding: 32px 20px;
  text-align: center;
  font-size: var(--t-14);
  color: var(--c-text-3);
}
</style>
