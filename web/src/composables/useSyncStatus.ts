import { computed } from 'vue';
import { db } from '@/db/dexie';
import { useLiveQuery } from '@/composables/useLiveQuery';
import { useAppSettings } from '@/composables/useAppSettings';
import { isCredentialsComplete } from '@/db/credentials';
import { findDuplicateGroups } from '@/utils/duplicate';

/** 同步底账实时状态（syncStates liveQuery 驱动，同步引擎写库后 UI 自动刷新） */
export function useSyncStatus() {
  const { data: syncStates } = useLiveQuery(() => db.syncStates.toArray(), []);
  const { data: credRow } = useLiveQuery(() => db.settings.get('credentials'), undefined);

  const pendingCount = computed(
    () => syncStates.value.filter((state) => state.status === 'pending').length,
  );
  const conflictCount = computed(
    () => syncStates.value.filter((state) => state.status === 'conflict').length,
  );
  /** WebDAV 服务器/账号/密码都已填写（未配置时同步静默跳过，指示器显示"未开启"） */
  const hasCredentials = computed(() => {
    const row = credRow.value;
    return row?.key === 'credentials' ? isCredentialsComplete(row.value) : false;
  });

  return { pendingCount, conflictCount, hasCredentials, syncStates };
}

/** 疑似重复组（同日同片多条，未在"都保留"忽略清单内的） */
export function useDuplicateGroups() {
  const { data: records } = useLiveQuery(() => db.records.toArray(), []);
  const { settings } = useAppSettings();

  const groups = computed(() =>
    findDuplicateGroups(
      records.value.filter((record) => !record.deleted),
      settings.value.hiddenDuplicateKeys ?? [],
    ),
  );

  return { groups };
}
