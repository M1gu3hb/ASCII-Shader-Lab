import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { isolationPlugin } from './scripts/isolation-plugin.ts';
import { runtimePlugin } from './scripts/runtime-plugin.ts';
import { seoPlugin } from './scripts/seo-plugin.ts';
import { PAGES } from './src/shared/site.ts';

/**
 * Chunks named after what they carry, so tests/e2e/perf.spec.ts can check that none of them loads with
 * a page's first view (the basic engine only without WebGL 2; the exporters only when exporting).
 * Only the file names change: the chunk graph stays the one Vite builds.
 */
const NAMED_CHUNKS: Array<[RegExp, string]> = [
  [/[\\/]src[\\/]engine[\\/]basic[\\/]/, 'basic-engine'],
  [/[\\/]node_modules[\\/]mediabunny[\\/]/, 'mediabunny'],
  [/[\\/]node_modules[\\/]gifenc[\\/]/, 'gifenc'],
  [/[\\/]node_modules[\\/]opentype\.js[\\/]/, 'opentype'],
  [/[\\/]src[\\/]exporters[\\/]code\.ts$/, 'exporter-code'],
  [/[\\/]src[\\/]studio[\\/]ExportSheet\.tsx$/, 'export-sheet'],
];

export default defineConfig({
  // Multi-page site: unknown URLs are 404s, not the landing.
  appType: 'mpa',
  // isolationPlugin: onnxruntime-web files under /ort/<version>/ and COOP/COEP on the photo studio (in-browser cutout).
  plugins: [react(), runtimePlugin(), seoPlugin(), isolationPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // Every public page (landing, studio, guides, licencia, 404) is listed once, in src/shared/site.ts.
      input: Object.fromEntries(PAGES.map(p => [p.id, resolve(import.meta.dirname, p.file)])),
      output: {
        chunkFileNames: c => {
          const named = NAMED_CHUNKS.find(([re]) => c.moduleIds.some(id => re.test(id)));
          return `assets/${named ? named[1] : '[name]'}-[hash].js`;
        },
      },
    },
  },
  server: { host: true },
});
