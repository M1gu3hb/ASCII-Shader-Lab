import { expect, test, type Page } from '@playwright/test';
import { contextOf } from './canvas';
import { openStudio } from './helpers';
import { chooseRecipe, hideStageOverlays } from './recipes';

/**
 * «Grabado láser» (C-07) in the Texto space: the recipe engraves the person's words. Writing other words changes
 * the drawing: what was engraved dissolves and the tip starts on the new letters, in both engines.
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
