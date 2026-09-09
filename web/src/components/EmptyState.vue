<script setup lang="ts">
defineProps<{
  emoji?: string;
  title: string;
  subtitle?: string;
  actionText?: string;
}>();

defineEmits<{
  action: [];
}>();
</script>

<template>
  <!-- 所有空态必须给出下一步动作 -->
  <div class="empty">
    <span class="emoji">{{ emoji ?? '🍿' }}</span>
    <b>{{ title }}</b>
    <p v-if="subtitle">{{ subtitle }}</p>
    <button v-if="actionText" class="empty-btn" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 48px 24px;
}

.emoji {
  font-size: 52px;
  display: block;
}

.empty b {
  display: block;
  font-size: var(--t-17);
  font-weight: 600;
  margin-top: 16px;
}

.empty p {
  font-size: var(--t-15);
  color: var(--c-text-2);
  margin: 6px 0 20px;
}

.empty-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--t-15);
  font-weight: 500;
  padding: 0 20px;
  height: 40px;
  border-radius: var(--r-btn);
  border: none;
  cursor: pointer;
  font-family: inherit;
  background: var(--c-primary);
  color: var(--c-card);
  transition: background 150ms ease-out;
}

.empty-btn:active {
  background: var(--c-primary-active);
}
</style>
