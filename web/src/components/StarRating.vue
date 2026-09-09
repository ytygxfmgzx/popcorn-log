<script setup lang="ts">
import { computed } from 'vue';

/** 评分星封装：v-model 0 = 未评分 */
const props = defineProps<{
  modelValue: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const rateValue = computed({
  get: () => props.modelValue,
  set: (value: number) => emit('update:modelValue', value),
});
</script>

<template>
  <div class="star-rating">
    <van-rate v-model="rateValue" :count="5" />
    <span v-if="modelValue === 0" class="none-label">点星评分，可不评</span>
  </div>
</template>

<style scoped>
.star-rating {
  display: flex;
  align-items: center;
  gap: 12px;
}

.none-label {
  font-size: var(--t-12);
  color: var(--c-text-3);
}
</style>
