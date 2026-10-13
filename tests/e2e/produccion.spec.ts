import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { download, openStudio } from './helpers';
import { chooseRecipe, hideStageOverlays } from './recipes';

/**
 * The public site after a deployment, as a person reaches it (closing of PR #10, §17):
 *   BASE_URL=https://glyphos-ascii.vercel.app npx playwright test tests/e2e/produccion.spec.ts --project=desktop
 * (and locally against `vite preview`). Its routes answer, the glyph and photo studios are still paused, the dice
 * are version 8, and a piece made with one of the closing's materials goes through edit → save with ★ → reload →
 * export. Everything stays in the test's own browser: nothing is written to the site.
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
