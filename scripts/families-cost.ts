/**
 * Cost of the families' CPU work, measured apart (closing of PR #10, §12): per preset and resolution of the raster
 * families, after a warm-up, a series of windows of half a simulated second:
 *  - step: the model's steps of the window, as ms per simulated second;
 *  - render: one drawing of the raster (luminance), and of its colour when the family has one (ms);
 *  - control: a control changed, i.e. a new run from its seed to its first raster (construction, warm-up steps and
 *    the first drawing, ms): what a person waits for after moving a slider of a simulation;
 *  - four layers: four runs stepped and drawn one after another in the same window (the engines run them on one
 *    thread), as ms per simulated second plus drawing.
 * Medians and 95th percentiles over the windows. Node, one thread, no GPU and no browser: the field pass, the
 * conversion to glyphs and the presentation are measured apart, in the browser (tests/e2e/coste-cuadro.spec.ts).
 * Run with the machine otherwise idle (no builds, probes or browsers running).
 *
 *   npx esbuild scripts/families-cost.ts --bundle --platform=node --format=esm --outfile=.cache/families-cost.mjs
 *   node .cache/families-cost.mjs --out=<file.json> [--ids=a,b] [--res=min,def,max] [--windows=16] [--four=a:p,b:p,c:p,d:p]
 */
import { writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/all.ts';
import { loadFamilyNow } from '../src/families/load.ts';
import { modelOf } from '../src/families/models.ts';
import { famFor } from '../src/families/params.ts';
import type { FamilyMeta, FamilyPreset, FieldModel } from '../src/families/types.ts';

const arg = (k: string, d?: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const out = arg('out', '.cache/families-cost.json')!;
const only = arg('ids') ? new Set(arg('ids')!.split(',')) : null;
const resModes = arg('res', 'min,def,max')!.split(',') as Array<'min' | 'def' | 'max'>;
const windows = Number(arg('windows', '16'));
const fourSpec = arg('four', 'reaccion_difusion:coral,fluido:lazos,ecos:tunel_arcoiris,humo:aurora')!.split(',').map(s => s.split(':') as [string, string]);

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const stat = (xs: number[]) => ({ med: r2(q(xs, 0.5)), p95: r2(q(xs, 0.95)), max: r2(Math.max(0, ...xs)) });

function resOf(meta: FamilyMeta, mode: 'min' | 'def' | 'max', pr: FamilyPreset): number {
  const [lo, hi, def] = meta.budget.res ?? [64, 192, 128];
  return mode === 'min' ? lo : mode === 'max' ? hi : pr.res ?? def;
}

interface Run { model: FieldModel; perWindow: number; rgb: Uint8Array | null; lum: Uint8Array }
function start(meta: FamilyMeta, pr: FamilyPreset, res: number, seed: string): { run: Run; ms: number } {
  const f = famFor(meta, seed, pr.id);
  const rate = meta.budget.rate ?? 30, warm = meta.budget.warmup ?? 0, speed = Math.abs(pr.layer?.speed ?? 1) || 1;
  const t0 = performance.now();
  const model = modelOf(meta.id)!({ seed: f.seed, params: f.p, res, v: f.v });
  model.step(warm);
  const lum = new Uint8Array(model.w * model.h);
  model.render(lum, 0);
  const rgb = model.renderColor ? new Uint8Array(model.w * model.h * 3) : null;
  if (rgb) model.renderColor!(rgb, 0);
  return { run: { model, perWindow: Math.max(1, Math.round(0.5 * speed * rate)), rgb, lum }, ms: performance.now() - t0 };
}

function measure(meta: FamilyMeta, pr: FamilyPreset, res: number) {
  const control: number[] = [];
  for (let i = 0; i < 3; i++) control.push(start(meta, pr, res, `coste-${i}`).ms);
  const { run } = start(meta, pr, res, 'coste');
  // warm-up: a few simulated seconds, so the JIT and the run's own regime are settled
  for (let i = 0; i < 6; i++) { run.model.step(run.perWindow); run.model.render(run.lum, i * 0.5); }
  const step: number[] = [], render: number[] = [], colour: number[] = [];
  for (let w = 0; w < windows; w++) {
    let t0 = performance.now();
    run.model.step(run.perWindow);
    step.push((performance.now() - t0) * 2);
    t0 = performance.now();
    run.model.render(run.lum, 3 + w * 0.5);
    render.push(performance.now() - t0);
    if (run.rgb) { t0 = performance.now(); run.model.renderColor!(run.rgb, 3 + w * 0.5); colour.push(performance.now() - t0); }
  }
  return { w: run.model.w, h: run.model.h, stepsPerSimSecond: run.perWindow * 2, msPerSimSecond: stat(step), msRender: stat(render), ...(colour.length ? { msRenderColour: stat(colour) } : {}), msControl: stat(control) };
}

const rows: unknown[] = [];
for (const meta of FAMILIES) {
  if (meta.kind === 'analytic' || (only && !only.has(meta.id))) continue;
  await loadFamilyNow(meta.id);
  if (!modelOf(meta.id)) continue;
  for (const pr of meta.presets) for (const mode of resModes) {
    const res = resOf(meta, mode, pr);
    try {
      const m = measure(meta, pr, res);
      rows.push({ family: meta.id, preset: pr.id, mode, res, ...m });
      console.log(`${meta.id}:${pr.id} ${mode} ${res} filas (${m.w}×${m.h}) · modelo ${m.msPerSimSecond.med} ms/s sim (p95 ${m.msPerSimSecond.p95}) · dibujo ${m.msRender.med} ms (p95 ${m.msRender.p95})${'msRenderColour' in m ? ` + color ${(m as { msRenderColour: { med: number } }).msRenderColour.med} ms` : ''} · control ${m.msControl.med} ms`);
    } catch (e) {
      rows.push({ family: meta.id, preset: pr.id, mode, res, error: String(e) });
      console.log(`${meta.id}:${pr.id} ${mode} ERROR ${e}`);
    }
  }
}

// four layers in the same window, at their default rows
const four: Array<{ id: string; preset: string; run: Run }> = [];
for (const [id, preset] of fourSpec) {
  const meta = FAMILIES.find(f => f.id === id), pr = meta?.presets.find(p => p.id === preset);
  if (!meta || !pr) { console.log(`cuatro capas: falta ${id}:${preset}`); continue; }
  await loadFamilyNow(id);
  four.push({ id, preset, run: start(meta, pr, resOf(meta, 'def', pr), 'coste-4').run });
}
const fourStep: number[] = [], fourDraw: number[] = [];
for (let i = 0; i < 6; i++) for (const l of four) { l.run.model.step(l.run.perWindow); l.run.model.render(l.run.lum, i * 0.5); }
for (let w = 0; w < windows; w++) {
  let t0 = performance.now();
  for (const l of four) l.run.model.step(l.run.perWindow);
  fourStep.push((performance.now() - t0) * 2);
  t0 = performance.now();
  for (const l of four) { l.run.model.render(l.run.lum, 3 + w * 0.5); if (l.run.rgb) l.run.model.renderColor!(l.run.rgb, 3 + w * 0.5); }
  fourDraw.push(performance.now() - t0);
}
const fourRow = { layers: four.map(l => `${l.id}:${l.preset}`), msPerSimSecond: stat(fourStep), msDrawAll: stat(fourDraw) };
console.log(`cuatro capas (${fourRow.layers.join(' + ')}): modelos ${fourRow.msPerSimSecond.med} ms/s sim (p95 ${fourRow.msPerSimSecond.p95}) · dibujo de las cuatro ${fourRow.msDrawAll.med} ms (p95 ${fourRow.msDrawAll.p95})`);

writeFileSync(out, JSON.stringify({ node: process.version, cpus: (await import('node:os')).cpus().map(c => c.model)[0], windows, rows, four: fourRow }, null, 1));
console.log(`${rows.length} filas → ${out}`);
