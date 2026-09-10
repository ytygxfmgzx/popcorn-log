<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { apiBase } from '@/services/api';
import { getCloudStore } from '@/services/cloud';
import { getCredentials, saveCredentials } from '@/db/credentials';
import { buildBackup, downloadBackup } from '@/services/backup';
import { getAppSettings } from '@/db/settings';
import { useAppSettings } from '@/composables/useAppSettings';
import { useDuplicateGroups, useSyncStatus } from '@/composables/useSyncStatus';
import { syncNow } from '@/sync/schedule';
import { PRESET_LOCATIONS, type SyncMode } from '@/types';

const router = useRouter();
const { settings, save } = useAppSettings();

const appVersion = __APP_VERSION__;

/* ---- Worker 地址 ---- */
const workerUrlInput = ref('');
const testing = ref(false);

/* ---- 云同步（双模式：Worker+R2 默认 / S3 直连高级） ---- */
const syncMode = ref<SyncMode>('worker');
const syncPasswordInput = ref('');
const s3EndpointInput = ref('');
const s3BucketInput = ref('');
const s3AccessKeyInput = ref('');
const s3SecretKeyInput = ref('');
const testingCreds = ref(false);
const syncing = ref(false);

// 直接查库初始化：settings 由 liveQuery 异步驱动，挂载瞬间尚未就绪
onMounted(async () => {
  const appSettings = await getAppSettings();
  workerUrlInput.value = appSettings.workerUrl ?? '';
  const credentials = await getCredentials();
  syncMode.value = credentials.mode === 'direct' ? 'direct' : 'worker';
  syncPasswordInput.value = credentials.syncPassword ?? '';
  s3EndpointInput.value = credentials.s3Endpoint ?? '';
  s3BucketInput.value = credentials.s3Bucket ?? '';
  s3AccessKeyInput.value = credentials.s3AccessKeyId ?? '';
  s3SecretKeyInput.value = credentials.s3SecretAccessKey ?? '';
});

async function saveWorkerUrl(): Promise<void> {
  await save({ workerUrl: workerUrlInput.value.trim() || undefined });
}

async function testConnection(): Promise<void> {
  await saveWorkerUrl();
  testing.value = true;
  try {
    const base = await apiBase();
    const resp = await fetch(`${base}/health`);
    if (resp.ok) {
      showToast('连接成功 ✅');
    } else {
      showToast(`连接失败（${resp.status}）`);
    }
  } catch {
    showToast('连接失败，请检查地址与网络');
  } finally {
    testing.value = false;
  }
}

const { pendingCount, conflictCount } = useSyncStatus();
const { groups: duplicateGroups } = useDuplicateGroups();

const statusLine = computed(() => {
  const parts: string[] = [];
  if (pendingCount.value) parts.push(`待同步 ${pendingCount.value}`);
  if (conflictCount.value) parts.push(`冲突 ${conflictCount.value}`);
  if (duplicateGroups.value.length) parts.push(`疑似重复 ${duplicateGroups.value.length} 组`);
  if (!parts.length) return '状态正常';
  return parts.join(' · ') + (hasPendingWork.value ? ' ›' : '');
});

const hasPendingWork = computed(
  () => conflictCount.value > 0 || duplicateGroups.value.length > 0,
);

const lastSyncedLabel = computed(() => {
  const at = settings.value.lastSyncedAt;
  if (!at) return '从未';
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
});

/** 切即存：点模式按钮立即持久化 mode，界面所示即引擎所用 */
async function switchMode(mode: SyncMode): Promise<void> {
  if (syncMode.value === mode) return;
  syncMode.value = mode;
  await saveCredentials({ mode });
}

async function testAndSaveCredentials(): Promise<void> {
  if (syncMode.value === 'worker') {
    if (!syncPasswordInput.value) {
      showToast('请填写同步密码');
      return;
    }
    await saveCredentials({ mode: 'worker', syncPassword: syncPasswordInput.value });
  } else {
    if (!s3EndpointInput.value.trim() || !s3BucketInput.value.trim() || !s3AccessKeyInput.value.trim() || !s3SecretKeyInput.value) {
      showToast('请填写完整的 S3 四项配置');
      return;
    }
    await saveCredentials({
      mode: 'direct',
      s3Endpoint: s3EndpointInput.value.trim(),
      s3Bucket: s3BucketInput.value.trim(),
      s3AccessKeyId: s3AccessKeyInput.value.trim(),
      s3SecretAccessKey: s3SecretKeyInput.value,
    });
  }
  testingCreds.value = true;
  try {
    const store = await getCloudStore();
    await store.verify();
    showToast('连接成功 ✅');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '连接失败');
  } finally {
    testingCreds.value = false;
  }
}

async function syncImmediately(): Promise<void> {
  syncing.value = true;
  try {
    const summary = await syncNow();
    if (!summary) {
      showToast('请先填写并保存云同步配置');
      return;
    }
    if (summary.conflicts > 0) {
      showToast(`同步完成，${summary.conflicts} 条冲突待处理`);
    } else {
      showToast('同步完成 ✅');
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '同步失败');
  } finally {
    syncing.value = false;
  }
}

/* ---- 成员管理 ---- */
const showAddMember = ref(false);
const newMember = ref('');

async function addMember(): Promise<void> {
  const name = newMember.value.trim();
  if (!name) return;
  if (settings.value.members.includes(name)) {
    showToast('已有这个成员啦');
    return;
  }
  await save({ members: [...settings.value.members, name] });
  newMember.value = '';
  showAddMember.value = false;
}

async function removeMember(name: string): Promise<void> {
  await showConfirmDialog({
    title: `移除「${name}」？`,
    message: '已有的观影记录不受影响',
    confirmButtonText: '移除',
    confirmButtonColor: 'var(--c-danger)',
  });
  await save({ members: settings.value.members.filter((member) => member !== name) });
}

/* ---- 自定义地点 ---- */
const showAddLocation = ref(false);
const newLocation = ref('');

async function removeLocation(name: string): Promise<void> {
  await showConfirmDialog({
    title: `删除地点「${name}」？`,
    message: '已有的观影记录不受影响',
    confirmButtonText: '删除',
    confirmButtonColor: 'var(--c-danger)',
  });
  await save({
    customLocations: settings.value.customLocations.filter((location) => location !== name),
  });
}

async function addLocation(): Promise<void> {
  const name = newLocation.value.trim();
  if (!name) return;
  if (!settings.value.customLocations.includes(name)) {
    await save({ customLocations: [...settings.value.customLocations, name] });
  }
  newLocation.value = '';
  showAddLocation.value = false;
}

/* ---- 备份导出 ---- */
const exporting = ref(false);

async function exportBackup(): Promise<void> {
  exporting.value = true;
  try {
    downloadBackup(await buildBackup());
    showToast('已导出备份文件');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div>
    <header class="navbar">
      <h1>设置</h1>
    </header>

    <main class="page">
      <!-- 一起看（成员） -->
      <h2 class="group-title">一起看</h2>
      <div class="card group chip-wrap">
        <span
          v-for="member in settings.members"
          :key="member"
          class="chip-btn"
          @click="removeMember(member)"
        >
          {{ member }}<em class="chip-del">✕</em>
        </span>
        <span class="chip-btn add" @click="showAddMember = true">＋</span>
      </div>

      <!-- 在哪看（地点） -->
      <h2 class="group-title">在哪看</h2>
      <div class="card group chip-wrap">
        <span v-for="location in PRESET_LOCATIONS" :key="location" class="chip-btn preset">
          {{ location }}<em class="chip-tag">预设</em>
        </span>
        <span
          v-for="location in settings.customLocations"
          :key="location"
          class="chip-btn"
          @click="removeLocation(location)"
        >
          {{ location }}<em class="chip-del">✕</em>
        </span>
        <span class="chip-btn add" @click="showAddLocation = true">＋</span>
        <p class="group-hint chip-hint">点 ✕ 删除；也可在录入页随手添加，自动同步到这里。</p>
      </div>

      <!-- 这里管影片资源（TMDB 代理 Worker） -->
      <h2 class="group-title">这里管影片资源</h2>
      <div class="card group">
        <div class="worker-row">
          <van-field
            v-model="workerUrlInput"
            label="Worker 地址"
            placeholder="如 https://popcorn-log-proxy.你的账号.workers.dev"
            @blur="saveWorkerUrl"
          />
          <van-button
            size="small"
            round
            :loading="testing"
            class="test-btn"
            @click="testConnection"
          >
            测试连接
          </van-button>
        </div>
        <p class="group-hint">
          留空 = 使用当前部署域名（本地开发适用）。搜片与海报显示需先配置可用的 Worker。
        </p>
      </div>

      <!-- 云同步 -->
      <h2 class="group-title">云同步</h2>
      <div class="card group">
        <div class="mode-switch">
          <span
            class="mode-btn"
            :class="{ on: syncMode === 'worker' }"
            @click="switchMode('worker')"
          >默认 · CF Worker<em v-if="syncMode === 'worker'"> ✓</em></span>
          <span
            class="mode-btn"
            :class="{ on: syncMode === 'direct' }"
            @click="switchMode('direct')"
          >高级 · 直连 S3<em v-if="syncMode === 'direct'"> ✓</em></span>
        </div>

        <template v-if="syncMode === 'worker'">
          <van-field
            v-model="syncPasswordInput"
            type="password"
            label="同步密码"
            placeholder="两台手机填同一个（部署 Worker 时设置的 SYNC_PASSWORD）"
          />
          <p class="group-hint">
            推荐。数据存你自己 Cloudflare 账号的 R2（免费 10GB）；密钥只在服务端，手机上仅需一个密码。两台手机填同一个即可共享全部记录与配置。
          </p>
        </template>

        <template v-else>
          <van-field
            v-model="s3EndpointInput"
            label="Endpoint"
            placeholder="如 https://oss-cn-hangzhou.aliyuncs.com"
          />
          <van-field v-model="s3BucketInput" label="Bucket" placeholder="如 popcorn-log" />
          <van-field v-model="s3AccessKeyInput" label="AccessKey" placeholder="AccessKey ID" />
          <van-field
            v-model="s3SecretKeyInput"
            type="password"
            label="SecretKey"
            placeholder="Secret Access Key"
          />
          <p class="group-hint">
            高级选项：浏览器直连任意 S3 兼容存储（阿里 OSS / 腾讯 COS / R2 / B2），需在存储控制台配置 CORS 并使用最小权限密钥。密钥只存这台手机。
          </p>
        </template>

        <div class="btn-row">
          <button class="btn-plain" :loading="testingCreds" @click="testAndSaveCredentials">
            🔑 测试并保存
          </button>
          <button class="btn-primary" :loading="syncing" @click="syncImmediately">
            ⇅ 立即同步
          </button>
        </div>
        <p
          class="group-hint"
          :class="{ 'status-link': hasPendingWork }"
          @click="hasPendingWork && router.push('/conflicts')"
        >
          {{ statusLine }} · 最近同步：{{ lastSyncedLabel }}
        </p>
      </div>

      <!-- 本地备份 -->
      <h2 class="group-title">本地备份</h2>
      <div class="card group">
        <button class="row-add" :loading="exporting" @click="exportBackup">
          📦 导出 JSON 备份
        </button>
        <p class="group-hint">
          备份包含全部观影记录与影片信息（不含密码与海报图片）。建议每月导出一次。
        </p>
      </div>

      <!-- 关于 -->
      <h2 class="group-title">关于</h2>
      <div class="card group about">
        <p>Popcorn Log</p>
        <p>v{{ appVersion }} · 想看清单规划中</p>
      </div>
    </main>

    <!-- 添加成员弹层 -->
    <van-popup
      v-model:show="showAddMember"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <div class="sheet">
        <h3>添加成员</h3>
        <van-field
          v-model="newMember"
          placeholder="如：妹妹、外婆"
          maxlength="8"
          @keyup.enter="addMember"
        />
        <van-button block round type="primary" class="sheet-btn" @click="addMember">
          添加
        </van-button>
      </div>
    </van-popup>

    <!-- 添加地点弹层 -->
    <van-popup
      v-model:show="showAddLocation"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <div class="sheet">
        <h3>添加地点</h3>
        <van-field
          v-model="newLocation"
          placeholder="如：外婆家"
          maxlength="12"
          @keyup.enter="addLocation"
        />
        <van-button block round type="primary" class="sheet-btn" @click="addLocation">
          添加
        </van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  padding: 12px 16px 10px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}

.navbar h1 {
  font-size: var(--t-20);
  font-weight: 600;
}

.group-title {
  font-size: var(--t-14);
  color: var(--c-text-2);
  font-weight: 600;
  margin: 20px 4px 8px;
}

.group-title:first-of-type {
  margin-top: 8px;
}

.group {
  padding: 8px 0;
}

.worker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 0;
}

.worker-row :deep(.van-field) {
  flex: 1;
  background: transparent;
}

.test-btn {
  flex: none;
  color: var(--c-primary-active);
  border-color: var(--c-primary);
  font-size: var(--t-12);
}

.line-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: var(--t-15);
}

.line-row + .line-row,
.line-row + .row-add,
.row-add + .group-hint {
  border-top: 1px solid var(--c-bg);
}

.preset-tag {
  font-size: var(--t-12);
  color: var(--c-text-3);
}

.row-remove {
  border: none;
  background: none;
  font-family: inherit;
  font-size: var(--t-12);
  color: var(--c-danger);
  cursor: pointer;
}

.row-add {
  display: block;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: none;
  font-family: inherit;
  font-size: var(--t-15);
  color: var(--c-primary);
  cursor: pointer;
  text-align: left;
}

.group-hint {
  font-size: var(--t-12);
  color: var(--c-text-3);
  padding: 8px 16px;
  line-height: 1.6;
}

.group-hint.status-link {
  color: var(--c-primary-active);
  cursor: pointer;
}

.mode-switch {
  display: flex;
  gap: 8px;
  padding: 10px 16px 8px;
}

.mode-btn {
  flex: 1;
  text-align: center;
  padding: 7px 0;
  font-size: var(--t-13);
  border-radius: 999px;
  background: var(--c-bg);
  color: var(--c-text-2);
  cursor: pointer;
}

.mode-btn.on {
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
  font-weight: 600;
}

.mode-btn em {
  font-style: normal;
}

/* chips 流式布局（成员 / 地点管理） */
.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
}

.chip-wrap .chip-btn {
  cursor: pointer;
}

.chip-wrap .chip-btn.preset {
  cursor: default;
}

.chip-del {
  font-style: normal;
  font-size: 10px;
  color: var(--c-text-3);
  margin-left: 5px;
}

.chip-tag {
  font-style: normal;
  font-size: 10px;
  color: var(--c-text-3);
  margin-left: 5px;
}

.chip-hint {
  width: 100%;
  padding: 2px 0 0;
  margin: 0;
}

/* 云同步按钮行 */
.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 2px 16px 12px;
}

.btn-plain,
.btn-primary {
  border-radius: var(--r-btn);
  padding: 10px 0;
  font-family: inherit;
  font-size: var(--t-14);
  cursor: pointer;
}

.btn-plain {
  border: 1px solid var(--c-primary);
  background: var(--c-card);
  color: var(--c-primary-active);
}

.btn-primary {
  border: none;
  background: var(--c-primary);
  color: #fff;
}

.btn-primary:active {
  background: var(--c-primary-active);
}

.about {
  padding: 12px 16px;
}

.about p {
  font-size: var(--t-12);
  color: var(--c-text-3);
}

.about p:first-child {
  font-size: var(--t-14);
  color: var(--c-text-2);
}

.sheet {
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
}

.sheet h3 {
  font-size: var(--t-17);
  font-weight: 600;
  margin-bottom: 12px;
  text-align: center;
}

.sheet .van-field {
  background: var(--c-bg);
  border-radius: var(--r-btn);
  margin-bottom: 12px;
}

.sheet-btn {
  margin-top: 4px;
}
</style>
