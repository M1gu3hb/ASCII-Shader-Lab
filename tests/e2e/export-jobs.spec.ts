import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';

/** Exports that take time: they belong to what started them, and a video piece is rendered from its own frames. */

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

async function openVideoTab(page: Page) {
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
}

test.describe('exportaciones largas', () => {
  test('la grabación en directo sigue con la ventana cerrada y se detiene desde el lienzo', async ({ page }) => {
    await openStudio(page);
    await openVideoTab(page);
    await page.getByRole('button', { name: 'Empezar a grabar' }).click();
    // the sheet closes so the stage can be used; the stage has the stop button
    await expect(page.locator('dialog.sheet[open]')).toHaveCount(0);
    const chip = page.locator('.rec-chip');
    await expect(chip).toContainText('Grabando');
    await page.locator('.stage').click({ position: { x: 200, y: 300 } });
    await expect(chip).toBeVisible();
    // the sheet, opened again, knows about it
    await openVideoTab(page);
    await expect(page.locator('dialog.sheet[open]').getByRole('button', { name: /Detener y guardar \(\d+ s\)/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    const [d] = await Promise.all([page.waitForEvent('download'), chip.getByRole('button', { name: 'Detener y guardar' }).click()]);
    expect(d.suggestedFilename()).toMatch(/-directo\.(webm|mp4)$/);
    await expect(chip).toHaveCount(0);
  });

  test('cerrar la ventana cancela el GIF en curso: nada se descarga después', async ({ page }) => {
    await openStudio(page);
    await openVideoTab(page);
    await page.getByLabel('Duración (s)').fill('2');
    await page.getByLabel('Ancho').selectOption('320');
    let downloads = 0;
    page.on('download', () => { downloads++; });
    await page.getByRole('button', { name: 'Descargar GIF' }).click();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.toast').filter({ hasText: 'Exportación cancelada' })).toBeVisible();
    await page.waitForTimeout(8000);
    expect(downloads).toBe(0);
    // and it can be made again, once, from the start
    await openVideoTab(page);
    await expect(page.getByRole('button', { name: 'Descargar GIF' })).toBeEnabled();
  });

  test('si una parte del estudio no se puede descargar, lo dice y el resto sigue en pie', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true }) })); // no idle prefetch
    await openStudio(page);
    await page.route(/\/assets\/export-sheet-[^/]*\.js$/, r => r.fulfill({ status: 404, body: '' }));
    await page.keyboard.press('e');
    const fail = page.locator('.load-fail');
    await expect(fail).toContainText('No se pudo cargar esta parte del estudio', { timeout: 20_000 });
    await expect(page.locator('.stage canvas').first()).toBeVisible();
    await expect(page.locator('.seedline')).toBeVisible();
    await fail.getByRole('button', { name: 'Cerrar' }).click();
    await expect(fail).toHaveCount(0);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
  });

  test('si el motor básico no se puede descargar cuando WebGL se pierde, lo dice (no «ni Canvas 2D»)', async ({ page }) => {
    await openStudio(page);
    await page.route(/\/assets\/basic-engine-[^/]*\.js$/, r => r.fulfill({ status: 404, body: '' }));
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.stage canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    const alert = page.locator('.fatal');
    await expect(alert).toContainText('No se pudo descargar el motor básico', { timeout: 15_000 });
    await expect(alert).not.toContainText('ni Canvas 2D');
    await expect(alert.getByRole('button', { name: 'Recargar' })).toBeVisible();
  });

  test('una foto en «Bloques» sobre fondo claro sale sin franja negra abajo en el PNG grande', async ({ page }) => {
    const { deflateSync } = await import('node:zlib');
    const { crc32 } = await import('../../src/shared/zip');
    const w = 300, h = 200, row = w * 3 + 1, raw = Buffer.alloc(row * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * row + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 128; }
    const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
    const photo = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    await openStudio(page, '');
    await page.goto('/studio/?camino=foto');
    await expect(page.getByRole('button', { name: 'Elegir una foto' })).toBeVisible({ timeout: 45_000 });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Elegir una foto' }).click()]);
    await chooser.setFiles({ name: 'mi-foto.png', mimeType: 'image/png', buffer: photo });
    await page.getByRole('button', { name: /^Bloques/ }).first().click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Claro' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar PNG/ }).click()]);
    const b64 = readFileSync((await d.path())!).toString('base64');
    // the bottom rows of the export: the paper background, not black (the last row of cells is cut by the edge)
    const black = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
      const px = x.getImageData(0, c.height - 3, c.width, 3).data;
      let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i] < 20 && px[i + 1] < 20 && px[i + 2] < 20) n++;
      return n / (px.length / 4);
    }, b64);
    expect(black).toBeLessThan(0.5);
  });

  test('el GIF de una pieza con video sigue el video fotograma a fotograma', async ({ page }) => {
    test.skip(!hasFfmpeg, 'needs ffmpeg to make a test video');
    const file = test.info().outputPath('reloj.webm');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=12:size=320x180:rate=30', '-c:v', 'libvpx', '-b:v', '300k', file]);
    await openStudio(page);
    await page.evaluate(b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'reloj.webm', { type: 'video/webm' }));
      document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, readFileSync(file).toString('base64'));
    await expect.poll(() => page.evaluate(() => { const v = [...document.querySelectorAll('video')].find(x => x.duration > 5); return v ? !v.paused : false; })).toBe(true);
    await openVideoTab(page);
    await page.getByLabel('Duración (s)').fill('1');
    await page.getByLabel('Fotogramas/s').selectOption('24');
    await page.getByLabel('Ancho').selectOption('320');
    // watch the video while the GIF is made: it is paused and moved to each frame's time, within the clip's second
    await page.evaluate(() => {
      const v = [...document.querySelectorAll('video')].find(x => x.duration > 5)!;
      const log: Array<{ paused: boolean; t: number }> = [];
      (window as unknown as { seeks: typeof log }).seeks = log;
      v.addEventListener('seeked', () => log.push({ paused: v.paused, t: v.currentTime }));
    });
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('button', { name: 'Descargar GIF' }).click()]);
    expect(d.suggestedFilename()).toMatch(/\.gif$/);
    const seeks = await page.evaluate(() => (window as unknown as { seeks: Array<{ paused: boolean; t: number }> }).seeks);
    expect(seeks.length).toBeGreaterThanOrEqual(20);
    expect(seeks.every(x => x.paused)).toBe(true);
    const ts = seeks.map(x => x.t);
    expect(Math.max(...ts) - Math.min(...ts)).toBeLessThanOrEqual(1.05);
  });
});
