import { apiFetch } from '@/services/api';
import { db } from '@/db/dexie';
import { movieKey, type MediaType, type MovieMeta } from '@/types';

/** 搜索结果简要信息 */
export interface MovieBrief {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  releaseYear?: number;
  posterPath?: string;
}

interface TmdbMultiResult {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

interface TmdbCrew {
  name: string;
  job: string;
}

interface TmdbDetail {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  genres?: Array<{ id: number; name: string }>;
  created_by?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ name: string }>;
    crew?: TmdbCrew[];
  };
}

/** 搜片联想（movie + tv，过滤 person 等），取前 10 条 */
export async function searchTitles(query: string): Promise<MovieBrief[]> {
  const q = query.trim();
  if (!q) return [];

  const resp = await apiFetch(
    `/tmdb/search/multi?query=${encodeURIComponent(q)}&include_adult=false&language=zh-CN`,
  );
  if (!resp.ok) {
    throw new Error(`TMDB 搜索失败（${resp.status}）`);
  }
  const data = (await resp.json()) as { results?: TmdbMultiResult[] };

  return (data.results ?? [])
    .filter((item) => {
      if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
      return Boolean(item.title ?? item.name);
    })
    .slice(0, 10)
    .map((item) => ({
      mediaType: item.media_type as MediaType,
      tmdbId: item.id,
      title: item.title ?? item.name ?? '',
      releaseYear:
        Number((item.release_date ?? item.first_air_date ?? '').slice(0, 4)) || undefined,
      posterPath: item.poster_path ?? undefined,
    }));
}

/** movie/tv 详情统一映射为 MovieMeta */
function mapDetail(mediaType: MediaType, detail: TmdbDetail): MovieMeta {
  const title = detail.title ?? detail.name ?? String(detail.id);
  const releaseYear =
    Number((detail.release_date ?? detail.first_air_date ?? '').slice(0, 4)) || undefined;
  const runtime =
    mediaType === 'movie'
      ? detail.runtime
      : detail.episode_run_time?.[0];
  const director =
    mediaType === 'movie'
      ? detail.credits?.crew?.find((crew) => crew.job === 'Director')?.name
      : detail.created_by?.[0]?.name;

  return {
    key: movieKey(mediaType, detail.id),
    mediaType,
    tmdbId: detail.id,
    title,
    posterPath: detail.poster_path ?? undefined,
    releaseYear,
    runtime,
    genres: (detail.genres ?? []).map((genre) => genre.name),
    overview: detail.overview || undefined,
    director,
    cast: (detail.credits?.cast ?? []).slice(0, 12).map((cast) => cast.name),
    cachedAt: new Date().toISOString(),
  };
}

/** 拉取详情（一次请求带走 credits），缓存进 IndexedDB；已有缓存直接返回 */
export async function fetchAndCacheMovie(mediaType: MediaType, tmdbId: number): Promise<MovieMeta> {
  const key = movieKey(mediaType, tmdbId);
  const cached = await db.movies.get(key);
  if (cached) return cached;

  const resp = await apiFetch(
    `/tmdb/${mediaType}/${tmdbId}?language=zh-CN&append_to_response=credits`,
  );
  if (!resp.ok) {
    throw new Error(`影片信息获取失败（${resp.status}）`);
  }
  const detail = (await resp.json()) as TmdbDetail;
  const meta = mapDetail(mediaType, detail);
  await db.movies.put(meta);
  return meta;
}

/** 从本地缓存取元数据（无网络场景，如编辑已有记录） */
export async function getCachedMovie(
  mediaType: MediaType,
  tmdbId: number,
): Promise<MovieMeta | undefined> {
  return db.movies.get(movieKey(mediaType, tmdbId));
}
