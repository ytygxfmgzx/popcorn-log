<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useDuplicateGroups, useSyncStatus } from '@/composables/useSyncStatus';
import { fetchFile } from '@/services/dav';
import { normalizeRemoteRecord } from '@/sync/merge';
import {
  dismissDuplicateGroup,
  mergeDuplicate,
  resolveConflictMerge,
  resolveConflictUseCloud,
  resolveConflictUseLocal,
} from '@/sync/resolve';
import { duplicateGroupKey } from '@/utils/duplicate';
import type { WatchRecord } from '@/types';

const router = useRouter();

/* ---------- 编辑冲突 ---------- */
const { syncStates, conflictCount } = useSyncStatus();
const { data: allRecords } = useLiveQuery(() => db.records.toArray(), []);

const conflictRecords = computed(() => {
  const byId = new Map(allRecords.value.map((record) => [record.id, record]));
  return syncStates.value
    .filter((state) => state.status === 'conflict')
    .map((state) => byId.get(state.recordId))
    .filter((record): record is WatchRecord => record !== undefined);
});

/** 云端版按需实时拉取（拉不到时展示占位，不阻塞本地版与操作） */
type RemoteVersion = 'loading' | 'failed' | WatchRecord;
const remoteVersions = reactive<Record<string, RemoteVersion>>({});

watch(
  () => conflictRecords.value.map((record) => record.id).join(','),
  (ids) => {
    for (const id of ids ? ids.split(',') : []) {
      if (remoteVersions[id]) continue;
      remoteVersions[id] = 'loading';
      const state = syncStates.value.find((item) => item.recordId === id);
      if (!state?.cloudFile) {
        remoteVersions[id] = 'failed';
        continue;
      }
      void (async () => {
        try {
          const fetched = await fetchFile(state.cloudFile as string);
          remoteVersions[id] = fetched.text
            ? (normalizeRemoteRecord(JSON.parse(fetched.text)) ?? 'failed')
            : 'failed';
        } catch {
          remoteVersions[id] = 'failed';
        }
      })();
    }
  },
  { immediate: true },
);

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    showToast('已处理');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败');
  }
}

function onUseCloud(record: WatchRecord): void {
  void run(() => resolveConflictUseCloud(record.id));
}

function onUseLocal(record: WatchRecord): void {
  void run(() => resolveConflictUseLocal(record.id));
}

function onMergeConflict(record: WatchRecord): void {
  void (async () => {
    try {
      await showConfirmDialog({
        title: '软合并',
        message: '以较新版本为主体，成员取并集，手记与孩子原话两边都保留。',
        confirmButtonText: '合并',
      });
    } catch {
      return;
    }
    await run(() => resolveConflictMerge(record.id));
  })();
}

/* ---------- 疑似重复 ---------- */
const { groups } = useDuplicateGroups();

function onMergeGroup(records: WatchRecord[]): void {
  void (async () => {
    try {
      await showConfirmDialog({
        title: '合并成一条？',
        message: '保留较新一条为主体，成员取并集，手记拼接；其余移为墓碑（可恢复）。',
        confirmButtonText: '合并',
      });
    } catch {
      return;
    }
    await run(() => mergeDuplicate(records.map((record) => record.id)));
  })();
}

function onKeepBoth(records: WatchRecord[]): void {
  void run(() => dismissDuplicateGroup(duplicateGroupKey(records[0])));
}

function stars(rating: number | null): string {
  return rating ? '★★★★★'.slice(0, rating) : '未评分';
}
</script>

<template>
  <div>
    <header class="sub-navbar">
      <span class="back" @click="router.back()">‹</span>
      <h1>同步待处理</h1>
    </header>

    <main class="page">
      <!-- 编辑冲突 -->
      <h2 class="group-title">编辑冲突（{{ conflictCount }}）</h2>
      <p v-if="!conflictCount" class="group-hint">同一条记录在两边同时被编辑时才会出现，处理前两边内容都完好保留。</p>
      <div v-for="record in conflictRecords" :key="record.id" class="card block">
        <h3 class="block-title">{{ record.titleSnapshot }}</h3>
        <div class="versus">
          <div class="side">
            <p class="side-label">本机版本</p>
            <p>{{ record.watchedDate }} · {{ record.location }}</p>
            <p>{{ record.members.join('、') || '未选成员' }} · {{ stars(record.rating) }}</p>
            <p v-if="record.note" class="side-note">{{ record.note }}</p>
            <p v-if="record.quote" class="side-note">"{{ record.quote }}"</p>
          </div>
          <div class="side">
            <p class="side-label">云端版本</p>
            <template v-if="remoteVersions[record.id] && remoteVersions[record.id] !== 'loading' && remoteVersions[record.id] !== 'failed'">
              <p>{{ (remoteVersions[record.id] as WatchRecord).watchedDate }} · {{ (remoteVersions[record.id] as WatchRecord).location }}</p>
              <p>{{ (remoteVersions[record.id] as WatchRecord).members.join('、') || '未选成员' }} · {{ stars((remoteVersions[record.id] as WatchRecord).rating) }}</p>
              <p v-if="(remoteVersions[record.id] as WatchRecord).note" class="side-note">{{ (remoteVersions[record.id] as WatchRecord).note }}</p>
              <p v-if="(remoteVersions[record.id] as WatchRecord).quote" class="side-note">"{{ (remoteVersions[record.id] as WatchRecord).quote }}"</p>
            </template>
            <p v-else-if="remoteVersions[record.id] === 'loading'" class="side-note">拉取中…</p>
            <p v-else class="side-note">云端版拉取失败（网络），仍可选择用本机版本</p>
          </div>
        </div>
        <div class="actions">
          <button class="act" @click="onUseCloud(record)">用云端</button>
          <button class="act" @click="onUseLocal(record)">用本机</button>
          <button class="act primary" @click="onMergeConflict(record)">软合并（推荐）</button>
        </div>
      </div>

      <!-- 疑似重复 -->
      <h2 class="group-title">疑似重复（{{ groups.length }}）</h2>
      <p v-if="!groups.length" class="group-hint">
        两台手机同一天记了同一部片时会在这里提示；真看了两遍选「是两场」即可。
      </p>
      <div v-for="group in groups" :key="duplicateGroupKey(group.records[0])" class="card block">
        <h3 class="block-title">{{ group.records[0].titleSnapshot }} · {{ group.watchedDate }}</h3>
        <div v-for="record in group.records" :key="record.id" class="dup-row">
          <p>{{ record.members.join('、') || '未选成员' }} · {{ stars(record.rating) }}</p>
          <p v-if="record.note" class="side-note">{{ record.note }}</p>
          <p v-if="record.quote" class="side-note">"{{ record.quote }}"</p>
        </div>
        <div class="actions">
          <button class="act primary" @click="onMergeGroup(group.records)">合并成一条</button>
          <button class="act" @click="onKeepBoth(group.records)">是两场，都保留</button>
        </div>
      </div>
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

.group-title {
  font-size: var(--t-14);
  color: var(--c-text-2);
  font-weight: 600;
  margin: 12px 4px 8px;
}

.group-hint {
  font-size: var(--t-12);
  color: var(--c-text-3);
  margin: 0 4px 12px;
  line-height: 1.6;
}

.block {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.block-title {
  font-size: var(--t-15);
  font-weight: 600;
  margin-bottom: 10px;
}

.versus {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.side {
  font-size: var(--t-13);
  color: var(--c-text-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.side-label {
  font-size: var(--t-12);
  font-weight: 600;
  color: var(--c-text);
}

.side-note {
  font-size: var(--t-12);
  color: var(--c-text-3);
  white-space: pre-wrap;
  word-break: break-all;
}

.dup-row {
  padding: 8px 0;
  font-size: var(--t-13);
  color: var(--c-text-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dup-row + .dup-row {
  border-top: 1px dashed var(--c-border);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.act {
  flex: 1;
  border: 1px solid var(--c-border);
  background: var(--c-card);
  border-radius: var(--r-btn);
  padding: 8px 0;
  font-family: inherit;
  font-size: var(--t-13);
  color: var(--c-text);
  cursor: pointer;
}

.act.primary {
  border-color: var(--c-primary);
  color: var(--c-primary-active);
  background: var(--c-primary-weak);
}
</style>
