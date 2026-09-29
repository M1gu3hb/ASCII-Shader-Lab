import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as httpServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { fileUrl, MODELS, variantFiles } from '../../src/cutout/models';
import { download } from './helpers';
import { PHOTO, PHOTO2, finalRender, framePoint, openFoto, project, settle, startFromPhoto } from './foto-helpers';

/**
 * The integrated photo studio (/studio/foto/, production build): the real tools from the palette
 * (rectangle, lasso, brush, colour, gradient, the object tool), «Quitar fondo» applied as a layer, a clip
 * from the library through «Animar», playback forwards and backwards and scrubbing on the studio's clock,
 * the still export at a scrubbed time equal to the preview at that time, undo/redo across tools and
 * clips, and autosave + reload keeping masks and clips.
 *
 * The object tool and the cutout run their models from a local copy (Hugging Face is never contacted: its
 * pinned URLs are routed to a local file server, as in tools.spec.ts); without it those tests are skipped
 * with the command that makes the copy.
 */

const time = (page: Page) => page.evaluate(() => (window as unknown as { __foto: { store(): { time: number } } }).__foto.store().time);
const parts = async (page: Page, i = -1) => { const p = await project(page); const l = i < 0 ? p.layers[p.layers.length + i] : p.layers[i]; return l.mask?.parts ?? []; };

const MODELS_DIR = resolve(process.env.GLYPHOS_MODELS_DIR ?? '.cache/modelos');
const manifest: { files: Array<{ url: string; source: string }> } | null = existsSync(join(MODELS_DIR, 'manifest.json'))
  ? JSON.parse(readFileSync(join(MODELS_DIR, 'manifest.json'), 'utf8')) : null;
const localBySource = new Map((manifest?.files ?? []).map(f => [f.source, f.url]));
const hasModel = (id: string) => {
  const spec = MODELS.find(m => m.id === id)!;
  return !!spec.wasm && variantFiles(spec.wasm).every(f => { const l = localBySource.get(fileUrl(spec, f)); return !!l && existsSync(join(MODELS_DIR, l)); });
};
const NEED = (id: string) => `Faltan los archivos locales de «${id}» en ${MODELS_DIR}: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm --only select,portrait`;

let files: Server | null = null;
let filesOrigin = '';
test.beforeAll(async () => {
  files = httpServer((req, res) => {
    const file = join(MODELS_DIR, decodeURIComponent((req.url ?? '/').split('?')[0].slice(1)));
    if (!file.startsWith(MODELS_DIR) || !existsSync(file)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size, 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>(r => files!.listen(0, '127.0.0.1', () => r()));
  const addr = files.address();
  filesOrigin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
test.afterAll(async () => { await new Promise(r => (files ? files.close(r) : r(null))); });

/** Model files from the local copy; nothing else leaves the machine. */
async function routeModels(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => {
    const u = route.request().url();
    if (u.startsWith('https://huggingface.co/')) {
      const local = localBySource.get(u);
      if (!local) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
      return route.fulfill({ status: 302, headers: { location: `${filesOrigin}/${local}`, 'access-control-allow-origin': '*' } });
    }
    return route.abort('blockedbyclient');
  });
}

async function drag(page: Page, pts: Array<[number, number]>, steps = 5) {
  const a = await framePoint(page, pts[0][0], pts[0][1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { const b = await framePoint(page, x, y); await page.mouse.move(b.x, b.y, { steps }); }
  await page.mouse.up();
}
async function clickAt(page: Page, x: number, y: number) { const a = await framePoint(page, x, y); await page.mouse.click(a.x, a.y); }
const tool = (page: Page, id: string) => page.locator(`.frail .tbtn[data-tool="${id}"]`).click();

async function withAsciiLayer(page: Page, file = PHOTO) {
  await startFromPhoto(page, file);
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect.poll(async () => (await project(page)).layers.length).toBe(2);
  await finalRender(page);
}

test('las herramientas reales: rectángulo, lazo, pincel, color y degradado; la máscara las nombra; deshacer y rehacer', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openFoto(page);
  await withAsciiLayer(page);
  const h0 = (await settle(page)).hash;
  await page.evaluate(() => (window as unknown as { __foto: { release(): void } }).__foto.release());

  // the palette: 12 tools with their letters, grouped, and no «pronto»
  await expect(page.locator('.frail .tbtn[data-tool]')).toHaveCount(14);
  await expect(page.locator('.frail')).not.toContainText('pronto');
  // a letter picks a tool (over the art), the tooltip names it
  await page.locator('.fv-over').hover();
  await page.keyboard.press('m');
  await expect(page.locator('.frail .tbtn[data-tool="rectangulo"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.frail .tbtn[data-tool="lazo"]').hover();
  await expect(page.getByRole('tooltip')).toContainText('Lazo');
  await expect(page.getByRole('tooltip')).toContainText('L');

  await drag(page, [[0.15, 0.2], [0.45, 0.55]]);
  await expect.poll(async () => (await parts(page)).length).toBe(1);
  expect((await parts(page))[0]).toMatchObject({ kind: 'rect', op: 'add' });
  await tool(page, 'lazo');
  await drag(page, [[0.6, 0.2], [0.85, 0.25], [0.8, 0.5], [0.62, 0.45]], 4);
  await expect.poll(async () => (await parts(page)).length).toBe(2);
  expect((await parts(page))[1].kind).toBe('polygon');
  await tool(page, 'pasar-a-ascii');
  await drag(page, [[0.2, 0.75], [0.5, 0.8], [0.7, 0.72]], 6);
  await expect.poll(async () => (await parts(page)).length).toBe(3);
  expect((await parts(page))[2].kind).toBe('stroke');
  await tool(page, 'color');
  await clickAt(page, 0.5, 0.1);
  await expect.poll(async () => (await parts(page)).length, { timeout: 30_000 }).toBe(4);
  expect((await parts(page))[3].kind).toBe('color');
  await tool(page, 'degradado');
  await drag(page, [[0.1, 0.9], [0.4, 0.6]]);
  await expect.poll(async () => (await parts(page)).length).toBe(5);
  expect((await parts(page))[4]).toMatchObject({ kind: 'gradient' });

  // the mask section lists them with the tools' names (gradient included)
  const list = page.locator('.fmask .parts > li');
  await expect(list).toHaveCount(5);
  await expect(list.nth(4)).toContainText('Degradado');
  await expect(list.nth(2)).toContainText('Trazo de pincel');
  // the picture changed
  expect((await settle(page)).hash).not.toBe(h0);
  await page.evaluate(() => (window as unknown as { __foto: { release(): void } }).__foto.release());

  // one undo step per gesture, back and forth
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await parts(page)).length).toBe(3);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await parts(page)).length).toBe(4);
  expect(errors).toEqual([]);
});

test('una animación de la biblioteca: reproducir, al revés, mover el cabezal; la exportación en ese instante es la vista; deshacer entre herramientas y clips; se guarda y vuelve', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openFoto(page);
  await withAsciiLayer(page);
  // a zone with the rectangle, then «Animar» from the layer's settings
  await tool(page, 'rectangulo');
  await drag(page, [[0.1, 0.1], [0.9, 0.9]]);
  await expect.poll(async () => (await parts(page)).length).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ftl')).toContainText('Sin animación');
  await page.getByRole('region', { name: /^Ajustes de/ }).getByRole('button', { name: 'Animar…' }).click();
  const sheet = page.getByRole('dialog', { name: /^Animar/ });
  await expect(sheet.locator('.tl-card[data-item="foto-a-ascii"]')).toBeVisible({ timeout: 30_000 });
  await sheet.locator('.tl-card[data-item="foto-a-ascii"]').click();
  await expect(sheet).toBeHidden();
  let p = await project(page);
  expect(p.layers[1].clips).toHaveLength(1);
  // the timeline opened with the clip
  const tl = page.getByRole('region', { name: 'Línea de tiempo' }).locator('.tl');
  await expect(tl.locator('.tl-clip')).toHaveCount(1);
  await expect(page.getByRole('region', { name: /^Ajustes de/ }).locator('.fanim-list li')).toHaveCount(1);

  // play forwards, pause, play backwards
  await tl.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect.poll(() => time(page), { timeout: 20_000 }).toBeGreaterThan(0.25);
  await tl.getByRole('button', { name: 'Pausar' }).click();
  const t1 = await time(page);
  expect(await page.evaluate(() => (window as unknown as { __foto: { clock(): { playing: boolean } } }).__foto.clock().playing)).toBe(false);
  await tl.getByRole('button', { name: 'Reproducir al revés' }).click();
  await expect.poll(() => time(page), { timeout: 20_000 }).toBeLessThan(t1 - 0.1);
  await tl.getByRole('button', { name: 'Reproducir al revés' }).click();
  // scrub: a click on the ruler moves the playhead there; the viewport draws that instant
  const ruler = (await tl.locator('.tl-ruler').boundingBox())!;
  const len = Math.max(1, (await project(page) as unknown as { time: { duration: number } }).time.duration);
  const pps = Number(await tl.getAttribute('data-pps')), start = Number(await tl.getAttribute('data-start'));
  const want = Math.min(len * 0.45, 0.6);
  await page.mouse.click(ruler.x + (want - start) * pps, ruler.y + ruler.height / 2);
  await expect.poll(async () => Math.abs((await time(page)) - want)).toBeLessThan(0.06);
  const t = await time(page);

  // the still exported at this instant is, pixel for pixel, the viewport's final render at 100 %
  await page.locator('.fv-over').hover();
  await page.keyboard.press('1');
  // (renders of the scrub may still come first: wait for the one at 100 %)
  await page.waitForFunction(() => { const F = (window as unknown as { __foto: { ui(): { render: { scale: number; light: boolean } }; sched(): { busy: boolean; dirty: boolean } } }).__foto; const r = F.ui().render; return r.scale === 1 && !r.light && !F.sched().busy && !F.sched().dirty; }, null, { timeout: 90_000 });
  const reports = await page.evaluate(() => (window as unknown as { __foto: { reports(): Array<{ t: number; light: boolean }> } }).__foto.reports());
  expect(reports.filter(x => !x.light).slice(-1)[0].t).toBeCloseTo(t, 5);
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const ex = page.getByRole('dialog', { name: 'Exportar' });
  const file = await download(page, () => ex.getByRole('button', { name: 'Exportar PNG' }).click());
  const cmp = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const art = document.querySelector<HTMLCanvasElement>('.fv-art')!;
    const a = art.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, art.width, art.height).data;
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let differ = 0;
    for (let i = 0; i < d.length; i++) if (a[i] !== d[i]) differ++;
    return { size: [bmp.width, bmp.height, art.width, art.height], differ };
  }, readFileSync(file.path).toString('base64'));
  expect(cmp.size[0]).toBe(cmp.size[2]);
  expect(cmp.differ).toBe(0);
  await page.keyboard.press('Escape');

  // undo goes back through the clip, then the zone; redo brings both
  await page.locator('.fv-over').hover();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await project(page)).layers[1].clips.length).toBe(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await parts(page)).length).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await project(page)).layers[1].clips.length).toBe(1);
  expect(await parts(page)).toHaveLength(1);

  // saved by itself: a reload brings the masks and the clips back, with the same pixels at the same instant
  p = await project(page);
  await page.evaluate(() => (window as unknown as { __foto: { ps: { setTime(t: number): void } } }).__foto.ps.setTime(0.3));
  const h = await settle(page);
  await expect(page.locator('.fsave')).toHaveText('guardado', { timeout: 30_000 });
  await page.reload();
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const q = await project(page);
  expect(JSON.stringify(q.layers)).toBe(JSON.stringify(p.layers));
  await expect(page.getByRole('region', { name: 'Línea de tiempo' }).locator('.tl-clip')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { __foto: { ps: { setTime(t: number): void } } }).__foto.ps.setTime(0.3));
  expect((await settle(page, h.scale)).hash).toBe(h.hash);
  expect(errors).toEqual([]);
});

test('herramienta «Objeto»: descarga con permiso, puntos sobre la guitarra, una parte de objeto', async ({ browser }) => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await routeModels(context);
  const page = await context.newPage();
  const errors = await openFoto(page);
  await withAsciiLayer(page, PHOTO2);
  await tool(page, 'objeto');
  const opts = page.getByRole('region', { name: /Opciones de Objeto/ });
  await opts.getByRole('button', { name: /Descargar \d+ MB/ }).click();
  await page.waitForFunction(() => (window as unknown as { __foto: { objectState(): { phase: string } } }).__foto.objectState().phase === 'ready', null, { timeout: 360_000 });
  for (const [x, y] of [[0.43, 0.41], [0.16, 0.68], [0.55, 0.74]] as Array<[number, number]>) await clickAt(page, x, y);
  await page.waitForFunction(() => { const s = (window as unknown as { __foto: { objectState(): { phase: string; matte: boolean } } }).__foto.objectState(); return s.matte && s.phase === 'ready'; }, null, { timeout: 120_000 });
  await opts.getByRole('button', { name: /^Aceptar/ }).click();
  await expect.poll(async () => (await parts(page)).length, { timeout: 30_000 }).toBe(1);
  expect((await parts(page))[0]).toMatchObject({ kind: 'raster', origin: 'object' });
  await expect(page.locator('.fmask .parts > li').first()).toContainText('Objeto');
  // «Quitar fondo…» from the tool opens the real cutout panel
  await opts.getByRole('button', { name: 'Quitar fondo…' }).click();
  await expect(page.getByRole('complementary', { name: 'Recorte' })).toBeVisible();
  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  await context.close();
});

test('«Quitar fondo» desde la paleta: recorte con el modelo de retrato y una capa nueva', async ({ browser }) => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(420_000);
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await routeModels(context);
  const page = await context.newPage();
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  await page.locator('.frail .tbtn[data-tool="recorte"]').click();
  const panel = page.getByRole('complementary', { name: 'Recorte' });
  await expect(panel).toBeVisible();
  await panel.locator('[data-model="portrait"] input').check();
  await panel.getByRole('button', { name: 'Recortar' }).click();
  await panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __foto: { cutoutState(): Promise<{ state: string }> } }).__foto.cutoutState())).state, { timeout: 360_000 }).toBe('refine');
  const before = (await project(page)).layers.length;
  await panel.getByRole('radio', { name: 'Capa nueva' }).click();
  await panel.getByRole('button', { name: 'Usar como capa' }).click();
  await expect(panel).toBeHidden({ timeout: 60_000 });
  const p = await project(page) as unknown as { sources: Array<{ id: string; kind: string }>; layers: Array<{ kind: string; source?: string }> };
  expect(p.layers.length).toBe(before + 1);
  const cut = p.sources.find(s => s.kind === 'cutout');
  expect(cut).toBeTruthy();
  expect(p.layers.some(l => l.source === cut!.id)).toBe(true);
  await finalRender(page);
  expect(errors.filter(e => !/Failed to load resource/.test(e))).toEqual([]);
  await context.close();
});
