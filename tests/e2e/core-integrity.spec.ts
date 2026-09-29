import { realpathSync } from 'node:fs';
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
