import { getAppSettings } from '@/db/settings';

/** Worker 基址：空 = 同源（仅本地开发经 vite proxy 有效；生产 Pages 上同源无 /tmdb 转发） */
export async function apiBase(): Promise<string> {
  const settings = await getAppSettings();
  return (settings.workerUrl ?? '').replace(/\/+$/, '');
}

function isLocalDev(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * 生产环境必须显式配置 Worker 地址：
 * 否则请求会打到静态托管自身，收到 SPA 的 index.html（200+HTML），
 * 解析 JSON 时报 "Unexpected token '<'" 之类的莫测错误。
 */
export async function requireApiBase(): Promise<string> {
  const base = await apiBase();
  if (!base && !isLocalDev()) {
    throw new Error('请先在「设置 → Worker 地址」填写你的 Worker 地址');
  }
  return base;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await requireApiBase();
  return fetch(base + path, init);
}

/** 确保响应是 JSON（地址填错成普通网站时返回 HTML，给用户可读的错误） */
export async function parseJsonResponse(resp: Response): Promise<unknown> {
  const contentType = resp.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('服务返回的不是数据，请检查 Worker 地址是否正确');
  }
  return resp.json();
}
