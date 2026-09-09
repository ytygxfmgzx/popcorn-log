<script setup lang="ts">
import { useAppSettings } from '@/composables/useAppSettings';

/** 成员多选 chips：选中 = 弱橙底 + 主色字 + ✓ */
const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const { settings } = useAppSettings();

function toggle(member: string): void {
  const next = props.modelValue.includes(member)
    ? props.modelValue.filter((item) => item !== member)
    : [...props.modelValue, member];
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="member-chips">
    <span
      v-for="member in settings.members"
      :key="member"
      class="chip-btn"
      :class="{ on: modelValue.includes(member) }"
      @click="toggle(member)"
    >
      {{ member }}<em v-if="modelValue.includes(member)"> ✓</em>
    </span>
    <p v-if="!settings.members.length" class="empty-hint">
      还没有家庭成员，去「设置 → 家庭成员」添加
    </p>
  </div>
</template>

<style scoped>
.member-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip-btn em {
  font-style: normal;
}

.empty-hint {
  font-size: var(--t-12);
  color: var(--c-text-3);
}
</style>
