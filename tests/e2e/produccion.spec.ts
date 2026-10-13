import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { download, openStudio } from './helpers';
import { chooseRecipe, hideStageOverlays } from './recipes';

/**
 * The public site after a deployment, as a person reaches it (closing of PR #10, §17):
 *   BASE_URL=https://glyphos-ascii.vercel.app npx playwright test tests/e2e/produccion.spec.ts --project=desktop
 * (and locally against `vite preview`). Its routes answer, the glyph and photo studios are still paused, the dice
 * are version 8, `ecos` and `humo` paint their own colour in both engines, and a piece made with one of the closing's
 * materials goes through edit → save with ★ → reload → export. Everything stays in the test's own browser: nothing is
 * written to the site.
 */

test('rutas: portada, estudio, visor, páginas de uso y licencia responden; lo que no existe da 404', async ({ page }) => {
  for (const path of ['/', '/studio/', '/ver/', '/fondos-ascii/', '/arte-ascii-terminal/', '/imagen-a-ascii/', '/texto-animado-ascii/', '/video-a-ascii/', '/licencia/', '/robots.txt', '/sitemap.xml']) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
  }
  expect((await page.request.get('/no-existe-esta-pagina/')).status()).toBe(404);
  // the sitemap does not offer the paused studios
  const map = await (await page.request.get('/sitemap.xml')).text();
  expect(map).not.toMatch(/studio\/(glifos|foto)/);
});

test('los estudios de glifos y de foto siguen en pausa', async ({ page }) => {
  await page.goto('/studio/glifos/');
  await expect(page).toHaveTitle(/Crea tus GLYPHOS está en pausa/);
  await page.goto('/studio/foto/');
  await expect(page).toHaveTitle(/Estudio de foto y video en revisión/);
});

test('el dado es la versión 8 y una semilla de la versión 7 sigue tejiendo la suya', async ({ page }) => {
  await openStudio(page, '#space=arte');
  await page.locator('.seedline').getByRole('button', { name: 'semilla' }).click();
  const seedSheet = page.getByRole('dialog', { name: 'Semilla' });
  await seedSheet.getByLabel('Semilla', { exact: true }).fill('marea-leve-001');
  await expect(seedSheet.getByRole('combobox', { name: 'Versión del generador' })).toContainText('Versión 8 (actual)');
  await page.keyboard.press('Escape');
  await openStudio(page, '#seed=faro-lunar-417&space=terminal&gen=7');
  await page.keyboard.press('e');
  const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
  await sheet.getByRole('tab', { name: 'Receta' }).click();
  await expect(sheet.locator('.seed-big')).toContainText('faro-lunar-417');
  await expect(sheet.locator('.seed-big')).toContainText('generador v7');
});

/** Of the stage's lit pixels (a screenshot), the share with a colour of their own, and how many hues (of 12) they take. */
async function stageHues(page: Page): Promise<{ coloured: number; hues: number }> {
  const png = await page.locator('.stage canvas').first().screenshot();
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 240; c.height = 150;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 240, 150);
    const d = x.getImageData(0, 0, 240, 150).data, bins = new Array(12).fill(0);
    let lit = 0, coloured = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi < 60) continue;
      lit++;
      if (hi - lo < 50) continue;
      coloured++;
      const h = hi === r ? ((g - b) / (hi - lo) + 6) % 6 : hi === g ? (b - r) / (hi - lo) + 2 : (r - g) / (hi - lo) + 4;
      bins[Math.min(11, Math.floor(h * 2))]++;
    }
    return { coloured: lit ? coloured / lit : 0, hues: bins.filter(n => n > coloured * 0.03).length };
  }, 'data:image/png;base64,' + png.toString('base64'));
}

// their palettes are greys: any colour on the stage is the one each cell carries (raster RGB)
for (const engine of ['webgl', 'basico'] as const) {
  test(`ecos y humo pintan su propio color por celda (${engine === 'basico' ? 'motor básico' : 'WebGL 2'})`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=fondos`);
    await hideStageOverlays(page);
    for (const [name, hues] of [['Túnel de colores', 4], ['Aurora de humo', 2]] as const) {
      await chooseRecipe(page, name);
      let got = { coloured: 0, hues: 0 };
      await expect.poll(async () => { got = await stageHues(page); return got.coloured > 0.25 && got.hues >= hues; },
        { message: `${name}: color propio`, timeout: 90_000, intervals: [1500] }).toBe(true);
      test.info().annotations.push({ type: 'color', description: `${name}: ${Math.round(got.coloured * 100)} % de lo encendido con color, ${got.hues} tonos de 12` });
    }
    expect(errors).toEqual([]);
  });
}

test('una pieza con un material del cierre: elegir, editar, guardar con ★, recargar y exportar', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openStudio(page, '#space=arte');
  await hideStageOverlays(page);
  await chooseRecipe(page, 'Esfera de vidrio');
  // edit: another cell size (Glifos)
  await page.getByRole('tab', { name: /^Glifos/ }).click();
  await page.getByLabel('Tamaño de celda').fill('14');
  await expect(page.locator('.seedline')).toContainText('editado');
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: /^Colección, 1 pieza/ })).toBeAttached();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.seedline')).toContainText('editado');
  await expect(page.getByRole('button', { name: /^Colección, 1 pieza/ })).toBeAttached();
  // the glass is still in front after the reload (Efectos)
  await page.getByRole('tab', { name: /^Efectos/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Vidrio delante' }).getByRole('radio', { name: 'Esfera' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Imagen' }).click();
  const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
  expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
  expect(readFileSync(png.path).length).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});
