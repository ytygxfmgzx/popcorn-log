import { computed, type ComputedRef } from 'vue';
import { db } from '@/db/dexie';
import { DEFAULT_APP_SETTINGS, saveAppSettings } from '@/db/settings';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { notifyLocalChange } from '@/sync/schedule';
import type { AppSettings } from '@/types';

/** 应用设置的响应式读取与保存（成员表 / 地点列表 / Worker 地址 / 上次成员组合） */
export function useAppSettings(): {
  settings: ComputedRef<AppSettings>;
  save: (patch: Partial<AppSettings>) => Promise<AppSettings>;
} {
  const { data } = useLiveQuery(() => db.settings.get('app'), undefined);

  const settings = computed<AppSettings>(() => ({
    ...DEFAULT_APP_SETTINGS,
    ...(data.value?.key === 'app' ? data.value.value : {}),
  }));

  // 同步引擎的 config 对账直写 saveAppSettings，不经此入口，不会自触发循环
  async function save(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = await saveAppSettings(patch);
    if ('members' in patch || 'customLocations' in patch) {
      notifyLocalChange(); // 共享配置变更（含删除）→ 去抖自动上云
    }
    return next;
  }

  return { settings, save };
}
