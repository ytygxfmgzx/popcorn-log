import { ref, onScopeDispose, type Ref } from 'vue';
import { liveQuery } from 'dexie';

/**
 * Dexie liveQuery 的 Vue 封装：查询结果变化时自动更新 ref
 */
export function useLiveQuery<T>(querier: () => Promise<T> | T, defaultValue: T): {
  data: Ref<T>;
  isLoading: Ref<boolean>;
} {
  const data = ref(defaultValue) as Ref<T>;
  const isLoading = ref(true);

  const subscription = liveQuery(querier).subscribe({
    next(value) {
      data.value = value;
      isLoading.value = false;
    },
    error() {
      isLoading.value = false;
    },
  });

  onScopeDispose(() => subscription.unsubscribe());

  return { data, isLoading };
}
