import { db } from '@/db/dexie';
import { PRESET_LOCATIONS, type AppSettings } from '@/types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  members: ['爸爸', '妈妈'],
  customLocations: [...PRESET_LOCATIONS],
};

export async function getAppSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app');
  if (!row || row.key !== 'app') {
    return { ...DEFAULT_APP_SETTINGS };
  }
  return { ...DEFAULT_APP_SETTINGS, ...row.value };
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAppSettings();
  const next: AppSettings = { ...current, ...patch };
  await db.settings.put({ key: 'app', value: next });
  return next;
}
