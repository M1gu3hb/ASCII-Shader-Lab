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
