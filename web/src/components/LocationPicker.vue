<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAppSettings } from '@/composables/useAppSettings';
import { LOCATION_EMOJI } from '@/types';

/** 地点选择（含初始预置，均存 AppSettings.customLocations，可增可删）+ 自定义添加 */
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { settings, save } = useAppSettings();

const options = computed(() => settings.value.customLocations);

const showAdd = ref(false);
const newLocation = ref('');

function pick(location: string): void {
  emit('update:modelValue', location);
}

async function confirmAdd(): Promise<void> {
  const name = newLocation.value.trim();
  if (!name) return;
  if (!options.value.includes(name)) {
    await save({ customLocations: [...settings.value.customLocations, name] });
  }
  pick(name);
  newLocation.value = '';
  showAdd.value = false;
}
</script>

<template>
  <div class="location-picker">
    <span
      v-for="location in options"
      :key="location"
      class="chip-btn"
      :class="{ on: modelValue === location }"
      @click="pick(location)"
    >
      {{ LOCATION_EMOJI[location] ?? '📍' }} {{ location }}
    </span>
    <span class="chip-btn add" @click="showAdd = true">＋</span>

    <van-popup
      v-model:show="showAdd"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <div class="add-sheet">
        <h3>添加地点</h3>
        <van-field
          v-model="newLocation"
          placeholder="如：外婆家"
          maxlength="12"
          @keyup.enter="confirmAdd"
        />
        <van-button block type="primary" round class="add-btn" @click="confirmAdd">
          添加并选中
        </van-button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.location-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.add-sheet {
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
}

.add-sheet h3 {
  font-size: var(--t-17);
  font-weight: 600;
  margin-bottom: 12px;
  text-align: center;
}

.add-sheet .van-field {
  background: var(--c-bg);
  border-radius: var(--r-btn);
  margin-bottom: 12px;
}

.add-btn {
  margin-top: 4px;
}
</style>
