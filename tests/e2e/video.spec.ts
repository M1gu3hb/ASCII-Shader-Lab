import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createServer as httpServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ViteDevServer } from 'vite';
import { fileUrl, MODELS, variantFiles } from '../../src/cutout/models';

/**
 * Movie exports, sound, the playback clock and tracking, driven through the QA page dev/video.html (window.vq).
 * The page makes its own test clip with mediabunny at test time: a square moving over a textured background, the
 * frame number as a binary strip at the top left, and a 440 Hz tone that starts at 0.5 s (VP9 + Opus in WebM,
 * what this Chromium encodes). dev/ pages are not in the production build: this spec starts its own Vite dev
 * server (port PW_DEV_PORT, default PW_PORT + 1000), cross-origin isolated for the page (WASM threads for the
 * models). Skipped against a deployed site (BASE_URL).
 *
 * Thresholds, and why:
 *   - exported frames vs render() at the same t: the PNG sequence is lossless, so it must be pixel-identical (MAE 0).
 *     Video and GIF are lossy: VP9/AV1 at the export's bitrate measure 30–38 dB PSNR on this busy synthetic
 *     picture (textured dots under character art); 26 dB is the floor for «same picture, codec loss only». Loss
 *     alone cannot prove the right frame, so each decoded frame must also be closer to render(t) than to render(t ±
 *     1 frame) — a one-frame shift fails that.
 *   - GIF: 256 colours + ordered dithering: MAE ≤ 14 of 255 per channel (measured ≈ 10).
 *   - sound: the tone must start where it starts in the source (0.5 s, or where the plan puts it) within one audio
 *     frame (Opus: 20 ms) and keep its 440 Hz within 2 %; the duration within one audio frame of the picture's.
 *   - background removal (portrait model on the CC0 test portrait panning): IoU ≥ 0.75 per frame against its
 *     hand-drawn outline (a working matte ≈0.85, a broken one < 0.5), and smoothing must lower the frame-to-frame
 *     change of the matte without costing IoU. Needs the local model files (skipped otherwise, like cutout.spec).
 *   - tracking (synthetic square, colour oracle as the model): IoU ≥ 0.8 on every frame. The square is 36 px on a
 *     320×180 frame: its edge is VP9-blurred over ~2 px and the masks are drawn with a soft edge, so a correct mask
 *     scores 0.85–1.0; a mask one frame late (≈2.4 px of motion per frame) still scores ≈0.87, two frames late
 *     ≈0.75 — 0.8 catches a track that lags or drifts more than about a frame and a half.
 */
const remote = !!process.env.BASE_URL;
const port = Number(process.env.PW_DEV_PORT ?? Number(process.env.PW_PORT ?? 4173) + 1000);
const url = `http://127.0.0.1:${port}/dev/video.html`;

test.describe.configure({ mode: 'serial' });
test.skip(remote, 'dev pages only exist in the dev server');

let server: ViteDevServer | null = null;
let page: Page;

/* local model files (see tests/e2e/cutout.spec.ts): Hugging Face is never contacted */
const MODELS_DIR = resolve(process.env.GLYPHOS_MODELS_DIR ?? '.cache/modelos');
const manifest: { files: Array<{ url: string; source: string }> } | null = existsSync(join(MODELS_DIR, 'manifest.json'))
  ? JSON.parse(readFileSync(join(MODELS_DIR, 'manifest.json'), 'utf8'))
  : null;
const localBySource = new Map((manifest?.files ?? []).map(f => [f.source, f.url]));
const hasModel = (id: string) => {
  const spec = MODELS.find(m => m.id === id)!;
  return !!spec.wasm && variantFiles(spec.wasm).every(f => {
    const local = localBySource.get(fileUrl(spec, f));
    return !!local && existsSync(join(MODELS_DIR, local));
  });
};
const NEED = (id: string) => `Faltan los archivos locales de «${id}» en ${MODELS_DIR}: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm`;
let files: Server | null = null;
let filesOrigin = '';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const { createServer } = await import('vite');
  server = await createServer({
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
    logLevel: 'error',
    // pre-bundled up front: a dependency found late makes the dev server answer the old one with 504
    optimizeDeps: { include: ['mediabunny', 'gifenc', 'idb-keyval', 'zustand', 'react', 'react-dom'] },
    plugins: [{
      name: 'video-qa-isolation',
      configureServer(s) {
        s.middlewares.use((req, res, next) => {
          if (/^\/dev\/video(\.html)?$/.test((req.url ?? '').split('?')[0])) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  files = httpServer((req, res) => {
    const file = join(MODELS_DIR, decodeURIComponent((req.url ?? '/').split('?')[0].slice(1)));
    if (!file.startsWith(MODELS_DIR) || !existsSync(file)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size, 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>(r => files!.listen(0, '127.0.0.1', () => r()));
  const addr = files.address();
  filesOrigin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => route.abort('blockedbyclient'));
  await context.route('https://huggingface.co/**', route => {
    const local = localBySource.get(route.request().url());
    if (!local) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 302, headers: { location: `${filesOrigin}/${local}`, 'access-control-allow-origin': '*' } });
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await page?.context().close();
  await server?.close();
  await new Promise(r => (files ? files.close(r) : r(null)));
});

const errors: string[] = [];
async function open() {
  if (page.url().startsWith(url)) return;
  page.on('pageerror', e => errors.push(e.message));
  let stale = false;
  page.on('response', r => { if (r.status() === 504) stale = true; });
  await page.goto(url);
  const deadline = Date.now() + 150_000;
  let reloaded = false;
  for (;;) {
    const ok = await page.evaluate(() => !!(window as unknown as W).vq?.ready || !!(window as unknown as W).vq?.error).catch(() => false);
    if (ok) break;
    if (stale && !reloaded) { reloaded = true; stale = false; await page.reload(); continue; }
    if (Date.now() > deadline) throw new Error('la página de QA no terminó de cargar');
    await page.waitForTimeout(500);
  }
  expect(await page.evaluate(() => (window as unknown as W).vq.error)).toBe('');
}

type W = Window & { vq: Record<string, (...a: unknown[]) => unknown> & { ready: boolean; error: string } };
const vq = <T>(fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => (window as unknown as W).vq[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;

interface ExportRes { ok: boolean; error?: string; ms: number; size?: number; mime?: string; audio?: string; notes?: string[]; progress: number; labels: string[]; cancelMs?: number }
interface Inspect {
  kind: string;
  video?: { codec: string | null; w: number; h: number; frames: number; duration: number; fps: number };
  audio?: { codec: string | null; sampleRate: number; channels: number; duration: number; onsets: number[]; freq: number; start: number };
  gif?: { frames: number; w: number; h: number; durations: number[]; loop: boolean };
  zip?: { files: number; pngs: number; w: number; h: number; readme: boolean };
}
interface Cmp { t: number; mae: number; psnr: number; maePrev: number | null; maeNext: number | null; alphaMae: number }

const OPUS_FRAME = 0.02;

/** Every sampled frame is the right one (closer to render(t) than to its neighbours) and differs by codec loss only. */
function expectSameFrames(c: Cmp[], minPsnr: number) {
  expect(c.length).toBeGreaterThanOrEqual(4);
  for (const f of c) {
    expect(f.psnr, `t=${f.t}`).toBeGreaterThanOrEqual(minPsnr);
    // (Infinity/null at the ends: no neighbour there)
    if (f.maePrev !== null && Number.isFinite(f.maePrev)) expect(f.mae, `t=${f.t} frente al cuadro anterior`).toBeLessThan(f.maePrev);
    if (f.maeNext !== null && Number.isFinite(f.maeNext)) expect(f.mae, `t=${f.t} frente al cuadro siguiente`).toBeLessThan(f.maeNext);
  }
}

test('formats are probed here: MP4 without H.264 goes AV1 (said so), WebM VP9 with real alpha, GIF and PNG always', async () => {
  test.setTimeout(240_000);
  await open();
  const f = await vq<Array<{ format: string; label: string; available: boolean; alpha: boolean; audio: boolean; limits: string; why?: string }>>('formats');
  expect(f.map(x => x.format)).toEqual(['mp4', 'webm', 'gif', 'png-zip']);
  const [mp4, webm, gif, png] = f;
  // this Chromium has no proprietary codecs: never «H.264» here, and the reason is shown
  expect(mp4.available).toBe(true);
  expect(mp4.label).toMatch(/AV1|VP9/);
  expect(mp4.limits).toMatch(/no codifica H\.264/);
  expect(webm).toMatchObject({ available: true, label: 'WebM (VP9)', audio: true });
  expect(gif).toMatchObject({ available: true, audio: false });
  expect(png).toMatchObject({ available: true, audio: false });
  const alpha = await vq<typeof f>('formats', { transparent: true });
  // a transparent WebM (VP9, colour and alpha as two streams) was encoded and decoded back here: real alpha
  expect(alpha[1].alpha).toBe(true);
  expect(alpha[1].limits).toMatch(/transparencia real/);
  expect(alpha[0].alpha).toBe(false);
  expect(alpha[3].alpha).toBe(true);
});

test('transparent WebM: the alpha that comes back is the alpha of render()', async () => {
  test.setTimeout(240_000);
  await open();
  await vq('build', 'alpha');
  const r = await vq<ExportRes>('export', { format: 'webm', transparent: true, end: 1 });
  expect(r.ok, r.error).toBe(true);
  expect(r.notes!.join(' ')).not.toMatch(/no codifica WebM con transparencia/);
  const i = await vq<Inspect & { video: { alpha?: boolean } }>('inspect');
  expect(i.video!.alpha).toBe(true);
  const c = await vq<Cmp[]>('compare', [0, 0.5, 0.9]);
  // the ASCII layer alone over transparency: a lot of it is clear, and it comes back clear
  for (const f of c) expect(f.alphaMae, `t=${f.t}`).toBeLessThan(12);
});

test('WebM: 90 frames of 320×180 at 30 fps, each the render() of its time; the original sound copied, in sync', async () => {
  test.setTimeout(240_000);
  await open();
  await vq('build', 'layers');
  const r = await vq<ExportRes>('export', { format: 'webm' });
  expect(r.ok, r.error).toBe(true);
  expect(r.audio).toBe('copied');
  expect(r.progress).toBe(90);
  expect(r.labels.some(l => /Cuadro \d+ de 90 · quedan/.test(l))).toBe(true);
  const i = await vq<Inspect>('inspect');
  expect(i.video).toMatchObject({ codec: 'vp9', w: 320, h: 180, frames: 90 });
  expect(i.video!.duration).toBeCloseTo(3, 2);
  expect(i.video!.fps).toBeCloseTo(30, 0);
  expect(i.audio!.codec).toBe('opus');
  expect(Math.abs(i.audio!.onsets[0] - 0.5)).toBeLessThan(OPUS_FRAME);
  expect(Math.abs(i.audio!.freq - 440) / 440).toBeLessThan(0.02);
  // as long as the source's own sound (the tone and the clip were written to 3 s)
  const src = await vq<Inspect>('inspectSource');
  expect(Math.abs(i.audio!.duration - src.audio!.duration)).toBeLessThan(OPUS_FRAME * 1.5);
  expect(Math.abs(i.audio!.duration - i.video!.duration)).toBeLessThan(OPUS_FRAME * 1.5);
  expect(src.audio!.onsets[0]).toBeCloseTo(0.5, 2);
  expectSameFrames(await vq<Cmp[]>('compare'), 26);
});

test('MP4 with what this browser encodes (AV1 here), the Opus sound copied into it', async () => {
  test.setTimeout(240_000);
  await open();
  const r = await vq<ExportRes>('export', { format: 'mp4' });
  expect(r.ok, r.error).toBe(true);
  expect(r.mime).toBe('video/mp4');
  expect(r.notes!.join(' ')).toMatch(/no codifica H\.264/);
  const i = await vq<Inspect>('inspect');
  expect(i.kind).toBe('MP4');
  expect(i.video).toMatchObject({ w: 320, h: 180, frames: 90 });
  expect(['av1', 'vp9']).toContain(i.video!.codec);
  expect(i.audio!.codec).toBe('opus');
  expect(Math.abs(i.audio!.onsets[0] - 0.5)).toBeLessThan(OPUS_FRAME);
  expectSameFrames(await vq<Cmp[]>('compare'), 26);
});

test('PNG sequence: pixel-identical to render() (preview = export), with its LEEME', async () => {
  test.setTimeout(240_000);
  await open();
  const r = await vq<ExportRes>('export', { format: 'png-zip' });
  expect(r.ok, r.error).toBe(true);
  expect(r.audio).toBe('none');
  const i = await vq<Inspect>('inspect');
  expect(i.zip).toEqual({ files: 91, pngs: 90, w: 320, h: 180, readme: true });
  const c = await vq<Cmp[]>('compare', [0, 0.5, 1.2, 2, 2.9]);
  for (const f of c) expect(f.mae, `t=${f.t}`).toBe(0);
  // exporting twice gives the same bytes
  const a = await vq<string>('lastHash');
  await vq<ExportRes>('export', { format: 'png-zip' });
  expect(await vq<string>('lastHash')).toBe(a);
});

test('GIF: global palette with Bayer dithering, exact length in centiseconds, loops; frames ≈ render()', async () => {
  test.setTimeout(240_000);
  await open();
  const r = await vq<ExportRes>('export', { format: 'gif', gif: { dither: 'bayer', palette: 'global' } });
  expect(r.ok, r.error).toBe(true);
  const i = await vq<Inspect>('inspect');
  expect(i.gif!.frames).toBe(90);
  expect([i.gif!.w, i.gif!.h]).toEqual([320, 180]);
  expect(i.gif!.loop).toBe(true);
  // 30 fps in whole centiseconds: 3, 3, 4… adding up to exactly 3 s
  expect(i.gif!.durations.reduce((a, b) => a + b, 0)).toBe(3000);
  for (const c of await vq<Cmp[]>('compare')) expect(c.mae, `t=${c.t}`).toBeLessThanOrEqual(14);
  // per-frame palettes and Floyd–Steinberg work too, deterministically
  const f1 = await vq<ExportRes>('export', { format: 'gif', end: 1, gif: { dither: 'floyd', palette: 'frame', loop: false } });
  expect(f1.ok, f1.error).toBe(true);
  const h1 = await vq<string>('lastHash');
  expect((await vq<Inspect>('inspect')).gif).toMatchObject({ frames: 30, loop: false });
  await vq<ExportRes>('export', { format: 'gif', end: 1, gif: { dither: 'floyd', palette: 'frame', loop: false } });
  expect(await vq<string>('lastHash')).toBe(h1);
});

test('sound follows the picture: a looping video loops its tone, a video shown from 1 s is silent before (re-encoded)', async () => {
  test.setTimeout(300_000);
  await open();
  await vq('build', 'loop');
  let r = await vq<ExportRes>('export', { format: 'webm' });
  expect(r.ok, r.error).toBe(true);
  expect(r.audio).toBe('reencoded');
  expect(r.notes!.join(' ')).toMatch(/se repite/);
  let i = await vq<Inspect>('inspect');
  expect(i.video!.frames).toBe(180);
  expect(i.audio!.onsets.length).toBe(2);
  expect(Math.abs(i.audio!.onsets[0] - 0.5)).toBeLessThan(OPUS_FRAME);
  expect(Math.abs(i.audio!.onsets[1] - 3.5)).toBeLessThan(OPUS_FRAME);
  expect(Math.abs(i.audio!.duration - 6)).toBeLessThan(OPUS_FRAME * 1.5);
  expect(Math.abs(i.audio!.freq - 440) / 440).toBeLessThan(0.02);

  await vq('build', 'span');
  r = await vq<ExportRes>('export', { format: 'mp4' });
  expect(r.ok, r.error).toBe(true);
  expect(r.audio).toBe('reencoded');
  expect(r.notes!.join(' ')).toMatch(/no se ve/);
  i = await vq<Inspect>('inspect');
  expect(Math.abs(i.audio!.onsets[0] - 1)).toBeLessThan(OPUS_FRAME);

  // a stretch of the timeline: the sound of that stretch, copied
  await vq('build', 'basic');
  r = await vq<ExportRes>('export', { format: 'webm', start: 0.25, end: 2.25 });
  expect(r.audio).toBe('copied');
  i = await vq<Inspect>('inspect');
  expect(i.video!.frames).toBe(60);
  expect(Math.abs(i.audio!.onsets[0] - 0.25)).toBeLessThan(OPUS_FRAME);
  // and none when asked
  r = await vq<ExportRes>('export', { format: 'webm', audio: 'none' });
  expect(r.audio).toBe('none');
  expect((await vq<Inspect>('inspect')).audio).toBeUndefined();
});

test('cancel mid-export stops within a frame and leaves nothing running', async () => {
  test.setTimeout(240_000);
  await open();
  await vq('build', 'layers');
  const before = await vq<Record<string, unknown>>('resources');
  for (const format of ['webm', 'gif', 'png-zip']) {
    const r = await vq<ExportRes>('export', { format }, 12);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^AbortError/);
    expect(r.cancelMs!).toBeLessThan(1500);
    // decoders close as their pump sees the end (a few ms): poll briefly
    await expect.poll(() => vq<Record<string, unknown>>('resources'), { timeout: 3000 }).toEqual({ ...before, codecs: {} });
  }
  // and the next export works
  const r = await vq<ExportRes>('export', { format: 'webm', end: 0.5 });
  expect(r.ok, r.error).toBe(true);
});

test('exporting twice gives the same frames', async () => {
  test.setTimeout(240_000);
  await open();
  await vq('build', 'layers');
  await vq<ExportRes>('export', { format: 'webm', end: 1 });
  const a = await vq<string[]>('frameHashes', 30);
  await vq<ExportRes>('export', { format: 'webm', end: 1 });
  const b = await vq<string[]>('frameHashes', 30);
  expect(a.length).toBe(30);
  expect(b).toEqual(a);
});

test('tracking a moving square: IoU ≥ 0.8 on every frame; keyframes marked in the stored masks', async () => {
  test.setTimeout(300_000);
  await open();
  await vq('build', 'layers');
  const r = await vq<{ ok: boolean; error?: string; frames: number; scores: number[]; names: string[]; stats: { keyframes: number; occluded: number } }>('track', { segmenter: 'oracle', keyEvery: 0.5 });
  expect(r.ok, r.error).toBe(true);
  expect(r.frames).toBe(90);
  expect(Math.min(...r.scores)).toBeGreaterThanOrEqual(0.8);
  expect(r.stats.keyframes).toBe(7);
  expect(r.stats.occluded).toBe(0);
  expect(r.names.filter(n => /-clave\.png$/.test(n)).length).toBe(7);
});

test('a correction repairs a bad stretch and recomputes only that stretch', async () => {
  test.setTimeout(300_000);
  await open();
  // the stand-in model is confused around frame 45 (a keyframe): masks 1.6× too big there
  const r = await vq<{ ok: boolean; scores: number[] }>('track', { segmenter: 'oracle', keyEvery: 0.5, bad: [43, 47] });
  expect(r.ok).toBe(true);
  const mean = (a: number[], i: number, j: number) => a.slice(i, j).reduce((p, q) => p + q, 0) / (j - i);
  expect(mean(r.scores, 31, 60)).toBeLessThan(0.7);
  // the rest of the track is not dragged down by it (the next keyframe finds the square again)
  expect(mean(r.scores, 60, 90)).toBeGreaterThan(0.85);
  const c = await vq<{ before: number[]; after: number[]; changed: boolean[]; names: string[] }>('correct', { t: 1.5, segmenter: 'oracle', bad: [43, 47] });
  expect(mean(c.after, 31, 60)).toBeGreaterThan(0.85);
  expect(Math.min(...c.after.slice(31, 60))).toBeGreaterThanOrEqual(0.8);
  // only frames between the keyframes around 45 (30 and 60) changed
  c.changed.forEach((ch, i) => { if (i <= 30 || i >= 60) expect(ch, `cuadro ${i}`).toBe(false); });
  expect(c.changed.filter(Boolean).length).toBe(29);
  expect(c.names[45]).toBe('pista-000045-correccion.png');
});

test('video background removal (portrait model, WASM): the person followed frame by frame, smoothed in time', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(420_000);
  await open();
  expect(await vq('downloadModel', 'portrait')).toMatch(/cached|ready/);
  await vq('portrait');
  // the CC0 portrait of tests/fixtures/photos panning 32 px over 2 s; its hand-drawn outline moved with it is the truth
  const raw = await vq<{ frames: number; scores: number[]; flicker: number; origin: string; estimate: { seconds: number[]; text: string } }>('matte', { smooth: 0, end: 0.6 });
  const smooth = await vq<typeof raw>('matte', { smooth: 0.5, end: 0.6 });
  expect(smooth.origin).toBe('subject');
  expect(smooth.frames).toBe(6);
  // the outline ignores hair strands and is a few px off along the edge: a working matte scores ≈0.85 (0.905 for a
  // still with the full guided upsampling, report-cutout.md); a broken one (empty, inverted, the background) < 0.5
  expect(Math.min(...smooth.scores)).toBeGreaterThanOrEqual(0.75);
  // smoothing keeps the person (same IoU within 0.02) and calms the edge from frame to frame
  const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
  expect(Math.abs(mean(smooth.scores) - mean(raw.scores))).toBeLessThan(0.02);
  expect(smooth.flicker).toBeLessThan(raw.flicker);
  // the estimate is said before starting, in words
  expect(smooth.estimate.text).toMatch(/cuadros con «Retrato»/);
});

test('tracking with the real point-selection model (EdgeTAM, WASM) on the moving square', async () => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(600_000);
  await open();
  expect(await vq('downloadModel', 'select')).toMatch(/cached|ready/);
  await vq('makeClip', {});
  await vq('build', 'layers');
  const r = await vq<{ ok: boolean; error?: string; frames: number; scores: number[]; stats: { keyframes: number; occluded: number; modelMs: number; flowMs: number; keyIoU: number[] } }>('track', { segmenter: 'model', keyEvery: 0.5 });
  expect(r.ok, r.error).toBe(true);
  expect(r.frames).toBe(90);
  // the model's own edge follows the VP9-blurred square a little differently from the oracle: 0.75 per frame
  expect(Math.min(...r.scores)).toBeGreaterThanOrEqual(0.75);
  expect(r.scores.reduce((p, q) => p + q, 0) / r.scores.length).toBeGreaterThanOrEqual(0.85);
  expect(r.stats.occluded).toBe(0);
});

test('playback clock: reverse shows earlier frames by seeking, loops stay in their region, nothing runs when paused', async () => {
  test.setTimeout(240_000);
  await open();
  await vq('build', 'basic');
  const rev = await vq<{ stats: { emitted: number; rendered: number; dropped: number }; log: Array<{ t: number; frame: number }>; t: number }>('playFor', 1800, { reverse: true, from: 2.9 });
  expect(rev.log.length).toBeGreaterThanOrEqual(5);
  for (let k = 1; k < rev.log.length; k++) {
    expect(rev.log[k].t).toBeLessThan(rev.log[k - 1].t);
    expect(rev.log[k].frame).toBeLessThanOrEqual(rev.log[k - 1].frame);
  }
  // each drawn frame is the frame of its time (the element seeked there)
  for (const e of rev.log) expect(Math.abs(e.frame - Math.floor(e.t * 30 + 1e-3))).toBeLessThanOrEqual(1);
  expect(new Set(rev.log.map(e => e.frame)).size).toBeGreaterThanOrEqual(4);

  const loop = await vq<{ log: Array<{ t: number; frame: number }> }>('playFor', 2500, { loop: { start: 0.5, end: 1 }, from: 0.5 });
  for (const e of loop.log) { expect(e.t).toBeGreaterThanOrEqual(0.5 - 1e-6); expect(e.t).toBeLessThan(1); }
  // it wrapped at least once
  expect(loop.log.some((e, k) => k > 0 && e.t < loop.log[k - 1].t)).toBe(true);

  // paused: nothing is emitted or drawn
  const stats = await vq<{ emitted: number }>('pbStats');
  await page.waitForTimeout(600);
  expect((await vq<{ emitted: number }>('pbStats')).emitted).toBe(stats.emitted);
  expect(errors).toEqual([]);
});
