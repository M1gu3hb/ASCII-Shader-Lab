import { readFileSync, realpathSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ViteDevServer } from 'vite';

/**
 * Regression guards of the studio's core (src/project, src/foto/export) found in review, run in a real browser
 * against the source modules: a blank page on a Vite dev server imports them (`await import('/src/…')`), so a
 * check needs no QA page. Own dev server at PW_DEV_PORT + 1 (default PW_PORT + 1001); skipped against a
 * deployed site (BASE_URL).
 */
const remote = !!process.env.BASE_URL;
const port = Number(process.env.PW_DEV_PORT ?? Number(process.env.PW_PORT ?? 4173) + 1000) + 1;
const origin = `http://127.0.0.1:${port}`;

test.describe.configure({ mode: 'serial' });
test.skip(remote, 'needs the source modules from a dev server');

let server: ViteDevServer | null = null;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const { createServer } = await import('vite');
  server = await createServer({
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
    logLevel: 'error',
  });
  await server.listen();
});

test.afterAll(async () => { await server?.close(); });

/** A blank page of the dev server's origin (module imports resolve there). */
async function blank(page: Page) {
  await page.route(`${origin}/blank.html`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>core</title><body></body>' }));
  await page.goto(`${origin}/blank.html`);
}

/** Runs `body` (the body of an async function, as text: it is not transpiled) in the page. */
const run = <T>(page: Page, body: string): Promise<T> => page.evaluate(`(async () => { ${body} })()`) as Promise<T>;

/**
 * In-page helpers: a 32×32 PNG of one grey, a tracked mask (one stored picture per frame, the first white and
 * the rest black, like «Seguir objeto» makes) kept for this tab, and the pixel at the centre of a PNG blob.
 */
const HELPERS = `
  const S = await import('/src/project/sources.ts');
  const N = await import('/src/project/normalize.ts');
  const png = async (v) => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = v ? '#ffffff' : '#000000'; x.fillRect(0, 0, 32, 32);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  };
  const trackedMask = async (n, salt) => {
    const white = await png(true), black = await png(false);
    const frames = [];
    for (let i = 0; i < n; i++) {
      const id = (salt + i.toString(16)).padStart(16, '0').slice(-16);
      S.keepBlob(id, i === 0 ? white : black, 'cuadro-' + i + '.png');
      frames.push({ t: i / 30, media: { id, kind: 'image', w: 32, h: 32, name: 'cuadro-' + i + '.png' } });
    }
    return { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'raster', op: 'add', media: frames[0].media, frames, interp: true, soft: 0, alpha: 1, origin: 'track' }] };
  };
  const centre = async (blob) => {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    return x.getImageData(bmp.width >> 1, bmp.height >> 1, 1, 1).data[0];
  };
`;

test('the exported mask of a tracked object at t is the mask of that frame', async ({ page }) => {
  await blank(page);
  const r = await run<{ first: number; last: number }>(page, `${HELPERS}
    const X = await import('/src/project/export.ts');
    const p = N.newProject({ w: 64, h: 64 });
    const l = N.newLayer('shape', { name: 'Forma' });
    l.mask = await trackedMask(40, 'a1');
    p.layers.push(l);
    // frame 0 shows the object (white), the last frame nothing (black)
    return { first: await centre(await X.exportMask(p, l.id, { t: 0 })), last: await centre(await X.exportMask(p, l.id, { t: 39 / 30 })) };
  `);
  expect(r.first).toBe(255);
  expect(r.last).toBe(0);
});

test('the text of a glyph layer under a tracked mask keeps the characters the mask shows at t', async ({ page }) => {
  await blank(page);
  const r = await run<{ shown: number; cells: number }>(page, `${HELPERS}
    const F = await import('/src/foto/export/frames.ts');
    const p = N.newProject({ w: 64, h: 64 });
    const photo = await (async () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      S.keepBlob('00000000000f0701', blob, 'blanco.png');
      return { id: '00000000000f0701', kind: 'image', w: 64, h: 64, name: 'blanco.png' };
    })();
    const src = N.sourceFromMedia(photo);
    p.sources.push(src);
    const l = N.newLayer('glyphs', { name: 'Caracteres', source: src.id });
    l.glyphs = { ...l.glyphs, cell: 8, aspect: 1 };
    l.mask = await trackedMask(40, 'b2');
    p.layers.push(l);
    const s = F.frameSession();
    try {
      const f = await F.glyphFrameAt(p, l.id, 0, s);
      let shown = 0;
      for (let i = 0; i < f.grid.chars.length; i++) if (f.grid.chars[i] !== ' ' && f.grid.alpha[i] > 0) shown++;
      return { shown, cells: f.grid.chars.length };
    } finally { s.release(); }
  `);
  // a white picture under a mask that shows everything at t = 0: every cell has its character
  expect(r.cells).toBeGreaterThan(0);
  expect(r.shown).toBe(r.cells);
});

test('a mask whose picture was missing is drawn once the picture is there (the mask cache does not keep it empty)', async ({ page }) => {
  await blank(page);
  const r = await run<{ before: number; after: number }>(page, `${HELPERS}
    const { evaluate } = await import('/src/project/evaluate.ts');
    const { Compositor } = await import('/src/project/compositor.ts');
    const id = 'c3c3c3c3c3c3c3c3';
    const p = N.newProject({ w: 64, h: 64, bg: '#000000' });
    const l = N.newLayer('shape', { name: 'Forma', shape: 'rect', pts: [0, 0, 1, 1], fill: '#ff0000', stroke: null });
    l.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'raster', op: 'add', media: { id, kind: 'image', w: 32, h: 32, name: 'mascara.png' }, soft: 0, alpha: 1, origin: 'paint' }] };
    p.layers.push(l);
    const comp = new Compositor({ provider: S.createSourceProvider() });
    const c = document.createElement('canvas');
    const red = async () => { await comp.render(evaluate(p, 0), c, { scale: 1 }); return c.getContext('2d').getImageData(32, 32, 1, 1).data[0]; };
    try {
      const before = await red();
      // the painted mask's file arrives (stored by another step, a project file opened meanwhile…)
      S.keepBlob(id, await png(true), 'mascara.png');
      return { before, after: await red() };
    } finally { comp.destroy(); }
  `);
  expect(r.before).toBe(0);
  expect(r.after).toBe(255);
});

test('a video trimmed without re-encoding (MP4 edit list) exports from the cut, as the preview shows it, with its sound', async ({ page }) => {
  test.setTimeout(120_000);
  await blank(page);
  const b64 = readFileSync('tests/fixtures/video/recortado-sin-recomprimir.mp4').toString('base64');
  const r = await run<{ preview: number[]; exact: number[]; exported: number[]; audio: string; loud: number[] }>(page, `
    const S = await import('/src/project/sources.ts');
    const N = await import('/src/project/normalize.ts');
    const V = await import('/src/video/index.ts');
    // (a bare specifier does not resolve in page code: the package's own module file, to read the result back)
    const mb = await import('/node_modules/mediabunny/dist/modules/src/index.js');
    const bytes = Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'video/mp4' });
    const id = '7e57c0de7e57c0de';
    S.keepBlob(id, blob, 'recortado.mp4');
    const centre = c => c.getContext('2d', { willReadFrequently: true }).getImageData(c.width >> 1, c.height >> 1, 1, 1).data[0];
    const at = [0, 1];
    // the preview (a video element) and the export's frame-exact decoder, at the same times
    const pv = await S.openPreviewVideo(blob), ex = await S.openExactVideo(blob);
    const preview = [], exact = [];
    for (const t of at) { await pv.seek(t); preview.push(centre(pv.canvas)); await ex.seek(t); exact.push(centre(ex.canvas)); }
    pv.close(); ex.close();
    // the whole export (WebM, the sound copied), read back
    const p = N.projectFromVideo({ id, kind: 'video', w: 64, h: 64, name: 'recortado.mp4', type: 'video/mp4' }, { duration: 2, fps: 30, hasAudio: true });
    const out = await V.exportMovie(p, { format: 'webm', audio: 'keep' });
    const input = new mb.Input({ source: new mb.BlobSource(out.blob), formats: mb.ALL_FORMATS });
    const sink = new mb.CanvasSink(await input.getPrimaryVideoTrack(), { width: 64, height: 64, fit: 'fill' });
    const exported = [];
    for (const t of at) {
      const wc = await sink.getCanvas(t + 0.001);
      const c = document.createElement('canvas'); c.width = c.height = 64;
      c.getContext('2d').drawImage(wc.canvas, 0, 0);
      exported.push(centre(c));
    }
    // where the beep is: energy per tenth of a second
    const energy = new Array(20).fill(0);
    for await (const s of new mb.AudioSampleSink(await input.getPrimaryAudioTrack()).samples(0, 2)) {
      const buf = new Float32Array(s.numberOfFrames);
      s.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
      for (let i = 0; i < buf.length; i++) { const k = Math.floor((s.timestamp + i / s.sampleRate) * 10); if (k >= 0 && k < 20) energy[k] += buf[i] * buf[i]; }
      s.close();
    }
    input.dispose();
    return { preview, exact, exported, audio: out.audio, loud: energy.map((e, k) => (e > 5 ? k : -1)).filter(k => k >= 0) };
  `);
  // the cut is at frame 30 of the counter: luma 16 + 90 → ~105 at t = 0, ~210 one second later
  for (const k of [0, 1]) {
    expect(Math.abs(r.preview[k] - [105, 210][k])).toBeLessThan(6);
    expect(Math.abs(r.exact[k] - r.preview[k])).toBeLessThan(4);
    expect(Math.abs(r.exported[k] - r.preview[k])).toBeLessThan(6);
  }
  // the beep was at the cut: it starts the export, as it starts the trimmed video
  expect(r.audio).toBe('copied');
  expect(r.loud).toEqual([0, 1]);
});

test('«Capa sola» of a layer that reads what is under it: its characters of the photo, and over the rest it gives the full render', async ({ page }) => {
  test.setTimeout(120_000);
  await blank(page);
  const r = await run<Record<string, { left: number; right: number; diff?: number }>>(page, `
    const S = await import('/src/project/sources.ts');
    const N = await import('/src/project/normalize.ts');
    const X = await import('/src/project/export.ts');
    // the photo: bright left half, black right half
    const c = document.createElement('canvas'); c.width = 320; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 320, 200); x.fillStyle = '#fff'; x.fillRect(0, 0, 160, 200);
    S.keepBlob('00000000000fa7e1', await new Promise(r => c.toBlob(r, 'image/png')), 'foto.png');
    const out = {};
    for (const kind of ['ascii', 'glyphs']) {
      const p = N.projectFromImage({ id: '00000000000fa7e1', kind: 'image', w: 320, h: 200, name: 'foto.png' });
      const l = N.newLayer(kind, { name: kind });
      if (kind === 'glyphs') l.glyphs = { ...l.glyphs, paper: null };
      p.layers.push(l);
      const photo = p.layers[0].id;
      const pixels = async o => { const { canvas } = await X.renderStill(p, o); return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; };
      const alone = await pixels({ only: [l.id], transparent: true });
      let left = 0, right = 0;
      for (let i = 0; i < alone.length; i += 4) if (alone[i + 3] > 40) { if ((i / 4) % 320 < 160) left++; else right++; }
      // the photo alone with the layer alone over it is the full render
      const base = await pixels({ only: [photo] }), full = await pixels({});
      const k = document.createElement('canvas'); k.width = 320; k.height = 200;
      const kx = k.getContext('2d');
      kx.putImageData(new ImageData(base, 320, 200), 0, 0);
      const a = document.createElement('canvas'); a.width = 320; a.height = 200;
      a.getContext('2d').putImageData(new ImageData(alone, 320, 200), 0, 0);
      kx.drawImage(a, 0, 0);
      const both = kx.getImageData(0, 0, 320, 200).data;
      let diff = 0;
      for (let i = 0; i < both.length; i++) diff = Math.max(diff, Math.abs(both[i] - full[i]));
      out[kind] = { left, right, diff };
    }
    return out;
  `);
  for (const kind of ['ascii', 'glyphs']) {
    // characters where the photo is bright, nothing where it is black (not an empty frame)
    expect(r[kind].left).toBeGreaterThan(1000);
    expect(r[kind].right).toBe(0);
    expect(r[kind].diff).toBeLessThanOrEqual(3);
  }
});

test('a media collection (the lab’s, in another tab) keeps the files undo can bring back', async ({ page }) => {
  await blank(page);
  const r = await run<{ layers: number; stored: boolean; kept: boolean }>(page, `${HELPERS}
    const store = await import('/src/project/store.ts');
    const persist = await import('/src/project/persist.ts');
    const MS = await import('/src/studio/mediaStore.ts');
    // a layer with a painted mask, its picture in the media store, the project saved
    const { stored, ...ref } = await persist.putMedia(await png(true), { kind: 'image', name: 'mascara.png', w: 32, h: 32 });
    const p = N.newProject({ w: 64, h: 64 });
    const l = N.newLayer('shape', { name: 'Forma' });
    l.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'raster', op: 'add', media: ref, soft: 0, alpha: 1, origin: 'paint' }] };
    p.layers.push(l);
    store.openProject(p);
    await store.saveNow();
    // the layer is deleted and the project saved again; later the lab collects what nothing lists
    store.removeLayer(l.id);
    await store.saveNow();
    await MS.gcMedia(new Set(), 0);
    // one undo brings the layer back: its mask must still be there
    store.undo();
    const kept = await MS.hasMedia(ref.id);
    await persist.deleteProject(p.id);
    return { layers: store.useProject.getState().project.layers.length, stored, kept };
  `);
  expect(r.stored).toBe(true);
  expect(r.layers).toBe(1);
  expect(r.kept).toBe(true);
});
