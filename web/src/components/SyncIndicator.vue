<script setup lang="ts">
/**
 * 同步状态指示器：✓ 已同步 / ⏳ 待同步 n / ⚠️ 有冲突
 * MVP 为静态"已同步"占位；Sync 阶段接入 syncStates 真实状态。
 */
defineProps<{
  pendingCount?: number;
  hasConflict?: boolean;
}>();
</script>

<template>
  <span v-if="hasConflict" class="sync-pill warn">⚠️ 有冲突</span>
  <span v-else-if="pendingCount" class="sync-pill pend">⏳ 待同步 {{ pendingCount }}</span>
  <span v-else class="sync-pill ok">✓ 已同步</span>
</template>

<style scoped>
.sync-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--t-12);
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
}

.ok {
  color: var(--c-success);
  background: rgba(16, 185, 129, 0.1); /* --c-success 的 10% 透明弱底 */
}

.pend {
  color: var(--c-warning);
  background: rgba(245, 166, 35, 0.12); /* --c-warning 的 12% 透明弱底 */
}

.warn {
  color: var(--c-danger);
  background: rgba(239, 68, 68, 0.1); /* --c-danger 的 10% 透明弱底 */
}
</style>
