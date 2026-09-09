<script setup lang="ts">
import { ref } from 'vue';
import { useAppSettings } from '@/composables/useAppSettings';

/** 成员多选 chips：选中 = 弱橙底 + 主色字 + ✓；＋ 随手新增（同步进设置页成员列表） */
const props = defineProps<{
  modelValue: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const { settings, save } = useAppSettings();

function toggle(member: string): void {
  const next = props.modelValue.includes(member)
    ? props.modelValue.filter((item) => item !== member)
    : [...props.modelValue, member];
  emit('update:modelValue', next);
}

const showAdd = ref(false);
const newMember = ref('');

async function confirmAdd(): Promise<void> {
  const name = newMember.value.trim();
  if (!name) return;
  if (!settings.value.members.includes(name)) {
    await save({ members: [...settings.value.members, name] });
  }
  if (!props.modelValue.includes(name)) {
    emit('update:modelValue', [...props.modelValue, name]);
  }
  newMember.value = '';
  showAdd.value = false;
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
    <span class="chip-btn add" @click="showAdd = true">＋</span>
    <p v-if="!settings.members.length" class="empty-hint">还没有成员，点 ＋ 添加</p>

    <van-popup
      v-model:show="showAdd"
      position="bottom"
      round
      :style="{ maxWidth: '480px', left: '50%', transform: 'translateX(-50%)' }"
    >
      <div class="add-sheet">
        <h3>添加成员</h3>
        <van-field
          v-model="newMember"
          placeholder="如：妹妹、外婆"
          maxlength="8"
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
