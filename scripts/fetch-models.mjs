#!/usr/bin/env node
/**
 * OPTIONAL: a same-origin mirror of the cutout models (not run by the normal build).
 *
 * Downloads every file of the registry (src/cutout/models.ts) from its pinned Hugging Face commit, checks size and
 * sha256, and writes it with a manifest the app reads first (/models/manifest.json → files by hash). Without a
 * mirror the app downloads from Hugging Face directly, after the person agrees.
 *
 *   node scripts/fetch-models.mjs                       # after `npm run build`: dist/models/ + manifest.json
 *   node scripts/fetch-models.mjs --out .cache/modelos  # a local copy for tests/e2e/cutout.spec.ts
 *   node scripts/fetch-models.mjs --from <dir>          # take files from a local folder when their hash matches
 *   node scripts/fetch-models.mjs --only portrait,select --backend wasm
 *
 * Models are large (≈500 MB for everything). Hosting them yourself means serving that traffic: check your plan.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = resolve(root, opt('--out') ?? 'dist/models');
const from = opt('--from') ? resolve(opt('--from')) : null;
const only = opt('--only')?.split(',');
const backend = opt('--backend'); // 'webgpu' | 'wasm' | undefined (both)

const { MODELS, fileUrl, variantFiles } = await import(join(root, 'src/cutout/models.ts'));

const sha256File = path => new Promise((res, rej) => {
  const h = createHash('sha256');
  createReadStream(path).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

/** Local candidates by size (hashing only files of the right size). */
const localBySize = new Map();
if (from) {
  const walk = dir => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else { const l = localBySize.get(st.size) ?? []; l.push(p); localBySize.set(st.size, l); }
    }
  };
  walk(from);
}

async function fetchTo(url, dest, expected) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const h = createHash('sha256');
  const chunks = [];
  let n = 0;
  for await (const c of res.body) { h.update(c); chunks.push(c); n += c.length; if (n > expected) throw new Error(`${url}: más grande de lo publicado`); }
  const buf = Buffer.concat(chunks);
  writeFileSync(dest, buf);
  return h.digest('hex');
}

mkdirSync(out, { recursive: true });
const manifest = { glyphos: 'models', version: 1, files: [] };
const seen = new Set();
for (const spec of MODELS) {
  if (only && !only.includes(spec.id)) continue;
  for (const [kind, v] of [['webgpu', spec.webgpu], ['wasm', spec.wasm]]) {
    if (!v || (backend && backend !== kind)) continue;
    for (const f of variantFiles(v)) {
      if (seen.has(f.sha256)) continue;
      seen.add(f.sha256);
      const name = `${f.sha256.slice(0, 12)}-${basename(f.path)}`;
      const dest = join(out, name);
      const url = fileUrl(spec, f);
      let ok = existsSync(dest) && statSync(dest).size === f.bytes && (await sha256File(dest)) === f.sha256;
      if (!ok && from) {
        for (const cand of localBySize.get(f.bytes) ?? []) {
          if ((await sha256File(cand)) === f.sha256) { copyFileSync(cand, dest); ok = true; console.log(`copiado  ${name} ← ${relative(root, cand)}`); break; }
        }
      }
      if (!ok) {
        console.log(`descargando ${name} (${Math.round(f.bytes / 1e6)} MB) de ${url}`);
        const got = await fetchTo(url, dest, f.bytes);
        if (got !== f.sha256) throw new Error(`${name}: sha256 distinto (${got}); no se usa.`);
        ok = true;
      }
      manifest.files.push({ sha256: f.sha256, bytes: f.bytes, url: name, source: url, model: spec.id, backend: kind });
    }
  }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.files.length} archivos verificados en ${relative(root, out) || out}`);
