import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { runtimePlugin } from './scripts/runtime-plugin.ts';
import { seoPlugin } from './scripts/seo-plugin.ts';
import { PAGES } from './src/shared/site.ts';

export default defineConfig({
  // Multi-page site: unknown URLs are 404s, not the landing.
  appType: 'mpa',
  plugins: [react(), runtimePlugin(), seoPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // Every public page (landing, studio, guides, licencia, 404) is listed once, in src/shared/site.ts.
      input: Object.fromEntries(PAGES.map(p => [p.id, resolve(import.meta.dirname, p.file)])),
    },
  },
  server: { host: true },
});
