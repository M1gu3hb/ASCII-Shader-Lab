import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * Edge cases of the engines, run on the engine module itself (built here):
 * - Renderer.snapshot of the WebGL engine (history thumbnails come from it) when the context goes away just
 *   before it, its event still to come: it answers «no picture» (null), never a blank one that would be kept
 *   as the piece's thumbnail. Some browsers return no fence on a lost context (emulated here); Chromium
 *   returns one that never signals.
 * - An empty «Tus caracteres»: the live piece and the piece opened again (normalizeRecipe) look the same.
 * - Cells of 2 to 6 device px (at pixel ratio 1 and 0.5) draw their glyphs, the same as the basic engine; and
 *   big cells, whose atlas wraps into rows of a number of glyphs that is not a power of two, too.
 */
const engineModule = async () => Buffer.from((await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' })).outputFiles[0].contents);

test('una instantánea de un contexto WebGL perdido es «nada», nunca una imagen en blanco', async ({ page }) => {
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const res = await page.evaluate(async () => {
    const E = await import('/__snap/engine.js' as string);
    const make = async () => {
      const cv = document.createElement('canvas');
      const eng = new E.AsciiEngine(cv, E.defaultRecipe(), { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: 160, height: 100, pixelRatio: 1 }, autoplay: false, interactive: false, preserveDrawingBuffer: true });
      await eng.ready();
      eng.renderAt(1);
      return { eng, gl: cv.getContext('webgl2')! };
    };
    const describe = (img: ImageData | null) => (img === null ? null : 'imagen');
    const a = await make();
    const img = await a.eng.snapshot(0, 0, 160, 100);
    let ink = 0;
    if (img) for (let i = 3; i < img.data.length; i += 4) ink += img.data[i];
    // lost, and no fence (as some browsers answer then)
    a.gl.getExtension('WEBGL_lose_context')!.loseContext();
    a.gl.fenceSync = () => null;
    const noFence = describe(await a.eng.snapshot(0, 0, 160, 100));
    a.eng.destroy();
    // lost, with Chromium's fence that never signals
    const b = await make();
    b.gl.getExtension('WEBGL_lose_context')!.loseContext();
    const lost = describe(await b.eng.snapshot(0, 0, 160, 100));
    b.eng.destroy();
    return { ok: !!img && ink > 0, noFence, lost };
  });
  expect(res).toEqual({ ok: true, noFence: null, lost: null });
});

test('sin caracteres, la pieza en vivo y la misma pieza al volver a abrirla se ven igual (la rampa por defecto)', async ({ page }) => {
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const res = await page.evaluate(async () => {
    const E = await import('/__snap/engine.js' as string);
    const shot = async (kind: string, r: unknown) => {
      const cv = document.createElement('canvas');
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: 200, height: 120, pixelRatio: 1 }, autoplay: false, interactive: false, preserveDrawingBuffer: true };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, r, opts) : new E.BasicEngine(cv, r, opts);
      await e.ready();
      e.renderAt(1.5);
      const s = await e.snapshot(0, 0, 200, 120);
      e.destroy();
      return Array.from(s!.data as Uint8ClampedArray).join(',');
    };
    const live = E.defaultRecipe();
    live.glyph.charset = '';
    const reopened = E.normalizeRecipe(JSON.parse(JSON.stringify(live)));
    const out: Record<string, boolean | string> = { reopenedCharset: reopened.glyph.charset };
    for (const kind of ['webgl', 'basic']) out[kind] = (await shot(kind, live)) === (await shot(kind, reopened));
    return out;
  });
  expect(res).toEqual({ reopenedCharset: ' .:-=+*#%@', webgl: true, basic: true });
});

/**
 * Small cells draw their glyphs. Measured on every pixel: a measure that reads every 4th pixel sees the same
 * column of each cell when cells are 2 or 4 px wide (the first one, empty in most glyphs this small), which
 * once passed for «cells 2 or 4 px wide draw no glyphs». Each size is also drawn by the basic engine: the
 * same glyphs, the same pixels.
 */
test('celdas de 2 a 6 px (proporción de píxel 1 y 0,5): se dibujan los caracteres, igual que en el motor básico', async ({ page }) => {
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const res = await page.evaluate(async () => {
    const E = await import('/__snap/engine.js' as string);
    const shot = async (kind: string, cell: number, pr: number) => {
      const cv = document.createElement('canvas');
      const r = E.defaultRecipe();
      r.glyph.cell = cell;
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: 160, height: 96, pixelRatio: pr }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, r, opts) : new E.BasicEngine(cv, r, opts);
      await e.ready();
      e.renderAt(1.5);
      const s = await e.snapshot(0, 0, cv.width, cv.height);
      const grid = e.readGrid();
      e.destroy();
      return { d: s!.data as Uint8ClampedArray, cw: grid.cw as number, ch: grid.ch as number };
    };
    const out: string[] = [];
    for (const pr of [1, 0.5]) for (const cw of [2, 3, 4, 5, 6]) {
      const a = await shot('webgl', cw / pr, pr), b = await shot('basic', cw / pr, pr);
      let ink = 0, differ = 0;
      // every pixel: ink is what stands out from the background (#0b0a09)
      for (let i = 0; i < a.d.length; i += 4) {
        if (a.d[i] + a.d[i + 1] + a.d[i + 2] > 90) ink++;
        if (Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])) > 8) differ++;
      }
      const share = ink / (a.d.length / 4);
      out.push(`${a.cw}x${a.ch}@${pr}: ${share > 0.03 ? 'tinta' : 'sin tinta ' + share.toFixed(4)}, ${differ ? differ + ' píxeles distintos del básico' : 'igual al básico'}`);
    }
    return out;
  });
  expect(res).toEqual([
    '2x3@1: tinta, igual al básico', '3x4@1: tinta, igual al básico', '4x6@1: tinta, igual al básico', '5x7@1: tinta, igual al básico', '6x8@1: tinta, igual al básico',
    '2x3@0.5: tinta, igual al básico', '3x4@0.5: tinta, igual al básico', '4x6@0.5: tinta, igual al básico', '5x7@0.5: tinta, igual al básico', '6x8@0.5: tinta, igual al básico',
  ]);
});

/**
 * Big cells: fewer glyphs fit a row of the atlas texture (8192 px / 148 px = 55 glyphs), so the ramp (56
 * glyphs, plus the line, block and space glyphs) wraps into a second row. At full brightness every cell shows
 * the densest glyph, index 55: the first of the second row, the glyph a float lookup (55 / 55 computed
 * through a reciprocal, as many GPUs divide) read past the end of the first row, where there is no ink.
 * SwiftShader divides exactly; the lookup is in whole numbers anyway (tests/unit/compose-glyph-lookup.test.ts).
 */
test('celdas grandes: el primer carácter de la segunda fila del atlas se encuentra, igual que en el motor básico', async ({ page }) => {
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const res = await page.evaluate(async () => {
    const E = await import('/__snap/engine.js' as string);
    const shot = async (kind: string) => {
      const cv = document.createElement('canvas');
      const r = E.defaultRecipe();
      r.glyph.cell = 148; r.glyph.aspect = 1;
      r.glyph.charset = [...new Set(Array.from(E.charsetById('detallado').chars as string))].slice(0, 56).join('');
      r.tone.bright = 1;
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: 296, height: 296, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, r, opts) : new E.BasicEngine(cv, r, opts);
      await e.ready();
      e.renderAt(1);
      const s = await e.snapshot(0, 0, 296, 296);
      const grid = e.readGrid();
      const table: string[] = e.glyphChars;
      e.destroy();
      return { d: s!.data as Uint8ClampedArray, idx: table.indexOf(grid.chars[0]) };
    };
    const a = await shot('webgl'), b = await shot('basic');
    // glyphs per atlas row, as buildAtlas lays them out (at most 64, and what fits the texture)
    const maxTex = Math.min(8192, document.createElement('canvas').getContext('webgl2')!.getParameter(0x0D33 /* MAX_TEXTURE_SIZE */) as number);
    const perRow = Math.min(64, Math.floor(maxTex / 148));
    let ink = 0, differ = 0;
    for (let i = 0; i < a.d.length; i += 4) {
      if (a.d[i] + a.d[i + 1] + a.d[i + 2] > 90) ink++;
      if (Math.max(Math.abs(a.d[i] - b.d[i]), Math.abs(a.d[i + 1] - b.d[i + 1]), Math.abs(a.d[i + 2] - b.d[i + 2])) > 8) differ++;
    }
    return { perRow, firstOfSecondRow: a.idx === perRow, sameGlyph: a.idx === b.idx, ink: ink > 296 * 296 * 0.05, differ };
  });
  expect(res).toEqual({ perRow: 55, firstOfSecondRow: true, sameGlyph: true, ink: true, differ: 0 });
});
