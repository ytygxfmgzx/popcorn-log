<script setup lang="ts">
import { ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import { apiBase } from '@/services/api';
import { buildBackup, downloadBackup } from '@/services/backup';
import { useAppSettings } from '@/composables/useAppSettings';
import { PRESET_LOCATIONS } from '@/types';

const { settings, save } = useAppSettings();

const appVersion = __APP_VERSION__;

/* ---- Worker 地址 ---- */
const workerUrlInput = ref('');
const testing = ref(false);

void (async () => {
  workerUrlInput.value = settings.value.workerUrl ?? '';
})();

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
      <!-- 同步 -->
      <h2 class="group-title">同步</h2>
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

      <!-- 家庭成员 -->
      <h2 class="group-title">家庭成员</h2>
      <div class="card group">
        <div v-for="member in settings.members" :key="member" class="line-row">
          <span>👨‍👩‍👧 {{ member }}</span>
          <button class="row-remove" @click="removeMember(member)">移除</button>
        </div>
        <button class="row-add" @click="showAddMember = true">＋ 添加成员</button>
      </div>

      <!-- 地点 -->
      <h2 class="group-title">常用地点</h2>
      <div class="card group">
        <div v-for="location in PRESET_LOCATIONS" :key="location" class="line-row">
          <span>{{ location }}</span>
          <span class="preset-tag">预设</span>
        </div>
        <div v-for="location in settings.customLocations" :key="location" class="line-row">
          <span>{{ location }}</span>
          <button class="row-remove" @click="removeLocation(location)">删除</button>
        </div>
        <p class="group-hint">新地点可在录入页随手添加，会自动出现在这里。</p>
      </div>

      <!-- 数据 -->
      <h2 class="group-title">数据</h2>
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
        <p>观影手账（popcorn-log）</p>
        <p>v{{ appVersion }} · 云同步与统计开发中</p>
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
        <h3>添加家庭成员</h3>
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
