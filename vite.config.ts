import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { runtimePlugin } from './scripts/runtime-plugin.ts';

export default defineConfig({
  plugins: [react(), runtimePlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        studio: resolve(import.meta.dirname, 'studio/index.html'),
      },
    },
  },
  server: { host: true },
});
