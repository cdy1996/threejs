import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(fileURLToPath(new URL('.', import.meta.url)), 'index.html'),
        blackhole: resolve(fileURLToPath(new URL('.', import.meta.url)), 'blackhole.html')
      }
    }
  }
});
