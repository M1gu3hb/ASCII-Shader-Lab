import { expect, test, type Page } from '@playwright/test';
import { itemsOf } from '../../src/studio/recipes/catalog';
import { clipped } from './clip';
import { openStudio } from './helpers';
import { openRecipes, openSettings, recipeBrowser, recipeCard, recipeLine } from './recipes';

/**
 * The recipe access on phones (touch): the line in the sheet's handle row names the piece's recipe with
 * its picture; pressed, the recipes take the sheet (the groups step aside) and the upper part of the
 * screen stays the piece's; the search is a button beside the filters; every target is 44 px; nothing is
 * cut, upright or on its side.
 */

/** The sheet or column done sliding in (a transition measured half-way reads as controls off the screen). */
async function still(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || (a.effect?.getComputedTiming().endTime ?? 0) === Infinity), undefined, { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(150);
}

async function targets(page: Page, sel: string) {
  return page.locator(sel).evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent).map(e => {
    const r = e.getBoundingClientRect();
    return { name: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) };
  }));
}

test('la línea en la hoja; las recetas ocupan la hoja y la pieza sigue arriba; buscar con un botón', async ({ page }) => {
  const errors = await openStudio(page, '#space=arte');
  await openSettings(page);
  const line = recipeLine(page);
  await expect(line).toHaveAccessibleName('Recetas de Arte: Bermellón');
  await expect(line).toContainText('Bermellón');
  const lb = (await line.boundingBox())!;
  expect(lb.height).toBeGreaterThanOrEqual(44);
  // the name is whole (not cut by the handle beside it)
  expect(await line.locator('.rx-cur-name').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);

  await line.tap();
  const box = recipeBrowser(page);
  await expect(box).toBeVisible();
  await expect(page.locator('.panel [role=tab]')).toHaveCount(0);
  // the sheet rests at half: the piece keeps the upper part of the screen
  await expect(page.locator('aside.panel')).toHaveAttribute('data-snap', /half|full/);
  const vh = page.viewportSize()!.height;
  if (await page.locator('aside.panel').getAttribute('data-snap') === 'half') expect((await page.locator('aside.panel').boundingBox())!.y).toBeGreaterThan(vh * 0.3);
  await expect(box.locator('.rx-card')).toHaveCount(itemsOf('arte').length);

  // 44 px targets
  for (const t of [...await targets(page, '#rx-browser .rx-find, #rx-browser .rx-chip'), ...await targets(page, '#rx-browser .rx-card')]) {
    expect(t.h, t.name).toBeGreaterThanOrEqual(44);
    expect(t.w, t.name).toBeGreaterThanOrEqual(44);
  }
  expect(await clipped(page)).toEqual([]);

  // the search: a button until it is used, then its field with the keyboard
  await expect(box.getByRole('searchbox')).toHaveCount(0);
  await box.getByRole('button', { name: 'Buscar recetas y escenas' }).tap();
  await expect(box.getByRole('searchbox')).toBeFocused();
  await page.keyboard.type('ola');
  await expect(recipeCard(page, 'Ola')).toBeVisible();
  await recipeCard(page, 'Ola').tap();
  await expect(page.locator('.seedline')).toContainText('Ola');
  await expect(line).toHaveAccessibleName('Recetas de Texto: Ola');
  await box.getByRole('button', { name: 'Listo' }).tap();
  await expect(box.getByRole('searchbox')).toHaveCount(0);
  // back to the settings: the line again
  await line.tap();
  await expect(box).toHaveCount(0);
  await expect(page.locator('.panel [role=tab]')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('una tarjeta tocada aplica su receta; la anterior queda un paso atrás', async ({ page }) => {
  await openStudio(page, '#space=fondos');
  await openRecipes(page);
  const card = recipeBrowser(page).locator('.rx-card').nth(2);
  const name = (await card.locator('.rx-name').textContent())!;
  await card.tap();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.seedline')).toContainText(name);
  await expect(page.locator('.seedline')).toContainText('2/2');
  // the settings put away with the recipes open: they come back as settings
  await page.getByRole('button', { name: 'Cerrar ajustes' }).tap();
  await openSettings(page);
  await expect(recipeBrowser(page)).toHaveCount(0);
  await expect(page.locator('.panel [role=tab]')).not.toHaveCount(0);
});

for (const [w, h] of [[360, 740], [390, 844], [844, 390], [740, 360]] as const) {
  test(`${w}×${h}: nada se corta, con las recetas abiertas y cerradas`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openStudio(page, '#space=arte');
    await openSettings(page);
    await still(page);
    expect(await clipped(page), 'cerradas').toEqual([]);
    await openRecipes(page);
    await still(page);
    expect(await clipped(page), 'abiertas').toEqual([]);
    const box = recipeBrowser(page);
    // the pictures get room: at least one row of cards in view
    await expect(box.locator('.rx-card').first()).toBeInViewport();
    const grid = (await box.locator('.rx-scroll').boundingBox())!;
    expect(grid.height, 'alto de la lista').toBeGreaterThanOrEqual(w > h ? 150 : 140);
    if (w > h) {
      // on its side: close and «Recetas» stand beside the search and the filters
      const cell = (await recipeLine(page).boundingBox())!, tools = (await box.locator('.rx-tools').boundingBox())!;
      expect(cell.x).toBeGreaterThan(tools.x + tools.width - 2);
      expect(cell.y).toBeLessThan(tools.y + 120);
    }
    await box.getByRole('radio', { name: /^Curvas y fractales/ }).tap();
    await still(page);
    expect(await clipped(page), 'un filtro').toEqual([]);
  });
}
