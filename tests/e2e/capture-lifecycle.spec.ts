import { build } from 'esbuild';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';

async function observeCapture(page: Page, delay = 0) {
  await page.addInitScript(delay => {
    const streams: MediaStream[] = [];
    Object.assign(window, { captureTracks: () => streams.flatMap(s => s.getTracks()).filter(t => t.readyState === 'live').length, captureRequests: () => streams.length });
    const md = navigator.mediaDevices, original = md.getUserMedia.bind(md);
    md.getUserMedia = async c => {
      const s = await original(c); streams.push(s);
      if (delay) await new Promise(r => setTimeout(r, delay));
      return s;
    };
  }, delay);
}
const active = (page: Page) => page.evaluate(() => (window as unknown as { captureTracks: () => number }).captureTracks());

for (const pending of [false, true]) test(`cámara ${pending ? 'esperando permiso' : 'encendida'}: Componentes cierra todas las pistas`, async ({ playwright, baseURL }) => {
  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 1366, height: 860 } });
    await observeCapture(page, pending ? 3500 : 0);
    await openStudio(page, '#space=media&source=camera');
    const button = page.locator('.prompt .card').getByRole('button', { name: 'Activar cámara' });
    // Same event loop: both handlers can run before React disables the button.
    await button.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    if (pending) await expect(page.locator('.prompt .card').getByRole('button', { name: 'Esperando permiso…' })).toBeDisabled();
    else await expect(page.getByRole('button', { name: 'Apagar cámara' })).toBeVisible();
    if (pending) await page.locator('.spaces button').nth(5).click();
    else await page.keyboard.press('6');
    await expect(page.locator('.spaces button').nth(5)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(active.bind(null, page)).toBe(0);
    await page.waitForTimeout(pending ? 3900 : 300);
    expect(await active(page)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { captureRequests: () => number }).captureRequests())).toBe(1);
    expect(await page.locator('video').count()).toBe(0);
  } finally { await browser.close(); }
});

test('micrófono: al entrar en Imagen se detienen todas las pistas', async ({ playwright, baseURL }) => {
  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 1366, height: 860 } });
    await observeCapture(page);
    await openStudio(page);
    await page.getByRole('tab', { name: 'Movimiento', exact: true }).click();
    await page.getByRole('button', { name: 'Reaccionar al sonido (micrófono)' }).click();
    await expect(page.getByRole('button', { name: 'Dejar de escuchar' })).toBeVisible();
    expect(await active(page)).toBe(1);
    await page.keyboard.press('3');
    await expect.poll(active.bind(null, page)).toBe(0);
  } finally { await browser.close(); }
});

test('un video con sonido se pausa al pasar a Componentes y vuelve al regresar', async ({ page }) => {
  const module = await build({ stdin: { contents: `export * as media from './src/studio/media'; export * as store from './src/studio/store'; export {defaultRecipe} from './src/engine/recipe';`, resolveDir: process.cwd() }, plugins: [{ name: 'exact-views-file', setup(b) { b.onResolve({ filter: /\/views\/views$/ }, a => ({ path: join(a.resolveDir, a.path + '.ts') })); } }], bundle: true, format: 'esm', write: false, loader: { '.css': 'empty' }, logLevel: 'silent' });
  await page.route('**/__capture/module.js', r => r.fulfill({ body: Buffer.from(module.outputFiles[0].contents), contentType: 'text/javascript' }));
  await page.goto('/licencia/');
  const result = await page.evaluate(async () => {
    const M = await import('/__capture/module.js' as string);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 40;
    const ctx = new AudioContext(), osc = ctx.createOscillator(), sound = ctx.createMediaStreamDestination();
    osc.connect(sound); osc.start();
    const stream = cv.captureStream(10); sound.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const paint = cv.getContext('2d')!;
    const draw = setInterval(() => { paint.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`; paint.fillRect(0, 0, 64, 40); }, 50);
    const chunks: Blob[] = [], rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    rec.ondataavailable = e => chunks.push(e.data);
    rec.start(); await new Promise(r => setTimeout(r, 500));
    await new Promise<void>(r => { rec.onstop = () => r(); rec.stop(); });
    clearInterval(draw); stream.getTracks().forEach(t => t.stop()); osc.stop(); await ctx.close();
    const r = M.defaultRecipe(); r.source = 'video';
    M.store.applyRecipe(r, 'importado', 'Video'); M.media.startMediaSync();
    const loaded = await M.media.loadFile(new File(chunks, 'sonido.webm', { type: 'video/webm' }));
    if (!loaded) throw new Error(M.media.useMedia.getState().error ?? 'No se generó el video de prueba');
    M.store.edit((r: { media: { ref: unknown } }) => { r.media.ref = loaded.ref; });
    M.media.syncMedia(true); M.media.toggleMute();
    const v = M.media.mediaElement('video') as HTMLVideoElement;
    await v.play();
    const before = { paused: v.paused, muted: v.muted };
    M.store.useStudio.setState({ space: 'componentes' });
    const paused = v.paused;
    M.store.useStudio.setState({ space: 'arte' });
    await new Promise(r => setTimeout(r, 100));
    return { before, paused, resumed: !v.paused };
  });
  expect(result).toEqual({ before: { paused: false, muted: false }, paused: true, resumed: true });
});
