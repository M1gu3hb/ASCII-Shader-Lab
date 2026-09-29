import { realpathSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as httpServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type CDPSession, type Page, type Request } from '@playwright/test';
import type { ViteDevServer } from 'vite';
import { fileUrl, MODELS, variantFiles } from '../../src/cutout/models';

/**
 * The photo studio's tools (src/foto/tools) and the «Recorte» panel (src/foto/cutout), driven through their QA
 * page (dev/foto-tools.html, window.qa): each tool makes the part it should and the pixels change inside and
 * not outside (or the other way round), keyboard drawing, touch (one finger draws, two fingers move the view and
 * draw nothing), one undo step per gesture, stroke flattening, the object tool and the cutout panel with their
 * models routed to a local copy (skipped with a message when it is absent).
 *
 * dev/ pages are not part of the production build, so this spec starts its own Vite dev server (PW_DEV_PORT,
 * default PW_PORT + 1000). Skipped against a deployed site (BASE_URL).
 *
 * Model files: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm --only select,portrait
 * (GLYPHOS_MODELS_DIR overrides the folder). Hugging Face is never contacted: its pinned URLs are routed to a
 * local file server, as in tests/e2e/cutout.spec.ts.
 */
const remote = !!process.env.BASE_URL;
const port = Number(process.env.PW_DEV_PORT ?? Number(process.env.PW_PORT ?? 4173) + 1000);
const base = `http://127.0.0.1:${port}/dev/foto-tools.html`;

const MODELS_DIR = resolve(process.env.GLYPHOS_MODELS_DIR ?? '.cache/modelos');
const manifest: { files: Array<{ url: string; source: string }> } | null = existsSync(join(MODELS_DIR, 'manifest.json'))
  ? JSON.parse(readFileSync(join(MODELS_DIR, 'manifest.json'), 'utf8'))
  : null;
const localBySource = new Map((manifest?.files ?? []).map(f => [f.source, f.url]));
const hasModel = (id: string) => {
  const spec = MODELS.find(m => m.id === id)!;
  return !!spec.wasm && variantFiles(spec.wasm).every(f => { const l = localBySource.get(fileUrl(spec, f)); return !!l && existsSync(join(MODELS_DIR, l)); });
};
const NEED = (id: string) => `Faltan los archivos locales de «${id}» en ${MODELS_DIR}: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm --only select,portrait`;

test.describe.configure({ mode: 'serial' });
test.skip(remote, 'dev pages only exist in the dev server');

let server: ViteDevServer | null = null;
let files: Server | null = null;
let filesOrigin = '';
let context: BrowserContext;
let page: Page;
const requests: Request[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const { createServer } = await import('vite');
  server = await createServer({
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
    logLevel: 'error',
  });
  await server.listen();
  files = httpServer((req, res) => {
    const file = join(MODELS_DIR, decodeURIComponent((req.url ?? '/').split('?')[0].slice(1)));
    if (!file.startsWith(MODELS_DIR) || !existsSync(file)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size, 'access-control-allow-origin': '*' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>(r => files!.listen(0, '127.0.0.1', () => r()));
  const addr = files.address();
  filesOrigin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  context.on('request', r => requests.push(r));
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => route.abort('blockedbyclient'));
  await context.route('https://huggingface.co/**', route => {
    const local = localBySource.get(route.request().url());
    if (!local) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 302, headers: { location: `${filesOrigin}/${local}`, 'access-control-allow-origin': '*' } });
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await new Promise(r => (files ? files.close(r) : r(null)));
  await server?.close();
});

/* ------------------------------------------------------------------ helpers */

type Part = { kind: string; op: string; [k: string]: unknown };
type RGBA = number[];

async function open(p: Page, query = '') {
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  let stale = false;
  p.on('response', r => { if (r.status() === 504) stale = true; });
  await p.goto(base + query);
  const deadline = Date.now() + 150_000;
  let reloaded = false;
  for (;;) {
    const ok = await p.evaluate(() => !!(window as unknown as { qa?: { ready: boolean; error: string } }).qa?.ready || !!(window as unknown as { qa?: { error: string } }).qa?.error).catch(() => false);
    if (ok) break;
    if (stale && !reloaded) { reloaded = true; stale = false; await p.reload(); continue; }
    if (Date.now() > deadline) throw new Error('la página de QA no terminó de cargar');
    await p.waitForTimeout(400);
  }
  expect(await p.evaluate(() => (window as unknown as { qa: { error: string } }).qa.error)).toBe('');
  return errors;
}

const qa = <T = unknown>(fn: string, ...args: unknown[]) => qaOn<T>(page, fn, ...args);
const qaOn = <T = unknown>(p: Page, fn: string, ...args: unknown[]) =>
  p.evaluate(([f, a]) => {
    const q = (window as unknown as { qa: Record<string, unknown> }).qa;
    const v = q[f as string];
    return typeof v === 'function' ? (v as (...x: unknown[]) => unknown)(...(a as unknown[])) : v;
  }, [fn, args] as const) as Promise<T>;
const parts = (p: Page = page, layer?: string) => qaOn<Part[]>(p, 'parts', ...(layer ? [layer] : []));
const depth = () => qa<{ past: number; future: number }>('undoDepth');
const sample = (pts: Array<[number, number]>, p: Page = page) => qaOn<RGBA[]>(p, 'sample', pts);
const differ = (a: RGBA, b: RGBA) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

async function at(p: Page, x: number, y: number) { return qaOn<{ x: number; y: number }>(p, 'client', { x, y }); }
async function drag(pts: Array<[number, number]>, o: { mods?: string[]; steps?: number } = {}) {
  const cs = await page.evaluate(list => list.map(([x, y]) => (window as unknown as { qa: { client(p: { x: number; y: number }): { x: number; y: number } } }).qa.client({ x, y })), pts);
  const a = cs[0];
  await page.mouse.move(a.x, a.y);
  for (const m of o.mods ?? []) await page.keyboard.down(m);
  await page.mouse.down();
  for (let i = 1; i < cs.length; i++) await page.mouse.move(cs[i].x, cs[i].y, { steps: o.steps ?? 5 });
  await page.mouse.up();
  for (const m of o.mods ?? []) await page.keyboard.up(m);
}
async function click(x: number, y: number, mods: string[] = []) {
  const a = await at(page, x, y);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.click(a.x, a.y);
  for (const m of mods) await page.keyboard.up(m);
}
async function tool(id: string, p: Page = page) { await qaOn(p, 'selectTool', id); await p.locator('#stage').focus(); }
async function reset(p: Page = page) {
  const ready = await p.evaluate(() => !!(window as unknown as { qa?: { ready: boolean } }).qa?.ready).catch(() => false);
  if (!ready || !p.url().endsWith('/dev/foto-tools.html')) await open(p);
  await qaOn(p, 'reset');
}

/* ------------------------------------------------------------------ tests */

test('the palette: every tool with its Spanish name, touch hint, shortcut and icon', async () => {
  test.setTimeout(200_000);
  const errors = await open(page);
  const tools = await qa<Array<{ id: string; name: string; shortcut: string; hint: string; group: string }>>('tools');
  expect(tools.map(t => `${t.shortcut} ${t.name}`)).toEqual([
    'V Editar partes', 'M Rectángulo', 'O Elipse', 'P Polígono', 'L Lazo', 'K Contorno preciso', 'W Color', 'J Objeto', 'G Degradado',
    'B Pasar a ASCII', 'E Borrar efecto', 'R Restaurar original',
  ]);
  for (const t of tools) expect(t.hint).toMatch(/teléfono/);
  const buttons = page.locator('#palette button');
  await expect(buttons).toHaveCount(12);
  for (let i = 0; i < 12; i++) {
    await expect(buttons.nth(i)).toHaveAttribute('aria-label', new RegExp(tools[i].name));
    expect(await buttons.nth(i).locator('svg[viewBox="0 0 24 24"]').count()).toBe(1);
  }
  // shortcuts switch tools; the options bar follows
  await page.locator('#stage').focus();
  await page.keyboard.press('p');
  expect(await qa('tool')).toBe('poligono');
  await expect(page.locator('#opts [data-tool="poligono"]')).toBeVisible();
  await page.keyboard.press('b');
  expect(await qa('tool')).toBe('pasar-a-ascii');
  expect(errors).toEqual([]);
});

test('rectangle: a drag makes one rect part (one undo step); the layer now shows inside and not outside', async () => {
  await reset();
  await tool('rectangulo');
  const probe: Array<[number, number]> = [[0.45, 0.4], [0.9, 0.9]];
  const before = await sample(probe);
  const d0 = await depth();
  await drag([[0.2, 0.2], [0.7, 0.6]]);
  const ps = await parts();
  expect(ps).toHaveLength(1);
  expect(ps[0]).toMatchObject({ kind: 'rect', op: 'add', rot: 0 });
  expect(ps[0].x as number).toBeCloseTo(0.2, 2);
  expect(ps[0].w as number).toBeCloseTo(0.5, 2);
  expect((await depth()).past).toBe(d0.past + 1);
  const after = await sample(probe);
  expect(differ(before[0], after[0])).toBeLessThanOrEqual(2); // inside: still the ASCII layer
  expect(differ(before[1], after[1])).toBeGreaterThan(20); // outside: now the photo
  // its handles resize it (one more step), undo walks back one gesture at a time
  const se = await at(page, 0.7, 0.6);
  await page.mouse.move(se.x, se.y);
  await page.mouse.down();
  await page.mouse.move(se.x + 40, se.y + 30, { steps: 5 });
  await page.mouse.up();
  const resized = (await parts())[0];
  expect(resized.w as number).toBeGreaterThan(0.52);
  expect(resized.x as number).toBeCloseTo(0.2, 2); // the opposite corner stayed
  expect((await depth()).past).toBe(d0.past + 2);
  await qa('undo');
  expect(((await parts())[0].w as number)).toBeCloseTo(0.5, 2);
  await qa('undo');
  expect(await parts()).toHaveLength(0);
  await qa('redo');
  expect(await parts()).toHaveLength(1);
});

test('modifiers: ⇧ when starting adds, ⌥ subtracts, ⇧⌥ intersects; ⇧ during the drag makes a circle', async () => {
  await reset();
  await tool('elipse');
  await drag([[0.1, 0.1], [0.5, 0.5]]);
  await drag([[0.3, 0.3], [0.45, 0.45]], { mods: ['Alt'] });
  await drag([[0.6, 0.6], [0.8, 0.8]], { mods: ['Shift'] });
  await drag([[0.2, 0.2], [0.9, 0.9]], { mods: ['Shift', 'Alt'] });
  expect((await parts()).map(p => p.op)).toEqual(['add', 'subtract', 'add', 'intersect']);
  // circle: shift pressed after the drag started
  await reset();
  await tool('elipse');
  const a = await at(page, 0.3, 0.3), b = await at(page, 0.6, 0.45);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 5, { steps: 2 });
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const p = (await parts())[0];
  const cv = (await qa<{ canvas: { w: number; h: number } }>('project')).canvas;
  expect((p.w as number) * cv.w).toBeCloseTo((p.h as number) * cv.h, 0); // a circle in pixels
  expect(p.op).toBe('add');
});

test('keyboard: a centred shape placed, moved, resized, rotated and applied; the edit tool walks and deletes parts', async () => {
  await reset();
  await tool('rectangulo');
  await page.keyboard.press('Enter');
  expect(await parts()).toHaveLength(0); // not in the mask until applied
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  const ps = await parts();
  expect(ps).toHaveLength(1);
  const cv = (await qa<{ canvas: { w: number; h: number } }>('project')).canvas;
  const side = Math.min(cv.w, cv.h) * 0.3;
  expect(((ps[0].x as number) + (ps[0].w as number) / 2) * cv.w).toBeCloseTo(cv.w / 2 + 30 + 0.5, 0);
  expect((ps[0].w as number) * cv.w).toBeCloseTo(side + 1, 0);
  expect(ps[0].rot).toBe(1);
  // Esc on a new keyboard shape discards it
  await page.keyboard.press('Enter'); // done with the selected one
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  expect(await parts()).toHaveLength(1);
  // polygon from the keyboard: arrows move a crosshair, Space places, Enter closes
  await tool('poligono');
  await page.keyboard.press('Space');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Space');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  expect((await parts()).map(p => p.kind)).toEqual(['rect', 'polygon']);
  expect(((await parts())[1].pts as number[]).length).toBe(6);
  // gradient from the keyboard
  await tool('degradado');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Enter');
  expect((await parts()).map(p => p.kind)).toEqual(['rect', 'polygon', 'gradient']);
  // the part editor: Tab selects, arrows nudge (one step for the burst), Delete removes
  await tool('editar-partes');
  await page.keyboard.press('Tab');
  const d0 = await depth();
  const x0 = (await parts())[0].x as number;
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(((await parts())[0].x as number)).toBeCloseTo(x0 - 2 / cv.w, 6);
  expect((await depth()).past).toBe(d0.past + 1);
  await page.keyboard.press('Delete');
  expect((await parts()).map(p => p.kind)).toEqual(['polygon', 'gradient']);
});

test('polygon (clicks, Backspace, close on the first vertex) and lasso (simplified, zoom-aware)', async () => {
  await reset();
  await tool('poligono');
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.75, 0.7], [0.5, 0.9]] as Array<[number, number]>) await click(x, y);
  await page.keyboard.press('Backspace');
  await click(0.3, 0.7);
  await click(0.3, 0.3); // the first vertex closes it
  const poly = (await parts())[0];
  expect(poly.kind).toBe('polygon');
  expect((poly.pts as number[]).length).toBe(8);
  // Escape cancels one being drawn
  await click(0.1, 0.1); await click(0.2, 0.1);
  await page.keyboard.press('Escape');
  expect(await parts()).toHaveLength(1);
  // lasso: a noisy circle becomes a polygon with far fewer points than the pointer gave
  await reset();
  await tool('lazo');
  const probe: Array<[number, number]> = [[0.5, 0.5], [0.08, 0.08]];
  const before = await sample(probe);
  const loop: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i++) { const a = (i / 60) * Math.PI * 2; loop.push([0.5 + 0.25 * Math.cos(a), 0.5 + 0.2 * Math.sin(a)]); }
  await drag(loop, { steps: 3 });
  const lasso = (await parts())[0];
  expect(lasso.kind).toBe('polygon');
  const simplified = await qa<{ lasso: { before: number; after: number } }>('timings');
  expect(simplified.lasso.after).toBeLessThan(simplified.lasso.before / 2);
  const after = await sample(probe);
  expect(differ(before[0], after[0])).toBeLessThanOrEqual(2);
  expect(differ(before[1], after[1])).toBeGreaterThan(20);
  // zoomed in, the same gesture keeps more detail (the tolerance is in screen pixels)
  await qa('undo');
  await qa('setZoom', 2.5);
  const small: Array<[number, number]> = loop.map(([x, y]) => [0.5 + (x - 0.5) * 0.3, 0.5 + (y - 0.5) * 0.3]);
  await drag(small, { steps: 3 });
  const zoomedPts = ((await parts())[0].pts as number[]).length / 2;
  await qa('setZoom', 1);
  await qa('undo');
  await drag(small, { steps: 3 });
  const fitPts = ((await parts())[0].pts as number[]).length / 2;
  expect(zoomedPts).toBeGreaterThan(fitPts);
});

test('precise contour: follows an edge, fixes points, closes into a dense polygon; each move stays under a frame', async () => {
  test.setTimeout(120_000);
  await open(page, '?foto=sintetica');
  await tool('contorno');
  await page.waitForFunction(() => (window as unknown as { qa: { timings(): { contour: { mapMs: number } } } }).qa.timings().contour.mapMs > 0, null, { timeout: 30_000 });
  // the synthetic landscape: the lake's straight shore at y = 390 / 600 (dark ridge above, lake below)
  const y = 390 / 600;
  await click(0.1, y + 0.012);
  for (const x of [0.2, 0.3, 0.4]) { const c = await at(page, x, y - 0.02); await page.mouse.move(c.x, c.y, { steps: 8 }); }
  await click(0.4, y - 0.02);
  const c2 = await at(page, 0.4, y + 0.25);
  await page.mouse.move(c2.x, c2.y, { steps: 8 });
  await click(0.4, y + 0.25);
  await click(0.1, y + 0.25);
  await page.keyboard.press('Enter');
  const p = (await parts())[0];
  expect(p.kind).toBe('polygon');
  const pts = p.pts as number[];
  expect(pts.length / 2).toBeGreaterThan(6);
  // the top side follows the shore: points between x 0.15 and 0.35 sit within 1.5 % of its line
  const top = [];
  for (let i = 0; i < pts.length; i += 2) if (pts[i] > 0.15 && pts[i] < 0.35 && pts[i + 1] < y + 0.08) top.push(pts[i + 1]);
  expect(top.length).toBeGreaterThan(0);
  for (const v of top) expect(Math.abs(v - y)).toBeLessThan(0.015);
  const t = await qa<{ contour: { mapMs: number; meanMoveMs: number; maxMoveMs: number; moves: number } }>('timings');
  console.log(`contour: map ${t.contour.mapMs} ms · ${t.contour.moves} moves · mean ${t.contour.meanMoveMs.toFixed(1)} ms · max ${t.contour.maxMoveMs.toFixed(1)} ms`);
  expect(t.contour.meanMoveMs).toBeLessThan(16);
  await open(page);
});

test('brushes: «Pasar a ASCII» adds, «Borrar efecto» subtracts, [ ] change the size; «Restaurar original» paints every effect layer in one step', async () => {
  await reset();
  await tool('borrar-efecto');
  const probe: Array<[number, number]> = [[0.5, 0.5], [0.1, 0.9]];
  const before = await sample(probe);
  await page.keyboard.press(']');
  await drag([[0.3, 0.5], [0.5, 0.5], [0.7, 0.5]]);
  const s = (await parts())[0];
  expect(s).toMatchObject({ kind: 'stroke', op: 'subtract' });
  expect(s.size as number).toBeCloseTo(0.075, 3); // 0.06 × 1.25
  const after = await sample(probe);
  expect(differ(before[0], after[0])).toBeGreaterThan(20); // painted out: the photo shows
  expect(differ(before[1], after[1])).toBeLessThanOrEqual(2);
  await tool('pasar-a-ascii');
  await drag([[0.45, 0.45], [0.55, 0.55]]);
  expect((await parts()).map(p => p.op)).toEqual(['subtract', 'add']);
  // restore: one stroke on both effect layers, one undo step
  const glyphs = await qa<string>('addGlyphs');
  await tool('restaurar-original');
  const d0 = await depth();
  await drag([[0.2, 0.2], [0.4, 0.3]]);
  expect((await depth()).past).toBe(d0.past + 1);
  const layers = await qa<Array<{ id: string; kind: string; parts: number }>>('layers');
  const ascii = layers.find(l => l.kind === 'ascii')!;
  expect((await parts(page, ascii.id)).slice(-1)[0]).toMatchObject({ kind: 'stroke', op: 'subtract' });
  expect((await parts(page, glyphs)).map(p => `${p.kind}:${p.op}`)).toEqual(['stroke:subtract']);
  await qa('undo');
  expect(await parts(page, glyphs)).toHaveLength(0);
  const t = await qa<{ brushCommitMs: Record<string, number> }>('timings');
  console.log(`brush commit: ${JSON.stringify(t.brushCommitMs)} ms`);
});

test('many strokes flatten into pictures with the same pixels (automatically, within the next stroke\'s undo step)', async () => {
  test.setTimeout(180_000);
  await reset();
  await tool('pasar-a-ascii');
  for (let i = 0; i < 12; i++) await drag([[0.1 + i * 0.06, 0.2], [0.15 + i * 0.06, 0.8]], { steps: 3 });
  expect((await parts()).filter(p => p.kind === 'stroke')).toHaveLength(12);
  const grid: Array<[number, number]> = [];
  for (let y = 0.05; y < 1; y += 0.1) for (let x = 0.03; x < 1; x += 0.07) grid.push([x, y]);
  const before = await sample(grid);
  // the flattening runs in the background; the next stroke swaps it in
  await page.waitForFunction(() => (window as unknown as { qa: { timings(): { flatten: { lastMs: number } } } }).qa.timings().flatten.lastMs > 0, null, { timeout: 60_000 });
  const d0 = await depth();
  await drag([[0.95, 0.95], [0.96, 0.96]], { steps: 2 });
  expect((await depth()).past).toBe(d0.past + 1);
  const ps = await parts();
  expect(ps.map(p => p.kind)).toEqual(['raster', 'stroke']);
  expect(ps[0]).toMatchObject({ op: 'add', origin: 'paint' });
  await qa('undo');
  const afterUndo = await parts();
  expect(afterUndo.filter(p => p.kind === 'stroke')).toHaveLength(12); // one undo: back to the 12 strokes
  await qa('redo');
  const after = await sample(grid);
  // the same pixels, but for the 8-bit storage of the mask and its smoothing at this render scale (edges)
  const diffs = grid.map((g, i) => (g[0] < 0.9 || g[1] < 0.9 ? differ(before[i], after[i]) : 0));
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`flatten pixels: mean ${mean.toFixed(2)} · max ${Math.max(...diffs)} over ${diffs.length} points`);
  expect(mean).toBeLessThanOrEqual(1.5);
  expect(diffs.filter(d => d > 16).length).toBeLessThanOrEqual(2);
  const t = await qa<{ flatten: { lastMs: number; lastW: number; lastH: number } }>('timings');
  console.log(`flatten: ${t.flatten.lastMs} ms at ${t.flatten.lastW}×${t.flatten.lastH}`);
  // «Aplanar trazos» by hand
  await reset();
  await tool('borrar-efecto');
  for (let i = 0; i < 3; i++) await drag([[0.2, 0.2 + i * 0.1], [0.8, 0.2 + i * 0.1]], { steps: 3 });
  await page.getByRole('button', { name: /Aplanar trazos \(3\)/ }).click();
  await expect.poll(async () => (await parts()).map(p => p.kind).join(',')).toBe('raster');
});

test('colour: a click selects everything close to it; ⇧ adds another; the tolerance edits it live', async () => {
  await reset();
  await tool('color');
  await page.waitForTimeout(300);
  await click(0.52, 0.78); // the pale pickguard
  const c = (await parts())[0];
  expect(c).toMatchObject({ kind: 'color', op: 'add' });
  await click(0.5, 0.75); // a plain click replaces
  expect(await parts()).toHaveLength(1);
  await click(0.45, 0.62, ['Shift']);
  expect(await parts()).toHaveLength(2);
  const d0 = await depth();
  const slider = page.getByRole('slider', { name: /Tolerancia/ });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  // previewed while it moves; the part is replaced once, a moment after the last key: one undo step
  expect(await qa('hasPreview')).toBe(true);
  await expect.poll(async () => (await parts())[1].tol as number, { timeout: 5000 }).toBeGreaterThan(c.tol as number);
  expect((await depth()).past).toBe(d0.past + 1);
  // preview while pressing
  await page.locator('#stage').focus();
  const a = await at(page, 0.3, 0.3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await expect.poll(() => qa('hasPreview')).toBe(true);
  await qa('idle');
  console.log(`colour preview render: ${await qa('lastRender')} ms`);
  await page.mouse.up();
});

test('gradient: a drag makes a graded zone (strength changes along it)', async () => {
  await reset();
  await tool('degradado');
  const pts: Array<[number, number]> = [[0.5, 0.1], [0.5, 0.5], [0.5, 0.9]];
  const before = await sample(pts);
  await drag([[0.5, 0.2], [0.5, 0.8]]);
  const g = (await parts())[0];
  expect(g).toMatchObject({ kind: 'gradient', shape: 'linear', alpha0: 1, alpha1: 0 });
  const after = await sample(pts);
  expect(differ(before[0], after[0])).toBeLessThanOrEqual(2); // full strength: as before
  expect(differ(before[2], after[2])).toBeGreaterThan(20); // faded out: the photo
  // the end handle moves (one step)
  const d0 = await depth();
  const e = await at(page, 0.5, 0.8);
  await page.mouse.move(e.x, e.y);
  await page.mouse.down();
  await page.mouse.move(e.x + 60, e.y, { steps: 4 });
  await page.mouse.up();
  expect((await parts())[0].x1 as number).toBeGreaterThan(0.55);
  expect((await depth()).past).toBe(d0.past + 1);
});

test('the part editor: click selects the topmost part, a vertex drags, a double-click inserts one, Delete removes', async () => {
  await reset();
  await tool('poligono');
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]] as Array<[number, number]>) await click(x, y);
  await page.keyboard.press('Enter');
  await tool('elipse');
  await drag([[0.45, 0.45], [0.55, 0.55]], { mods: ['Alt'] });
  await tool('editar-partes');
  await click(0.5, 0.5);
  await expect(page.locator('#opts [data-tool="editar-partes"] .tool-title')).toContainText('Elipse');
  await page.keyboard.press('Escape');
  await click(0.35, 0.35);
  await expect(page.locator('#opts [data-tool="editar-partes"] .tool-title')).toContainText('Polígono');
  // drag the (0.7, 0.3) vertex
  const v = await at(page, 0.7, 0.3);
  await page.mouse.move(v.x, v.y);
  await page.mouse.down();
  await page.mouse.move(v.x + 30, v.y - 20, { steps: 4 });
  await page.mouse.up();
  const moved = (await parts())[0].pts as number[];
  expect(moved[2]).toBeGreaterThan(0.72);
  // double-click the left edge: a fifth vertex
  const e = await at(page, 0.3, 0.5);
  await page.mouse.dblclick(e.x, e.y);
  expect(((await parts())[0].pts as number[]).length).toBe(10);
  // the operation from the options bar
  await page.getByRole('radio', { name: 'Restar' }).click();
  expect((await parts())[0].op).toBe('subtract');
  await page.locator('#stage').focus();
  await page.keyboard.press('Escape');
  await click(0.35, 0.35);
  await page.keyboard.press('Delete');
  expect((await parts()).map(p => p.kind)).toEqual(['ellipse']);
});

test('touch: one finger draws, two fingers move the view and draw nothing; brushes too', async ({ browser }) => {
  test.setTimeout(200_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await open(p);
  const cdp: CDPSession = await ctx.newCDPSession(p);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<[number, number]>) => {
    const tp = [];
    for (const [i, q] of pts.entries()) { const c = await at(p, q[0], q[1]); tp.push({ x: c.x, y: c.y, id: i, radiusX: 4, radiusY: 4, force: 1 }); }
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: tp });
  };
  await qaOn(p, 'selectTool', 'rectangulo');
  await touch('touchStart', [[0.2, 0.2]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[0.2 + i * 0.08, 0.2 + i * 0.06]]);
  await touch('touchEnd', []);
  expect((await parts(p)).map(x => x.kind)).toEqual(['rect']);
  // two fingers: pinch-zoom and pan; the first finger's drawing is cancelled
  const z0 = (await qaOn<{ zoom: number }>(p, 'view')).zoom;
  await touch('touchStart', [[0.3, 0.6]]);
  await touch('touchMove', [[0.32, 0.62]]);
  await touch('touchStart', [[0.3, 0.6], [0.6, 0.8]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[0.3 - i * 0.02, 0.6 - i * 0.02], [0.6 + i * 0.02, 0.8 + i * 0.02]]);
  await touch('touchEnd', []);
  expect((await parts(p)).map(x => x.kind)).toEqual(['rect']);
  expect((await qaOn<{ zoom: number }>(p, 'view')).zoom).toBeGreaterThan(z0 * 1.1);
  await qaOn(p, 'setZoom', 1);
  // a brush stroke with one finger; two fingers cancel a stroke
  await qaOn(p, 'selectTool', 'pasar-a-ascii');
  await touch('touchStart', [[0.3, 0.5]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[0.3 + i * 0.05, 0.5]]);
  await touch('touchEnd', []);
  expect((await parts(p)).map(x => x.kind)).toEqual(['rect', 'stroke']);
  await touch('touchStart', [[0.3, 0.7]]);
  await touch('touchMove', [[0.35, 0.7]]);
  await touch('touchStart', [[0.35, 0.7], [0.6, 0.75]]);
  await touch('touchMove', [[0.36, 0.71], [0.62, 0.77]]);
  await touch('touchEnd', []);
  expect((await parts(p)).map(x => x.kind)).toEqual(['rect', 'stroke']);
  // polygon by taps; a two-finger gesture places no vertex
  await qaOn(p, 'selectTool', 'poligono');
  for (const q of [[0.2, 0.3], [0.7, 0.3], [0.6, 0.6]] as Array<[number, number]>) { await touch('touchStart', [q]); await touch('touchEnd', []); }
  await touch('touchStart', [[0.5, 0.8]]);
  await touch('touchStart', [[0.5, 0.8], [0.7, 0.9]]);
  await touch('touchMove', [[0.48, 0.78], [0.72, 0.92]]);
  await touch('touchEnd', []);
  await p.getByRole('button', { name: /Cerrar/ }).click();
  const poly = (await parts(p)).slice(-1)[0];
  expect(poly.kind).toBe('polygon');
  expect((poly.pts as number[]).length).toBe(6);
  // the options bar's controls are at least 44 px tall
  for (const b of await p.locator('#opts button, #opts input[type=range]').all()) {
    const box = await b.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
  await ctx.close();
});

test('object tool: nothing downloads before consent; points select the guitar; «Aceptar» stores an object part', async () => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(420_000);
  await reset();
  const modelRequests = () => requests.filter(r => r.url().startsWith('https://huggingface.co/') || r.url().startsWith(filesOrigin));
  const n0 = modelRequests().length;
  await tool('objeto');
  await expect(page.getByRole('button', { name: /Descargar \d+ MB/ })).toBeVisible();
  await expect(page.locator('#opts [data-tool="objeto"]')).toContainText('no se suben');
  expect(modelRequests().length).toBe(n0);
  await page.getByRole('button', { name: /Descargar \d+ MB/ }).click();
  await page.waitForFunction(() => (window as unknown as { qa: { objectState(): { phase: string } } }).qa.objectState().phase === 'ready', null, { timeout: 360_000 });
  const probe: Array<[number, number]> = [[0.43, 0.41], [0.08, 0.08]];
  const before = await sample(probe);
  for (const [x, y] of [[0.43, 0.41], [0.16, 0.68], [0.55, 0.74]] as Array<[number, number]>) await click(x, y);
  await page.waitForFunction(() => { const s = (window as unknown as { qa: { objectState(): { phase: string; matte: boolean } } }).qa.objectState(); return s.matte && s.phase === 'ready'; }, null, { timeout: 120_000 });
  await expect(page.locator('.tool-points li')).toHaveCount(3);
  // a point can be removed (the mask updates), then added back as a negative one with ⌥
  await page.getByRole('button', { name: 'Quitar el punto 3' }).click();
  await expect(page.locator('.tool-points li')).toHaveCount(2);
  await click(0.55, 0.74);
  await click(0.08, 0.08, ['Alt']);
  await expect(page.locator('.tool-points .neg')).toHaveCount(1);
  await page.waitForFunction(() => { const s = (window as unknown as { qa: { objectState(): { phase: string; matte: boolean } } }).qa.objectState(); return s.matte && s.phase === 'ready'; }, null, { timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Aceptar/ }).click();
  await expect.poll(async () => (await parts()).length, { timeout: 30_000 }).toBe(1);
  const part = (await parts())[0];
  expect(part).toMatchObject({ kind: 'raster', op: 'add', origin: 'object' });
  expect((part.points as Array<{ positive: boolean }>).map(p => p.positive)).toEqual([true, true, true, false]);
  const after = await sample(probe);
  expect(differ(before[0], after[0])).toBeLessThanOrEqual(3); // on the guitar: still ASCII
  expect(differ(before[1], after[1])).toBeGreaterThan(20); // the blanket corner: the photo
  const t = await qa<{ object: { encodeMs: number; decodeMs: number[] } }>('timings');
  console.log(`object: encode ${t.object.encodeMs} ms · decodes ${JSON.stringify(t.object.decodeMs)} ms`);
  // re-editing reopens its points
  await tool('editar-partes');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Editar puntos' }).click();
  expect(await qa('tool')).toBe('objeto');
  await expect(page.locator('.tool-points li')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /^Actualizar/ })).toBeVisible();
  // only model files were fetched from outside our origin, and nothing was uploaded
  for (const r of requests) {
    const u = r.url();
    if (u.startsWith(`http://127.0.0.1:${port}`) || u.startsWith('data:') || u.startsWith('blob:')) continue;
    expect(u.startsWith('https://huggingface.co/') || u.startsWith(filesOrigin)).toBe(true);
    expect(r.method()).toBe('GET');
  }
});

test('the «Recorte» panel: models with reasons, consent, cut-out, refinement, a cut-out layer and a background mask in one step, PNG export', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(420_000);
  await open(page, '?foto=retrato');
  await qa('openCutout');
  const panel = page.locator('#cutout');
  await expect(panel.locator('[data-model="subject-hq"]')).toContainText(/WebGPU/);
  await panel.locator('[data-model="portrait"] input').check();
  await panel.getByRole('button', { name: 'Recortar' }).click();
  await expect(panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ })).toBeVisible();
  await expect(panel).toContainText('Tus fotos no se suben');
  await panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ }).click();
  await page.waitForFunction(() => (window as unknown as { qa: { panel(): { state: string } } }).qa.panel().state === 'refine', null, { timeout: 360_000 });
  const last = (await qa<{ last: { ms: number; backend: string } }>('panel')).last;
  console.log(`cutout panel: portrait ${last.ms} ms (${last.backend})`);
  await expect(panel).toContainText('el pelo suelto'.replace('el', 'El'));
  // refinement and previews
  await panel.getByRole('slider', { name: /Desplazar/ }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  await expect(panel.getByRole('slider', { name: /Desplazar/ })).toHaveValue('-3');
  for (const bg of ['Claro', 'Oscuro', 'Contraste', 'Cuadros']) await panel.getByRole('radio', { name: bg, exact: true }).click();
  await panel.getByRole('radio', { name: 'Antes' }).click();
  await panel.getByRole('radio', { name: 'Después' }).click();
  // a «Quitar» brush stroke on the preview, then undo it
  await panel.getByRole('radio', { name: 'Quitar', exact: true }).click();
  await panel.locator('canvas').scrollIntoViewIfNeeded();
  const box = (await panel.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(panel.getByRole('button', { name: 'Deshacer retoque' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Deshacer retoque' }).click();
  // exports
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'PNG transparente' }).click();
  expect((await dl).suggestedFilename()).toMatch(/recorte\.png$/);
  // both: a cut-out layer and the background as a mask on the target, one undo step
  const target = await qa<string>('target');
  const d0 = await depth();
  await panel.getByRole('radio', { name: 'Las dos' }).click();
  await panel.getByRole('radio', { name: 'Fondo' }).click();
  await panel.getByRole('button', { name: 'Usar como capa y máscara' }).click();
  await expect(panel).toBeHidden({ timeout: 60_000 });
  const pr = await qa<{ sources: Array<{ kind: string; cutout?: { from: string } }>; layers: Array<{ kind: string; source?: string }> }>('project');
  const cut = pr.sources.find(s => s.kind === 'cutout');
  expect(cut?.cutout?.from).toBeTruthy();
  expect(pr.layers.some(l => l.kind === 'photo' && l.source === (cut as unknown as { id: string }).id)).toBe(true);
  expect((await parts(page, target)).slice(-1)[0]).toMatchObject({ kind: 'raster', origin: 'background' });
  expect((await depth()).past).toBe(d0.past + 1);
  await qa('undo');
  const back = await qa<{ sources: Array<{ kind: string }> }>('project');
  expect(back.sources.some(s => s.kind === 'cutout')).toBe(false);
  expect(await parts(page, target)).toHaveLength(0);
});
