import { build, type Plugin as EsbuildPlugin } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The standalone engine runtime, bundled and minified with esbuild, as strings the studio inlines into
 * exported HTML / Web Component / React code (so exports never depend on Function.prototype.toString()
 * of bundled code):
 *   virtual:mt-runtime        the WebGL 2 runtime (src/runtime/entry.ts)
 *   virtual:mt-runtime-basic  { runtime, patterns }: the same runtime plus the basic engine (Canvas 2D,
 *                             src/runtime/entry-basic.ts), and one small script per CPU pattern, so an
 *                             export carries only the patterns its piece uses.
 */
const ROOT = resolve(import.meta.dirname, '..');
const ENTRY = resolve(ROOT, 'src/runtime/entry.ts');
const ENTRY_BASIC = resolve(ROOT, 'src/runtime/entry-basic.ts');
const PATTERNS = resolve(ROOT, 'src/engine/basic/patterns.ts');
/**
 * Modules the BASIC_PATTERNS table takes the library's patterns from (listed there by name). Their
 * exports are pure, so a pattern script keeps only what its one pattern uses, and they take the
 * runtime's helpers instead of core.ts, like patterns.ts.
 */
const LIBRARY = ['patterns-extra.ts', 'patterns-next.ts', 'particles.ts', 'solid.ts'].map(f => resolve(ROOT, 'src/engine/basic', f));
const PATTERN_MODULES = new Set([PATTERNS, ...LIBRARY]);
const CORE = resolve(ROOT, 'src/engine/basic/core.ts');
const SHIM = resolve(ROOT, 'src/runtime/basic-patterns.ts');
const FAMILY_LOADER = resolve(ROOT, 'src/families/load.ts');

/** id → module of each visual family's code, as src/families/load.ts lists them (`id: () => import('./x.ts')`). */
export function familyModules(src = readFileSync(FAMILY_LOADER, 'utf8')): Array<[string, string]> {
  return [...src.matchAll(/^\s*(\w+): \(\) => import\('(\.\/[^']+)'\),?$/gm)].map(m => [m[1], resolve(ROOT, 'src/families', m[2])]);
}

/**
 * One visual family as a script that registers its code in the runtime (Glyphos.registerFamily): the model
 * of a raster family, or the CPU twin of an analytic one. Each carries its own copy of the small helpers it
 * uses; nothing happens on a page without a runtime that knows families, or that has it already.
 */
async function familyScript(id: string, path: string): Promise<string> {
  const out = await build({
    ...common,
    stdin: { contents: `import * as M from ${JSON.stringify(path)}; __OUT = M;`, resolveDir: ROOT, loader: 'ts' },
  });
  const body = out.outputFiles[0].text.trim();
  const q = JSON.stringify(id);
  return `(function(G){if(!G||!G.registerFamily||G.hasFamily(${q}))return;var __OUT;${body}G.registerFamily(${q},__OUT)})(window.Glyphos);`;
}

const common = {
  bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
} as const;

/** Splits the body of an object literal at its top-level commas. */
function topLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

const TABLE = /export const BASIC_PATTERNS: Record<string, BasicPattern> = \{([\s\S]*?)\n\};/;

/** id → the expression of each entry of the BASIC_PATTERNS table in patterns.ts. */
export function patternTable(src = readFileSync(PATTERNS, 'utf8')): Array<[string, string]> {
  const m = TABLE.exec(src);
  if (!m) throw new Error('runtime-plugin: no encuentro la tabla BASIC_PATTERNS en ' + PATTERNS);
  return topLevel(m[1]).map(s => {
    const i = s.indexOf(':');
    return i < 0 ? [s, s] : [s.slice(0, i).trim().replace(/^['"]|['"]$/g, ''), s.slice(i + 1).trim()];
  });
}

/** Names exported by basic/core.ts (the helpers a pattern script takes from the runtime). */
function coreNames(): string[] {
  return [...readFileSync(CORE, 'utf8').matchAll(/^export (?:const|function|let) (\w+)/gm)].map(m => m[1]);
}

/** Marks the module-level allocations and IIFEs of a pattern module pure, so esbuild can drop them with their patterns. */
const pureTables = (src: string) => src
  .replace(/\bnew (Float64Array|Float32Array|Int32Array|Uint32Array|Uint16Array|Uint8Array)\(/g, '/* @__PURE__ */ new $1(')
  .replace(/= \(\(\) => \{/g, '= /* @__PURE__ */ (() => {');

/**
 * One pattern as a script that registers itself in the runtime (see src/runtime/basic-patterns.ts):
 * patterns.ts with a table of only that pattern (esbuild drops the others, and the library modules'
 * exports it does not name) and core.ts replaced by the runtime's own helpers (__C), wrapped so it does
 * nothing on a page without the basic engine.
 */
async function patternScript(id: string, src: string, table: Array<[string, string]>, names: string[]): Promise<string> {
  const m = TABLE.exec(src)!;
  const expr = table.find(([k]) => k === id)![1];
  // the other patterns' tables and constants are marked pure, so esbuild drops them with their patterns
  const only = pureTables(src.slice(0, m.index) + `export const BASIC_PATTERNS: Record<string, BasicPattern> = { ${JSON.stringify(id)}: ${expr} };` + src.slice(m.index + m[0].length));
  const subset: EsbuildPlugin = {
    name: 'mt-pattern-subset',
    setup(b) {
      b.onLoad({ filter: /[\\/]engine[\\/]basic[\\/]patterns\.ts$/ }, () => ({ contents: only, loader: 'ts' }));
      b.onLoad({ filter: /[\\/]engine[\\/]basic[\\/](patterns-extra|patterns-next|particles|solid)\.ts$/ }, a => (LIBRARY.includes(a.path) ? { contents: pureTables(readFileSync(a.path, 'utf8')), loader: 'ts' } : undefined));
      b.onResolve({ filter: /^\.\/core$/ }, a => (PATTERN_MODULES.has(a.importer) ? { path: 'mt-core', namespace: 'mt' } : undefined));
      // a call marked pure per helper: esbuild drops the ones this pattern does not use
      b.onLoad({ filter: /^mt-core$/, namespace: 'mt' }, () => ({ contents: names.map(n => `export const ${n} = /* @__PURE__ */ __G(${JSON.stringify(n)});`).join('\n'), loader: 'js' }));
    },
  };
  const out = await build({
    ...common,
    stdin: { contents: `import { BASIC_PATTERNS, setPX } from ${JSON.stringify(PATTERNS)}; const p = BASIC_PATTERNS[${JSON.stringify(id)}]; __OUT = { f: p.f, prep: p.prep, px: setPX };`, resolveDir: ROOT, loader: 'ts' },
    plugins: [subset],
    pure: ['Math.cos', 'Math.sin', 'Math.sqrt', 'Math.fround'],
  });
  const body = out.outputFiles[0].text.trim();
  const q = JSON.stringify(id);
  return `(function(M){var B=M&&M.__basic;if(!B||B.has(${q}))return;var __G=function(n){return B.core[n]},__OUT;${body}B.add(${q},__OUT)})(window.Glyphos);`;
}

/** The two runtimes and the pattern scripts (also used by the unit tests). */
export async function buildRuntimes(): Promise<{ runtime: string; basic: string; patterns: Record<string, string>; families: Record<string, string> }> {
  const runtime = (await build({ ...common, entryPoints: [ENTRY] })).outputFiles[0].text;
  const shim: EsbuildPlugin = {
    name: 'mt-basic-registry',
    setup(b) {
      b.onResolve({ filter: /^\.\/patterns$/ }, a => (/[\\/]engine[\\/]basic[\\/]field\.ts$/.test(a.importer) ? { path: SHIM } : undefined));
    },
  };
  const basic = (await build({ ...common, entryPoints: [ENTRY_BASIC], plugins: [shim] })).outputFiles[0].text;
  const src = readFileSync(PATTERNS, 'utf8');
  const table = patternTable(src);
  const names = coreNames();
  const entries = await Promise.all(table.map(async ([id]) => [id, await patternScript(id, src, table, names)] as const));
  const patterns: Record<string, string> = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b, 'en')));
  const fam = await Promise.all(familyModules().map(async ([id, path]) => [id, await familyScript(id, path)] as const));
  const families: Record<string, string> = Object.fromEntries(fam.sort(([a], [b]) => a.localeCompare(b, 'en')));
  return { runtime, basic, patterns, families };
}

/** Shares unchanged string blocks between the two runtimes without evaluating generated code. */
export function runtimeDataModule(b: { runtime: string; basic: string; patterns: Record<string, string>; families?: Record<string, string> }): string {
  const base = b.basic;
  const index = new Map<string, number[]>();
  const anchor = 64;
  for (let i = 0; i + anchor <= base.length; i += 32) {
    const key = base.slice(i, i + anchor), positions = index.get(key) ?? [];
    if (positions.length < 8) positions.push(i);
    index.set(key, positions);
  }
  const pieces: string[] = [];
  let literal = '', p = 0;
  const flush = () => { if (literal) { pieces.push(JSON.stringify(literal)); literal = ''; } };
  while (p < b.runtime.length) {
    let at = 0, length = 0;
    for (const i of index.get(b.runtime.slice(p, p + anchor)) ?? []) {
      let n = anchor;
      while (i + n < base.length && p + n < b.runtime.length && base[i + n] === b.runtime[p + n]) n++;
      if (n > length) { at = i; length = n; }
    }
    if (length >= 128) { flush(); pieces.push(`basic.slice(${at},${at + length})`); p += length; }
    else literal += b.runtime[p++];
  }
  flush();
  return `export const basic=${JSON.stringify(base)};\nexport const runtime=[${pieces.join(',')}].join('');\nexport const patterns=${JSON.stringify(b.patterns)};\nexport const families=${JSON.stringify(b.families ?? {})};`;
}

export function runtimePlugin(): Plugin {
  const ids = { 'virtual:mt-runtime': '\0virtual:mt-runtime', 'virtual:mt-runtime-basic': '\0virtual:mt-runtime-basic', 'virtual:mt-runtime-data': '\0virtual:mt-runtime-data' } as Record<string, string>;
  let built: ReturnType<typeof buildRuntimes> | null = null;
  return {
    name: 'mt-runtime',
    resolveId(source) {
      return ids[source] ?? null;
    },
    async load(source) {
      if (!Object.values(ids).includes(source)) return null;
      if (source === ids['virtual:mt-runtime']) return `export { runtime as default } from 'virtual:mt-runtime-data';`;
      if (source === ids['virtual:mt-runtime-basic']) return `export { basic as runtime, patterns, families } from 'virtual:mt-runtime-data';`;
      built ??= buildRuntimes();
      const b = await built;
      for (const f of [ENTRY, ENTRY_BASIC, PATTERNS, ...LIBRARY, SHIM, FAMILY_LOADER, ...familyModules().map(([, p]) => p)]) this.addWatchFile(f);
      return runtimeDataModule(b);
    },
    // in `vite dev`, an edit to the engine rebuilds the strings on the next load
    watchChange() { built = null; },
  };
}
