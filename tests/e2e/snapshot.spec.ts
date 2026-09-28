import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * Renderer.snapshot of the WebGL engine (history thumbnails come from it) when the context goes away just
 * before it, its event still to come: it answers «no picture» (null), never a blank one that would be kept
 * as the piece's thumbnail. Some browsers return no fence on a lost context (emulated here); Chromium
 * returns one that never signals.
 */
test('una instantánea de un contexto WebGL perdido es «nada», nunca una imagen en blanco', async ({ page }) => {
  const out = await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' });
  await page.route('**/__snap/engine.js', r => r.fulfill({ body: Buffer.from(out.outputFiles[0].contents), contentType: 'text/javascript' }));
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
