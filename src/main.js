import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { appRouter } from './router';
import './styles/theme.css';

const app = createApp(App).use(createPinia()); // pinia first: the router's login guard uses a store
const router = appRouter();
app.use(router);

// Wait for the first navigation: if we are coming back from Wikimedia's login, the router guard has
// finished the login (and redirected to the right page) before anything is drawn.
router.isReady().then(() => app.mount('#app'));
