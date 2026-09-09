<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UpdatePrompt from '@/components/UpdatePrompt.vue';
import { setupAutoSync } from '@/sync/schedule';

const route = useRoute();
const router = useRouter();

const currentTab = computed(() => route.meta.tabbar ?? '');

function onTabChange(name: string | number): void {
  if (name === 'home') void router.push('/');
  if (name === 'stats') void router.push('/stats');
  if (name === 'settings') void router.push('/settings');
}

// 切到前台 / 网络恢复自动同步（未配置凭据时引擎内部静默跳过）
onMounted(setupAutoSync);
</script>

<template>
  <UpdatePrompt />
  <router-view />

  <!-- Tabbar：想看为 Enhance 阶段，暂置灰 -->
  <van-tabbar
    v-if="currentTab"
    :model-value="currentTab"
    placeholder
    safe-area-inset-bottom
    @change="onTabChange"
  >
    <van-tabbar-item name="home">
      手账
      <template #icon><span class="tab-icon">📖</span></template>
    </van-tabbar-item>
    <van-tabbar-item name="watchlist" disabled>
      想看
      <template #icon><span class="tab-icon">⭐</span></template>
    </van-tabbar-item>
    <van-tabbar-item name="stats">
      统计
      <template #icon><span class="tab-icon">📊</span></template>
    </van-tabbar-item>
    <van-tabbar-item name="settings">
      设置
      <template #icon><span class="tab-icon">⚙️</span></template>
    </van-tabbar-item>
  </van-tabbar>

  <div v-if="route.meta.fab" class="app-fab" @click="router.push('/record/new')">＋</div>
</template>

<style scoped>
.tab-icon {
  font-size: 20px;
  line-height: 1;
}
</style>
