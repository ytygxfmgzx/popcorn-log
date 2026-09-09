import { computed, type ComputedRef } from 'vue';
import { db } from '@/db/dexie';
import { DEFAULT_APP_SETTINGS, saveAppSettings } from '@/db/settings';
import { useLiveQuery } from '@/composables/useLiveQuery';
import type { AppSettings } from '@/types';

/** 应用设置的响应式读取与保存（成员表 / 自定义地点 / Worker 地址 / 上次成员组合） */
export function useAppSettings(): {
  settings: ComputedRef<AppSettings>;
  save: (patch: Partial<AppSettings>) => Promise<AppSettings>;
} {
  const { data } = useLiveQuery(() => db.settings.get('app'), undefined);

  const settings = computed<AppSettings>(() => ({
    ...DEFAULT_APP_SETTINGS,
    ...(data.value?.key === 'app' ? data.value.value : {}),
  }));

  return { settings, save: saveAppSettings };
}
