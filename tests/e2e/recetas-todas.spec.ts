// the catalogue lists the families' presets once their specs are here (the browser loads them when it opens)
import '../../src/families/all';
import { expect, test, type Page } from '@playwright/test';
import { allItems, type RecipeItem } from '../../src/studio/recipes/catalog';
import { spaceById } from '../../src/random/spaces';
import { contextOf, drawn } from './canvas';
import { openStudio } from './helpers';
import { dropPhoto, hideStageOverlays, openRecipes, recipeCard, stageColours } from './recipes';

/**
 * Every recipe and composed scene of the lab (the visual families: familias.spec.ts), applied from the recipe browser in both engines (WebGL and
 * the basic one): no page error and no engine failure, the piece is in the recipe's own space, the stage
 * draws something, and the recipe line names it. Imagen with the person's photo on stage (its recipes keep
 * it). Reduced motion: the pieces appear at once (the transitions have their own spec), so each check is
 * about the piece itself.
 */

const SPACES = ['fondos', 'arte', 'media', 'tipo', 'terminal'] as const;

async function settle(page: Page) {
  // the stage prepares the piece (its shader, its fonts), then shows it
  await page.waitForFunction(() => { const c = document.querySelector('.stage canvas'); return !!c && !c.hasAttribute('data-busy'); }, undefined, { timeout: 60_000, polling: 100 });
}

async function applyEach(page: Page, space: typeof SPACES[number], items: RecipeItem[], errors: string[]) {
  const name = spaceById(space).name;
  const bad: string[] = [];
  await openRecipes(page);
  for (const it of items) {
    const card = recipeCard(page, it.name);
    await card.scrollIntoViewIfNeeded();
    await card.click();
    await expect(card, it.key).toHaveAttribute('aria-pressed', 'true');
    await settle(page);
    // its space: the column's head, the space picker and the recipe line say so
    await expect(page.locator('.panel-title .pt-name'), it.key).toHaveText(name);
    await expect(page.locator('.panel .rx-line'), it.key).toHaveAccessibleName(`Recetas de ${name}: ${it.name}`);
    await expect(page.locator('.seedline'), it.key).toContainText(it.name);
    await expect.poll(() => stageColours(page), { message: `${it.key}: el escenario dibuja`, timeout: 30_000 }).toBeGreaterThan(3);
    const failed = await page.locator('.toast').filter({ hasText: /no pudo/ }).allTextContents();
    if (failed.length) bad.push(`${it.key}: ${failed.join(' / ')}`);
    if (errors.length) bad.push(`${it.key}: ${errors.splice(0).join(' / ')}`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
}

for (const engine of ['webgl', 'basico'] as const) {
  test.describe(engine === 'webgl' ? 'motor WebGL' : 'motor básico', () => {
    test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    for (const space of SPACES) {
      // the visual families have their own spec (familias.spec.ts): one preset of each, in both engines
      const items = allItems().filter(i => i.space === space && i.kind !== 'familia');
      test(`${spaceById(space).name}: sus ${items.length} recetas y escenas abren en su espacio y dibujan`, async ({ page }) => {
        test.setTimeout(900_000);
        const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=${space}`);
        // the basic stage draws first: asking for a context before its engine took one would create the wrong one
        // (a WebGL stage is not readable outside its frame, and asking for webgl2 first gives it the type it takes)
        if (engine === 'basico') await drawn(page, '.stage canvas');
        expect(await contextOf(page, '.stage canvas')).toBe(engine === 'basico' ? '2d' : 'webgl2');
        if (space === 'media') {
          await dropPhoto(page);
          await settle(page);
        }
        await hideStageOverlays(page);
        await applyEach(page, space, items, errors);
      });
    }
  });
}
