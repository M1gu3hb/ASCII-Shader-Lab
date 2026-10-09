/**
 * The photo studio's in-browser cutout needs two things from the build and the servers:
 *
 * 1. onnxruntime-web's runtime files served from our own origin, with the exact installed version in the path
 *    (/ort/<version>/ort-wasm-simd-threaded[.asyncify].{mjs,wasm}). The ML worker points ORT's wasmPaths there:
 *    no CDN, no blob: URLs. Dev serves them from node_modules; the build copies them into dist.
 *    ORT is imported through its "extern wasm" builds (the .mjs factory is fetched from /ort/, not inlined).
 * 2. Cross-origin isolation (COOP same-origin + COEP require-corp) on the pages that run the models, so WASM can
 *    use threads (SharedArrayBuffer). Scoped to those pages; other pages keep working as before. Scripts and
 *    runtime files get CORP same-origin + COEP require-corp so the module worker and ORT's thread workers load
 *    inside an isolated page. vercel.json carries the same rules for production.
 */
import { FOTO_STUDIO } from '../src/shared/site.ts';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const ORT_DIR = join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');

export const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

export function ortVersion(): string {
  return JSON.parse(readFileSync(join(ROOT, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8')).version;
}

/** Page paths served cross-origin isolated (the photo studio and the cutout QA page). */
export const ISOLATED_PAGES = [/^\/studio\/foto(\/|$)/, /^\/dev\/cutout(\.html)?$/];

const isDocument = (path: string) => path.endsWith('/') || path.endsWith('.html') || !/\.[a-z0-9]+$/i.test(path.slice(path.lastIndexOf('/')));

/** Adds the isolation headers to a response by path (shared by the dev and preview servers). */
export function isolationHeaders(path: string): Record<string, string> {
  if (ISOLATED_PAGES.some(re => re.test(path))) {
    return { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
  }
  if (!isDocument(path)) return { 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
  return {};
}

const EMPTY_MANIFEST = JSON.stringify({ glyphos: 'models', version: 1, files: [] }) + '\n';

const TYPES: Record<string, string> = { '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm' };

export function isolationPlugin(): Plugin {
  const version = ortVersion();
  const prefix = `/ort/${version}/`;

  const headers: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '/').split('?')[0];
    for (const [k, v] of Object.entries(isolationHeaders(path))) res.setHeader(k, v);
    next();
  };

  const ortFiles: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '/').split('?')[0];
    if (!path.startsWith(prefix)) { next(); return; }
    const name = path.slice(prefix.length);
    const file = join(ORT_DIR, name);
    if (!ORT_FILES.includes(name) || !existsSync(file)) { next(); return; }
    res.setHeader('Content-Type', TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(statSync(file).size));
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(res);
  };

  return {
    name: 'glyphos-isolation',
    config() {
      return {
        resolve: {
          alias: [
            { find: /^onnxruntime-web\/webgpu$/, replacement: join(ORT_DIR, 'ort.webgpu.min.mjs') },
            { find: /^onnxruntime-web\/wasm$/, replacement: join(ORT_DIR, 'ort.wasm.min.mjs') },
          ],
        },
        optimizeDeps: { exclude: ['onnxruntime-web'] },
        // The ML worker imports ORT with import(): a code-splitting (ES module) worker.
        worker: { format: 'es' as const },
      };
    },
    configureServer(server) {
      server.middlewares.use(headers);
      server.middlewares.use(ortFiles);
      // No mirror in dev unless public/models/manifest.json exists: answer with an empty one (no 404 noise).
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== '/models/manifest.json' || existsSync(join(ROOT, 'public', 'models', 'manifest.json'))) { next(); return; }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(EMPTY_MANIFEST);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(headers);
    },
    generateBundle() {
      if (!FOTO_STUDIO) return;
      // The optional same-origin model mirror (scripts/fetch-models.mjs) replaces this empty manifest.
      this.emitFile({ type: 'asset', fileName: 'models/manifest.json', source: EMPTY_MANIFEST });
      for (const name of ORT_FILES) {
        this.emitFile({ type: 'asset', fileName: `ort/${version}/${name}`, source: readFileSync(join(ORT_DIR, name)) });
      }
    },
  };
}
