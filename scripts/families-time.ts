/**
 * Development aid: how each family preset behaves in time, in Node, without a browser. For every preset (several
 * seeds and resolutions), the model runs from its seed at its fixed rate and, at each sampled moment T, measures:
 *  - model: how much the raster changes over the next half second with the camera held at T (the state itself);
 *  - visible: how much it changes between T and T + 0.5 s as the layer shows it (state and camera);
 *  - lit: the share of the domain with ink (0 = empty, 1 = full), the cost of the half second's steps (ms) and of
 *    one render of the raster (msRender: drawing can cost more than stepping).
 * Analytic families are sampled through their CPU twin on a 96 × 48 grid, through the preset's layer scale and
 * with its cell size, as the engines sample them (visible only: they have no state).
 *
 *   npx esbuild scripts/families-time.ts --bundle --platform=node --format=esm --outfile=.cache/families-time.mjs
 *   node .cache/families-time.mjs --out=<file.json> [--ids=a,b] [--seeds=3] [--res=def|min,def,max]
 *        [--times=0,30,60,120] [--long=600] [--presets=id,id]
 *
 * This measures change and occupancy of the field the engines turn into characters: not beauty and not frame
 * rate on a real device. A window of little change can be a deliberate pause; read it with the preset's contract.
 */
import { writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/all.ts';
import { loadFamilyNow } from '../src/families/load.ts';
import { analyticOf, modelOf } from '../src/families/models.ts';
import { famFor, packParams } from '../src/families/params.ts';
import type { FamilyMeta, FamilyPreset } from '../src/families/types.ts';

const arg = (k: string, d?: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const out = arg('out', '.cache/families-time.json')!;
const only = arg('ids') ? new Set(arg('ids')!.split(',')) : null;
const onlyPresets = arg('presets') ? new Set(arg('presets')!.split(',')) : null;
const nSeeds = Number(arg('seeds', '2'));
const resModes = arg('res', 'def')!.split(',') as Array<'min' | 'def' | 'max'>;
const times = arg('times', '0,30,60,120')!.split(',').map(Number);
// the extremes of the resolution range run shorter windows (the maximum can be slow): enough to see a regime
const timesAt = { min: (arg('times-min') ?? '0,15,30,60').split(',').map(Number), max: (arg('times-max') ?? '0,15,30').split(',').map(Number), def: times };
const long = Number(arg('long', '0'));

interface Sample { t: number; model: number; visible: number; changed: number; lit: number; ms: number; msRender?: number }
interface Row { family: string; kind: string; preset: string; name: string; seed: string; res: number | null; rate: number; samples: Sample[]; error?: string }

const lit = (r: Uint8Array) => { let n = 0; for (let i = 0; i < r.length; i++) if (r[i] > 24) n++; return n / r.length; };
const diff = (a: Uint8Array, b: Uint8Array) => {
  let s = 0, c = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); s += d; if (d > 8) c++; }
  return { mean: s / a.length / 255, changed: c / a.length };
};

function runModel(meta: FamilyMeta, pr: FamilyPreset, seed: string, res: number, times: number[]): Row {
  const f = famFor(meta, seed, pr.id);
  const rate = meta.budget.rate ?? 30, warm = meta.budget.warmup ?? 0, speed = Math.abs(pr.layer?.speed ?? 1);
  const row: Row = { family: meta.id, kind: meta.kind, preset: pr.id, name: pr.name, seed, res, rate, samples: [] };
  try {
    const model = modelOf(meta.id)!({ seed: f.seed, params: f.p, res });
    const A = new Uint8Array(model.w * model.h), B = new Uint8Array(A.length), C = new Uint8Array(A.length);
    const ts = [...times, ...(long && times === timesAt.def ? [long] : [])].sort((a, b) => a - b);
    for (const t of ts) {
      const target = warm + Math.floor(t * speed * rate);
      model.step(Math.max(0, target - model.steps));
      model.render(A, t);
      const t0 = performance.now();
      model.step(Math.max(1, Math.floor(0.5 * speed * rate)));
      const ms = performance.now() - t0;
      model.render(B, t);
      const r0 = performance.now();
      model.render(C, t + 0.5);
      const msRender = performance.now() - r0;
      const m = diff(A, B), v = diff(A, C);
      row.samples.push({ t, model: m.mean, visible: v.mean, changed: v.changed, lit: lit(C), ms, msRender });
    }
  } catch (e) { row.error = String(e); }
  return row;
}

function runAnalytic(meta: FamilyMeta, pr: FamilyPreset): Row {
  const impl = analyticOf(meta.id)!;
  const f = famFor(meta, 'glyphos', pr.id);
  const k = packParams(meta, f.p);
  const speed = Math.abs(pr.layer?.speed ?? 1), scale = pr.layer?.scale ?? 1;
  const w = 96, h = 48;
  const at = (t: number) => {
    const r = new Uint8Array(w * h);
    impl.prep?.(t * speed, k, undefined, scale / h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) r[y * w + x] = Math.max(0, Math.min(255, Math.round(255 * impl.cpu(((x + 0.5) / w - 0.5) * 2 * scale, (0.5 - (y + 0.5) / h) * scale, t * speed, k))));
    return r;
  };
  const row: Row = { family: meta.id, kind: meta.kind, preset: pr.id, name: pr.name, seed: '-', res: null, rate: 0, samples: [] };
  for (const t of [...times, ...(long ? [long] : [])]) {
    const t0 = performance.now();
    const a = at(t), c = at(t + 0.5);
    const v = diff(a, c);
    row.samples.push({ t, model: v.mean, visible: v.mean, changed: v.changed, lit: lit(c), ms: performance.now() - t0 });
  }
  return row;
}

const rows: Row[] = [];
for (const meta of FAMILIES) {
  if (only && !only.has(meta.id)) continue;
  await loadFamilyNow(meta.id);
  for (const pr of meta.presets) {
    if (onlyPresets && !onlyPresets.has(pr.id)) continue;
    if (meta.kind === 'analytic') rows.push(runAnalytic(meta, pr));
    else {
    const b = meta.budget.res ?? [64, 128, 96];
    const def = pr.res ?? b[2];
    for (const mode of resModes) {
      const res = mode === 'min' ? b[0] : mode === 'max' ? b[1] : def;
      const seeds = mode === 'def' ? nSeeds : 1;
      for (let s = 0; s < seeds; s++) {
        const seed = s === 0 ? `${meta.id}-${pr.id}` : `${meta.id}-${pr.id}-${s}`;
        rows.push(runModel(meta, pr, seed, res, timesAt[mode]));
        writeFileSync(out, JSON.stringify(rows));
      }
    }
    }
    const last = rows[rows.length - 1];
    console.log(`${meta.id}/${pr.id}`, last.samples.map(x => `${x.t}s m${(x.model * 100).toFixed(2)} l${(x.lit * 100).toFixed(0)}`).join(' | '));
  }
}
writeFileSync(out, JSON.stringify(rows, null, 1));
