<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { buildViewingRanks } from '@/stats/viewings';
import { filterRecords } from '@/stats/aggregate';
import StatsFilterBar from '@/components/StatsFilterBar.vue';
import { statsFilter, filterToQuery, queryToFilter, applyStatsFilter } from '@/stats/filter-state';
import { todayStr } from '@/utils/date';
import RecordCard from '@/components/RecordCard.vue';
import type { WatchRecord } from '@/types';

/**
 * 统计明细列表：从统计页分布榜点进来，展示当前筛选组合下的全部记录。
 * 筛选状态与统计页共享（filter-state 单例）：进入时从 query 恢复统计页带来的完整条件
 * （保证条数与统计卡片数字一致），页内可继续增删条件；变化回写 query（刷新/恢复不丢）。
 */
const route = useRoute();
const router = useRouter();

const { data: records } = useLiveQuery<WatchRecord[]>(() => db.records.toArray(), []);
const { data: movies } = useLiveQuery(() => db.movies.toArray(), []);

/* 进入时：query（统计页带来的筛选）写入共享状态；无筛选 key 的直链保持现状 */
const restored = queryToFilter(route.query);
if (restored) applyStatsFilter(restored);

/* 标题：进入时被点击项的快照（不随页内筛选调整变化） */
function snapshotTitle(): string {
  const member = typeof route.query.member === 'string' ? route.query.member : '';
  const location = typeof route.query.location === 'string' ? route.query.location : '';
  const genre = typeof route.query.genre === 'string' ? route.query.genre : '';
  const person = typeof route.query.person === 'string' ? route.query.person : '';
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
}
const title = snapshotTitle();

/* 页内筛选变化 → 回写 query（刷新/恢复不丢；单值“被点击项”key 不再保留） */
watch(
  statsFilter,
  () => {
    void router.replace({ path: '/stats/list', query: filterToQuery() });
  },
  { deep: true },
);

const subLabel = computed(() => {
  const rangeMap: Record<string, string> = {
    week: '本周',
    month: '本月',
    halfYear: '半年',
    year: '一年',
    all: '全部时间',
  };
  if (statsFilter.range === 'custom' && statsFilter.customStart && statsFilter.customEnd) {
    return `${statsFilter.customStart} ~ ${statsFilter.customEnd}`;
  }
  return rangeMap[statsFilter.range] ?? '全部时间';
});

const visible = computed(() => {
  const list = filterRecords(records.value, movies.value, statsFilter, todayStr());
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
      <!-- 与统计页同款筛选栏：状态共享，页内可任意增删条件 -->
      <StatsFilterBar />

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
