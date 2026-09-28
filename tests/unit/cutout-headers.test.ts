import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isolationHeaders, ORT_FILES, ortVersion } from '../../scripts/isolation-plugin';

interface Rule { source: string; headers: Array<{ key: string; value: string }> }
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as { headers: Rule[] };
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** Headers Vercel sends for a path: every matching rule, later rules winning (path-to-regexp «(.*)» only). */
function headersFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of vercel.headers) {
    const re = new RegExp('^' + r.source.split('(.*)').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    if (re.test(path)) for (const h of r.headers) out[h.key.toLowerCase()] = h.value;
  }
  return out;
}

describe('headers for the in-browser cutout (vercel.json)', () => {
  it('lets WebAssembly compile, never allows blob: scripts, and reaches Hugging Face only to download', () => {
    const csp = headersFor('/')['content-security-policy'];
    const dir = (name: string) => csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' '))!;
    expect(dir('script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(dir('connect-src')).toBe("connect-src 'self' blob: data: https://huggingface.co https://*.hf.co https://*.huggingface.co");
    expect(dir('worker-src')).toBe("worker-src 'self' blob:");
    expect(dir('default-src')).toBe("default-src 'self'");
  });

  it('isolates only the photo studio (and the QA page)', () => {
    for (const p of ['/studio/foto/', '/studio/foto/index.html', '/dev/cutout', '/dev/cutout.html']) {
      expect(headersFor(p)['cross-origin-opener-policy'], p).toBe('same-origin');
      expect(headersFor(p)['cross-origin-embedder-policy'], p).toBe('require-corp');
    }
    for (const p of ['/', '/studio/', '/imagen-a-ascii/', '/licencia/', '/ex/salidas/web/']) {
      expect(headersFor(p)['cross-origin-opener-policy'], p).toBeUndefined();
      expect(headersFor(p)['cross-origin-embedder-policy'], p).toBeUndefined();
    }
  });

  it('serves scripts and the runtime so workers load inside an isolated page', () => {
    for (const p of ['/assets/ml.worker-abc.js', '/ort/1.30.0/ort-wasm-simd-threaded.mjs']) {
      expect(headersFor(p)['cross-origin-resource-policy'], p).toBe('same-origin');
      expect(headersFor(p)['cross-origin-embedder-policy'], p).toBe('require-corp');
      expect(headersFor(p)['cache-control'], p).toContain('immutable');
    }
    expect(headersFor('/ort/1.30.0/ort-wasm-simd-threaded.wasm')['content-type']).toBe('application/wasm');
    expect(headersFor('/models/manifest.json')['cache-control']).toBe('public, max-age=300');
  });
});

describe('dev/preview servers mirror the same rules', () => {
  it('isolates the same pages and marks subresources', () => {
    expect(isolationHeaders('/studio/foto/')).toMatchObject({ 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    expect(isolationHeaders('/dev/cutout.html')).toMatchObject({ 'Cross-Origin-Opener-Policy': 'same-origin' });
    expect(isolationHeaders('/studio/')).toEqual({});
    expect(isolationHeaders('/')).toEqual({});
    expect(isolationHeaders('/assets/x.js')).toEqual({ 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
  });

  it('copies the runtime files of the exact installed version', () => {
    expect(pkg.dependencies['onnxruntime-web']).toMatch(/^1\.30\.\d+$/);
    expect(ortVersion()).toBe(pkg.dependencies['onnxruntime-web']);
    expect(ORT_FILES).toEqual(expect.arrayContaining(['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.asyncify.mjs']));
  });
});
