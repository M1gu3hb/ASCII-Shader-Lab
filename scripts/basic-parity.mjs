#!/usr/bin/env node
/**
 * Parity check: renders every pattern (and every studio preset) with the WebGL 2 engine and the
 * Canvas 2D basic engine at the same fixed size and time, and compares their GridSnapshots.
 *   node scripts/basic-parity.mjs [--json out.json] [--quick]
 * Starts a Vite dev server (dev/basic.html) on PARITY_PORT (default 4174) and drives it with Playwright
 * (Chromium with SwiftShader WebGL, like the e2e suite). Prints markdown tables:
 *   r      Pearson correlation of per-cell luminance (GridSnapshot.lum)
 *   Δlum   mean absolute difference of luminance (0..255)
 *   glifos share of cells with the same character; visibles: same, among cells where either shows ink
 *   Δrgb   mean absolute difference of cell colours; Δpx: of canvas pixels (0..255)
 * Exit code 1 when a pattern correlates below 0.8 at both sample times, a preset below 0.8, or any
 * comparison differs by more than 8 (of 255) per pixel on average: that is a rendering bug, not rounding.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { realpathSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const quick = args.includes('--quick');
const port = Number(process.env.PARITY_PORT ?? 4174);
const TIMES = [3.3, 17.9];

// node_modules may be a symlink (separate working copies): allow serving fonts from its real location
const allow = [process.cwd(), realpathSync('node_modules')];
const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', fs: { allow } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/dev/basic.html?parity`);
  await page.waitForFunction(() => !!window.__basic, null, { timeout: 60_000 });
  const info = await page.evaluate(() => ({ patterns: window.__basic.patterns, presets: window.__basic.presets, probe: window.__basic.probe }));
  console.log(`probe: ${JSON.stringify(info.probe)}\n`);

  // WebGL probe, createRenderer fallbacks and the live loop, checked in this browser
  const checks = await Promise.race([
    page.evaluate(() => window.__basic.diagnostics()),
    new Promise((_, reject) => setTimeout(() => reject(new Error('diagnostics: timed out after 3 min')), 180_000)),
  ]);
  console.log('## Diagnóstico y respaldo\n');
  for (const c of checks) console.log(`- ${c.ok ? 'ok' : 'FALLA'} · ${c.name} — ${c.info}`);
  console.log('');
  if (checks.some(c => !c.ok)) failed = true;

  const f2 = v => v.toFixed(3);
  const pct = v => (v * 100).toFixed(1) + '%';
  const rows = [];
  for (const id of info.patterns) {
    const res = [];
    for (const t of TIMES) res.push(await page.evaluate(([id, t]) => window.__basic.comparePattern(id, t), [id, t]));
    const worst = res.reduce((a, b) => (b.r < a.r ? b : a));
    rows.push({ id, res, worst });
    if (res.every(c => c.r < 0.8) || res.some(c => c.pixelMad > 8)) failed = true;
  }
  console.log(`## Patrones (480×270, celda 6, t = ${TIMES.join(' y ')})\n`);
  console.log('| patrón | r (t1 / t2) | Δlum | glifos | visibles | Δrgb | Δpx |');
  console.log('|---|---|---|---|---|---|---|');
  for (const { id, res } of rows) {
    const avg = k => res.reduce((s, c) => s + c[k], 0) / res.length;
    console.log(`| ${id} | ${res.map(c => f2(c.r)).join(' / ')} | ${avg('lumMad').toFixed(2)} | ${pct(avg('glyphs'))} | ${pct(avg('visibleGlyphs'))} | ${avg('rgbMad').toFixed(2)} | ${avg('pixelMad').toFixed(2)} |`);
  }
  const all = rows.flatMap(r => r.res);
  const mean = k => all.reduce((s, c) => s + c[k], 0) / all.length;
  console.log(`\nMedia: r ${f2(mean('r'))} · Δlum ${mean('lumMad').toFixed(2)} · glifos ${pct(mean('glyphs'))} · visibles ${pct(mean('visibleGlyphs'))}`);
  console.log(`Mínimo r: ${rows.map(r => [r.id, Math.min(...r.res.map(c => c.r))]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([id, r]) => `${id} ${f2(r)}`).join(', ')}\n`);

  // pointer effects: same pointer state injected into both engines, a few frames rendered
  const pointer = [];
  const modes = await page.evaluate(() => window.__basic.interactModes);
  for (const [mode, id] of [...modes.map(m => [m, 'plasma']), ['erase', 'media/revelado']]) {
    pointer.push({ ...(await page.evaluate(([m, id]) => window.__basic.comparePointer(m, 6, id), [mode, id])), mode, id });
  }
  console.log('## Interacción (puntero pulsado y en movimiento, 6 cuadros)\n');
  console.log('| modo | sobre | r | Δlum | glifos | Δpx | celdas que cambia el puntero |');
  console.log('|---|---|---|---|---|---|---|');
  for (const c of pointer) console.log(`| ${c.mode} | ${c.id} | ${f2(c.r)} | ${c.lumMad.toFixed(2)} | ${pct(c.glyphs)} | ${c.pixelMad.toFixed(2)} | ${pct(c.touched)} |`);
  console.log('');
  if (pointer.some(c => c.r < 0.9 || c.touched < 0.01)) failed = true;

  const presets = [];
  if (!quick) {
    for (const key of info.presets) presets.push(await page.evaluate(k => window.__basic.comparePreset(k), key));
    if (presets.some(c => c.r < 0.8 || c.pixelMad > 8)) failed = true;
    console.log('## Presets del estudio (640×360, t = 3.3)\n');
    console.log('| preset | r | Δlum | glifos | visibles | Δrgb | Δpx | sin soporte |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const c of presets) {
      console.log(`| ${c.id} | ${f2(c.r)} | ${c.lumMad.toFixed(2)} | ${pct(c.glyphs)} | ${pct(c.visibleGlyphs)} | ${c.rgbMad.toFixed(2)} | ${c.pixelMad.toFixed(2)} | ${c.gaps.join(', ') || '—'} |`);
    }
    // transparent background (image and video exports): plate, cell fills, scanlines, vignette, CRT
    const transparent = [];
    for (const key of ['fondos/bruma', 'tipo/maquina', 'terminal/consola', 'arte/dona', 'media/bloques']) {
      transparent.push(await page.evaluate(k => window.__basic.comparePreset(k, 3.3, true), key));
    }
    console.log('\n## Fondo transparente (exportaciones)\n');
    console.log('| preset | r | glifos | Δpx (RGBA) |');
    console.log('|---|---|---|---|');
    for (const c of transparent) console.log(`| ${c.id} | ${f2(c.r)} | ${pct(c.glyphs)} | ${c.pixelMad.toFixed(2)} |`);
    if (transparent.some(c => c.pixelMad > 8)) failed = true;
  }

  // cost per frame, in this browser (SwiftShader: the canvas is GPU-accelerated in software, slow for
  // full-canvas overlays) and in one without GPU (CPU canvas, like a browser with acceleration off)
  const cases = [['pattern', 'nube'], ['pattern', 'plasma'], ['pattern', 'marmol'], ['pattern', 'dona'], ['preset', 'fondos/bruma'], ['preset', 'tipo/maquina'], ['preset', 'arte/bermellon'], ['preset', 'terminal/consola'], ['preset', 'media/retrato']];
  const runBenches = async pg => {
    const out = [];
    for (const [kind, id] of quick ? cases.slice(0, 2) : cases) {
      const b = await pg.evaluate(([kind, id]) => kind === 'pattern' ? window.__basic.benchPattern(id, { frames: 40 }) : window.__basic.benchPreset(id, { frames: 40 }), [kind, id]);
      out.push({ kind, id, ...b });
    }
    return out;
  };
  const benches = { swiftshader: await runBenches(page), cpu: [] };
  const cpuBrowser = await chromium.launch({ args: ['--disable-gpu', '--disable-software-rasterizer'] });
  try {
    const cpuPage = await cpuBrowser.newPage({ viewport: { width: 1400, height: 900 } });
    await cpuPage.goto(`http://127.0.0.1:${port}/dev/basic.html?parity`);
    await cpuPage.waitForFunction(() => !!window.__basic, null, { timeout: 60_000 });
    benches.cpu = await runBenches(cpuPage);
  } finally { await cpuBrowser.close(); }
  for (const [label, list] of [['navegador sin GPU (canvas por CPU)', benches.cpu], ['SwiftShader (canvas por GPU emulada)', benches.swiftshader]]) {
    console.log(`\n## Coste por cuadro del motor básico: ${label} (1280×720 CSS, pixelRatio 1, 40 cuadros)\n`);
    console.log('| caso | rejilla | total (media / mediana / p90) | campo | selección | composición y dibujo |');
    console.log('|---|---|---|---|---|---|');
    for (const b of list) {
      console.log(`| ${b.kind} ${b.id} | ${b.cols}×${b.rows} | ${b.total.toFixed(1)} / ${b.median.toFixed(1)} / ${b.p90.toFixed(1)} ms | ${b.field.toFixed(1)} | ${b.select.toFixed(1)} | ${b.compose.toFixed(1)} |`);
    }
  }
  if (errors.length) { console.log('\nErrores de la página:\n' + errors.join('\n')); failed = true; }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ probe: info.probe, checks, patterns: rows, pointer, presets, benches, errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
