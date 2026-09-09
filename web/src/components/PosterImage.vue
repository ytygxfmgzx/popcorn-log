<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { ensurePoster } from '@/services/poster';

const props = defineProps<{
  posterPath?: string;
  alt?: string;
}>();

const objectUrl = ref<string | null>(null);

async function load(): Promise<void> {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
  if (!props.posterPath) return;
  const blob = await ensurePoster(props.posterPath);
  if (!blob) return; // 加载失败保持占位，不裂图
  objectUrl.value = URL.createObjectURL(blob);
}

watch(() => props.posterPath, () => void load(), { immediate: true });

onBeforeUnmount(() => {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div class="poster-image">
    <img v-if="objectUrl" :src="objectUrl" :alt="alt ?? ''" />
    <div v-else class="placeholder"><span>🍿</span></div>
  </div>
</template>

<style scoped>
/* 海报一律 2:3；占位 = 弱橙底 + 🍿，加载失败同样回占位 */
.poster-image {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-btn);
  overflow: hidden;
  background: var(--c-primary-weak);
  position: relative;
  flex: none;
}

.poster-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
</style>
