import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { contextOf } from './canvas';
import { download, openStudio } from './helpers';
import { chooseRecipe, hideStageOverlays } from './recipes';

/**
 * «Grabado láser» (C-07) in the Texto space: the recipe engraves the person's words. Writing other words changes
 * the drawing: what was engraved dissolves and the tip starts on the new letters, in both engines. Its exported
 * image and page carry the engraving of the words.
 */

/** Share of bright pixels of the stage in a horizontal band (x0..x1 as fractions of its width). */
async function ink(page: Page, x0: number, x1: number): Promise<number> {
  const png = await page.locator('.stage canvas').first().screenshot();
  return page.evaluate(async ([src, a, b]) => {
    const img = new Image();
    img.src = src as string;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 320, 180);
    const d = x.getImageData(0, 0, 320, 180).data;
    let lit = 0, all = 0;
    for (let j = 0; j < 180; j++) for (let i = Math.floor(320 * (a as number)); i < Math.floor(320 * (b as number)); i++) {
      const o = (j * 320 + i) * 4;
      all++;
      if (d[o] + d[o + 1] + d[o + 2] > 150) lit++;
    }
    return lit / all;
  }, ['data:image/png;base64,' + png.toString('base64'), x0, x1] as const);
}

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('grabado láser en Texto: el GIF exportado lleva el surco y la punta avanza de un cuadro a otro', async ({ page }) => {
  test.skip(!hasFfmpeg, 'Sin ffmpeg no se pueden leer los cuadros del GIF.');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await openStudio(page, '#space=tipo');
  await hideStageOverlays(page);
  await chooseRecipe(page, 'Grabado láser');
  await page.getByRole('tab', { name: 'Tu texto', exact: true }).click();
  await page.getByRole('textbox', { name: /^Texto \(Enter para otra línea\)/ }).fill('OB');
  await expect.poll(() => ink(page, 0.25, 0.75), { message: 'se graban la O y la B', timeout: 90_000, intervals: [1000] }).toBeGreaterThan(0.01);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  await page.getByLabel('Duración (s)').fill('2');
  await page.getByRole('radio', { name: '320 px' }).click();
  const gif = await download(page, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
  expect(readFileSync(gif.path).subarray(0, 3).toString()).toBe('GIF');
  // every frame, grey at 160 × 90: ink in each, and the engraving is not one still picture
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', gif.path, '-vf', 'scale=160:90,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 });
  const n = Math.floor(raw.length / (160 * 90));
  expect(n, 'cuadros del GIF').toBeGreaterThanOrEqual(10);
  const lit = Array.from({ length: n }, (_, f) => { let c = 0; for (let i = f * 14400; i < (f + 1) * 14400; i++) if (raw[i] > 60) c++; return c / 14400; });
  expect(Math.min(...lit), `tinta por cuadro: ${lit.map(v => v.toFixed(3)).join(' ')}`).toBeGreaterThan(0.005);
  let moved = 0;
  for (let i = 0; i < 14400; i++) if (Math.abs(raw[i] - raw[(n - 1) * 14400 + i]) > 40) moved++;
  expect(moved / 14400, 'el primer y el último cuadro difieren (la punta avanza)').toBeGreaterThan(0.002);
  expect(errors).toEqual([]);
});

test('grabado láser en Texto: la imagen y la página exportadas llevan el grabado de las palabras', async ({ page, context }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await openStudio(page, '#space=tipo');
  await hideStageOverlays(page);
  await chooseRecipe(page, 'Grabado láser');
  await page.getByRole('tab', { name: 'Tu texto', exact: true }).click();
  await page.getByRole('textbox', { name: /^Texto \(Enter para otra línea\)/ }).fill('OB');
  await expect.poll(() => ink(page, 0.25, 0.75), { message: 'se graban la O y la B', timeout: 90_000, intervals: [1000] }).toBeGreaterThan(0.01);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Imagen' }).click();
  const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
  expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
  // the page as code: it runs the family on its own, reading the same words
  await page.getByRole('tab', { name: 'Código' }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
  const file = test.info().outputPath('grabado.html');
  await d.saveAs(file);
  expect(readFileSync(file, 'utf8')).toContain('"OB"');
  const other = await context.newPage();
  const otherErrors: string[] = [];
  other.on('pageerror', e => otherErrors.push(e.message));
  await other.setViewportSize({ width: 960, height: 540 });
  await other.goto('file://' + file);
  // the code page draws with its own clock: the tip engraves the O and the B in the middle of its canvas
  await expect.poll(async () => {
    const shot = await other.locator('canvas').first().screenshot();
    return other.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, 160, 90);
      const px = x.getImageData(40, 0, 80, 90).data;
      let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 150) lit++;
      return lit / (px.length / 4);
    }, 'data:image/png;base64,' + shot.toString('base64'));
  }, { message: 'la página exportada graba', timeout: 90_000, intervals: [1000] }).toBeGreaterThan(0.01);
  expect(otherErrors).toEqual([]);
  expect(errors).toEqual([]);
});

for (const engine of ['webgl', 'basico'] as const) {
  test(`grabado láser en Texto (${engine}): escribir otro texto cambia el grabado`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=tipo`);
    expect(await contextOf(page, '.stage canvas')).toBe(engine === 'basico' ? '2d' : 'webgl2');
    await hideStageOverlays(page);
    await chooseRecipe(page, 'Grabado láser');
    // «GLYPHOS»: the tip starts on the G, at the left of the stage
    await expect.poll(() => ink(page, 0.02, 0.2), { message: 'la G se graba', timeout: 90_000, intervals: [1000] }).toBeGreaterThan(0.01);
    const before = await ink(page, 0.02, 0.2);
    // other words: a single centred letter, nowhere near the G
    await page.getByRole('tab', { name: 'Tu texto', exact: true }).click();
    await page.getByRole('textbox', { name: /^Texto \(Enter para otra línea\)/ }).fill('I');
    // what was engraved dissolves (half a second) and the tip goes to the I in the middle
    await expect.poll(() => ink(page, 0.02, 0.2), { message: 'la G se disuelve', timeout: 30_000, intervals: [500] }).toBeLessThan(before * 0.35);
    await expect.poll(() => ink(page, 0.42, 0.58), { message: 'se graba la I', timeout: 60_000, intervals: [1000] }).toBeGreaterThan(0.01);
    expect(errors).toEqual([]);
  });
}
