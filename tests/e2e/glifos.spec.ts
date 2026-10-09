import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { encodeRecipe, pieceHash } from '../../src/shared/share';
import { download, openStudio } from './helpers';
import { closeRecipes, hideStageOverlays, openRecipes, recipeCard } from './recipes';

/**
 * «Crea tus GLYPHOS», the essential flow: make a set (one letter imported as SVG, the assistant proposes
 * the rest, everything accepted), check the font it exports, use it in the lab on a visual family, save the
 * piece, reload, and export it: the set is still there and the vector export draws its outlines.
 */

const SVG_H = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140"><rect x="0" y="0" width="22" height="140"/><rect x="78" y="0" width="22" height="140"/><rect x="0" y="60" width="100" height="18"/>'
  // what a safe import ignores
  + '<script>alert(1)</script><image href="https://example.com/x.png" width="10" height="10"/><foreignObject><p>x</p></foreignObject></svg>';

async function makeSet(page: Page, name: string) {
  await page.goto('/studio/glifos/');
  await page.getByRole('button', { name: /Nuevo alfabeto/ }).click();
  await expect(page.locator('.gl-board')).toBeVisible();
  const title = page.getByLabel('Nombre del proyecto');
  await title.fill(name);
  await page.locator('.gl-tile[data-ch="H"]').click();
  await page.getByRole('tab', { name: 'Importar' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Elegir SVG/ }).click()]);
  await fc.setFiles({ name: 'H.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG_H) });
  await expect(page.locator('.gl-import .gl-line')).toContainText('SVG importado');
  await page.getByRole('tab', { name: 'Asistente' }).click();
  await page.getByRole('button', { name: /Usar «H» como referencia/ }).click();
  // the original is locked as soon as it is a reference
  await expect(page.locator('.gl-tile[data-ch="H"]')).toHaveClass(/st-bloqueado/);
  await page.getByRole('button', { name: 'Medir el estilo de mis referencias' }).click();
  await expect(page.locator('.gl-src').first()).toContainText(/medido|no estimado|ajustado/);
  await page.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(page.locator('.gl-tile[data-ch="n"]')).toHaveClass(/st-propuesto/, { timeout: 30_000 });
  // proposals never replace the locked reference
  await expect(page.locator('.gl-tile[data-ch="H"]')).toHaveClass(/st-bloqueado/);
  await page.getByRole('button', { name: 'Aceptar todas las propuestas' }).click();
  await expect(page.locator('.gl-tile[data-ch="n"]')).toHaveClass(/st-aceptado/);
  await expect(page.locator('.gl-save')).toHaveText('Guardado en este navegador', { timeout: 15_000 });
}

test.describe('Crea tus GLYPHOS', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('crear un juego, usarlo en una familia, guardar, recargar y exportar', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await makeSet(page, 'Prueba de astas');

    // the project survives a reload of the glyph studio
    await page.reload();
    await expect(page.getByText('Prueba de astas')).toBeVisible();
    await page.getByRole('button', { name: 'Abrir', exact: true }).click();
    await expect(page.locator('.gl-tile[data-ch="n"]')).toHaveClass(/st-aceptado/);

    // OpenType font: written, read back and tried in this browser before it is offered
    await page.getByRole('tab', { name: 'Exportar' }).click();
    const otf = await download(page, () => page.getByRole('button', { name: 'Fuente OpenType (.otf)' }).click());
    expect(otf.name).toMatch(/\.otf$/);
    expect(readFileSync(otf.path).subarray(0, 4).toString('latin1')).toBe('OTTO');
    await expect(page.locator('.gl-export .gl-line')).toContainText('Probada en este navegador');

    // into the lab
    await page.getByRole('button', { name: 'Usar en el laboratorio' }).click();
    await expect(page.locator('.gl-export .gl-line')).toContainText('está en el laboratorio');

    // a new piece with a visual family, drawn with the set
    await openStudio(page, '#space=arte');
    await hideStageOverlays(page);
    await openRecipes(page);
    const card = recipeCard(page, 'Coral químico');
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await closeRecipes(page);
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await page.getByRole('combobox', { name: 'Tus glifos' }).click();
    await page.getByRole('option', { name: /Prueba de astas/ }).click();
    await expect(page.getByRole('combobox', { name: 'Tus glifos' })).toContainText('Prueba de astas');

    // saved with ★, and back after a reload, with its set (no «not in this browser» notice)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: /en tu colección/i }).first()).toBeAttached({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await expect(page.getByRole('combobox', { name: 'Tus glifos' })).toContainText('Prueba de astas');
    await expect(page.getByText(/que no está en este navegador/)).toHaveCount(0);

    // the vector export draws the set's outlines (paths of the set, not font text)
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Vector' }).click();
    const svg = await download(page, () => page.getByRole('button', { name: 'Descargar SVG' }).click());
    const text = readFileSync(svg.path, 'utf8');
    expect(text).toContain('<path id="s0"');
    expect(errors).toEqual([]);
  });

  test('un enlace no lleva el juego: donde falta, la pieza se ve con su tipografía y lo dice', async ({ page, browser }) => {
    test.setTimeout(600_000);
    await makeSet(page, 'Juego viajero');
    await page.getByRole('tab', { name: 'Exportar' }).click();
    await page.getByRole('button', { name: 'Usar en el laboratorio' }).click();
    const link = await page.getByRole('link', { name: /Abrir el laboratorio con/ }).getAttribute('href');
    expect(link).toMatch(/#glifos=[0-9a-f]{16}$/);
    // the lab opens the current piece with the set (same browser)
    await openStudio(page, link!.replace('/studio/', ''));
    await expect(page.locator('.toast').filter({ hasText: /usa tus glifos/ }).first()).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Receta' }).click();
    const file = await download(page, () => page.getByRole('button', { name: 'Descargar receta (.json)' }).click());
    const recipe = JSON.parse(readFileSync(file.path, 'utf8')).recipe;
    expect(recipe.v).toBe(3);
    expect(recipe.glyph.set).toMatch(/^[0-9a-f]{16}$/);
    expect(recipe.glyph.setName).toBe('Juego viajero');
    // the link names the set but does not carry it: another browser (a fresh profile) draws with the font, and says so
    const code = await encodeRecipe(recipe);
    const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p2 = await other.newPage();
    await p2.goto('/ver/#' + pieceHash(code));
    await expect(p2.locator('.ver-note').filter({ hasText: /Juego viajero.*no está en este navegador/ })).toBeVisible({ timeout: 30_000 });
    await p2.goto('/studio/#' + pieceHash(code));
    await expect(p2.getByText(/«Juego viajero», que no está en este navegador/).first()).toBeVisible({ timeout: 60_000 });
    await other.close();
  });
});
