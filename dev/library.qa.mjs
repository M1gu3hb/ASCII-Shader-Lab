#!/usr/bin/env node
/**
 * Drives dev/library.html (the library ported from the Codex branch) in Chromium with SwiftShader:
 *   node dev/library.qa.mjs --out DIR [--page] [--snaps] [--parity] [--bench] [--solo patrones,escenas] [--ids a,b]
 *   --page    screenshots of the QA page, one per section (DIR/library-<section>.png)
 *   --snaps   every pattern, particle motion, recipe and scene by both engines at 1440×900 and 390×844
 *             (DIR/full/<section>/<id>.<engine>.<w>x<h>.jpg)
 *   --parity  both engines compared per item (r of cell luminance, same glyphs, pixel difference) → DIR/parity.json
 *   --quick   with --snaps: only WebGL at 1440×900 (while iterating)
 *   --bench   basic engine, each pattern alone at 1920×1080, cell 12 (lab numbers) → DIR/bench.json;
 *             --bench-ids nube,dona measures those patterns instead (to compare)
 * Starts a Vite dev server on QA_PORT (default 4312). Not part of the build or the test suites.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = k => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const has = k => args.includes(k);
const out = opt('--out') ?? 'library-qa';
const port = Number(process.env.QA_PORT ?? 4312);
const solo = opt('--solo');
const ids = opt('--ids');
mkdirSync(out, { recursive: true });

const allow = [process.cwd(), realpathSync('node_modules')];
const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1', fs: { allow } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const log = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => log.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text()); });
  const q = new URLSearchParams();
  if (solo) q.set('solo', solo);
  if (ids) q.set('ids', ids);
  await page.goto(`http://127.0.0.1:${port}/dev/library.html?${q}`);
  await page.waitForFunction(() => window.__lib?.done, null, { timeout: 900_000, polling: 1000 });
  const info = await page.evaluate(() => ({ items: window.__lib.items, errors: window.__lib.errors }));
  console.log(`${info.items.length} piezas; errores del motor: ${info.errors.length}`);
  for (const e of info.errors) console.log('  ' + e);

  if (has('--page')) {
    for (const s of ['patrones', 'particulas', 'recetas', 'escenas', 'paletas', 'alfabetos', 'letras']) {
      const el = await page.$(`#${s} + .note + .grid`);
      if (!el) continue;
      await el.screenshot({ path: join(out, `library-${s}.png`) });
    }
  }
  const wanted = info.items.filter(i => ['patrones', 'particulas', 'recetas', 'escenas'].includes(i.section)
    && (!solo || solo.split(',').includes(i.section)) && (!ids || ids.split(',').includes(i.id)));
  if (has('--snaps')) {
    for (const it of wanted) {
      const dir = join(out, 'full', it.section);
      mkdirSync(dir, { recursive: true });
      for (const [w, h] of has('--quick') ? [[1440, 900]] : [[1440, 900], [390, 844]]) for (const engine of has('--quick') ? ['gl'] : ['gl', 'basic']) {
        const url = await page.evaluate(async ([s, id, w, h, engine]) => {
          const png = await window.__lib.snap(s, id, { w, h, engine });
          // JPEG keeps the folder small; the glyphs stay readable at 92
          const img = new Image(); img.src = png; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          return c.toDataURL('image/jpeg', 0.92);
        }, [it.section, it.id, w, h, engine]);
        writeFileSync(join(dir, `${it.id.replace('/', '__')}.${engine}.${w}x${h}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      }
    }
    console.log(`capturas: ${wanted.length * 4}`);
  }
  if (has('--parity')) {
    const rows = [];
    for (const it of wanted) {
      const res = [];
      for (const t of [3.3, 17.9]) res.push(await page.evaluate(([s, id, t]) => window.__lib.compare(s, id, { t }), [it.section, it.id, t]));
      rows.push({ ...it, res });
      const worst = res.reduce((a, b) => (b.r < a.r ? b : a));
      console.log(`${it.section}/${it.id}: r ${res.map(c => c.r.toFixed(3)).join(' / ')} · glifos ${(worst.glyphs * 100).toFixed(0)}% · Δpx ${worst.pixelMad.toFixed(2)} · tinta ${worst.ink.toFixed(0)}`);
    }
    writeFileSync(join(out, 'parity.json'), JSON.stringify(rows, null, 1));
  }
  if (has('--bench')) {
    const rows = [];
    // --bench-ids nube,dona: other patterns of the catalog, to compare with (same size and cell)
    const pats = opt('--bench-ids') ? opt('--bench-ids').split(',').map(id => ({ id })) : info.items.filter(i => i.section === 'patrones' || i.section === 'particulas');
    for (const it of pats) {
      const b = await page.evaluate(id => window.__lib.benchPattern(id, { w: 1920, h: 1080, cell: 12, frames: 10 }), it.id);
      rows.push({ id: it.id, ...b });
      console.log(`${it.id}: ${b.cols}×${b.rows} · total ${b.total.toFixed(1)} ms · campo ${b.field.toFixed(1)} ms`);
    }
    writeFileSync(join(out, 'bench.json'), JSON.stringify(rows, null, 1));
  }
} finally {
  if (log.length) console.log('\nconsola:\n' + log.join('\n'));
  await browser.close();
  await server.close();
}
