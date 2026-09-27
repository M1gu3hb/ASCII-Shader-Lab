import { build } from 'esbuild';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Exposes `virtual:mt-runtime` — the standalone engine runtime, bundled and minified with
 * esbuild, as a string. The studio inlines it into exported HTML / Web Component / React code,
 * so exports never depend on Function.prototype.toString() of bundled code.
 */
export function runtimePlugin(): Plugin {
  const id = 'virtual:mt-runtime';
  const resolved = '\0' + id;
  const entry = resolve(import.meta.dirname, '../src/runtime/entry.ts');
  return {
    name: 'mt-runtime',
    resolveId(source) {
      return source === id ? resolved : null;
    },
    async load(source) {
      if (source !== resolved) return null;
      const out = await build({
        entryPoints: [entry],
        bundle: true,
        minify: true,
        format: 'iife',
        target: 'es2020',
        write: false,
        legalComments: 'none',
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      const code = out.outputFiles[0].text;
      this.addWatchFile(entry);
      return `export default ${JSON.stringify(code)};`;
    },
  };
}
