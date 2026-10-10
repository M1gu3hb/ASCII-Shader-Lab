/**
 * Development aid: runs the visual families' models in Node, without a browser, and writes their rasters
 * as PNG files (grey levels: what the engines turn into characters), with the cost per step.
 *
 *   npx esbuild scripts/families-viz.ts --bundle --platform=node --format=esm --outfile=.cache/families-viz.mjs
 *   node .cache/families-viz.mjs [out-dir] [ids,comma,separated] [--steps=N]
 *
 * Each preset of each raster family is run from its seed: warm-up plus N steps (default: 6 s of its rate).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { FAMILIES } from '../src/families/registry.ts';
import { loadFamilyNow } from '../src/families/load.ts';
import { analyticOf, modelOf } from '../src/families/models.ts';
import { defaultParams, packParams } from '../src/families/params.ts';

function crc32(buf: Uint8Array) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function png(w: number, h: number, grey: Uint8Array): Buffer {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; raw.set(grey.subarray(y * w, (y + 1) * w), y * (w + 1) + 1); }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const out = args[0] ?? '.cache/families-viz';
const only = args[1] ? new Set(args[1].split(',')) : null;
const stepsArg = process.argv.find(a => a.startsWith('--steps='));
mkdirSync(out, { recursive: true });

for (const meta of FAMILIES) {
  if (only && !only.has(meta.id)) continue;
  await loadFamilyNow(meta.id);
  if (meta.kind === 'analytic') {
    // the CPU twin over the 2:1 domain at time 6 s (what the basic engine evaluates per cell)
    const impl = analyticOf(meta.id);
    if (!impl) { console.log(meta.id, 'sin gemelo de CPU'); continue; }
    for (const pr of meta.presets) {
      const k = packParams(meta, { ...defaultParams(meta), ...pr.params });
      const w = 384, h = 192, ras = new Uint8Array(w * h), t = Number(process.env.T ?? 6);
      const t0 = performance.now();
      impl.prep?.(t, k);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = impl.cpu(((x + 0.5) / w - 0.5) * 2, 0.5 - (y + 0.5) / h, t, k);
        ras[y * w + x] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
      writeFileSync(`${out}/${meta.id}-${pr.id}.png`, png(w, h, ras));
      console.log(`${meta.id}/${pr.id}: ${w}×${h} en CPU, ${(performance.now() - t0).toFixed(0)} ms`);
    }
    continue;
  }
  const factory = modelOf(meta.id);
  if (!factory) { console.log(meta.id, 'sin modelo'); continue; }
  for (const pr of meta.presets) {
    const params = { ...defaultParams(meta), ...pr.params };
    const res = pr.res ?? meta.budget.res?.[2] ?? 128;
    const m = factory({ seed: 'muestra', params, res });
    const warm = meta.budget.warmup ?? 0, rate = meta.budget.rate ?? 30;
    const n = stepsArg ? Number(stepsArg.slice(8)) : Math.round(6 * rate);
    const t0 = performance.now();
    m.step(warm + n);
    const ms = (performance.now() - t0) / Math.max(1, warm + n);
    const ras = new Uint8Array(m.w * m.h);
    const t = n / rate;
    m.render(ras, t);
    let sum = 0;
    for (const v of ras) sum += v;
    writeFileSync(`${out}/${meta.id}-${pr.id}.png`, png(m.w, m.h, ras));
    console.log(`${meta.id}/${pr.id}: ${m.w}×${m.h}, ${warm + n} pasos, ${ms.toFixed(3)} ms/paso, media ${(sum / ras.length).toFixed(1)}`);
  }
}
