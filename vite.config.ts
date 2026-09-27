import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { runtimePlugin } from './scripts/runtime-plugin';

export default defineConfig({
  plugins: [react(), runtimePlugin()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio/index.html'),
      },
    },
  },
  server: { host: true },
});
