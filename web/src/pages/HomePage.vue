<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import RecordCard from '@/components/RecordCard.vue';
import EmptyState from '@/components/EmptyState.vue';
import SyncIndicator from '@/components/SyncIndicator.vue';
import type { WatchRecord } from '@/types';

const router = useRouter();

const { data: records, isLoading } = useLiveQuery<WatchRecord[]>(
  () => db.records.orderBy('watchedDate').reverse().filter((record) => !record.deleted).toArray(),
  [],
);

const visible = computed(() => records.value);
</script>

<template>
  <div>
    <header class="navbar">
      <h1>观影手账</h1>
      <SyncIndicator />
    </header>

    <main class="page">
      <!-- 列表加载骨架屏 -->
      <template v-if="isLoading">
        <div v-for="n in 3" :key="n" class="skeleton card">
          <van-skeleton :row="2" round />
        </div>
      </template>

      <template v-else>
        <RecordCard
          v-for="record in visible"
          :key="record.id"
          :record="record"
          @click="router.push(`/record/${record.id}`)"
        />
        <EmptyState
          v-if="!visible.length"
          title="还没有家庭观影记录"
          subtitle="记下第一部电影吧"
          action-text="＋ 记一场"
          @action="router.push('/record/new')"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}

.navbar h1 {
  font-size: var(--t-20);
  font-weight: 600;
}

.skeleton {
  padding: 16px;
  margin-bottom: 12px;
}
</style>
