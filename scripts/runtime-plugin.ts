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
const PATTERNS_EXTRA = resolve(ROOT, 'src/engine/basic/patterns-extra.ts');
const PATTERNS_NEXT = resolve(ROOT, 'src/engine/basic/patterns-next.ts');
const BASIC_PARTICLES = resolve(ROOT, 'src/engine/basic/particles.ts');
const CORE = resolve(ROOT, 'src/engine/basic/core.ts');
const SHIM = resolve(ROOT, 'src/runtime/basic-patterns.ts');

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
const EXTRA_TABLE = /export const EXTRA_BASIC: Record<string, BasicPattern> = \{([\s\S]*?)\n\};/;
const NEXT_TABLE = /export const NEXT_BASIC: Record<string, BasicPattern> = \{([\s\S]*?)\n\};/;

/** id → the expression of each entry of the BASIC_PATTERNS table in patterns.ts. */
export function patternTable(src = readFileSync(PATTERNS, 'utf8')): Array<[string, string]> {
  const m = TABLE.exec(src);
  if (!m) throw new Error('runtime-plugin: no encuentro la tabla BASIC_PATTERNS en ' + PATTERNS);
  return topLevel(m[1]).map(s => {
    const i = s.indexOf(':');
    return i < 0 ? [s, s] : [s.slice(0, i).trim().replace(/^['"]|['"]$/g, ''), s.slice(i + 1).trim()];
  });
}

function extraTable(src: string, re: RegExp): Array<[string, string]> {
  const m = re.exec(src);
  if (!m) throw new Error('runtime-plugin: no encuentro la tabla adicional');
  return topLevel(m[1]).map(s => {
    const i = s.indexOf(':');
    return i < 0 ? [s, s] : [s.slice(0, i).trim().replace(/^['"]|['"]$/g, ''), s.slice(i + 1).trim()];
  });
}

/** Names exported by basic/core.ts (the helpers a pattern script takes from the runtime). */
function coreNames(): string[] {
  return [...readFileSync(CORE, 'utf8').matchAll(/^export (?:const|function|let) (\w+)/gm)].map(m => m[1]);
}

/**
 * One pattern as a script that registers itself in the runtime (see src/runtime/basic-patterns.ts):
 * patterns.ts with a table of only that pattern (esbuild drops the others) and core.ts replaced by the
 * runtime's own helpers (__C), wrapped so it does nothing on a page without the basic engine.
 */
async function patternScript(id: string, src: string, table: Array<[string, string]>, names: string[], variant: 'base' | 'extra' | 'next' = 'base'): Promise<string> {
  const re = variant === 'extra' ? EXTRA_TABLE : variant === 'next' ? NEXT_TABLE : TABLE;
  const file = variant === 'extra' ? PATTERNS_EXTRA : variant === 'next' ? PATTERNS_NEXT : PATTERNS;
  const tableName = variant === 'extra' ? 'EXTRA_BASIC' : variant === 'next' ? 'NEXT_BASIC' : 'BASIC_PATTERNS';
  const pxName = variant === 'extra' ? 'setExtraPX' : variant === 'next' ? 'setNextPX' : 'setPX';
  const expr = table.find(([k]) => k === id)![1];
  // the other patterns' tables and constants are marked pure, so esbuild drops them with their patterns
  const original = variant !== 'base' ? src : src.replace("import { EXTRA_BASIC, setExtraPX } from './patterns-extra';", '')
    .replace("import { NEXT_BASIC, setNextPX } from './patterns-next';", '')
    .replace('setExtraPX(v);', '').replace('setNextPX(v);', '')
    .replace('Object.assign(BASIC_PATTERNS, EXTRA_BASIC);', '')
    .replace('Object.assign(BASIC_PATTERNS, NEXT_BASIC);', '');
  const found = re.exec(original)!;
  const only = (original.slice(0, found.index) + `export const ${tableName}: Record<string, BasicPattern> = { ${JSON.stringify(id)}: ${expr} };` + original.slice(found.index + found[0].length))
    .replace(/\bnew (Float64Array|Float32Array|Int32Array|Uint32Array|Uint16Array|Uint8Array)\(/g, '/* @__PURE__ */ new $1(')
    .replace(/= \(\(\) => \{/g, '= /* @__PURE__ */ (() => {');
  const subset: EsbuildPlugin = {
    name: 'mt-pattern-subset',
    setup(b) {
      b.onLoad({ filter: /[\\/]engine[\\/]basic[\\/]patterns(?:-extra|-next)?\.ts$/ }, a => (a.path === file ? { contents: only, loader: 'ts' } : undefined));
      b.onResolve({ filter: /^\.\/core$/ }, a => (a.importer === file ? { path: 'mt-core', namespace: 'mt' } : undefined));
      // a call marked pure per helper: esbuild drops the ones this pattern does not use
      b.onLoad({ filter: /^mt-core$/, namespace: 'mt' }, () => ({ contents: names.map(n => `export const ${n} = /* @__PURE__ */ __G(${JSON.stringify(n)});`).join('\n'), loader: 'js' }));
    },
  };
  const out = await build({
    ...common,
    stdin: { contents: `import { ${tableName}, ${pxName} } from ${JSON.stringify(file)}; const p = ${tableName}[${JSON.stringify(id)}]; __OUT = { f: p.f, prep: p.prep, px: ${pxName} };`, resolveDir: ROOT, loader: 'ts' },
    plugins: [subset],
    pure: ['Math.cos', 'Math.sin', 'Math.sqrt', 'Math.fround'],
  });
  const body = out.outputFiles[0].text.trim();
  const q = JSON.stringify(id);
  return `(function(M){var B=M&&M.__basic;if(!B||B.has(${q}))return;var __G=function(n){return B.core[n]},__OUT;${body}B.add(${q},__OUT)})(window.Glyphos);`;
}

/** The two runtimes and the pattern scripts (also used by the unit tests). */
export async function buildRuntimes(): Promise<{ runtime: string; basic: string; patterns: Record<string, string> }> {
  const runtime = (await build({ ...common, entryPoints: [ENTRY] })).outputFiles[0].text;
  const shim: EsbuildPlugin = {
    name: 'mt-basic-registry',
    setup(b) {
      b.onResolve({ filter: /^\.\/patterns$/ }, a => (/[\\/]engine[\\/]basic[\\/]field\.ts$/.test(a.importer) ? { path: SHIM } : undefined));
    },
  };
  const basic = (await build({ ...common, entryPoints: [ENTRY_BASIC], plugins: [shim] })).outputFiles[0].text;
  const src = readFileSync(PATTERNS, 'utf8'), srcExtra = readFileSync(PATTERNS_EXTRA, 'utf8'), srcNext = readFileSync(PATTERNS_NEXT, 'utf8');
  const table = patternTable(src), tableExtra = extraTable(srcExtra, EXTRA_TABLE), tableNext = extraTable(srcNext, NEXT_TABLE);
  const names = coreNames();
  const patterns: Record<string, string> = {};
  await Promise.all(table.map(async ([id]) => { patterns[id] = await patternScript(id, src, table, names); }));
  await Promise.all(tableExtra.map(async ([id]) => { patterns[id] = await patternScript(id, srcExtra, tableExtra, names, 'extra'); }));
  await Promise.all(tableNext.map(async ([id]) => { patterns[id] = await patternScript(id, srcNext, tableNext, names, 'next'); }));
  return { runtime, basic, patterns };
}

export function runtimePlugin(): Plugin {
  const ids = { 'virtual:mt-runtime': '\0virtual:mt-runtime', 'virtual:mt-runtime-basic': '\0virtual:mt-runtime-basic' } as Record<string, string>;
  let built: ReturnType<typeof buildRuntimes> | null = null;
  return {
    name: 'mt-runtime',
    resolveId(source) {
      return ids[source] ?? null;
    },
    async load(source) {
      if (source !== ids['virtual:mt-runtime'] && source !== ids['virtual:mt-runtime-basic']) return null;
      built ??= buildRuntimes();
      const b = await built;
      for (const f of [ENTRY, ENTRY_BASIC, PATTERNS, PATTERNS_EXTRA, PATTERNS_NEXT, BASIC_PARTICLES, SHIM]) this.addWatchFile(f);
      return source === ids['virtual:mt-runtime']
        ? `export default ${JSON.stringify(b.runtime)};`
        : `export const runtime = ${JSON.stringify(b.basic)};\nexport const patterns = ${JSON.stringify(b.patterns)};`;
    },
    // in `vite dev`, an edit to the engine rebuilds the strings on the next load
    watchChange() { built = null; },
  };
}
