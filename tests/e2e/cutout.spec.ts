/**
 * The in-browser cutout, end to end, on the QA page (dev/cutout.html) with REAL inference on the WASM backend.
 *
 * The QA page is not part of the site build. Build and serve it on its own, then point the tests at it:
 *
 *   node scripts/fetch-models.mjs --out .cache/modelos --backend wasm     # local, verified model files (once)
 *   npx vite build --config scripts/cutout-qa.config.ts
 *   npx vite preview --config scripts/cutout-qa.config.ts --port 4195 --strictPort &
 *   BASE_URL=http://localhost:4195 npx playwright test tests/e2e/cutout.spec.ts
 *
 * Hugging Face is never contacted: its pinned URLs are routed to a local file server (with a redirect, like the
 * real host) serving GLYPHOS_MODELS_DIR (default .cache/modelos, written by scripts/fetch-models.mjs). Tests that
 * need a model skip with a message when its files are absent. Model files are never committed.
 *
 * Reference masks are coarse polygons drawn by hand over the fixtures (tests/fixtures/photos). A matte that works
 * scores ≈0.9 against them (their edges are a few px off along the whole outline and they ignore hair strands);
 * a broken one (empty, everything, inverted, the background) scores below 0.5. Thresholds sit in between, per model.
 */
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { allFiles, fileUrl, MODELS, variantFiles } from '../../src/cutout/models';

const MODELS_DIR = resolve(process.env.GLYPHOS_MODELS_DIR ?? '.cache/modelos');
const manifest: { files: Array<{ sha256: string; url: string; source: string }> } | null = existsSync(join(MODELS_DIR, 'manifest.json'))
  ? JSON.parse(readFileSync(join(MODELS_DIR, 'manifest.json'), 'utf8'))
  : null;
const localBySource = new Map((manifest?.files ?? []).map(f => [f.source, f.url]));
const REGISTRY = allFiles();
const hasModel = (id: string, backend: 'wasm' | 'webgpu' = 'wasm') => {
  const spec = MODELS.find(m => m.id === id)!;
  const v = backend === 'wasm' ? spec.wasm : spec.webgpu;
  return !!v && variantFiles(v).every(f => {
    const local = localBySource.get(fileUrl(spec, f));
    return !!local && existsSync(join(MODELS_DIR, local));
  });
};
const NEED = (id: string) => `Faltan los archivos locales de «${id}» en ${MODELS_DIR}: node scripts/fetch-models.mjs --out .cache/modelos --backend wasm`;

/** Hand-drawn outlines (source px) of the subject of each fixture. */
const PORTRAIT = [330, 72, 400, 66, 470, 80, 540, 110, 600, 160, 640, 220, 670, 290, 700, 360, 725, 440, 745, 520, 790, 590, 825, 650, 835, 740, 828, 858, 90, 858, 70, 760, 60, 660, 70, 600, 130, 570, 135, 500, 130, 420, 140, 340, 160, 260, 190, 190, 230, 130, 280, 90];
const GUITAR = [0, 628, 70, 598, 140, 570, 190, 530, 212, 480, 232, 425, 262, 388, 305, 362, 355, 354, 400, 360, 432, 378, 695, 0, 768, 0, 768, 62, 545, 440, 578, 470, 596, 515, 602, 565, 592, 615, 562, 660, 517, 690, 477, 720, 459, 750, 452, 790, 449, 840, 444, 885, 432, 940, 412, 985, 392, 1024, 0, 1024];

let files: Server | null = null;
let filesOrigin = '';
let context: BrowserContext;
let page: Page;
const requests: Request[] = [];
/** Serve model files slowly (to cancel a download halfway). */
let slowModels = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  files = createServer((req, res) => {
    const [path, query] = (req.url ?? '/').split('?');
    const file = join(MODELS_DIR, decodeURIComponent(path.slice(1)));
    if (!file.startsWith(MODELS_DIR) || !existsSync(file)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(file).size, 'access-control-allow-origin': '*' });
    if (query === 'slow') {
      // A slow link, for the cancel test: 64 KB every 100 ms.
      const s = createReadStream(file, { highWaterMark: 65536 });
      s.on('data', chunk => { s.pause(); res.write(chunk); setTimeout(() => s.resume(), 100); });
      s.on('end', () => res.end());
      req.on('close', () => s.destroy());
    } else createReadStream(file).pipe(res);
  });
  await new Promise<void>(r => files!.listen(0, '127.0.0.1', () => r()));
  const addr = files.address();
  filesOrigin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  context = await browser.newContext({ viewport: { width: 1366, height: 860 }, acceptDownloads: true });
  context.on('request', r => requests.push(r));
  // Anything else outside the page's origin fails loudly (and is recorded).
  await context.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, route => route.abort('blockedbyclient'));
  await context.route('https://huggingface.co/**', route => {
    const local = localBySource.get(route.request().url());
    if (!local) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
    // Like the real host: a redirect to the file server, which answers with CORS «*».
    return route.fulfill({ status: 302, headers: { location: `${filesOrigin}/${local}${slowModels ? '?slow' : ''}`, 'access-control-allow-origin': '*' } });
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  await new Promise(r => (files ? files.close(r) : r(null)));
});

async function openQA() {
  if (page.url().includes('/dev/cutout.html')) return;
  const res = await page.goto('/dev/cutout.html');
  test.skip(!res || res.status() === 404, 'La página de QA no está en esta compilación. Compílala y sírvela aparte (ver el comentario al principio de este archivo) y usa BASE_URL.');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60_000 });
}

const model = (id: string) => page.locator(`li[data-model="${id}"]`);
const qa = <T>(fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as unknown as { cutoutQA: Record<string, (...x: unknown[]) => unknown> }).cutoutQA[f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const modelRequests = () => requests.filter(r => r.url().startsWith('https://huggingface.co/') || r.url().startsWith(filesOrigin));

async function download(id: string) {
  const li = model(id);
  if (!(await li.locator('[data-action="download"]').count())) return;
  await li.locator('[data-action="download"]').click();
  await expect(page.locator('#consent')).toBeVisible();
  await page.locator('#c-yes').click();
  await expect(model(id)).toHaveAttribute('data-state', /cached|ready/, { timeout: 180_000 });
}

async function waitMatte(before: number) {
  await page.waitForFunction(n => (window as unknown as { cutoutQA: { rows(): unknown[] } }).cutoutQA.rows().length > n, before, { timeout: 280_000 });
}

test('the QA page is cross-origin isolated: WASM threads, COOP/COEP headers', async () => {
  await openQA();
  const res = await page.request.get('/dev/cutout.html');
  expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(res.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => crossOriginIsolated && typeof SharedArrayBuffer === 'function')).toBe(true);
  await expect(page.locator('#env')).toContainText('Aislamiento entre orígenes: sí');
  // onnxruntime-web's files come from our origin, versioned, isolated-friendly.
  const wasm = await page.request.get('/ort/1.30.0/ort-wasm-simd-threaded.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  expect(wasm.headers()['cross-origin-resource-policy']).toBe('same-origin');
  expect(wasm.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  const empty = await page.request.get('/models/manifest.json');
  expect(await empty.json()).toMatchObject({ glyphos: 'models', files: [] });
});

test('nothing is downloaded before the person agrees, and the dialog says what and why', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  await openQA();
  await qa('fixture', 'retrato');
  const li = model('portrait');
  await expect(li).toHaveAttribute('data-state', 'absent');
  // The API refuses to run a model that is not downloaded (no silent download).
  expect(await qa('tryRemoveBackground', 'portrait')).toBe('needs-download');
  await li.locator('[data-action="download"]').click();
  const dialog = page.locator('#consent');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Retrato');
  await expect(dialog).toContainText('7 MB');
  await expect(dialog).toContainText('Tus fotos no se suben: el recorte ocurre en tu equipo. El modelo se descarga una vez desde Hugging Face y queda guardado en este navegador');
  await expect(dialog).toContainText('Apache-2.0');
  expect(modelRequests()).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Ahora no' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  expect(modelRequests()).toHaveLength(0);
  await expect(li).toHaveAttribute('data-state', 'absent');
  await download('portrait');
  // One pinned file, verified and stored by hash.
  const hf = modelRequests().filter(r => r.url().startsWith('https://huggingface.co/'));
  expect(hf.map(r => r.url())).toEqual(['https://huggingface.co/Xenova/modnet/resolve/fa2fa546052fba4c08921230a26cc69a333fca12/onnx/model_uint8.onnx']);
  expect(await qa<number>('storedBytes')).toBe(6627048);
});

test('«Retrato» (WASM): a plausible matte of the portrait, with real alpha in the PNG', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(300_000);
  await openQA();
  await download('portrait');
  const n = (await qa<unknown[]>('rows')).length;
  await model('portrait').locator('[data-action="run"]').click();
  await waitMatte(n);
  const rows = await qa<Array<Record<string, number | string>>>('rows');
  const row = rows[rows.length - 1];
  expect(row.backend).toMatch(/^wasm×2|^wasm/);
  const iou = await qa<number>('iou', PORTRAIT);
  console.log(`retrato · portrait: IoU ${iou.toFixed(3)} · ${JSON.stringify(row)}`);
  // MODNet also keeps a piece of the armchair next to the shoulder: 0.80 leaves room for that, not for a failure.
  expect(iou).toBeGreaterThan(0.8);
  const st = await qa<{ w: number; h: number; alpha0: number; alpha255: number; soft: number; type: string }>('exportStats');
  expect(st.type).toBe('image/png');
  expect([st.w, st.h]).toEqual([1024, 858]);
  expect(st.alpha0).toBeGreaterThan(0.2 * st.w * st.h);
  expect(st.alpha255).toBeGreaterThan(0.2 * st.w * st.h);
  expect(st.soft).toBeGreaterThan(1000);
  // The file the button saves is an RGBA PNG.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#savePng').click()]);
  const png = readFileSync(await dl.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png[25]).toBe(6); // IHDR colour type 6 = truecolour with alpha
  expect(dl.suggestedFilename()).toBe('retrato-recorte.png');
});

test('refinement and brushes change the matte; the GPU and CPU guided upsampling agree', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  await openQA();
  const before = await qa<{ mean: number }>('matteStats');
  await qa('setRefine', { shift: -6 });
  const shrunk = await qa<{ mean: number }>('matteStats');
  expect(shrunk.mean).toBeLessThan(before.mean - 0.01);
  await qa('setRefine', { shift: 0 });
  const hard = await qa<{ soft: number; opaque: number }>('matteStats');
  await qa('setRefine', { feather: 10 });
  const soft = await qa<{ soft: number; opaque: number }>('matteStats');
  // A softer edge: fewer fully opaque pixels, more partly transparent ones.
  expect(soft.opaque).toBeLessThan(hard.opaque - 1000);
  expect(soft.soft).toBeGreaterThan(hard.soft);
  await qa('setRefine', { feather: 0 });
  expect(await qa<number>('brush', [{ x: 500, y: 330 }], 'remove', 40, 1)).toBe(0);
  expect(await qa<number>('brush', [{ x: 960, y: 60 }], 'keep', 40, 1)).toBe(255);
  const parity = await qa<{ gl: boolean; maxDiff: number }>('guidedParity');
  console.log(`guided GL/CPU: ${JSON.stringify(parity)}`);
  expect(parity.gl).toBe(true);
  expect(parity.maxDiff).toBeLessThanOrEqual(2);
});

test('previews on light, dark, high-contrast and checkerboard backgrounds', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  await openQA();
  const pixel = () => page.evaluate(() => { const c = document.getElementById('canvas') as HTMLCanvasElement; return Array.from(c.getContext('2d')!.getImageData(990, 20, 1, 1).data); });
  const want: Record<string, number[]> = { light: [244, 241, 234, 255], dark: [12, 11, 10, 255], contrast: [34, 224, 90, 255] };
  for (const [bg, rgba] of Object.entries(want)) {
    await page.locator(`[data-bg="${bg}"]`).click();
    expect(await pixel()).toEqual(rgba);
  }
  await page.locator('[data-bg="checker"]').click();
  expect([[217, 217, 217, 255], [154, 154, 154, 255]]).toContainEqual(await pixel());
});

test('«Seleccionar objeto» (WASM): points select the guitar on a busy background; points can be removed', async () => {
  test.skip(!hasModel('select'), NEED('select'));
  test.setTimeout(300_000);
  await openQA();
  await qa('fixture', 'guitarra');
  await download('select');
  await model('select').locator('[data-action="select"]').click();
  await page.waitForFunction(() => (window as unknown as { cutoutQA: { state(): { selecting: boolean } } }).cutoutQA.state().selecting, null, { timeout: 180_000 });
  const box = (await page.locator('#canvas').boundingBox())!;
  const click = async (x: number, y: number, negative = false) => {
    const n = (await qa<unknown[]>('rows')).length;
    if (negative) await page.keyboard.down('Shift');
    await page.mouse.click(box.x + (x / 768) * box.width, box.y + (y / 1024) * box.height);
    if (negative) await page.keyboard.up('Shift');
    await waitMatte(n);
  };
  // The body in several places (the model needs a click per region on this busy pattern), the pickguard, the neck.
  for (const [x, y] of [[330, 420], [120, 700], [420, 760], [610, 190], [500, 620], [150, 980]]) await click(x, y);
  const iou = await qa<number>('iou', GUITAR);
  const rows = await qa<Array<Record<string, number | string>>>('rows');
  console.log(`guitarra · select: IoU ${iou.toFixed(3)} · first ${JSON.stringify(rows[rows.length - 6])} · last ${JSON.stringify(rows[rows.length - 1])}`);
  // This model keeps the dark fretboard, the soundhole and the bridge out of «the guitar» even with a click on
  // the neck (≈20 % of the outline's area): a body-only selection scores ≈0.67. Broken results score below 0.5
  // (everything selected ≈0.45, nothing 0), so 0.6 tells them apart.
  expect(iou).toBeGreaterThan(0.6);
  // Correctable: removing a point gives a different mask.
  const before = await qa<{ mean: number }>('matteStats');
  const n = rows.length;
  await page.locator('#points li').last().getByRole('button').click();
  await waitMatte(n);
  expect(Math.abs((await qa<{ mean: number }>('matteStats')).mean - before.mean)).toBeGreaterThan(0.001);
  expect(await page.locator('#points li').count()).toBe(5);
});

test('«Sujeto» (WASM, 192 MB, ≈3 GB of memory): the general model on the portrait', async () => {
  test.skip(!hasModel('subject'), NEED('subject'));
  test.skip(process.env.GLYPHOS_E2E_SUBJECT === '0', 'GLYPHOS_E2E_SUBJECT=0: se omite el modelo grande.');
  test.setTimeout(600_000);
  await openQA();
  await qa('fixture', 'retrato');
  await expect(model('subject')).toContainText('3 GB');
  await download('subject');
  const n = (await qa<unknown[]>('rows')).length;
  await model('subject').locator('[data-action="run"]').click();
  await waitMatte(n);
  const iou = await qa<number>('iou', PORTRAIT);
  const rows = await qa<Array<Record<string, number | string>>>('rows');
  console.log(`retrato · subject: IoU ${iou.toFixed(3)} · ${JSON.stringify(rows[rows.length - 1])}`);
  expect(iou).toBeGreaterThan(0.85);
  // The object on the busy background: the general model takes the whole guitar (neck and soundhole included).
  await qa('fixture', 'guitarra');
  await model('subject').locator('[data-action="run"]').click();
  await waitMatte(rows.length);
  const iouGuitar = await qa<number>('iou', GUITAR);
  const rows2 = await qa<Array<Record<string, number | string>>>('rows');
  console.log(`guitarra · subject: IoU ${iouGuitar.toFixed(3)} · ${JSON.stringify(rows2[rows2.length - 1])}`);
  expect(iouGuitar).toBeGreaterThan(0.85);
});

test('video frames: a stream of frames goes through the worker (transferred bitmaps in, bytes out)', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(300_000);
  await openQA();
  await qa('fixture', 'retrato');
  await download('portrait');
  // Preview size: the shortest side at 256 (the model sees 448 × 256), the matte stays at the model's size.
  const preview = await qa<{ ms: number[]; low: number[]; out: number[] }>('throughput', 'portrait', 5, 640, 360, false, 256);
  expect(preview.ms).toHaveLength(5);
  expect(preview.low).toEqual([448, 256]);
  expect(preview.out).toEqual(preview.low);
  // Default size (shortest side 512 → 896 × 512), upsampled to the frame's 640 × 360 with the guided filter.
  const full = await qa<{ ms: number[]; low: number[]; out: number[] }>('throughput', 'portrait', 3, 640, 360, true);
  expect(full.low).toEqual([896, 512]);
  expect(full.out).toEqual([640, 360]);
  console.log(`vídeo · portrait 640×360 · a 256: ${JSON.stringify(preview.ms)} ms · a 512 + bordes: ${JSON.stringify(full.ms)} ms`);
});

test('cancel stops a running cut-out and a download; the next run works', async () => {
  test.skip(!hasModel('portrait'), NEED('portrait'));
  test.setTimeout(300_000);
  await openQA();
  await qa('fixture', 'retrato');
  await download('portrait');
  // Inference: cancel while it runs (the worker is terminated), then run again.
  await model('portrait').locator('[data-action="run"]').click();
  await expect(page.locator('#cancel')).toBeEnabled();
  await page.locator('#cancel').click();
  await expect(page.locator('#status')).toHaveText('Cancelado.', { timeout: 5_000 });
  const n = (await qa<unknown[]>('rows')).length;
  await model('portrait').locator('[data-action="run"]').click();
  await waitMatte(n);
  // Download: slow link, cancel halfway, nothing stored.
  if (hasModel('select')) {
    await model('select').locator('[data-action="forget"]').click();
    await expect(model('select')).toHaveAttribute('data-state', 'absent');
    slowModels = true;
    await model('select').locator('[data-action="download"]').click();
    await page.locator('#c-yes').click();
    await expect(page.locator('#status')).toContainText('Descargando modelo');
    await page.locator('#cancel').click();
    await expect(page.locator('#status')).toHaveText('Cancelado.');
    slowModels = false;
    expect(await qa<string>('modelState', 'select')).toBe('absent');
  }
});

test('photos never leave the device: only model files and our own files are requested', async () => {
  await openQA();
  const pageOrigin = new URL(page.url()).origin;
  const pinned = new Set(REGISTRY.map(f => f.url));
  const outside = requests.filter(r => {
    const u = r.url();
    return !u.startsWith(pageOrigin) && !u.startsWith(filesOrigin) && !pinned.has(u) && !u.startsWith('blob:') && !u.startsWith('data:');
  });
  expect(outside.map(r => r.url())).toEqual([]);
  // Only reads: no request carries a body (nothing is uploaded, not even to our own origin).
  const writes = requests.filter(r => r.method() !== 'GET' || (r.postDataBuffer()?.length ?? 0) > 0);
  expect(writes.map(r => `${r.method()} ${r.url()}`)).toEqual([]);
  // Every Hugging Face request was a pinned file of the registry.
  for (const r of requests.filter(q => q.url().startsWith('https://huggingface.co/'))) expect(pinned.has(r.url())).toBe(true);
});
