/**
 * Build + preview of the cutout QA page (dev/cutout.html) on its own, so it never ships with the site:
 *
 *   npx vite --config scripts/cutout-qa.config.ts --port 4195                  # dev server
 *   npx vite build --config scripts/cutout-qa.config.ts                        # → dist-qa/
 *   npx vite preview --config scripts/cutout-qa.config.ts --port 4195 --strictPort
 *   BASE_URL=http://localhost:4195 PW_PORT=4195 npx playwright test cutout     # tests/e2e/cutout.spec.ts
 *
 * Same isolation headers and /ort/<version>/ files as the site (scripts/isolation-plugin.ts).
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { isolationPlugin } from './isolation-plugin.ts';

const root = resolve(import.meta.dirname, '..');

export default defineConfig({
  root,
  appType: 'mpa',
  plugins: [isolationPlugin()],
  build: {
    outDir: resolve(root, 'dist-qa'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { cutout: resolve(root, 'dev/cutout.html') } },
  },
  server: { host: true },
});
