import { build } from 'esbuild';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';

test('snapshot conserva los píxeles de un lienzo vivo aunque espere a la GPU', async ({ page }) => {
  const module = await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
  await page.route('**/__audit/engine.js', r => r.fulfill({ body: Buffer.from(module.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/engine.js' as string);
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    const r = m.defaultRecipe(); r.layers.forEach((l: any) => { l.on = false; }); r.color.bg = '#123456';
    const e = new m.AsciiEngine(canvas, r, { library: m.PATTERN_GLSL, googleFonts: false,
      fixedSize: { width: 32, height: 24, pixelRatio: 1 }, autoplay: false, interactive: false });
    await e.ready(); e.renderAt(0);
    const preserved = canvas.getContext('webgl2')!.getContextAttributes()!.preserveDrawingBuffer;
    const image = await e.snapshot(0, 0, 4, 4); e.destroy(); canvas.remove();
    return { preserved, pixels: image ? Array.from(image.data) : null };
  });
  expect(result.preserved).toBe(false);
  expect(result.pixels).toEqual(Array.from({ length: 16 }, () => [18, 52, 86, 255]).flat());
});

async function harness(page: Page) {
  const root = process.cwd();
  const out = await build({ stdin: { resolveDir: root, contents: `
    export { buildAtlas } from './src/engine/atlas';
    export { normalizeRecipe, defaultRecipe } from './src/engine/recipe';
    export { captureGrid, exportImage, exportGif, trailWarmup, exportStart } from './src/studio/exporting';
    export { offscreenEngine, resolveNothing } from './src/studio/offscreen';
    export { loadFile, syncMedia, mediaElement, startMediaSync } from './src/studio/media';
    export { useCaps } from './src/studio/caps';
    export { install } from './src/runtime/api';
    export { PATTERN_GLSL } from './src/engine/glsl/patterns';
    export { applyRecipe, currentRecipe, edit, useStudio, importSession, importFavorites, hydrate, persistNow } from './src/studio/store';
  `.replace('offscreenEngine, resolveNothing', 'offscreenEngine') }, plugins: [{ name: 'exact-views', setup(b) { b.onResolve({ filter: /\/views\/views$/ }, a => ({ path: join(a.resolveDir, a.path + '.ts') })); b.onResolve({ filter: /\/views\/Views$/ }, a => ({ path: join(a.resolveDir, a.path + '.tsx') })); b.onResolve({filter: /\.(woff2?|ttf)\?url$/}, a => ({path:a.path,namespace:'audit-font'})); b.onLoad({filter:/.*/,namespace:'audit-font'}, () => ({contents:"export default '';",loader:'js'})); } }], bundle: true, format: 'esm', write: false, loader: { '.css': 'empty' }, logLevel: 'silent' });
  await page.route('**/__audit/module.js', r => r.fulfill({ body: Buffer.from(out.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
}

test('terminar una exportación no reanuda el video después de salir a Componentes', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string); m.useCaps.setState({ renderer: 'basic' });
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50;
    canvas.getContext('2d')!.fillRect(0, 0, 80, 50);
    const stream = canvas.captureStream(10), rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const complete = new Promise<Blob>(resolve => { rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })); });
    const paint = setInterval(() => {
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = `hsl(${Date.now() % 360} 70% 50%)`; ctx.fillRect(0, 0, 80, 50);
    }, 40);
    rec.start(); await new Promise(r => setTimeout(r, 600)); rec.stop(); const blob = await complete;
    clearInterval(paint);
    stream.getTracks().forEach(t => t.stop());
    const r = m.defaultRecipe(); r.source = 'video'; r.glyph.font = 'system';
    m.applyRecipe(r, 'importado', 'Video'); m.startMediaSync();
    const loaded = await m.loadFile(new File([blob], 'test.webm', { type: 'video/webm' }));
    if (!loaded) throw new Error(`No se generó un video de prueba válido (${blob.size} bytes)`);
    m.edit((r: any) => { r.media.ref = loaded.ref; }); m.syncMedia(true);
    const video = m.mediaElement('video') as HTMLVideoElement; await video.play();
    const wasPlaying = !video.paused;
    await m.exportGif(m.currentRecipe(), 80, { fps: 5, seconds: .2, start: 0, colors: 32 }, () => {
      m.useStudio.setState({ space: 'componentes' });
    }, { cancelled: false });
    await new Promise(r => setTimeout(r, 100));
    const paused = video.paused;
    video.pause(); return { wasPlaying, paused };
  });
  expect(result).toEqual({ wasPlaying: true, paused: true });
});


for (const surface of ['estudio', 'visor'] as const) test(`${surface}: cada peso de fuente local anunciado carga un archivo real`, async ({ page }) => {
  if (surface === 'estudio') await openStudio(page);
  else {
    const r = { v: 2, glyph: { font: 'system' } };
    await page.goto('/ver/#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url') + '&p=1');
    await expect(page.locator('.ver-stage[data-state="ready"]')).toHaveCount(1);
  }
  const rows = await page.evaluate(async () => {
    const fonts = [
      ['JetBrains Mono', [100,200,300,400,500,600,700,800]],
      ['IBM Plex Mono', [100,200,300,400,500,600,700]],
      ['Martian Mono', [100,200,300,400,500,600,700,800]],
      ['Fira Code', [300,400,500,600,700]], ['Space Mono', [400,700]],
      ['VT323', [400]], ['Press Start 2P', [400]], ['Silkscreen', [400,700]], ['Instrument Serif', [400]],
    ] as const;
    const out = [];
    for (const [family, weights] of fonts) for (const weight of weights) {
      const faces = await document.fonts.load(`${weight} 16px "${family}"`, 'GLYPHOS ñ');
      const variableRange = family === 'Fira Code' ? '300 700' : ['JetBrains Mono', 'Martian Mono'].includes(family) ? '100 800' : null;
      out.push({ family, weight, loaded: faces.length > 0 && faces.every(f => f.status === 'loaded'),
        correctFace: !variableRange || faces.some(f => f.weight === variableRange) });
    }
    return out;
  });
  expect(rows.length).toBe(35);
  for (const row of rows) {
    expect(row.loaded, `${row.family}/${row.weight}`).toBe(true);
    expect(row.correctFace, `${row.family}/${row.weight}: cara variable equivalente al código`).toBe(true);
  }
});


test('el atlas del sistema tiene los mismos píxeles en pantallas de densidad 1 y 2', async ({ browser }) => {
  const images: number[][] = [];
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ deviceScaleFactor: dpr });
    try {
      const page = await context.newPage(); await harness(page);
      images.push(await page.evaluate(async () => {
        const { buildAtlas } = await import('/__audit/module.js' as string);
        const atlas = buildAtlas({ charset: ' ·◔◑◕●', sort: true,
          stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          weight: 400, scale: 1.03, cw: 22, ch: 34, extras: '', maxTex: 4096 });
        return Array.from(atlas.canvas.getContext('2d')!.getImageData(0, 0, atlas.canvas.width, atlas.canvas.height).data);
      }));
    } finally { await context.close(); }
  }
  expect(images[0].some(v => v > 0)).toBe(true);
  expect(images[1]).toEqual(images[0]);
});
