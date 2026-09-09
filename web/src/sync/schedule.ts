import { runSync, type SyncSummary } from './engine';

/**
 * 同步触发调度：
 * - 保存/删除记录后 notifyLocalChange（去抖 2s，连续编辑合并为一轮）
 * - 切到前台 / 网络恢复 → 自动跑一轮（App.vue 挂载监听）
 * - syncNow 手动入口（设置页 / SyncIndicator 点击）
 * 引擎自带执行互斥，重入安全。
 */

const DEBOUNCE_MS = 2000;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** 本地数据有变动（saveRecord/tombstoneRecord 后调用），去抖后自动同步 */
export function notifyLocalChange(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSync().catch(() => undefined); // 自动同步失败静默，等下个触发时机重试
  }, DEBOUNCE_MS);
}

/** 手动「立即同步」：立即执行（跳过去抖），异常上抛由调用方提示 */
export async function syncNow(): Promise<SyncSummary | null> {
  clearTimeout(debounceTimer);
  return runSync();
}

/** App 挂载时调用：页面切到前台 / 网络恢复自动同步 */
export function setupAutoSync(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void runSync().catch(() => undefined);
    }
  });
  window.addEventListener('online', () => {
    void runSync().catch(() => undefined);
  });
}
