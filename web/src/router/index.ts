import { createRouter, createWebHashHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import RecordEditPage from '@/pages/RecordEditPage.vue';
import RecordDetailPage from '@/pages/RecordDetailPage.vue';
import SettingsPage from '@/pages/SettingsPage.vue';
import ConflictsPage from '@/pages/ConflictsPage.vue';
import StatsPage from '@/pages/StatsPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** 显示底部 Tabbar 并高亮该项 */
    tabbar?: string;
    /** 显示右下角录入 FAB */
    fab?: boolean;
  }
}

const router = createRouter({
  // hash 模式：静态托管无 SPA fallback 配置，离线 SW navigateFallback 也最简单
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage, meta: { tabbar: 'home', fab: true } },
    { path: '/record/new', name: 'record-new', component: RecordEditPage },
    { path: '/record/:id', name: 'record-detail', component: RecordDetailPage },
    { path: '/record/:id/edit', name: 'record-edit', component: RecordEditPage },
    { path: '/settings', name: 'settings', component: SettingsPage, meta: { tabbar: 'settings' } },
    { path: '/conflicts', name: 'conflicts', component: ConflictsPage },
    { path: '/stats', name: 'stats', component: StatsPage, meta: { tabbar: 'stats' } },
    { path: '/watchlist', redirect: '/' }, // Enhance 阶段：想看清单
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
