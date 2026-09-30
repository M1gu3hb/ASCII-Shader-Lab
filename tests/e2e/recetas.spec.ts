import { expect, test } from '@playwright/test';
import { itemsOf } from '../../src/studio/recipes/catalog';
import { openStudio } from './helpers';
import { chooseRecipe, closeRecipes, openRecipes, recipeBrowser, recipeCard, recipeLine, searchRecipes } from './recipes';

/**
 * The recipe access of the lab (src/studio/recipes/) on a wide screen with a mouse and a keyboard: one line
 * names the piece's recipe and opens every recipe and scene of the space in the settings' place; sections,
 * filters and a search in Spanish; one click applies (the piece before stays one step back in the history,
 * and a note offers the way back to it); arrows move in the grid, Enter applies, Escape closes; pictures
 * are drawn for what is in view and kept.
 */

test('la línea nombra la receta de la pieza; abierta, las recetas ocupan el lugar de los ajustes', async ({ page }) => {
  const errors = await openStudio(page, '#space=arte');
  const line = recipeLine(page);
  const n = itemsOf('arte').length;
  await expect(line).toHaveAccessibleName('Recetas de Arte: Bermellón');
  await expect(line).toHaveAttribute('aria-expanded', 'false');
  await expect(line).toContainText(`Ver ${n}`);
  // its picture arrives (the recipe's own render)
  await expect(line.locator('.rx-pic img')).toHaveCount(1, { timeout: 90_000 });
  // closed: the settings are all there, the line is one row
  await expect(page.locator('.panel [role=tab]')).toHaveCount(7);
  expect((await line.boundingBox())!.height).toBeLessThanOrEqual(62);

  await line.click();
  await expect(line).toHaveAttribute('aria-expanded', 'true');
  const box = recipeBrowser(page);
  await expect(box).toBeVisible();
  await expect(page.locator('.panel [role=tab]')).toHaveCount(0);
  await expect(page.locator('#pane')).toBeHidden();
  await expect(box.locator('.rx-card')).toHaveCount(n);
  for (const h of ['Figuras 3D', 'Curvas y fractales', 'Escenas compuestas']) await expect(box.getByRole('heading', { name: new RegExp('^' + h) })).toBeVisible();
  await expect(recipeCard(page, 'Bermellón')).toHaveAttribute('aria-pressed', 'true');
  // the stage keeps all of its room: the browser lives in the column
  const panel = (await page.locator('.panel').boundingBox())!, b = (await box.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(panel.x - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width + 1);

  // Escape: the settings come back, the focus on the line
  await recipeCard(page, 'Dona').focus();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(line).toBeFocused();
  await expect(page.locator('.panel [role=tab]')).toHaveCount(7);
  await expect(page.locator('.panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('secciones, filtros y búsqueda sin acentos; lo de otro espacio se abre en su espacio', async ({ page }) => {
  const errors = await openStudio(page, '#space=arte');
  await openRecipes(page);
  const box = recipeBrowser(page);
  const filters = box.getByRole('radiogroup', { name: 'Qué recetas mostrar' });
  await expect(filters.getByRole('radio', { name: /^Todas/ })).toHaveAttribute('aria-checked', 'true');
  // a filter: only its recipes, with a line that says what they are
  await filters.getByRole('radio', { name: /^Figuras 3D/ }).click();
  const d3 = itemsOf('arte').filter(i => i.cats.includes('figuras')).length;
  await expect(box.locator('.rx-card')).toHaveCount(d3);
  await expect(box.getByText('Objetos que giran, dibujados con caracteres.')).toBeVisible();
  await filters.getByRole('radio', { name: /^Expresivas/ }).click();
  await expect(box.locator('.rx-card')).toHaveCount(itemsOf('arte').filter(i => i.cats.includes('expresivas')).length);
  await filters.getByRole('radio', { name: /^Todas/ }).click();

  // search: accents and capitals do not matter; the number of results is said
  const search = box.getByRole('searchbox', { name: /Buscar recetas y escenas/ });
  await search.fill('MEDUSA');
  await expect(box.locator('.rx-card')).toHaveCount(1);
  await expect(recipeCard(page, 'Medusa bioluminiscente')).toBeVisible();
  await expect(box.getByText('1 resultado', { exact: true })).toBeAttached();
  await search.fill('neon');
  await expect(recipeCard(page, 'Nudo de neón')).toBeVisible();
  await expect(box.getByRole('heading', { name: /^En otros espacios/ })).toBeVisible();
  // the filters step aside while searching
  await expect(filters).toHaveCount(0);
  // another space's recipe: it opens in its space
  await box.getByRole('button', { name: /^Neón\. Letras con textura, de Texto/ }).click();
  await expect(page.locator('.panel-title .pt-name')).toHaveText('Texto');
  await expect(page.getByRole('button', { name: 'Texto', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(recipeLine(page)).toHaveAccessibleName('Recetas de Texto: Neón');
  await expect(page.locator('.seedline')).toContainText('Neón');
  // nothing found: said, with a way back to all
  await search.fill('zzqx');
  await expect(box.getByText(/Nada con «zzqx»/)).toBeVisible();
  await box.getByRole('button', { name: 'Ver todas las recetas de Texto' }).click();
  await expect(search).toHaveValue('');
  await expect(box.locator('.rx-card')).toHaveCount(itemsOf('tipo').length);
  // Escape in the search empties it first, then closes
  await search.fill('ola');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await search.press('Escape');
  await expect(box).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('teclado: flechas en la cuadrícula, Enter aplica, Escape cierra; la historia no se mueve', async ({ page }) => {
  await openStudio(page, '#space=arte');
  await openRecipes(page);
  const box = recipeBrowser(page);
  // one stop for the pictures: the piece's own recipe
  const stop = box.locator('.rx-card[tabindex="0"]');
  await expect(stop).toHaveCount(1);
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  // Tab reaches the search, then the filters (one stop), then the pictures
  await recipeLine(page).focus();
  await page.keyboard.press('Tab');
  await expect(box.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(box.getByRole('radio', { name: /^Todas/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(stop).toBeFocused();

  const cards = box.locator('.rx-card');
  await page.keyboard.press('Home');
  await expect(cards.first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused();
  const y1 = (await cards.nth(1).boundingBox())!.y;
  await page.keyboard.press('ArrowDown');
  const down = page.locator('.rx-card:focus');
  expect((await down.boundingBox())!.y).toBeGreaterThan(y1 + 20);
  // the same column
  expect(Math.abs((await down.boundingBox())!.x - (await cards.nth(1).boundingBox())!.x)).toBeLessThan(4);
  await page.keyboard.press('ArrowUp');
  await expect(cards.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(cards.last()).toBeFocused();
  await expect(cards.last()).toBeInViewport();
  // the arrows moved in the grid, never through the history
  await expect(page.locator('.seedline')).toContainText('1/1');
  // Enter applies the one with the focus, which stays there
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const name = (await cards.nth(1).locator('.rx-name').textContent())!;
  await page.keyboard.press('Enter');
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.nth(1)).toBeFocused();
  await expect(page.locator('.seedline')).toContainText(name);
  await expect(page.locator('.seedline')).toContainText('2/2');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
  await expect(recipeLine(page)).toBeFocused();
});

test('aplicar nunca pierde la pieza: la anterior queda en el historial y el aviso vuelve a ella', async ({ page }) => {
  const errors = await openStudio(page, '#space=arte');
  // the person's own piece: an edit
  await page.getByRole('tab', { name: 'Glifos' }).click();
  await page.getByLabel('Tamaño de celda').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.seedline')).toContainText('editado');
  await expect(recipeLine(page)).toHaveAccessibleName('Recetas de Arte: Bermellón, editada');
  await chooseRecipe(page, 'Dona', { stay: true });
  await expect(page.locator('.seedline')).toContainText('Dona');
  await expect(page.locator('.seedline')).toContainText('2/2');
  const note = page.locator('.toast').filter({ hasText: 'Receta «Dona» aplicada' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Volver a ella' }).click();
  await expect(page.locator('.seedline')).toContainText('1/2');
  await expect(page.locator('.seedline')).toContainText('editado');
  await expect(recipeLine(page)).toHaveAccessibleName('Recetas de Arte: Bermellón, editada');
  // the edited piece's recipe is marked as where it comes from, not as the piece itself
  await expect(recipeCard(page, 'Bermellón')).toHaveAttribute('aria-pressed', 'false');
  await expect(recipeCard(page, 'Bermellón')).toHaveAccessibleName(/tu pieza viene de aquí \(editada\)/);
  // choosing the recipe already on screen (unedited) does nothing: no second copy in the history
  await recipeCard(page, 'Julia').click();
  await expect(page.locator('.seedline')).toContainText('3/3');
  await recipeCard(page, 'Julia').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.seedline')).toContainText('3/3');
  // from one recipe to another nothing of the person's is left behind: no note
  await recipeCard(page, 'Magma').click();
  await expect(page.locator('.seedline')).toContainText('4/4');
  await page.waitForTimeout(400);
  await expect(page.locator('.toast').filter({ hasText: 'Receta «Magma» aplicada' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('recientes y tu colección', async ({ page }) => {
  await openStudio(page, '#space=arte');
  await chooseRecipe(page, 'Dona', { stay: true });
  await recipeCard(page, 'Julia').click();
  await expect(recipeCard(page, 'Julia')).toHaveAttribute('aria-pressed', 'true');
  const box = recipeBrowser(page);
  await box.getByRole('radio', { name: /^Recientes/ }).click();
  await expect(box.locator('.rx-card .rx-name')).toHaveText(['Julia', 'Dona']);
  // saved with ★ (S): the collection is a filter of its own
  await page.keyboard.press('Escape');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('s');
  await expect(page.locator('.toast').filter({ hasText: 'Guardado en tu colección' })).toBeVisible();
  await openRecipes(page);
  await box.getByRole('radio', { name: /^Tu colección/ }).click();
  const saved = box.getByRole('button', { name: /de tu colección/ });
  await expect(saved).toHaveCount(1);
  await expect(saved).toHaveAttribute('aria-pressed', 'true');
  // another recipe, then the saved piece again from the browser
  await box.getByRole('radio', { name: /^Todas/ }).click();
  await recipeCard(page, 'Magma').click();
  await expect(page.locator('.seedline')).toContainText('Magma');
  await box.getByRole('radio', { name: /^Tu colección/ }).click();
  await saved.click();
  await expect(page.locator('.seedline')).toContainText('Julia');
});

test('las imágenes se dibujan para lo que se ve y se guardan para volver', async ({ page }) => {
  test.setTimeout(240_000);
  await openStudio(page, '#space=fondos');
  await openRecipes(page);
  const box = recipeBrowser(page);
  const first = box.locator('.rx-card').first();
  await expect(first.locator('.rx-pic img')).toHaveCount(1, { timeout: 120_000 });
  // the last one, far below: not drawn while it is out of view
  const last = box.locator('.rx-card').last();
  await expect(last).not.toBeInViewport();
  await expect(last.locator('.rx-pic img')).toHaveCount(0);
  // before its render: the recipe's own colours and a few of its characters (never an empty box)
  await expect(last.locator('.rx-stand')).not.toBeEmpty();
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator('.rx-pic img')).toHaveCount(1, { timeout: 120_000 });
  // kept: closed and opened again, the pictures are there at once
  await closeRecipes(page);
  await openRecipes(page);
  await expect(box.locator('.rx-card').first().locator('.rx-pic img')).toHaveCount(1, { timeout: 1500 });
});

test('Glifos: el selector de caracteres y su comparación sobre la pieza son uno', async ({ page }) => {
  const errors = await openStudio(page, '#space=arte');
  await page.getByRole('tab', { name: 'Glifos' }).click();
  const picker = page.getByRole('combobox', { name: 'Caracteres', exact: true });
  await page.getByRole('button', { name: 'Qué es «Caracteres»' }).click();
  const sets = page.getByRole('group', { name: 'Juegos de caracteres' });
  await expect(sets.getByRole('button')).not.toHaveCount(0);
  // the same sets as the picker, marked the same
  const cur = await picker.getAttribute('data-value');
  await expect(sets.locator('[aria-pressed="true"]')).toHaveCount(1);
  await sets.getByRole('button', { name: /^Braille/ }).click();
  await expect(picker).toHaveAttribute('data-value', 'braille');
  await expect(sets.getByRole('button', { name: /^Braille/ })).toHaveAttribute('aria-pressed', 'true');
  // each set's characters as real text, and its picture on the piece when it arrives
  await expect(sets.getByRole('button', { name: /^Braille/ }).locator('.csx-chars')).toContainText('⣿');
  await expect(sets.locator('.rx-pic img').first()).toBeAttached({ timeout: 90_000 });
  // an ordinary edit: undone with Ctrl+Z
  await page.keyboard.press('Control+z');
  await expect(picker).toHaveAttribute('data-value', cur!);
  // only ASCII, only Unicode
  await page.getByRole('radiogroup', { name: 'Qué juegos mostrar' }).getByRole('radio', { name: 'ASCII' }).click();
  await expect(sets.getByRole('button', { name: /^Braille/ })).toHaveCount(0);
  await expect(sets.getByRole('button', { name: /^Clásico/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Glifos en Terminal: sólo juegos ASCII en la comparación', async ({ page }) => {
  await openStudio(page, '#space=terminal');
  await page.getByRole('tab', { name: 'Glifos' }).click();
  await page.getByRole('button', { name: 'Qué es «Caracteres»' }).click();
  const sets = page.getByRole('group', { name: 'Juegos de caracteres' });
  await expect(sets.getByRole('button', { name: /^Clásico/ })).toHaveCount(1);
  await expect(sets.getByRole('button', { name: /^Bloques/ })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Qué juegos mostrar' })).toHaveCount(0);
});

test('buscar desde otro espacio y en la hoja de ajustes estrecha', async ({ page }) => {
  // a narrow window: the settings are a sheet; the search is a button beside the filters
  await page.setViewportSize({ width: 560, height: 900 });
  await openStudio(page, '#space=fondos');
  await openRecipes(page);
  const box = recipeBrowser(page);
  await expect(box.getByRole('searchbox')).toHaveCount(0);
  await searchRecipes(page, 'fractal');
  await expect(box.getByRole('searchbox')).toBeFocused();
  await expect(recipeCard(page, 'Atlas de Mandelbrot')).toBeVisible();
  await recipeCard(page, 'Atlas de Mandelbrot').click();
  await expect(page.locator('.seedline')).toContainText('Atlas de Mandelbrot');
  await expect(recipeLine(page)).toHaveAccessibleName('Recetas de Arte: Atlas de Mandelbrot');
  await box.getByRole('button', { name: 'Listo' }).click();
  await expect(box.getByRole('searchbox')).toHaveCount(0);
  await expect(box.getByRole('radiogroup', { name: 'Qué recetas mostrar' })).toBeVisible();
});
