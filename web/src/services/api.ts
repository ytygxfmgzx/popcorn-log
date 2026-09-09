import { getAppSettings } from '@/db/settings';

/** Worker 基址：空 = 同源（开发经 vite proxy，生产填 workers.dev 域名） */
export async function apiBase(): Promise<string> {
  const settings = await getAppSettings();
  return (settings.workerUrl ?? '').replace(/\/+$/, '');
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await apiBase();
  return fetch(base + path, init);
}
