import { realpathSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ViteDevServer } from 'vite';

/**
 * The photo and video studio's foundation, driven through its QA page (dev/project.html, window.mt):
 * samples render, exports equal the render, transparency is real, saved projects and project files reopen
 * with the same pixels, media collections keep what projects and the lab use.
 * dev/ pages are not part of the production build, so this spec starts its own Vite dev server
 * (port PW_DEV_PORT, default PW_PORT + 1000). Skipped against a deployed site (BASE_URL).
 */
const remote = !!process.env.BASE_URL;
const port = Number(process.env.PW_DEV_PORT ?? Number(process.env.PW_PORT ?? 4173) + 1000);
const url = `http://127.0.0.1:${port}/dev/project.html`;

test.describe.configure({ mode: 'serial' });
test.skip(remote, 'dev pages only exist in the dev server');

let server: ViteDevServer | null = null;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const { createServer } = await import('vite');
  // node_modules may be a symlink (separate working copies): allow serving fonts from its real location
  server = await createServer({
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
    logLevel: 'error',
  });
  await server.listen();
});

test.afterAll(async () => { await server?.close(); });

interface Mt {
  ready: boolean;
  error: string;
  samples: Array<{ name: string }>;
  render(i: number, t?: number, scale?: number): Promise<{ w: number; h: number; hash: string; std: number; report: { warnings: string[]; missing: unknown[]; layers: Array<{ note?: string }> } }>;
  exportMatches(i: number, t?: number, format?: string): Promise<{ type: string; same: boolean; differ: number; max: number; size: number[]; alpha: { clear: number; solid: number; partial: number; total: number } }>;
  saveReopen(i: number, t?: number): Promise<{ saved: string; reopened: boolean; listed: boolean; equalJson: boolean; same: boolean; differ: number }>;
  fileRoundTrip(i: number, t?: number): Promise<{ ok: boolean; newId: boolean; same: boolean; differ: number }>;
  state(i: number, t: number): Array<{ name: string; kind: string; opacity: number; clips: string[] }>;
  gcCheck(): Promise<Record<string, unknown>>;
  videoCheck(): Promise<{ codec: string; frames: Array<{ t: number; want: number; exact: number; preview: number }> }>;
  basic: boolean;
  sequenceCheck(): Promise<{ seq: number[][]; cutoutCenter: number[]; cutoutCorner: number[] }>;
  budgetCheck(): Promise<{ ascii: number; warnings: string[]; shared: boolean; roomyWarnings: string[]; same: boolean }>;
  autosaveCheck(): Promise<{ listedName: string | null; savedName: string | null; afterUndo: string | null; storage: string }>;
  exportsCheck(): Promise<{
    layer: { type: string; alpha: { clear: number; solid: number; partial: number; total: number } };
    mask: { w: number; h: number; center: number; corner: number; alpha: { solid: number; total: number } } | null;
    original: { files: number; same: boolean; name: string };
    small: number[]; webp: string; frames: string[];
  }>;
}
type W = Window & { mt: Mt };

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // a dev server that finds a dependency late re-bundles it and answers the old one with 504: load again then
  let stale = false;
  page.on('response', r => { if (r.status() === 504) stale = true; });
  await page.goto(url + query);
  // the first visit compiles the page's modules and the engines' shaders (SwiftShader): generous
  const deadline = Date.now() + 150_000;
  let reloaded = false;
  for (;;) {
    const ok = await page.evaluate(() => !!(window as unknown as W).mt?.ready || !!(window as unknown as W).mt?.error).catch(() => false);
    if (ok) break;
    if (stale && !reloaded) { reloaded = true; stale = false; await page.reload(); continue; }
    if (Date.now() > deadline) throw new Error('la página de QA no terminó de cargar');
    await page.waitForTimeout(500);
  }
  expect(await page.evaluate(() => (window as unknown as W).mt.error)).toBe('');
  return errors;
}

test('every sample renders, the same pixels twice, with nothing missing', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  const n = await page.evaluate(() => (window as unknown as W).mt.samples.length);
  expect(n).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < n; i++) {
    const [a, b] = await page.evaluate(async i => { const mt = (window as unknown as W).mt; return [await mt.render(i, 1.2, 0.5), await mt.render(i, 1.2, 0.5)]; }, i);
    expect(a.hash, `muestra ${i}`).toBe(b.hash);
    expect(a.std, `muestra ${i} tiene imagen`).toBeGreaterThan(8);
    expect(a.report.missing).toEqual([]);
    expect(a.report.layers.filter(l => l.note)).toEqual([]);
  }
  // the figures on the page show them too
  await expect(page.locator('figure canvas')).toHaveCount(n);
  expect(errors).toEqual([]);
});

test('evaluate at a scrubbed time: clips hold before, run, and hold after; keyframes move', async ({ page }) => {
  await open(page);
  const s = await page.evaluate(() => { const mt = (window as unknown as W).mt; return [mt.state(0, 0), mt.state(0, 1.4), mt.state(0, 3.9), mt.state(3, 0.75)]; });
  expect(s[0][1].clips[0]).toBe('foto-a-ascii 0.000');
  expect(s[1][1].clips[0]).toMatch(/^foto-a-ascii 0\.(4|5)\d+ ▶$/);
  expect(s[2][1].clips[0]).toBe('foto-a-ascii 1.000');
  // «Dos zonas»: the right zone's opacity is keyframed 0 → 1 over 1.5 s (ease out)
  expect(s[3][2].opacity).toBeGreaterThan(0.5);
  expect(s[3][2].opacity).toBeLessThan(1);
  // and the frames differ as the clip runs
  const h = await page.evaluate(async () => { const mt = (window as unknown as W).mt; return [(await mt.render(0, 0, 0.25)).hash, (await mt.render(0, 1.4, 0.25)).hash, (await mt.render(0, 3, 0.25)).hash]; });
  expect(new Set(h).size).toBe(3);
});

test('the exported PNG at scale 1 is render() at scale 1, pixel for pixel', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  for (const i of [0, 2, 3]) {
    const r = await page.evaluate(i => (window as unknown as W).mt.exportMatches(i, 1.2), i);
    expect(r.type).toBe('image/png');
    expect(r, `muestra ${i}`).toMatchObject({ same: true, differ: 0 });
    expect(r.alpha.solid).toBe(r.alpha.total);
  }
});

test('a transparent project exports real alpha (and JPEG falls back to the background)', async ({ page }) => {
  await open(page);
  const i = await page.evaluate(() => (window as unknown as W).mt.samples.findIndex(s => /transparente/i.test(s.name)));
  expect(i).toBeGreaterThanOrEqual(0);
  const png = await page.evaluate(i => (window as unknown as W).mt.exportMatches(i, 0), i);
  expect(png).toMatchObject({ type: 'image/png', same: true });
  expect(png.alpha.clear).toBeGreaterThan(png.alpha.total * 0.1);
  expect(png.alpha.solid).toBeGreaterThan(100);
  expect(png.alpha.partial).toBeGreaterThan(100);
  const jpg = await page.evaluate(i => (window as unknown as W).mt.exportMatches(i, 0, 'jpeg'), i);
  expect(jpg.type).toBe('image/jpeg');
  expect(jpg.alpha.solid).toBe(jpg.alpha.total);
});

test('a saved project and a project file reopen with the same pixels', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const saved = await page.evaluate(() => (window as unknown as W).mt.saveReopen(3, 1));
  expect(saved).toMatchObject({ saved: 'ok', reopened: true, listed: true, equalJson: true, same: true });
  // after a reload too (the store is IndexedDB)
  await open(page);
  const again = await page.evaluate(() => (window as unknown as W).mt.saveReopen(3, 1));
  expect(again).toMatchObject({ reopened: true, same: true });
  const file = await page.evaluate(() => (window as unknown as W).mt.fileRoundTrip(2, 0));
  expect(file).toMatchObject({ ok: true, newId: true, same: true });
  const withClips = await page.evaluate(() => (window as unknown as W).mt.fileRoundTrip(0, 1.4));
  expect(withClips).toMatchObject({ ok: true, same: true });
});

test('media collections: the lab keeps project files, the studio keeps lab files, unused files go', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => (window as unknown as W).mt.gcCheck());
  expect(r).toMatchObject({ labKeepsStudio: true, studioKeepsLab: true, goneWhenUnused: true, restored: true });
});

test('video sources: the frame-exact and the preview providers both draw the frame of each time', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const r = await page.evaluate(() => (window as unknown as W).mt.videoCheck());
  expect(r.frames.length).toBeGreaterThanOrEqual(10);
  for (const f of r.frames) {
    // each frame is one solid colour (red 20, 42, 64…): a neighbour frame is 22 away, codec noise a few units
    expect(Math.abs(f.exact - f.want), `exacto a ${f.t} s`).toBeLessThanOrEqual(6);
    expect(Math.abs(f.preview - f.want), `vista a ${f.t} s`).toBeLessThanOrEqual(6);
  }
});

test('without WebGL 2 (the basic engine) every sample renders and the export still equals the render', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await open(page, '?motor=basico');
  expect(await page.evaluate(() => (window as unknown as W).mt.basic)).toBe(true);
  const n = await page.evaluate(() => (window as unknown as W).mt.samples.length);
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(i => (window as unknown as W).mt.render(i, 1.2, 0.5), i);
    expect(r.std, `muestra ${i}`).toBeGreaterThan(8);
    expect((r.report as unknown as { engines: { webgl2: number } }).engines.webgl2).toBe(0);
  }
  const e = await page.evaluate(() => (window as unknown as W).mt.exportMatches(3, 1.2));
  expect(e).toMatchObject({ same: true, differ: 0 });
  expect(errors).toEqual([]);
});

test('photo sequences, cut-outs, the engine budget, autosave and the other exports', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const seq = await page.evaluate(() => (window as unknown as W).mt.sequenceCheck());
  // three photos, half a second each, then the first again
  expect(seq.seq).toEqual([[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 0, 0, 255]]);
  expect(seq.cutoutCenter[3]).toBe(255);
  expect(seq.cutoutCorner[3]).toBe(0);

  const b = await page.evaluate(() => (window as unknown as W).mt.budgetCheck());
  expect(b.ascii).toBeGreaterThan(2);
  expect(b.shared).toBe(true);
  expect(b.warnings.join(' ')).toMatch(/capas ASCII/);
  expect(b.roomyWarnings).toEqual([]);
  expect(b.same).toBe(true);

  const a = await page.evaluate(() => (window as unknown as W).mt.autosaveCheck());
  expect(a).toMatchObject({ listedName: 'Guardado solo', savedName: 'Guardado solo', storage: 'ok' });
  expect(a.afterUndo).not.toBe('Guardado solo');

  const e = await page.evaluate(() => (window as unknown as W).mt.exportsCheck());
  expect(e.layer.type).toBe('image/png');
  expect(e.layer.alpha.clear).toBeGreaterThan(0);
  expect(e.layer.alpha.solid + e.layer.alpha.partial).toBeGreaterThan(0);
  expect(e.mask).toMatchObject({ w: 320, h: 200, center: 255, corner: 0 });
  expect(e.mask!.alpha.solid).toBe(e.mask!.alpha.total);
  expect(e.original).toMatchObject({ files: 1, same: true, name: 'atardecer.png' });
  expect(e.small).toEqual([480, 300]);
  expect(e.frames).toHaveLength(4);
  expect(new Set(e.frames.map(f => f.split(':')[1])).size).toBe(4);
});
