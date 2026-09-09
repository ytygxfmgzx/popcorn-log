import { ref } from 'vue';
import { registerSW } from 'virtual:pwa-register';

export const needRefresh = ref(false);

export const updateSW = registerSW({
  onNeedRefresh() {
    needRefresh.value = true;
  },
});
