import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer as httpServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { devices, expect, test, type Browser, type BrowserContext, type CDPSession, type Locator, type Page } from '@playwright/test';
import { fileUrl, MODELS, variantFiles } from '../../src/cutout/models';
import { zip } from '../../src/shared/zip';
import { download, openStudio, seedText } from './helpers';
import { PHOTO, PHOTO2, finalRender, framePoint, openFoto, project, settle, startFromPhoto } from './foto-helpers';

/**
 * The owner's scenarios, walked through in the real studios (production build), one test each:
 *   1. a portrait with hair: the portrait model cuts it out, the edge is refined, the transparent PNG has real alpha;
 *   2. an object on a busy background: the object tool with points on the guitar (one of them «not this»), then a
 *      second part;
 *   3. several masks in one photo: three zones with different styles and a graded (gradient) zone;
 *   4. a transparent PNG: characters only on the subject, over nothing;
 *   5. an editorial composition: a poster applied, its title edited, the PNG equal to the preview;
 *   6. a reversed animation: the frames of a reversed clip are the forward frames in reverse order;
 *   7. reopening a project: saved by itself and reloaded, and from its file: the same pixels;
 *   8. old lab recipes: generator versions 1–4, an original single-file lab recipe, a receta.monotrama.json
 *      project, a session saved by the previous version and a #r= link still open in the lab, and «Llevar al
 *      estudio de foto» takes an old project there;
 *   9. a phone held upright (390×844): start, a photo, a tool with a finger, the dice, export.
 * (Video scenarios are tests/e2e/foto-video.spec.ts's.)
 *
 * Screenshots of every step go to ESCENARIOS_SHOTS when set (the test's output folder otherwise), to be looked
 * at. The models run from the local copy (.cache/modelos, as in foto-studio.spec.ts): Hugging Face is never
 * contacted; without the copy those scenarios skip with the command that makes it.
 */

type W = { __foto: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const SHOTS = process.env.ESCENARIOS_SHOTS ?? '';
async function shot(page: Page, name: string) {
  const dir = SHOTS || test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}
/**
 * The viewport at rest before a screenshot: its last render is the final one and nothing more is coming. (A
 * tool's live preview keeps the light view on: after a while the screenshot is taken anyway.)
 */
async function quiet(page: Page) {
  await page.waitForFunction(() => {
    const F = (window as unknown as { __foto: { ui(): { render: { light: boolean; n: number } }; sched(): { busy: boolean; dirty: boolean } } }).__foto;
    const r = F.ui().render, q = F.sched();
    return r.n > 0 && !r.light && !q.busy && !q.dirty;
  }, null, { timeout: 20_000 }).catch(() => undefined);
}
async function fshot(page: Page, name: string) {
  await quiet(page);
  await shot(page, name);
}
function keep(path: string, name: string) {
  const dir = SHOTS || test.info().outputDir;
  mkdirSync(dir, { recursive: true });
  copyFileSync(path, join(dir, name));
}

/* ------------------------------------------------------------------ models from the local copy */

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

/** A desktop context whose model downloads come from the local copy; nothing else leaves the machine. */
async function modelContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => {
    const u = route.request().url();
    if (u.startsWith('https://huggingface.co/')) {
      const local = localBySource.get(u);
      if (!local) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
      return route.fulfill({ status: 302, headers: { location: `${filesOrigin}/${local}`, 'access-control-allow-origin': '*' } });
    }
    return route.abort('blockedbyclient');
  });
  return context;
}

/* ------------------------------------------------------------------ helpers */

const noise = (errors: string[]) => errors.filter(e => !/Failed to load resource/.test(e));
const tool = (page: Page, id: string) => page.locator(`.frail .tbtn[data-tool="${id}"]`).click();
const lastParts = async (page: Page) => { const p = await project(page); return p.layers[p.layers.length - 1].mask?.parts ?? []; };

async function drag(page: Page, pts: Array<[number, number]>, steps = 5) {
  const a = await framePoint(page, pts[0][0], pts[0][1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { const b = await framePoint(page, x, y); await page.mouse.move(b.x, b.y, { steps }); }
  await page.mouse.up();
}

async function addLayer(page: Page, kind: RegExp) {
  const n = (await project(page)).layers.length;
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: kind }).click();
  await expect.poll(async () => (await project(page)).layers.length).toBe(n + 1);
  await finalRender(page);
}

const cutoutState = (page: Page) => page.evaluate(async () => (await (window as unknown as W).__foto.cutoutState()).state as string);

/** Alpha of a PNG: fully clear, fully solid and in between (soft edges), counted in the page. */
async function alphaOf(page: Page, png: Buffer) {
  return page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, solid = 0, soft = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) clear++; else if (d[i] === 255) solid++; else soft++; }
    const at = (fx: number, fy: number) => d[(Math.floor(fy * (c.height - 1)) * c.width + Math.floor(fx * (c.width - 1))) * 4 + 3];
    return { w: c.width, h: c.height, total: d.length / 4, clear, solid, soft, corners: [at(0, 0), at(1, 0), at(0, 1), at(1, 1)] };
  }, png.toString('base64'));
}

/** Pixel differences between the viewport's art canvas and a PNG. */
async function compareWithArt(page: Page, png: Buffer) {
  return page.evaluate(async b64 => {
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
  }, png.toString('base64'));
}

/** Waits until the viewport shows its final render at 100 %. */
async function atFullSize(page: Page) {
  await page.locator('.fv-over').hover();
  await page.keyboard.press('1');
  await page.waitForFunction(() => {
    const F = (window as unknown as { __foto: { ui(): { render: { scale: number; light: boolean } }; sched(): { busy: boolean; dirty: boolean } } }).__foto;
    const r = F.ui().render;
    return r.scale === 1 && !r.light && !F.sched().busy && !F.sched().dirty;
  }, null, { timeout: 120_000 });
}

async function openExport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Exportar' });
  await expect(sheet.locator('.xp-fmts')).toBeVisible({ timeout: 30_000 });
  return sheet;
}
const exportPng = (page: Page, sheet: Locator) => download(page, () => sheet.getByRole('button', { name: 'Exportar PNG' }).click());

/* ------------------------------------------------------------------ 1 */

test('1 · retrato con pelo: el modelo de retrato recorta, el borde se afina y el PNG transparente tiene alfa real', async ({ browser }) => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(480_000);
  const context = await modelContext(browser);
  const page = await context.newPage();
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  await fshot(page, '1-retrato-foto');
  await page.locator('.frail .tbtn[data-tool="recorte"]').click();
  const panel = page.getByRole('complementary', { name: 'Recorte' });
  await expect(panel).toBeVisible();
  await panel.locator('[data-model="portrait"] input').check();
  await panel.getByRole('button', { name: 'Recortar' }).click();
  // nothing downloads before the person agrees: the panel says what, how big and why
  await expect(panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ })).toBeVisible();
  await fshot(page, '1-retrato-permiso');
  await panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ }).click();
  await expect.poll(() => cutoutState(page), { timeout: 360_000 }).toBe('refine');
  await fshot(page, '1-retrato-recorte');
  // the edge, refined for hair: the extra detail pass and the old background's colour taken out of the edge
  for (const name of ['Detalle', 'Descontaminar']) {
    const s = panel.getByRole('slider', { name });
    await s.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  }
  await expect(panel.getByRole('slider', { name: 'Detalle' })).toHaveValue('0.4');
  await page.waitForTimeout(2500);
  await panel.getByRole('radio', { name: 'Claro' }).click();
  await fshot(page, '1-retrato-afinado-claro');
  await panel.getByRole('radio', { name: 'Cuadros' }).click();
  // the transparent PNG: the background clear, the person solid, the hair and the edges in between
  const png = await download(page, () => panel.getByRole('button', { name: 'PNG transparente' }).click());
  keep(png.path, '1-retrato-recorte-transparente.png');
  const a = await alphaOf(page, readFileSync(png.path));
  expect([a.w, a.h]).toEqual([1024, 858]);
  expect(a.clear).toBeGreaterThan(a.total * 0.15);
  expect(a.solid).toBeGreaterThan(a.total * 0.2);
  expect(a.soft).toBeGreaterThan(5000);
  expect(a.corners[0]).toBe(0);
  // used as a layer at once
  await panel.getByRole('radio', { name: 'Capa nueva' }).click();
  await panel.getByRole('button', { name: 'Usar como capa' }).click();
  await expect(panel).toBeHidden({ timeout: 60_000 });
  const p = await project(page) as unknown as { sources: Array<{ kind: string }>; layers: Array<{ kind: string }> };
  expect(p.sources.some(s => s.kind === 'cutout')).toBe(true);
  expect(p.layers).toHaveLength(2);
  await finalRender(page);
  await fshot(page, '1-retrato-capa');
  expect(noise(errors)).toEqual([]);
  await context.close();
});

/* ------------------------------------------------------------------ 2 */

test('2 · objeto con fondo complejo: puntos sobre la guitarra (uno «no es esto») y una segunda parte', async ({ browser }) => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(480_000);
  const context = await modelContext(browser);
  const page = await context.newPage();
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO2);
  await addLayer(page, /ASCII \(render gráfico\)/);
  await tool(page, 'objeto');
  const opts = page.getByRole('region', { name: /Opciones de Objeto/ });
  await opts.getByRole('button', { name: /Descargar \d+ MB/ }).click();
  await page.waitForFunction(() => (window as unknown as W).__foto.objectState().phase === 'ready', null, { timeout: 360_000 });
  const ready = () => page.waitForFunction(() => { const s = (window as unknown as W).__foto.objectState(); return s.matte && s.phase === 'ready'; }, null, { timeout: 120_000 });
  // the guitar: its body, the lower bout and the pickguard; the blanket beside it marked «not this» (⌥ + click)
  for (const [x, y] of [[0.43, 0.41], [0.16, 0.68], [0.55, 0.74]] as Array<[number, number]>) { const pt = await framePoint(page, x, y); await page.mouse.click(pt.x, pt.y); }
  const no = await framePoint(page, 0.86, 0.5);
  await page.keyboard.down('Alt');
  await page.mouse.click(no.x, no.y);
  await page.keyboard.up('Alt');
  await ready();
  await expect(opts.locator('.tool-points li')).toHaveCount(4);
  await fshot(page, '2-objeto-puntos');
  await opts.getByRole('button', { name: /^Aceptar/ }).click();
  await expect.poll(async () => (await lastParts(page)).length, { timeout: 30_000 }).toBe(1);
  // a second part: the cushion at the top, added to the same mask
  for (const [x, y] of [[0.3, 0.12], [0.5, 0.2]] as Array<[number, number]>) { const pt = await framePoint(page, x, y); await page.mouse.click(pt.x, pt.y); }
  await ready();
  await opts.getByRole('button', { name: /^Aceptar/ }).click();
  await expect.poll(async () => (await lastParts(page)).length, { timeout: 30_000 }).toBe(2);
  const parts = await lastParts(page);
  for (const part of parts) expect(part).toMatchObject({ kind: 'raster', origin: 'object', op: 'add' });
  await expect(page.locator('.fmask .parts > li')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await finalRender(page);
  await fshot(page, '2-objeto-dos-partes');
  // the mask view shows what the characters cover
  await page.getByRole('button', { name: 'Ver la máscara' }).click();
  await finalRender(page);
  await fshot(page, '2-objeto-mascara');
  expect(noise(errors)).toEqual([]);
  await context.close();
});

/* ------------------------------------------------------------------ 3 */

test('3 · varias máscaras en una foto: tres zonas con estilos distintos y una zona en degradado', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  const h0 = (await settle(page)).hash;
  await page.evaluate(() => (window as unknown as W).__foto.release());
  // zone 1: an ASCII layer in a rectangle (top left)
  await addLayer(page, /ASCII \(render gráfico\)/);
  await tool(page, 'rectangulo');
  // (below the «Quitar fondo» recommendation, which may show over the top of the art)
  await drag(page, [[0.03, 0.22], [0.4, 0.6]]);
  await expect.poll(async () => (await lastParts(page)).length).toBe(1);
  // zone 2: real characters in an ellipse (the face), another style from the dice
  await addLayer(page, /Caracteres reales/);
  await tool(page, 'elipse');
  await drag(page, [[0.36, 0.2], [0.66, 0.72]]);
  await expect.poll(async () => (await lastParts(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Azar', exact: true }).click();
  // zone 3: another ASCII layer in a lasso (bottom right), rolled too, graded with a gradient zone
  await addLayer(page, /ASCII \(render gráfico\)/);
  await tool(page, 'lazo');
  await drag(page, [[0.68, 0.45], [0.97, 0.5], [0.95, 0.95], [0.66, 0.9]], 4);
  await expect.poll(async () => (await lastParts(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Azar', exact: true }).click();
  await page.getByRole('button', { name: 'Azar', exact: true }).click();
  await tool(page, 'degradado');
  await drag(page, [[0.05, 0.95], [0.4, 0.62]]);
  await expect.poll(async () => (await lastParts(page)).length).toBe(2);
  await page.keyboard.press('Escape');
  const p = await project(page) as unknown as { layers: Array<{ kind: string; style?: unknown; glyphs?: unknown; mask?: { parts: Array<{ kind: string }> } }> };
  const zones = p.layers.slice(1);
  expect(zones.map(l => l.kind)).toEqual(['ascii', 'glyphs', 'ascii']);
  expect(zones.map(l => l.mask?.parts.map(x => x.kind))).toEqual([['rect'], ['ellipse'], ['polygon', 'gradient']]);
  // three different looks: the two ASCII layers do not share their style, the characters are their own kind
  expect(JSON.stringify(zones[0].style)).not.toBe(JSON.stringify(zones[2].style));
  await expect(page.locator('.fmask .parts > li').last()).toContainText('Degradado');
  const h1 = await settle(page);
  expect(h1.hash).not.toBe(h0);
  await page.evaluate(() => (window as unknown as W).__foto.release());
  await finalRender(page);
  await fshot(page, '3-zonas');
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ 4 */

test('4 · PNG transparente: caracteres sólo sobre el sujeto recortado, sobre nada', async ({ browser }) => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(480_000);
  const context = await modelContext(browser);
  const page = await context.newPage();
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  // real characters, then «Quitar fondo» makes them a mask of the subject (and a cut-out layer)
  await addLayer(page, /Caracteres reales/);
  await page.locator('.frail .tbtn[data-tool="recorte"]').click();
  const panel = page.getByRole('complementary', { name: 'Recorte' });
  await panel.locator('[data-model="portrait"] input').check();
  await panel.getByRole('button', { name: 'Recortar' }).click();
  await panel.getByRole('button', { name: /Descargar \d+ MB y recortar/ }).click();
  await expect.poll(() => cutoutState(page), { timeout: 360_000 }).toBe('refine');
  await panel.getByRole('radio', { name: 'Máscara' }).click();
  await panel.getByRole('radio', { name: 'Sujeto' }).click();
  await panel.getByRole('button', { name: 'Aplicar como máscara' }).click();
  await expect(panel).toBeHidden({ timeout: 60_000 });
  const p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'glyphs']);
  expect(p.layers[1].mask?.parts[0]).toMatchObject({ kind: 'raster' });
  // no photo under them, and a transparent canvas
  await page.getByRole('button', { name: /^Ocultar «Foto original»/ }).click();
  await page.getByRole('button', { name: /^Lienzo/ }).click();
  await page.getByRole('switch', { name: 'Fondo transparente' }).setChecked(true, { force: true });
  expect((await project(page)).canvas.transparent).toBe(true);
  await finalRender(page);
  await fshot(page, '4-transparente-vista');
  const sheet = await openExport(page);
  await expect(sheet.getByRole('switch', { name: 'Fondo transparente' })).toBeChecked();
  const png = await exportPng(page, sheet);
  keep(png.path, '4-transparente.png');
  const a = await alphaOf(page, readFileSync(png.path));
  // the corners (background) are clear; the characters on the subject are there, many of them solid
  expect(a.corners).toEqual([0, 0, 0, 0]);
  expect(a.clear).toBeGreaterThan(a.total * 0.5);
  expect(a.solid + a.soft).toBeGreaterThan(a.total * 0.03);
  expect(noise(errors)).toEqual([]);
  await context.close();
});

/* ------------------------------------------------------------------ 5 */

test('5 · composición editorial: un cartel aplicado y editado se exporta igual a la vista', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  const posters = async () => {
    await page.locator('.xm-btn').click();
    await page.getByRole('menuitem', { name: /Aplicar plantilla de cartel/ }).click();
    return page.getByRole('dialog', { name: 'Aplicar plantilla de cartel' });
  };
  let sheet = await posters();
  await sheet.locator('.xp-card[data-poster=anotado]').click();
  await sheet.getByRole('radio', { name: 'Redes' }).click();
  await sheet.getByRole('radio', { name: 'Vertical 4:5' }).click();
  await expect(sheet.getByText('1080 × 1350 px', { exact: true })).toBeVisible();
  await fshot(page, '5-cartel-hoja');
  await sheet.getByRole('button', { name: 'Aplicar al proyecto' }).click();
  await expect(sheet).toBeHidden();
  await finalRender(page);
  // edited: a new title refits its box; the texts stay text layers
  sheet = await posters();
  await sheet.getByRole('textbox', { name: 'Título', exact: true }).last().fill('Luz de invierno');
  await expect.poll(async () => ((await project(page)).layers.find(l => l.name === 'Título') as unknown as { text: string } | undefined)?.text).toBe('Luz de invierno');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const p = await project(page);
  expect([p.canvas.w, p.canvas.h]).toEqual([1080, 1350]);
  expect(p.layers.filter(l => l.kind === 'text').length).toBeGreaterThanOrEqual(3);
  await finalRender(page);
  await fshot(page, '5-cartel-vista');
  // preview = export: the PNG at 1× is the final view at 100 %, pixel for pixel
  await atFullSize(page);
  const ex = await openExport(page);
  const png = await exportPng(page, ex);
  keep(png.path, '5-cartel.png');
  const cmp = await compareWithArt(page, readFileSync(png.path));
  expect(cmp.size).toEqual([1080, 1350, 1080, 1350]);
  expect(cmp.differ).toBe(0);
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ 6 */

test('6 · animación invertida: los cuadros del clip al revés son los de ida en orden inverso', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = await openFoto(page);
  await startFromPhoto(page, PHOTO);
  await addLayer(page, /Caracteres reales/);
  await page.getByRole('region', { name: /^Ajustes de/ }).getByRole('button', { name: 'Animar…' }).click();
  const lib = page.getByRole('dialog', { name: /^Animar/ });
  await expect(lib.locator('.tl-card[data-item="foto-a-ascii"]')).toBeVisible({ timeout: 30_000 });
  await lib.locator('.tl-card[data-item="foto-a-ascii"]').click();
  await expect(lib).toBeHidden();
  const clip = (await project(page) as unknown as { layers: Array<{ clips: Array<{ start: number; dur: number; reverse: boolean }> }> }).layers[1].clips[0];
  expect(clip.reverse).toBe(false);
  const at = async (t: number) => {
    await page.evaluate(x => (window as unknown as W).__foto.ps.setTime(x), t);
    return (await settle(page, 0.5)).hash;
  };
  const xs = [0.125, 0.375, 0.625, 0.875];
  const forward: string[] = [];
  for (const x of xs) forward.push(await at(clip.start + x * clip.dur));
  // the clip changes the picture over time (these are not four copies of one frame)
  expect(new Set(forward).size).toBeGreaterThanOrEqual(3);
  await page.evaluate(t => (window as unknown as W).__foto.ps.setTime(t), clip.start + 0.375 * clip.dur);
  await page.evaluate(() => (window as unknown as W).__foto.release());
  await finalRender(page);
  await fshot(page, '6-ida');
  // «Al revés» from the clip in the timeline
  const tl = page.getByRole('region', { name: 'Línea de tiempo' });
  await tl.locator('.tl-clip').first().click();
  await page.getByRole('switch', { name: /^Al revés/ }).click();
  await expect.poll(async () => (await project(page) as unknown as { layers: Array<{ clips: Array<{ reverse: boolean }> }> }).layers[1].clips[0].reverse).toBe(true);
  await page.keyboard.press('Escape');
  await expect(tl.locator('.tl-clip.rev')).toHaveCount(1);
  const backward: string[] = [];
  for (const x of xs) backward.push(await at(clip.start + (1 - x) * clip.dur));
  // the frame at (1 − x) of the reversed clip is the frame at x of the forward one
  expect(backward).toEqual(forward);
  await page.evaluate(t => (window as unknown as W).__foto.ps.setTime(t), clip.start + 0.625 * clip.dur);
  await page.evaluate(() => (window as unknown as W).__foto.release());
  await finalRender(page);
  await fshot(page, '6-vuelta');
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ 7 */

test('7 · reapertura de proyecto: se guarda solo, se recarga y se abre desde su archivo con los mismos píxeles', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Cartel editorial/ }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
  // a change of our own: a zone on the ASCII layer
  await page.locator('.lr', { hasText: 'Zona tramada' }).locator('.lr-main').click();
  await page.getByRole('button', { name: '+ Zona elíptica' }).click();
  const before = await project(page);
  const h = await settle(page);
  await expect(page.locator('.fsave')).toHaveText('guardado', { timeout: 30_000 });
  await fshot(page, '7-antes');
  await page.reload();
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  expect(JSON.stringify(await project(page))).toBe(JSON.stringify(before));
  expect((await settle(page, h.scale)).hash).toBe(h.hash);
  // the project file (.glyphos.zip), opened as a new project: the same layers and pixels
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const file = await download(page, () => page.getByRole('button', { name: 'Descargar el proyecto (.glyphos.zip)' }).click());
  expect(file.name).toMatch(/\.glyphos\.zip$/);
  keep(file.path, '7-proyecto.glyphos.zip');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Proyectos' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Abrir un proyecto' }).click();
  await (await chooser).setFiles(file.path);
  await expect(page.locator('.fv-art')).toBeVisible();
  await expect.poll(async () => (await project(page))?.id ?? before.id).not.toBe(before.id);
  await finalRender(page);
  const q = await project(page);
  expect(q.layers.map(l => [l.kind, l.name])).toEqual(before.layers.map(l => [l.kind, l.name]));
  expect((await settle(page, h.scale)).hash).toBe(h.hash);
  await page.evaluate(() => (window as unknown as W).__foto.release());
  await finalRender(page);
  await fshot(page, '7-reabierto');
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ 8 */

/** Drops a file on the lab's stage, like dragging it from the desktop. */
async function dropOnLab(page: Page, name: string, type: string, data: Buffer) {
  await page.evaluate(({ name, type, b64 }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { name, type, b64: data.toString('base64') });
}

test('8 · recetas anteriores: versiones 1–4 del generador, receta del laboratorio original, proyecto .monotrama, sesión vieja y enlace #r= se abren; «Llevar al estudio de foto» también', async ({ page }) => {
  test.setTimeout(480_000);
  const v1gen = JSON.parse(readFileSync(join(import.meta.dirname, '../unit/fixtures/generator-v1.json'), 'utf8')) as { cases: Array<{ seed: string; space: string; recipe: Record<string, unknown> }> };
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  // seeds woven by each version of the generator (links with gen=1…4)
  for (const gen of [1, 2, 3, 4]) {
    await page.goto('about:blank');
    await openStudio(page, `#seed=faro-lunar-417&space=arte&gen=${gen}`);
    expect(await seedText(page)).toBe('faro-lunar-417');
    await page.keyboard.press('e');
    const out = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await out.getByRole('tab', { name: 'Receta' }).click();
    await expect(out.locator('.seed-big')).toContainText(`generador v${gen}`);
    await page.keyboard.press('Escape');
    await shot(page, `8-generador-v${gen}`);
  }
  // a recipe saved by the original single-file lab (its own settings format)
  const original = { source: 'pattern', patA: 7, patB: 0, blend: 2, mix: 0.45, scale: 1, scaleB: 1.4, speed: 1, speedB: 0.4, rot: 0, warp: 0,
    mouse: 0.4, cell: 14, aspect: 1.3, charset: ' .:-=+*#%@', sortDensity: true, font: 'vt', weight: 400, glyph: 1, bright: 0, contrast: 1.35,
    gamma: 1, invert: false, dither: 0, edge: 0, colorMode: 1, colA: '#c8ffd8', colB: '#0a5a26', bg: '#000000', sat: 1, hue: 0, vivid: 0.5,
    cycle: 0, cellBg: 0, glow: 0.6, scan: 0.2, vig: 0.5, paused: false, mediaSrc: '' };
  await dropOnLab(page, 'ajustes-originales.json', 'application/json', Buffer.from(JSON.stringify(original)));
  await expect(page.locator('.toast').filter({ hasText: 'Receta abierta' })).toBeVisible();
  await shot(page, '8-receta-original');
  // a #r= link (the recipe in the address) of a piece of generator version 1
  const r1 = v1gen.cases[0].recipe;
  await page.goto('about:blank');
  await openStudio(page, '#r=j' + Buffer.from(JSON.stringify(r1)).toString('base64url'));
  await expect(page.locator('.toast').filter({ hasText: 'Pieza abierta desde un enlace' })).toBeVisible();
  await shot(page, '8-enlace-r');
  // a session saved by the previous version (Monotrama, no scope)
  const session = { monotrama: 'session', version: 1, exported: '2026-09-01T10:00:00.000Z', cursor: 0, entries: [{ id: 'e-viejo', recipe: r1, origin: r1, kind: 'inicio', space: 'fondos', created: 1, edited: false }], favorites: [], media: [] };
  const sessZip = Buffer.from(await (await zip([{ name: 'sesion.json', data: JSON.stringify(session) }])).arrayBuffer());
  await page.getByRole('button', { name: /Colección/ }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Abrir sesión' }).click()]);
  await chooser.setFiles({ name: 'monotrama-sesion-2026-09-01.zip', mimeType: 'application/zip', buffer: sessZip });
  await expect(page.locator('.toast').filter({ hasText: /Sesión abierta/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await shot(page, '8-sesion-vieja');
  // a project saved as Monotrama (receta.monotrama.json) with its photo
  const photo = readFileSync(PHOTO);
  const oldRecipe = { ...r1, source: 'image', media: { ...(r1.media as Record<string, unknown>), ref: { kind: 'image', name: 'retrato-pelo.jpg', type: 'image/jpeg', w: 1024, h: 858 } }, meta: { ...(r1.meta as Record<string, unknown>), name: 'Retrato de Monotrama', space: 'media' } };
  const projZip = Buffer.from(await (await zip([
    { name: 'receta.monotrama.json', data: JSON.stringify({ monotrama: 'recipe', version: 2, recipe: oldRecipe }) },
    { name: 'medios/retrato-pelo.jpg', data: new Uint8Array(photo) },
  ])).arrayBuffer());
  await dropOnLab(page, 'retrato.monotrama.zip', 'application/zip', projZip);
  await expect(page.locator('.toast').filter({ hasText: 'Proyecto abierto' })).toBeVisible();
  await expect(page.locator('.prompt .card')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await shot(page, '8-proyecto-monotrama');
  // «Llevar al estudio de foto» with that old project: its photo and an ASCII layer with its recipe
  const sw = page.getByRole('navigation', { name: 'Estudios de GLYPHOS' });
  await sw.getByRole('button', { name: /Foto y video|Foto/ }).click();
  await page.getByRole('menuitem', { name: /Llevar al estudio de foto/ }).click();
  await page.waitForURL(/\/studio\/foto\/\?*#p=/, { timeout: 45_000 });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await page.goto(page.url().replace('/studio/foto/', '/studio/foto/?qa'));
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'ascii']);
  expect(p.name).toBe('Retrato de Monotrama');
  await fshot(page, '8-llevado-al-estudio-de-foto');
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ 9 */

type Pt = { x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
  if (type === 'touchEnd') await new Promise(r => setTimeout(r, 450));
}
async function swipe(client: CDPSession, a: Pt, b: Pt, n = 6) {
  await touch(client, 'touchStart', [a]);
  for (let i = 1; i <= n; i++) await touch(client, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }]);
  await touch(client, 'touchEnd', []);
}

test('9 · experiencia móvil vertical (390×844): empezar, una foto, una herramienta con el dedo, el dado, exportar', async ({ browser }) => {
  test.setTimeout(420_000);
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'] as typeof devices['Pixel 7'] & { defaultBrowserType?: string };
  const context = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = await openFoto(page);
  await shot(page, '9-movil-inicio');
  // nothing wider than the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').tap();
  await (await chooser).setFiles(PHOTO);
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  await fshot(page, '9-movil-foto');
  // immersive: the art and four actions within the thumb's reach
  const bar = page.getByRole('navigation', { name: 'Acciones' });
  for (const n of ['Versión anterior', 'Azar', 'Siguiente (al final, azar)', 'Herramientas']) {
    const b = (await bar.getByRole('button', { name: n, exact: true }).boundingBox())!;
    expect(b.y).toBeGreaterThan(844 * 0.8);
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  // a layer of characters from the sheet, then the rectangle with one finger
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  const sheet = page.getByRole('region', { name: 'Herramientas y capas' });
  await sheet.getByRole('tab', { name: 'Capas' }).tap();
  await sheet.getByRole('button', { name: 'Añadir capa' }).tap();
  await page.getByRole('menuitem', { name: /Caracteres reales/ }).tap();
  await expect.poll(async () => (await project(page)).layers.length).toBe(2);
  await sheet.getByRole('tab', { name: 'Herramientas' }).tap();
  await sheet.getByRole('button', { name: 'Rectángulo (M)' }).tap();
  await fshot(page, '9-movil-herramientas');
  await page.getByRole('button', { name: 'Cerrar la hoja' }).tap();
  const client = await context.newCDPSession(page);
  await swipe(client, await framePoint(page, 0.25, 0.2), await framePoint(page, 0.75, 0.8));
  await expect.poll(async () => (await project(page)).layers[1].mask?.parts.length).toBe(1);
  await finalRender(page);
  await fshot(page, '9-movil-zona');
  // the dice: a new version of the characters' style
  const style0 = JSON.stringify((await project(page) as unknown as { layers: Array<{ glyphs?: unknown }> }).layers[1].glyphs);
  await bar.getByRole('button', { name: 'Azar', exact: true }).tap();
  await expect.poll(async () => JSON.stringify((await project(page) as unknown as { layers: Array<{ glyphs?: unknown }> }).layers[1].glyphs)).not.toBe(style0);
  await finalRender(page);
  await fshot(page, '9-movil-azar');
  // export from the sheet's «Explorar»
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  await sheet.getByRole('tab', { name: 'Explorar' }).tap();
  await sheet.getByRole('button', { name: 'Exportar' }).tap();
  const ex = page.getByRole('dialog', { name: 'Exportar' });
  await expect(ex.locator('.xp-fmts')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await fshot(page, '9-movil-exportar');
  const png = await download(page, () => ex.getByRole('button', { name: 'Exportar PNG' }).tap());
  expect(png.name).toMatch(/\.png$/);
  const a = await alphaOf(page, readFileSync(png.path));
  expect([a.w, a.h]).toEqual([1024, 858]);
  expect(errors).toEqual([]);
  await context.close();
});
