<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useSyncStatus, useDuplicateGroups } from '@/composables/useSyncStatus';
import { syncNow } from '@/sync/schedule';
import { buildViewingRanks } from '@/stats/viewings';
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

/* 同片观看名次：重刷 ≥2 次的卡片显示「第 N 次」徽章 */
const viewingRanks = computed(() => buildViewingRanks(records.value));

/* 同步指示器：真实底账状态 + 点击行为（未配置去设置，有冲突去处理，否则立即同步） */
const { pendingCount, conflictCount, hasCredentials } = useSyncStatus();

async function onIndicatorClick(): Promise<void> {
  if (!hasCredentials.value) {
    void router.push('/settings');
    return;
  }
  if (conflictCount.value > 0) {
    void router.push('/conflicts');
    return;
  }
  try {
    const summary = await syncNow();
    if (!summary) return; // 未配置凭据 / 已在同步中，静默
    if (summary.conflicts > 0) {
      showToast(`有 ${summary.conflicts} 条冲突待处理`);
      void router.push('/conflicts');
    } else {
      showToast(summary.pushed + summary.pulled > 0 ? '同步完成 ✅' : '已是最新');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '同步失败');
  }
}

/* 疑似重复提示条：存在则显示，可关闭（下次进入页面再现） */
const { groups: duplicateGroups } = useDuplicateGroups();
const hintDismissed = ref(false);

/* 下拉刷新：立即同步一轮，云端变化（新增/修改/删除）即时反映到列表 */
const refreshing = ref(false);

async function onRefresh(): Promise<void> {
  try {
    const summary = await syncNow();
    if (summary && summary.pushed + summary.pulled > 0) {
      showToast(summary.conflicts > 0 ? `有 ${summary.conflicts} 条冲突待处理` : '已同步 ✅');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '同步失败');
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <div>
    <header class="navbar">
      <h1>Popcorn Log</h1>
      <span class="indicator" @click="onIndicatorClick">
        <SyncIndicator
          :pending-count="pendingCount"
          :has-conflict="conflictCount > 0"
          :disabled="!hasCredentials"
        />
      </span>
    </header>

    <main class="page">
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <div
          v-if="duplicateGroups.length && !hintDismissed"
          class="dup-hint card"
          @click="router.push('/conflicts')"
        >
          <span>🔁 有 {{ duplicateGroups.length }} 场可能是同一场记了两次，去看看 ›</span>
          <span class="hint-close" @click.stop="hintDismissed = true">✕</span>
        </div>

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
            :viewing-rank="viewingRanks.get(record.id)"
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
      </van-pull-refresh>
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

.indicator {
  cursor: pointer;
}

.dup-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: var(--t-13);
  color: var(--c-primary-active);
  cursor: pointer;
}

.hint-close {
  flex: none;
  color: var(--c-text-3);
  padding: 2px 4px;
  font-size: var(--t-12);
}

.skeleton {
  padding: 16px;
  margin-bottom: 12px;
}
</style>
