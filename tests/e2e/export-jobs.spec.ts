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
