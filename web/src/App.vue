<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UpdatePrompt from '@/components/UpdatePrompt.vue';

const route = useRoute();
const router = useRouter();

const currentTab = computed(() => route.meta.tabbar ?? '');

function onTabChange(name: string | number): void {
  if (name === 'home') void router.push('/');
  if (name === 'settings') void router.push('/settings');
}
</script>

<template>
  <UpdatePrompt />
  <router-view />

  <!-- Tabbar 四项：想看/统计为后续阶段，暂置灰 -->
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
    <van-tabbar-item name="stats" disabled>
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
