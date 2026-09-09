<script setup lang="ts">
import { needRefresh, updateSW } from '@/pwa';

function refresh(): void {
  void updateSW(true);
}
</script>

<template>
  <!-- PWA 新版本提示条：新 SW waiting 时出现，点击刷新 -->
  <div v-if="needRefresh" class="update-prompt">
    <span>✨ 发现新版本</span>
    <button @click="refresh">刷新</button>
  </div>
</template>

<style scoped>
.update-prompt {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  background: var(--c-primary);
  color: var(--c-card);
  font-size: var(--t-14);
  z-index: 2000;
}

.update-prompt button {
  border: 1px solid var(--c-card);
  background: none;
  color: var(--c-card);
  font-size: var(--t-12);
  font-family: inherit;
  padding: 2px 12px;
  border-radius: 999px;
  cursor: pointer;
}
</style>
