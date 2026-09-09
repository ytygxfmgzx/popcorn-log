import { createApp } from 'vue';
import Vant from 'vant';
import 'vant/lib/index.css';
import '@/styles/tokens.css';
import '@/styles/vant-theme.css';
import '@/styles/base.css';
import App from './App.vue';
import router from './router';
import './pwa';

const app = createApp(App);
app.use(router);
app.use(Vant);
app.mount('#app');
