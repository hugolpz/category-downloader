import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  worker: { format: 'es' },
  server: { port: 8079, strictPort: true, proxy: { '/auth': 'http://localhost:8787', '/api': 'http://localhost:8787' } },
  test: { environment: 'node' },
});
