import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer as httpServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { fileUrl, MODELS, variantFiles } from '../../src/cutout/models';
import { download } from './helpers';
import { PHOTO, PHOTO2, finalRender, framePoint, meanIn, openFoto, project, settle } from './foto-helpers';

/**
 * Video editing in the photo and video studio (/studio/foto/, production build), with test clips made in the page
 * (window.__fotoVideo, src/foto/videoqa.ts): lane video's synthetic clip — a square moving over a textured
 * background, the frame number as a binary strip at the top left, a 440 Hz tone from 0.5 s (VP9 + Opus WebM) — and
 * the CC0 portrait of tests/fixtures panning sideways. Everything goes through the real UI: the file chooser, the
 * timeline's transport, the tool palette, the «Recorte» panel, the export sheet, the camera sheet.
 *
 *   - playback: the video clock (the element's time is the project's time; sound on forward, muted in reverse), a
 *     loop region, the speed; paused, every frame the viewport shows is the frame of its time (its strip number);
 *   - tracking with the real point-selection model from the local copy, IoU per frame against the square the clip
 *     was drawn with, one correction that recomputes only its stretch, the keyframes as ticks on the timeline, an
 *     ASCII style only on the tracked object and another style on a time segment;
 *   - MP4/WebM from the export sheet: decoded frames ≈ render(t) (codec loss only, and the right frame), the tone
 *     present and in sync; «Sonido de» with two videos; photo sequences to MP4/WebM/GIF;
 *   - video background removal on the panning portrait (small and time-bounded: 6 frames) with consent and cancel;
 *   - a clip from Chromium's fake camera that keeps the mirror the preview shows;
 *   - the cost of tracked masks in the compositor (every picture decoded per frame before, one or two now).
 *
 * Thresholds, and why:
 *   - tracking IoU: ≥ 0.7 on every frame and ≥ 0.85 on average. The square is 36 px on a 320×180 clip, VP9-blurred over
 *     ~2 px, masks stored at 320 px with a soft edge: a right mask scores 0.85–1.0; one frame late (2.4 px of motion)
 *     ≈0.87; two frames late ≈0.75. The model's own edge differs from the drawn square (lane video measured min 0.89,
 *     mean 0.96 on its page; here min 0.77, mean 0.96), so 0.7 per frame catches a lost or drifting track (it falls
 *     under 0.5 within a few frames) without failing on one soft keyframe edge; the mean catches a general lag.
 *   - movies: PSNR ≥ 26 dB against render(t) (VP9/AV1 at the export bitrate measure 30–38 dB on this busy picture;
 *     lane video's floor), and each frame closer to render(t) than to render(t ± 1 frame); GIF MAE ≤ 14 (256 colours).
 *   - sound: the tone starts where it does in the source (0.5 s) within one Opus frame (20 ms) and keeps 440 Hz within 2 %.
 *   - background removal: IoU ≥ 0.75 per frame against the portrait's hand-drawn outline (lane video: a working matte
 *     ≈0.85, a broken one < 0.5).
 * The model tests need the local copy (.cache/modelos; skipped with the command that makes it otherwise); Hugging Face
 * is never contacted (its pinned URLs are routed to a local file server, as in foto-studio.spec.ts).
 */

type W = Window & { __foto: Record<string, any>; __fotoVideo: Record<string, any>; __fotoExport: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Clip { b64: string; name: string; spec: { w: number; h: number; fps: number; seconds: number; onset: number; freq: number; audio: boolean; size: number }; codec: string }

const MODELS_DIR = resolve(process.env.GLYPHOS_MODELS_DIR ?? '.cache/modelos');
const manifest: { files: Array<{ url: string; source: string }> } | null = existsSync(join(MODELS_DIR, 'manifest.json'))
  ? JSON.parse(readFileSync(join(MODELS_DIR, 'manifest.json'), 'utf8')) : null;
const localBySource = new Map((manifest?.files ?? []).map(f => [f.source, f.url]));
const hasModel = (id: string) => {
  const spec = MODELS.find(m => m.id === id)!;
  return !!spec.wasm && variantFiles(spec.wasm).every(f => { const l = localBySource.get(fileUrl(spec, f)); return !!l && existsSync(join(MODELS_DIR, l)); });
};
const NEED = (id: string) => `Faltan los archivos locales de «${id}» en ${MODELS_DIR}: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm --only select,portrait`;
/** Screenshots of the flow go here when GLYPHOS_SHOTS names a folder (they are for people, not assertions). */
const SHOTS = process.env.GLYPHOS_SHOTS ?? '';
const shot = async (page: Page, name: string) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `${name}.png`) }); };

// (Chromium's fake camera and microphone for the camera test: harmless for the others)
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

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

const V = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as W).__fotoVideo[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const storeTime = (page: Page) => page.evaluate(() => (window as unknown as W).__foto.store().time as number);
interface PlayState { clock: string; playing: boolean; reverse: boolean; rate: number; t: number; srcTime: number | null; elements: Array<{ muted: boolean; paused: boolean; time: number; rate: number }> }
const playState = (page: Page) => V<PlayState>(page, 'playState');

/** Makes the synthetic clip in the page and opens it through the start screen's file chooser. */
async function openClip(page: Page, o: Partial<Clip['spec']> = {}): Promise<Clip> {
  await page.waitForFunction(() => !!(window as unknown as W).__fotoVideo, null, { timeout: 30_000 });
  const c = await V<Clip>(page, 'clip', o);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').click();
  await (await chooser).setFiles({ name: c.name, mimeType: 'video/webm', buffer: Buffer.from(c.b64, 'base64') });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  return c;
}

/** Drops a file on the studio (as a person drags it from the desktop): in the editor it becomes a new layer. */
async function dropFile(page: Page, name: string, type: string, b64: string) {
  await page.evaluate(([n, t, d]) => {
    const f = new File([Uint8Array.from(atob(d), c => c.charCodeAt(0))], n, { type: t });
    const dt = new DataTransfer();
    dt.items.add(f);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [name, type, b64] as const);
}

async function addAscii(page: Page): Promise<string> {
  const n = (await project(page)).layers.length;
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect.poll(async () => (await project(page)).layers.length).toBe(n + 1);
  await finalRender(page);
  return (await project(page)).layers[n].id;
}

/** The frame number the viewport shows (the clip's binary strip), read from a render at 100 %. */
async function stripShown(page: Page): Promise<number> {
  await settle(page, 1);
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.fv-art')!;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    const b = Math.max(6, Math.round(8 * (c.width / 320)));
    let v = 0;
    for (let bit = 0; bit < 10; bit++) {
      const d = x.getImageData(Math.floor(bit * b + b / 2), Math.floor(b / 2), 1, 1).data;
      if (d[0] + d[1] + d[2] > 384) v |= 1 << bit;
    }
    return v;
  });
}
const release = (page: Page) => page.evaluate(() => (window as unknown as W).__foto.release());

test('reproducir un video: el reloj es el video (con su sonido), al revés sin sonido, región en bucle y velocidad; cada cuadro es el de su tiempo', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openFoto(page);
  const c = await openClip(page);
  const p0 = await page.evaluate(() => (window as unknown as W).__foto.project());
  // the file's own frame rate and sound were read on opening
  expect(p0.time.fps).toBeCloseTo(30, 1);
  expect(p0.sources[0].hasAudio).toBe(true);
  expect(p0.time.duration).toBeCloseTo(3, 1);
  const tl = page.getByRole('region', { name: 'Línea de tiempo' });
  await expect(tl).toBeVisible({ timeout: 30_000 });
  expect((await playState(page)).clock).toBe('video');

  // paused: each frame shown is the frame of its time (WebM stores 1 ms ticks: 86/30 s is stored at 2.867 s)
  expect(await stripShown(page)).toBe(0);
  await tl.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  expect(Math.round((await storeTime(page)) * 30)).toBe(5);
  expect(await stripShown(page)).toBe(5);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  expect(Math.round((await storeTime(page)) * 30)).toBe(65);
  expect(await stripShown(page)).toBe(65);
  await page.keyboard.press('Home');
  await release(page);

  // forward: the clock video plays with its sound and the project's time follows it
  await tl.getByRole('button', { name: 'Reproducir', exact: true }).click();
  const samples: PlayState[] = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(250); samples.push(await playState(page)); }
  for (const s of samples) {
    expect(s.playing).toBe(true);
    const clock = s.elements.find(e => !e.paused)!;
    expect(clock, 'el video que marca el tiempo está reproduciéndose').toBeTruthy();
    expect(clock.muted, 'se oye hacia delante').toBe(false);
    // the picture drawn is at most a couple of frames from what is heard (renders are waited for, never queued)
    expect(Math.abs(clock.time - (s.srcTime ?? 0))).toBeLessThan(0.25);
  }
  expect(samples[5].t).toBeGreaterThan(samples[0].t + 0.6);
  await shot(page, 'reproducir');
  await tl.getByRole('button', { name: 'Pausar' }).click();
  await expect.poll(async () => (await playState(page)).playing).toBe(false);
  const tp = await storeTime(page);
  expect(await stripShown(page)).toBe(Math.round(tp * 30));
  await release(page);

  // backwards: no sound, the elements paused and seeked, the time goes down
  await tl.getByRole('button', { name: 'Reproducir al revés' }).click();
  await page.waitForTimeout(700);
  const r = await playState(page);
  expect(r.reverse).toBe(true);
  expect(r.elements.every(e => e.muted && e.paused)).toBe(true);
  expect(r.t).toBeLessThan(tp);
  await tl.getByRole('button', { name: 'Reproducir al revés' }).click();

  // a loop region: playing stays inside it and wraps
  await page.keyboard.press('Home');
  await tl.focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
  await tl.getByRole('button', { name: 'Región de bucle' }).click();
  const region = await page.evaluate(() => (window as unknown as W).__foto.clock().region as { in: number; out: number });
  expect(region.in).toBeCloseTo(0.5, 2);
  expect(region.out).toBeGreaterThan(region.in + 0.5);
  await tl.getByRole('button', { name: 'Reproducir', exact: true }).click();
  const ts: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < (region.out - region.in) * 1000 + 1500) { ts.push((await playState(page)).t); await page.waitForTimeout(120); }
  for (const t of ts) { expect(t).toBeGreaterThanOrEqual(region.in - 0.05); expect(t).toBeLessThanOrEqual(region.out + 0.05); }
  expect(ts.some((t, i) => i > 0 && t < ts[i - 1] - 0.2), 'la región vuelve a empezar').toBe(true);
  // speed: the elements play at the chosen rate
  await tl.getByRole('combobox', { name: 'Velocidad' }).selectOption('2');
  await page.waitForTimeout(300);
  expect((await playState(page)).elements.find(e => !e.paused)?.rate).toBe(2);
  await tl.getByRole('button', { name: 'Pausar' }).click();
  expect(c.spec.audio).toBe(true);
  expect(errors).toEqual([]);
});

test('seguir el cuadrado con el modelo real: marca, «Seguir», IoU por cuadro, una corrección que sólo rehace su tramo, marcas en la línea de tiempo; ASCII sólo en el objeto y otro estilo en un tramo', async ({ page, context }) => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(900_000);
  await routeModels(context);
  const errors = await openFoto(page);
  const c = await openClip(page);
  const ascii = await addAscii(page);
  const video = (await project(page)).layers[0].id;
  // the tool: T over the art
  await page.locator('.fv-over').hover();
  await page.keyboard.press('t');
  const opts = page.locator('.tool-opts[data-tool="seguir"]');
  await expect(opts).toBeVisible();
  // the selection model asks first (nothing downloaded without consent), then analyses this frame
  await expect(opts.getByRole('heading', { name: /¿Descargar/ })).toBeVisible({ timeout: 30_000 });
  await shot(page, 'seguir-permiso');
  await opts.getByRole('button', { name: /^Descargar/ }).click();
  await expect(opts).toContainText('Toca el objeto', { timeout: 180_000 });
  const q = await V<{ x: number; y: number }>(page, 'squareAt', c.spec, 0);
  const at = await framePoint(page, (q.x + c.spec.size / 2) / c.spec.w, (q.y + c.spec.size / 2) / c.spec.h);
  await page.mouse.click(at.x, at.y);
  await expect(opts.locator('.tool-points')).toContainText('1 +');
  // the model's mask of this frame shows before anything is followed
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__foto.sched().preview), { timeout: 60_000 }).toBe(true);
  await expect(opts).toContainText(/90 cuadros · \d+–\d+ (s|min)/);
  await shot(page, 'seguir-marcado');
  await opts.getByRole('button', { name: /^Seguir/ }).click();
  await expect(opts.getByRole('progressbar')).toBeVisible();
  await shot(page, 'seguir-progreso');
  await expect.poll(async () => ((await project(page)).layers[1].mask?.parts ?? []).length, { timeout: 600_000 }).toBe(1);
  const part = (await project(page)).layers[1].mask!.parts[0];
  expect(part).toMatchObject({ kind: 'raster', origin: 'track', op: 'add' });
  const sc = await V<{ scores: number[]; names: string[]; ids: string[]; times: number[] }>(page, 'trackScores', ascii, 0, c.spec);
  expect(sc.scores.length).toBe(90);
  const mean = sc.scores.reduce((a, b) => a + b, 0) / sc.scores.length;
  expect(Math.min(...sc.scores), `IoU por cuadro: ${sc.scores.join(' ')}`).toBeGreaterThanOrEqual(0.7);
  expect(mean).toBeGreaterThanOrEqual(0.85);
  const keys = sc.names.filter(n => /-(clave|correccion|oculto)\.png$/.test(n)).length;
  expect(keys).toBe(7);

  // the timeline: the track's keyframes as ticks on the layer's row; a click goes there
  const tl = page.getByRole('region', { name: 'Línea de tiempo' });
  const ticks = tl.locator('.tl-tk');
  await expect(ticks).toHaveCount(7);
  await ticks.nth(3).click();
  await expect.poll(() => storeTime(page)).toBeCloseTo(1.5, 2);
  await shot(page, 'seguir-marcas');

  // a correction on frame 36 (between the keyframes 30 and 45): only that stretch is computed again
  await tl.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.round((await storeTime(page)) * 30)).toBe(36);
  await expect(opts.getByRole('button', { name: 'Corregir aquí' })).toBeEnabled();
  await opts.getByRole('button', { name: 'Corregir aquí' }).click();
  await expect(opts).toContainText('Corregir en 0:01,2');
  await expect(opts).toContainText('Se recalcula sólo de 0:01,0 a 0:01,5');
  const q2 = await V<{ x: number; y: number }>(page, 'squareAt', c.spec, 36 / 30);
  const at2 = await framePoint(page, (q2.x + c.spec.size / 2) / c.spec.w, (q2.y + c.spec.size / 2) / c.spec.h);
  await page.mouse.click(at2.x, at2.y);
  await expect(opts.locator('.tool-points')).toContainText('1 +', { timeout: 60_000 });
  await shot(page, 'corregir');
  await opts.getByRole('button', { name: 'Aplicar la corrección' }).click();
  await expect.poll(async () => (await V<{ names: string[] }>(page, 'trackScores', ascii, 0, c.spec)).names[36], { timeout: 300_000 }).toBe('pista-000036-correccion.png');
  const after = await V<{ scores: number[]; names: string[]; ids: string[] }>(page, 'trackScores', ascii, 0, c.spec);
  after.ids.forEach((id, i) => { if (i <= 30 || i >= 45) expect(id, `cuadro ${i} fuera del tramo`).toBe(sc.ids[i]); });
  expect(after.ids.slice(31, 45).some((id, k) => id !== sc.ids[31 + k])).toBe(true);
  expect(Math.min(...after.scores.slice(31, 45))).toBeGreaterThanOrEqual(0.7);
  await expect(ticks).toHaveCount(8);
  await expect(tl.locator('.tl-tk.correccion')).toHaveCount(1);
  // one undo step takes the correction back, redo brings it
  await page.locator('.fv-over').hover();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await V<{ names: string[] }>(page, 'trackScores', ascii, 0, c.spec)).names[36]).toBe(sc.names[36]);
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () => (await V<{ names: string[] }>(page, 'trackScores', ascii, 0, c.spec)).names[36]).toBe('pista-000036-correccion.png');
  await page.keyboard.press('Escape');

  // the ASCII style only on the object: hiding that layer changes the square, not the rest
  await tl.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  const q3 = await V<{ x: number; y: number }>(page, 'squareAt', c.spec, 20 / 30);
  const inside = [(q3.x + 8) / c.spec.w, (q3.y + 8) / c.spec.h, 20 / c.spec.w, 20 / c.spec.h] as const;
  const outside = [0.7, 0.6, 0.2, 0.3] as const;
  await settle(page, 1);
  const withA = { in: await meanIn(page, ...inside), out: await meanIn(page, ...outside) };
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = false; }), ascii);
  await settle(page, 1);
  const without = { in: await meanIn(page, ...inside), out: await meanIn(page, ...outside) };
  const dist = (a: number[], b: number[]) => Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i])));
  expect(dist(withA.in, without.in), 'el objeto seguido cambia con la capa ASCII').toBeGreaterThan(12);
  expect(dist(withA.out, without.out), 'fuera del objeto, nada cambia').toBeLessThan(1.5);
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = true; }), ascii);

  // another style on a time segment (1–2 s): nothing before it, there inside it
  const seg = await addAscii(page);
  await page.evaluate(([id]) => (window as unknown as W).__foto.ps.updateLayer(id, (l: { span: unknown; opacity: number }) => { l.span = { in: 1, out: 2 }; l.opacity = 0.9; }), [seg]);
  await tl.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
  const hA = (await settle(page, 1)).hash;
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = false; }), seg);
  expect((await settle(page, 1)).hash, 'antes del tramo la segunda capa no se ve').toBe(hA);
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = true; }), seg);
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  const hB = (await settle(page, 1)).hash;
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = false; }), seg);
  expect((await settle(page, 1)).hash, 'dentro del tramo sí').not.toBe(hB);
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { visible: boolean }) => { l.visible = true; }), seg);
  await release(page);
  await shot(page, 'dos-estilos');
  expect(video).toBeTruthy();
  expect(errors).toEqual([]);
});

type MovieCmp = Array<{ t: number; mae: number; psnr: number; maePrev: number | null; maeNext: number | null }>;
function expectFrames(cmp: MovieCmp, o: { minPsnr?: number; maxMae?: number }) {
  expect(cmp.length).toBeGreaterThanOrEqual(3);
  for (const f of cmp) {
    if (o.minPsnr !== undefined) expect(f.psnr, `t=${f.t}`).toBeGreaterThanOrEqual(o.minPsnr);
    if (o.maxMae !== undefined) expect(f.mae, `t=${f.t}`).toBeLessThanOrEqual(o.maxMae);
    if (f.maePrev !== null && Number.isFinite(f.maePrev)) expect(f.mae, `t=${f.t} frente al cuadro anterior`).toBeLessThan(f.maePrev);
    if (f.maeNext !== null && Number.isFinite(f.maeNext)) expect(f.mae, `t=${f.t} frente al cuadro siguiente`).toBeLessThan(f.maeNext);
  }
}
const MIME: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', zip: 'application/zip' };
const OPUS_FRAME = 0.02;

async function openExport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Exportar' });
  await expect(sheet.locator('.xp-fmts')).toBeVisible({ timeout: 30_000 });
  return sheet;
}
const exportNow = (page: Page, sheet: Locator) => download(page, () => sheet.locator('.xp-btns .btn.primary').click());

test('exportar MP4 y WebM con sonido desde el estudio: los cuadros son render(t) y el tono suena a tiempo; «Sonido de» elige el video', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openFoto(page);
  const c = await openClip(page);
  await addAscii(page);
  // (a lighter layer over the video: half opacity, only the lower half)
  const p = await project(page);
  await page.evaluate(id => (window as unknown as W).__foto.ps.updateLayer(id, (l: { opacity: number; mask: unknown }) => {
    l.opacity = 0.6;
    l.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0, y: 0.5, w: 1, h: 0.5, rot: 0, soft: 0, alpha: 1 }] };
  }), p.layers[1].id);
  await finalRender(page);
  let sheet = await openExport(page);
  const formats = await page.evaluate(() => (window as unknown as W).__fotoExport.movieFormats()) as Array<{ format: string; available: boolean; audio: boolean }>;
  // (this Chromium writes WebM with Opus: the sound check below is not skipped)
  expect(formats.find(f => f.format === 'webm')).toMatchObject({ available: true, audio: true });
  let checked = 0;
  for (const fmt of ['webm', 'mp4']) {
    const radio = sheet.locator(`input[name="xp-format"][value="${fmt}"]`);
    if (!(await radio.isEnabled())) continue;
    await radio.check();
    await expect(sheet.locator('.xp-sum')).toContainText('90 cuadros');
    await sheet.getByRole('radio', { name: 'Conservar el del video' }).check();
    // one video with sound: no «Sonido de»
    await expect(sheet.getByRole('combobox', { name: 'Sonido de' })).toHaveCount(0);
    const file = await exportNow(page, sheet);
    const b64 = readFileSync(file.path).toString('base64');
    const info = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.inspectMovie(d, t), [b64, MIME[fmt]] as const);
    expect(info.video.frames).toBe(90);
    expect([info.video.w, info.video.h]).toEqual([320, 180]);
    if (formats.find(f => f.format === fmt)?.audio) {
      const tone = await V<{ onsets: number[]; freq: number; start: number; videoStart: number } | null>(page, 'tone', b64, MIME[fmt]);
      expect(tone, 'el archivo trae sonido').toBeTruthy();
      // in sync: where it starts in the source (0.5 s), measured on the picture's clock
      expect(Math.abs(tone!.onsets[0] - tone!.videoStart - c.spec.onset)).toBeLessThan(OPUS_FRAME);
      expect(Math.abs(tone!.freq - 440) / 440).toBeLessThan(0.02);
    }
    const cmp: MovieCmp = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.compareMovie(d, t, { fps: 30, start: 0, end: 3, width: 320, transparent: false, times: [0, 1, 1.5, 2.9] }), [b64, MIME[fmt]] as const);
    expectFrames(cmp, { minPsnr: 26 });
    await expect(sheet.locator('.xp-res')).toContainText(/[Ss]onido/);
    await shot(page, `exportar-${fmt}`);
    checked++;
  }
  expect(checked, 'ningún formato de video disponible aquí').toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  // a second video with another sound (660 Hz from 1 s), dropped in as a layer: «Sonido de» appears and picks it
  const c2 = await V<Clip>(page, 'clip', { onset: 1, freq: 660, seconds: 3 });
  await dropFile(page, 'otro-sonido.webm', 'video/webm', c2.b64);
  await expect.poll(async () => (await project(page)).sources.length).toBe(2);
  await finalRender(page);
  sheet = await openExport(page);
  const webm = sheet.locator('input[name="xp-format"][value="webm"]');
  if (await webm.isEnabled()) {
    await webm.check();
    const pick = sheet.getByRole('combobox', { name: 'Sonido de' });
    await expect(pick).toBeVisible({ timeout: 30_000 });
    await pick.click();
    await page.getByRole('listbox').getByRole('option', { name: /otro-sonido/ }).click();
    await expect(sheet).toContainText('Sale el sonido de un solo video, sin mezclar: «otro-sonido.webm»');
    await shot(page, 'exportar-sonido-de');
    const file = await exportNow(page, sheet);
    const tone = await V<{ onsets: number[]; freq: number; videoStart: number } | null>(page, 'tone', readFileSync(file.path).toString('base64'), 'video/webm');
    expect(tone).toBeTruthy();
    expect(Math.abs(tone!.onsets[0] - tone!.videoStart - 1)).toBeLessThan(OPUS_FRAME);
    expect(Math.abs(tone!.freq - 660) / 660).toBeLessThan(0.02);
  }
  expect(errors).toEqual([]);
});

test('una secuencia de fotos sale en MP4, WebM y GIF desde la hoja, cuadro a cuadro', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openFoto(page);
  await page.waitForFunction(() => !!(window as unknown as W).__fotoVideo, null, { timeout: 30_000 });
  const photos = [PHOTO, PHOTO2, PHOTO].map(f => readFileSync(f).toString('base64'));
  const seq = await V<{ frames: number; duration: number }>(page, 'sequenceProject', photos, 0.25);
  expect(seq).toEqual({ frames: 3, duration: 0.75 });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const sheet = await openExport(page);
  const p = await project(page) as unknown as { canvas: { w: number; h: number } };
  let done = 0;
  for (const fmt of ['mp4', 'webm', 'gif']) {
    const radio = sheet.locator(`input[name="xp-format"][value="${fmt}"]`);
    await expect(radio).toBeVisible({ timeout: 30_000 });
    if (!(await radio.isEnabled())) continue;
    await radio.check();
    await expect(sheet.locator('.xp-sum')).toContainText('9 cuadros');
    const file = await exportNow(page, sheet);
    const b64 = readFileSync(file.path).toString('base64');
    const info = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.inspectMovie(d, t), [b64, MIME[fmt]] as const);
    if (fmt === 'gif') expect(info.gif.frames).toBe(9); else expect(info.video.frames).toBe(9);
    const w = fmt === 'gif' ? p.canvas.w : p.canvas.w - (p.canvas.w % 2);
    const cmp: MovieCmp = await page.evaluate(([d, t, ww]) => (window as unknown as W).__fotoExport.compareMovie(d, t, { fps: 12, start: 0, end: 0.75, width: ww, transparent: false, times: [0, 0.25, 0.5] }), [b64, MIME[fmt], w] as const);
    // (neighbouring frames of a sequence are the same photo: only codec loss is checked here)
    for (const f of cmp) {
      if (fmt === 'gif') expect(f.mae, `t=${f.t}`).toBeLessThanOrEqual(14);
      else expect(f.psnr, `t=${f.t}`).toBeGreaterThanOrEqual(26);
    }
    done++;
  }
  expect(done).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('quitar el fondo del video con el modelo de retrato: estimación antes, permiso, cancelar, la máscara del sujeto cuadro a cuadro', async ({ page, context }) => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(600_000);
  await routeModels(context);
  const errors = await openFoto(page);
  await page.waitForFunction(() => !!(window as unknown as W).__fotoVideo, null, { timeout: 30_000 });
  const clip = await V<{ b64: string; name: string }>(page, 'portraitClip', readFileSync(PHOTO).toString('base64'));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').click();
  await (await chooser).setFiles({ name: clip.name, mimeType: 'video/webm', buffer: Buffer.from(clip.b64, 'base64') });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const video = (await project(page)).layers[0];
  await page.locator('.frail .tbtn[data-tool="recorte"]').click();
  const panel = page.locator('.fcut');
  const sec = panel.locator('.cp-video');
  await expect(sec.getByRole('heading', { name: 'Quitar fondo del video' })).toBeVisible({ timeout: 30_000 });
  // the stretch: the first 0.6 s (6 frames at 10 fps), with the arrow keys on «Hasta»
  const hasta = sec.getByRole('slider', { name: 'Hasta' });
  await hasta.focus();
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowLeft');
  await expect(sec).toContainText('6 cuadros con «Retrato»');
  await sec.getByRole('radio', { name: 'Máscara: sujeto' }).click();
  await shot(page, 'fondo-video-estimacion');
  await sec.getByRole('button', { name: 'Quitar fondo del video' }).click();
  // nothing is downloaded before the person says so
  await expect(sec.getByRole('heading', { name: /¿Descargar «Retrato/ })).toBeVisible({ timeout: 30_000 });
  await sec.getByRole('button', { name: /^Descargar .* y quitar el fondo/ }).click();
  await expect(sec.getByRole('progressbar')).toBeVisible({ timeout: 60_000 });
  // cancel once the frames are being matted: nothing changes
  await expect(sec).toContainText(/Preparando el modelo|Quitando el fondo/, { timeout: 120_000 });
  await sec.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sec.getByRole('button', { name: 'Quitar fondo del video' })).toBeVisible({ timeout: 60_000 });
  expect((await project(page)).layers[0].mask).toBeNull();
  // and for real
  await sec.getByRole('button', { name: 'Quitar fondo del video' }).click();
  await shot(page, 'fondo-video-progreso');
  await expect.poll(async () => ((await project(page)).layers[0].mask?.parts ?? []).length, { timeout: 480_000 }).toBe(1);
  const part = (await project(page)).layers[0].mask!.parts[0];
  expect(part).toMatchObject({ kind: 'raster', origin: 'subject', op: 'add' });
  const r = await V<{ scores: number[]; frames: number }>(page, 'portraitScores', video.id, 0);
  expect(r.frames).toBe(6);
  expect(Math.min(...r.scores), r.scores.join(' ')).toBeGreaterThanOrEqual(0.75);
  await finalRender(page);
  await shot(page, 'fondo-video-listo');
  expect(errors).toEqual([]);
});

test('el costo de una máscara seguida: el compositor prepara sólo los cuadros que se ven (antes, todos en cada cuadro)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openFoto(page);
  await openClip(page, { seconds: 1 });
  await addAscii(page);
  const b = await V<{ frames: number; before: { meanMs: number; worstMs: number }; after: { meanMs: number; worstMs: number }; w: number; h: number }>(page, 'benchMasks', { frames: 90, samples: 12, scale: 0.5 });
  console.log(`máscara seguida de ${b.frames} cuadros, render ${b.w}×${b.h}: antes ${b.before.meanMs} ms (peor ${b.before.worstMs}), ahora ${b.after.meanMs} ms (peor ${b.after.worstMs})`);
  expect(b.after.meanMs).toBeLessThan(b.before.meanMs);
  expect(errors).toEqual([]);
});

test.describe('cámara', () => {
  /**
   * Chromium's fake camera writes its clock («00:01:450 29») at the top left of its picture, on a flat green: the side
   * of the recorded file where that text is (the band with the larger spread of brightness) says whether the file is
   * mirrored. The preview of the front camera starts mirrored.
   */
  const clockBands = (page: Page) => V<Array<{ mean: number; sd: number }> | null>(page, 'fileRegions', 0.5, [[0.065, 0.02, 0.14, 0.05], [0.795, 0.02, 0.14, 0.05]]);

  async function recordClip(page: Page, mirror: boolean) {
    await page.getByRole('button', { name: 'Cámara: foto o clip' }).click();
    const sheet = page.getByRole('dialog', { name: 'Cámara' });
    const sw = sheet.getByRole('switch', { name: /Espejo/ });
    await expect(sheet.getByRole('button', { name: 'Grabar un clip' })).toBeEnabled({ timeout: 20_000 });
    if ((await sw.isChecked()) !== mirror) await sw.setChecked(mirror, { force: true });
    await expect(sheet.locator('video')).toHaveCSS('transform', mirror ? /matrix\(-1/ : 'none');
    await sheet.getByRole('button', { name: 'Grabar un clip' }).click();
    await expect(sheet.getByRole('status')).toContainText('Grabando');
    await shot(page, `camara-grabando-${mirror ? 'espejo' : 'sin-espejo'}`);
    await page.waitForTimeout(1500);
    await sheet.getByRole('button', { name: /^Detener/ }).click();
    await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
    await finalRender(page);
    const p = await page.evaluate(() => (window as unknown as W).__foto.project());
    expect(p.name).toBe('Clip de la cámara');
    expect(p.sources[0].kind).toBe('video');
    expect(p.time.duration).toBeGreaterThan(0.8);
    return clockBands(page);
  }

  test('grabar un clip con la cámara falsa: en espejo como se ve, y sin espejo cuando se quita', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openFoto(page);
    await page.waitForFunction(() => !!(window as unknown as W).__fotoVideo, null, { timeout: 30_000 });
    // the front camera starts mirrored, as the preview shows it: the camera's clock text ends up on the right
    const on = await recordClip(page, true);
    expect(on).toBeTruthy();
    expect(on![1].sd, `en espejo, el reloj de la cámara queda a la derecha (${JSON.stringify(on)})`).toBeGreaterThan(on![0].sd + 8);
    // back to the start, the front camera without mirror: the file is not mirrored either
    await page.getByRole('button', { name: 'Proyectos' }).click();
    await expect(page.locator('.fs-drop')).toBeVisible({ timeout: 30_000 });
    const off = await recordClip(page, false);
    expect(off![0].sd, `sin espejo, a la izquierda como la da la cámara (${JSON.stringify(off)})`).toBeGreaterThan(off![1].sd + 8);
    // the choice is kept for this camera (this session)
    expect(await page.evaluate(() => sessionStorage.getItem('glyphos.foto.espejo'))).toContain('"user":false');
    expect(errors).toEqual([]);
  });
});
