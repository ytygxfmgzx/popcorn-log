import { ref, watch, onScopeDispose, type Ref } from 'vue';
import { db } from '@/db/dexie';
import { movieKey, type MediaType, type MovieMeta } from '@/types';

/** 按 mediaType + tmdbId 读取本地元数据缓存（非 liveQuery，按需查询） */
export function useMovieMeta(mediaType: Ref<MediaType | undefined>, tmdbId: Ref<number | undefined>): {
  meta: Ref<MovieMeta | undefined>;
} {
  const meta = ref<MovieMeta>();

  async function load() {
    if (!mediaType.value || tmdbId.value === undefined) {
      meta.value = undefined;
      return;
    }
    meta.value = await db.movies.get(movieKey(mediaType.value, tmdbId.value));
  }

  const stop = watch(
    () => [mediaType.value, tmdbId.value] as const,
    () => {
      void load();
    },
    { immediate: true },
  );

  onScopeDispose(() => stop());

  return { meta };
}
