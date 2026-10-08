import { build } from 'esbuild';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openStudio, pressUntil } from './helpers';

const enc = (r: unknown) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');
const recipe = { v: 2, source: 'text', text: { content: 'GLYPHOS', font: 'system', weight: 700, size: 1, anim: { kind: 'orbita', on: true, amount: 1, speed: 1 } }, glyph: { cell: 10, aspect: 1, charset: ' .:-=+*#%@', font: 'system', sort: false }, color: { stops: ['#ffffff', '#ffffff'], bg: '#000000' }, motion: { speed: 1 }, media: { xform: [{ kind: 'estela', on: true, amount: 0.95, p: 0.1 }] }, interact: { mode: 'none' }, meta: { space: 'tipo' } };

async function harness(page: Page) {
  const root = process.cwd();
  const out = await build({ stdin: { resolveDir: root, contents: `
    export { normalizeRecipe, defaultRecipe } from './src/engine/recipe';
    export { captureGrid, exportImage, exportGif, trailWarmup, exportStart } from './src/studio/exporting';
    export { offscreenEngine, resolveNothing } from './src/studio/offscreen';
    export { loadFile, syncMedia, mediaElement } from './src/studio/media';
    export { useCaps } from './src/studio/caps';
    export { install } from './src/runtime/api';
    export { PATTERN_GLSL } from './src/engine/glsl/patterns';
    export { applyRecipe, currentRecipe, edit, useStudio, importSession, importFavorites, hydrate, persistNow } from './src/studio/store';
  `.replace('offscreenEngine, resolveNothing', 'offscreenEngine') }, plugins: [{ name: 'exact-views', setup(b) { b.onResolve({ filter: /\/views\/views$/ }, a => ({ path: join(a.resolveDir, a.path + '.ts') })); b.onResolve({ filter: /\/views\/Views$/ }, a => ({ path: join(a.resolveDir, a.path + '.tsx') })); b.onResolve({filter: /\.(woff2?|ttf)\?url$/}, a => ({path:a.path,namespace:'audit-font'})); b.onLoad({filter:/.*/,namespace:'audit-font'}, () => ({contents:"export default '';",loader:'js'})); } }], bundle: true, format: 'esm', write: false, loader: { '.css': 'empty' }, logLevel: 'silent' });
  await page.route('**/__audit/module.js', r => r.fulfill({ body: Buffer.from(out.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
}

for (const kind of ['webgl2', 'basic'] as const) test(`${kind}: PNG y rejilla llevan Estela, y coinciden con su historia preparada`, async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async ({ input, kind }) => {
    const m = await import('/__audit/module.js' as string);
    m.useCaps.setState({ renderer: kind });
    const r = m.normalizeRecipe(input), start = 0, fps = 30;
    const n = Math.round(m.trailWarmup(r) * fps);
    const size = { cssW: 320, cssH: 180, pixelRatio: 1 };
    const ref = await m.offscreenEngine(r, size);
    for (let i = n; i >= 1; i--) ref.renderAt(start - i / fps, start - i / fps);
    ref.renderAt(start, start);
    const expected = Array.from(ref.readGrid().lum); ref.destroy();
    const grid = await m.captureGrid(r, 32, 18, start);
    const cold = await m.offscreenEngine(r, size); cold.renderAt(start, start);
    const coldLum = Array.from(cold.readGrid().lum); cold.destroy();
    // PNG uses the stage's CSS composition (1280×720), rendered at 320×180.
    const pngRef = await m.offscreenEngine(r, { cssW: 1280, cssH: 720, pixelRatio: .25 });
    for (let i = n; i >= 1; i--) pngRef.renderAt(start - i / fps, start - i / fps);
    pngRef.renderAt(start, start);
    const expectedPng = await new Promise<Blob>(resolve => pngRef.canvas.toBlob(resolve, 'image/png'));
    pngRef.destroy();
    const actualPng = await m.exportImage(r, { kind: 'fixed', w: 320, h: 180 }, { transparent: false, format: 'png' });
    const pixels = async (blob: Blob) => { const bitmap = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const ctx = c.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close(); return Array.from(ctx.getImageData(0, 0, c.width, c.height).data); };
    const a = await pixels(actualPng), b = await pixels(expectedPng);
    return { equalGrid: JSON.stringify(expected) === JSON.stringify(Array.from(grid.lum)), changed: expected.reduce((s, v, i) => s + Math.abs(v - coldLum[i]), 0), pngError: a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length };
  }, { input: recipe, kind });
  expect(result.equalGrid).toBe(true); expect(result.changed).toBeGreaterThan(100); expect(result.pngError).toBeLessThan(.05);
});

test('colección: la estrella distingue cambios y desactivar atajos persiste tras recargar', async ({ page }) => {
  await openStudio(page, enc(recipe));
  await page.locator('.act.fav').click();
  await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
  // A local edit on a real control.
  await page.getByRole('tab', { name: /Movimiento/ }).click();
  const speed = page.getByRole('slider', { name: /^Velocidad$/ });
  await speed.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.act.fav')).toHaveAccessibleName(/Guardado antes de tus cambios/);
  await pressUntil(page, '?', page.getByRole('dialog', { name: /Atajos/ }));
  await page.getByRole('switch', { name: /Atajos de una sola/ }).uncheck();
  await page.keyboard.press('Escape');
  const before = await page.locator('.seedline').textContent();
  await page.keyboard.press('r'); expect(await page.locator('.seedline').textContent()).toBe(before);
  await page.reload();
  await expect(page.locator('.seedline')).toBeVisible();
  await page.getByRole('button', { name: /Atajos/ }).click();
  await expect(page.getByRole('switch', { name: /Atajos de una sola/ })).not.toBeChecked();
});

test('un enlace pegado con el estudio abierto crea una entrada y conserva la edición anterior', async ({ page }) => {
  await openStudio(page, enc(recipe));
  const incoming = { ...recipe, text: { ...recipe.text, content: 'ENLACE NUEVO' }, meta: { space: 'tipo', name: 'ENLACE NUEVO' } };
  await page.evaluate(hash => { location.hash = hash; }, enc(incoming));
  await expect(page.locator('.seedline')).toContainText('ENLACE NUEVO');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.seedline')).toContainText('Desde un enlace');
  expect(new URL(page.url()).hash).toBe('');
});

test('importar una sesión conserva la versión local después de persistir y volver a hidratar', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string); await m.hydrate();
    m.edit((r: any) => { r.color.bg = '#00ff00'; });
    const old = m.useStudio.getState().entries[0];
    const incoming = JSON.parse(JSON.stringify(old)); incoming.recipe.color.bg = '#ff00ff'; incoming.updated = Date.now() + 1000;
    const first = m.importSession({ entries: [incoming], favorites: [null], cursor: 0 });
    const again = m.importSession({ entries: [incoming], favorites: [], cursor: 0 });
    await m.persistNow();
    return { first, again, colors: m.useStudio.getState().entries.map((e: any) => e.recipe.color.bg) };
  });
  expect(result.first.preserved).toBe(1); expect(result.first.invalid).toBe(1);
  expect(result.colors.sort()).toEqual(['#00ff00', '#ff00ff']); expect(result.again.preserved).toBe(0);
  await page.reload();
  const colors = await page.evaluate(async () => { const m = await import('/__audit/module.js' as string); await m.hydrate(); return m.useStudio.getState().entries.map((e: any) => e.recipe.color.bg); });
  expect(colors.sort()).toEqual(['#00ff00', '#ff00ff']);
});

test('la repetición de R no crea resultados y los atajos Deshacer no actúan con una hoja abierta', async ({ page }) => {
  await openStudio(page);
  const before = await page.locator('.seedline').textContent();
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', repeat: true, bubbles: true })));
  expect(await page.locator('.seedline').textContent()).toBe(before);
  await pressUntil(page, 'e', page.getByRole('dialog', { name: /Llevar la pieza/ }));
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('dialog', { name: /Llevar la pieza/ })).toBeVisible();
});


for (const kind of ['webgl2', 'basic'] as const) test(`${kind}: ocultar todas las capas deja una rejilla vacía incluso con inversión y glifos sin espacios`, async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async kind => {
    const m = await import('/__audit/module.js' as string); m.useCaps.setState({ renderer: kind });
    const r = m.defaultRecipe(); r.layers.forEach((l: any) => { l.on = false; });
    r.glyph.charset = '#@'; r.glyph.sort = false; r.glyph.font = 'system'; r.tone.invert = true;
    const g = await m.captureGrid(r, 20, 12, 1);
    return { lum: Math.max(...g.lum), alpha: Math.max(...g.alpha) };
  }, kind);
  expect(result).toEqual({ lum: 0, alpha: 0 });
});

test('el web component aplica recipe, paused y scrim tras conectarse y se libera al salir', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string); m.install();
    const api = (window as any).Glyphos; api.register(m.PATTERN_GLSL);
    const el = document.createElement('glyphos-field'); el.setAttribute('paused', '');
    el.style.cssText = 'width:320px;height:180px';
    const r = m.defaultRecipe(); r.glyph.font = 'system'; el.setAttribute('recipe', JSON.stringify(r));
    document.body.replaceChildren(el); await new Promise(resolve => setTimeout(resolve, 250));
    const first = (el as any).ctl;
    await first.engine.ready();
    const before = first.engine.time;
    el.removeAttribute('paused');
    for (let i = 0; i < 30 && first.engine.time <= before; i++) await new Promise(resolve => setTimeout(resolve, 100));
    const playing = first.engine.time > before;
    el.setAttribute('paused', ''); const paused = first.engine.time;
    await new Promise(resolve => setTimeout(resolve, 100)); const stopped = first.engine.time === paused;
    const next = m.defaultRecipe(); next.color.bg = '#ff00ff'; next.glyph.font = 'system';
    el.setAttribute('recipe', JSON.stringify(next));
    const updated = first.engine.recipe?.color.bg ?? (first.engine as any).r.color.bg;
    el.setAttribute('scrim', 'full'); el.setAttribute('scrim-opacity', '.4');
    await new Promise(resolve => setTimeout(resolve, 100));
    const scrims = el.shadowRoot!.querySelectorAll('div').length;
    el.remove(); await new Promise(resolve => setTimeout(resolve, 30));
    return { playing, stopped, updated, scrims, cleaned: (el as any).ctl === null && !el.shadowRoot!.querySelector('canvas') };
  });
  expect(result).toEqual({ playing: true, stopped: true, updated: '#ff00ff', scrims: 1, cleaned: true });
});

test('web component: corregir una receta futura permite arrancar sin reconectar el elemento', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string);
    m.install(); (window as any).Glyphos.register(m.PATTERN_GLSL);
    const el = document.createElement('glyphos-field'); el.style.height = '200px';
    el.setAttribute('paused', ''); el.setAttribute('recipe', JSON.stringify({ v: 99 }));
    document.body.replaceChildren(el); await new Promise(r => setTimeout(r, 50));
    const rejected = (el as any).ctl === null;
    const recipe = m.defaultRecipe(); recipe.glyph.font = 'system';
    el.setAttribute('recipe', JSON.stringify(recipe));
    await new Promise(r => setTimeout(r, 100));
    const recovered = !!(el as any).ctl?.engine;
    el.remove(); return { rejected, recovered };
  });
  expect(result).toEqual({ rejected: true, recovered: true });
});

test('web component: cambiar el origen carga el medio correcto y cambiar la receta actualiza su velocidad', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string);
    m.install(); (window as any).Glyphos.register(m.PATTERN_GLSL);
    const videos: HTMLVideoElement[] = [];
    const create = document.createElement.bind(document);
    document.createElement = ((name: string, opts?: ElementCreationOptions) => {
      const el = create(name, opts); if (name === 'video') videos.push(el as HTMLVideoElement); return el;
    }) as typeof document.createElement;
    const el = create('glyphos-field'); el.style.height = '200px'; el.setAttribute('paused', '');
    el.setAttribute('src', 'data:video/webm;base64,');
    const r = m.defaultRecipe(); r.glyph.font = 'system';
    el.setAttribute('recipe', JSON.stringify(r));
    document.body.replaceChildren(el); await new Promise(r => setTimeout(r, 100));
    r.source = 'video'; r.media.rate = .5;
    el.setAttribute('recipe', JSON.stringify(r)); await new Promise(r => setTimeout(r, 100));
    const bound = !!(el as any).ctl?.engine?.hasMedia('video');
    r.media.rate = 1.5; el.setAttribute('recipe', JSON.stringify(r));
    const speed = videos.at(-1)?.playbackRate ?? null;
    const ctl = (el as any).ctl; el.setAttribute('recipe', JSON.stringify({ v: 99 }));
    const retained = (el as any).ctl === ctl;
    el.remove(); document.createElement = create;
    return { bound, speed, retained };
  });
  expect(result).toEqual({ bound: true, speed: 1.5, retained: true });
});

test('sin portapapeles, L abre un enlace seleccionable y Compartir no afirma que lo copió', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } });
    document.execCommand = () => false;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('blocked'); } });
  });
  await openStudio(page);
  await page.keyboard.press('l');
  await expect(page.locator('dialog[open]')).toContainText('enlace');
  const link = page.locator('dialog[open] input[readonly]');
  await expect(link).toHaveValue(/\/ver\/#r=/);
  const share = page.locator('dialog[open]').getByRole('button', { name: /^Compartir…$/ });
  if (await share.count()) { await share.click(); await expect(page.locator('.toast').last()).not.toContainText('quedó copiado'); }
});

test('colores de imagen: controles inactivos y límites de texto explícitos', async ({ page }) => {
  const r = { ...recipe, source: 'image', color: { ...recipe.color, mode: 'source' }, meta: { space: 'media' } };
  await openStudio(page, enc(r));
  await page.getByRole('tab', { name: /^Color/ }).click();
  await expect(page.getByRole('slider', { name: 'Desplazar la paleta' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cómo se reparte el color' })).toBeDisabled();
  await page.getByRole('button', { name: 'Usar tu paleta', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Desplazar la paleta' })).toBeEnabled();
  await page.getByRole('button', { name: 'Texto', exact: true }).click();
  const input = page.getByRole('textbox', { name: /Texto \(Enter para otra línea\)/ });
  await expect(input).toHaveAttribute('maxlength', '600');
  await expect(input).toHaveAccessibleName(/\/600/);
});

test('objetivos pequeños del escritorio tienen al menos 24 px', async ({ page }) => {
  await openStudio(page);
  await page.getByRole('tab', { name: /^Capas/ }).click();
  const targets = page.locator('.help-q:visible, .sl-val:visible, .seed-acts button:visible');
  const boxes = await targets.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return [r.width, r.height]; }));
  expect(boxes.length).toBeGreaterThan(5);
  for (const [w, h] of boxes) { expect(w).toBeGreaterThanOrEqual(24); expect(h).toBeGreaterThanOrEqual(24); }
});

test('la placa del mensaje explica cuándo tiene efecto y se habilita con resplandor', async ({ page }) => {
  const r = { ...recipe, msg: { on: true, text: 'Hola' }, fx: { cellBg: 0, glow: 0 } };
  await openStudio(page, enc(r));
  await page.getByRole('tab', { name: 'Mensaje', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Placa detrás del texto' })).toBeDisabled();
  await expect(page.getByText(/El fondo bajo el mensaje ya es plano/)).toBeVisible();
  await page.evaluate(hash => { location.hash = hash; }, enc({ ...r, fx: { cellBg: 0, glow: 0.5 } }));
  await expect(page.getByRole('slider', { name: 'Placa detrás del texto' })).toBeEnabled();
});

test('miniaturas: una valla GPU que no responde termina sin leer píxeles ni bloquear', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const m = await import('/__audit/module.js' as string);
    m.useCaps.setState({ renderer: 'webgl2' });
    const r = m.defaultRecipe(); r.glyph.font = 'system';
    const eng = await m.offscreenEngine(r, { cssW: 160, cssH: 100, pixelRatio: 1 });
    await eng.renderAt(0, 0);
    const gl = eng.canvas.getContext('webgl2')!;
    const check = gl.getSyncParameter.bind(gl), read = gl.readPixels.bind(gl), del = gl.deleteSync.bind(gl);
    let reads = 0, removed = 0;
    gl.getSyncParameter = () => gl.UNSIGNALED;
    gl.readPixels = (...a: any[]) => { reads++; (read as any)(...a); };
    gl.deleteSync = s => { removed++; del(s); };
    const start = performance.now();
    const pixels = await eng.snapshot(0, 0, 20, 20);
    const elapsed = performance.now() - start;
    gl.getSyncParameter = check; gl.readPixels = read; gl.deleteSync = del; eng.destroy();
    return { empty: pixels === null, elapsed, reads, removed };
  });
  expect(result.empty).toBe(true); expect(result.reads).toBe(0); expect(result.removed).toBe(1);
  expect(result.elapsed).toBeGreaterThanOrEqual(3900); expect(result.elapsed).toBeLessThan(7000);
});

test('el inicio del video exportado es explícito y la duración mostrada conserva el bucle', async ({ page }) => {
  await openStudio(page, enc({ ...recipe, source: 'video', motion: { speed: 1 }, media: { rate: 1 }, meta: { space: 'media' } }));
  await pressUntil(page, 'e', page.getByRole('dialog', { name: /Llevar la pieza/ }));
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  await expect(page.getByText('El clip empieza al inicio de tu video (0 s).')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(hash => { location.hash = hash; }, enc({ ...recipe, motion: { speed: 1, loop: 1.86 } }));
  await expect(page.locator('.seedline')).toContainText('Desde un enlace');
  await pressUntil(page, 'e', page.getByRole('dialog', { name: /Llevar la pieza/ }));
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Duración (s)' })).toHaveValue('1.86');
});

for (const unknownDuration of [false, true]) test('un GIF de video empieza a 0 s aunque la vista esté avanzada y restaura el video después' + (unknownDuration ? ' (duración aún desconocida)' : ''), async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async unknownDuration => {
    const m = await import('/__audit/module.js' as string); m.useCaps.setState({ renderer: 'basic' });
    const c = document.createElement('canvas'); c.width = 160; c.height = 100; const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgb(20,20,20)'; ctx.fillRect(0,0,160,100);
    const stream = c.captureStream(30); const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = []; recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    const complete = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, {type:'video/webm'})); });
    recorder.start();
    const since = performance.now(); const timer = setInterval(() => { const gray = Math.min(230, 20 + (performance.now() - since) * .4); ctx.fillStyle = `rgb(${gray},${gray},${gray})`; ctx.fillRect(0,0,160,100); }, 30);
    await new Promise(resolve => setTimeout(resolve, 600)); clearInterval(timer); recorder.stop();
    const blob = await complete; stream.getTracks().forEach(t => t.stop());
    const r = m.defaultRecipe(); r.source = 'video'; r.glyph.font = 'system'; r.glyph.charset = '█'; r.glyph.sort = false; r.color.mode = 'source'; r.color.bg = '#000000'; r.color.shade = 0; r.color.vivid = 0; r.motion.loop = 0;
    m.applyRecipe(r, 'importado', 'Video');
    const loaded = await m.loadFile(new File([blob], 'gradient.webm', {type:'video/webm'}));
    m.edit((x: any) => { x.media.ref = loaded.ref; }); m.syncMedia(true);
    const video = m.mediaElement('video') as HTMLVideoElement; video.pause();
    await new Promise<void>(resolve => { video.addEventListener('seeked', () => resolve(), {once:true}); video.currentTime = .4; });
    const before = video.currentTime;
    if (unknownDuration) Object.defineProperty(video, 'duration', { configurable: true, get: () => Infinity });
    const gif = await m.exportGif(m.currentRecipe(), 320, {fps:4,seconds:.25,start:m.exportStart(m.currentRecipe()),colors:128}, () => {}, {cancelled:false});
    const bitmap = await createImageBitmap(gif); const out = document.createElement('canvas'); out.width=bitmap.width; out.height=bitmap.height; const x=out.getContext('2d')!; x.drawImage(bitmap,0,0); bitmap.close();
    const pixels=x.getImageData(0,0,out.width,out.height).data; let sum=0; for(let i=0;i<pixels.length;i+=4)sum+=pixels[i];
    return { mean:sum/(pixels.length/4), before, after:video.currentTime };
  }, unknownDuration);
  expect(result.mean).toBeLessThan(50); expect(result.before).toBeGreaterThan(.3); expect(result.after).toBeCloseTo(result.before, 2);
});
