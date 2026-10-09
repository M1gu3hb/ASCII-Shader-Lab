import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FAMILIES } from '../../src/families/registry';
import { contextOf } from './canvas';
import { download, openStudio } from './helpers';
import { closeRecipes, hideStageOverlays, openRecipes, recipeCard, stageColours } from './recipes';

/**
 * The visual families in the lab, in both engines: the first preset of every family opens from the recipe
 * browser, draws, and shows its family panel; a simulation runs (Reiniciar / Avanzar change the stage), its
 * PNG exports from a copy, and a piece saved with ★ comes back after a reload with its family.
 */

async function settle(page: Page) {
  await page.waitForFunction(() => { const c = document.querySelector('.stage canvas'); return !!c && !c.hasAttribute('data-busy'); }, undefined, { timeout: 90_000, polling: 100 });
}

async function applyPreset(page: Page, name: string) {
  await openRecipes(page);
  const card = recipeCard(page, name);
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await settle(page);
  // the family's panel is in the layer card («Capas»)
  await closeRecipes(page);
  await page.getByRole('tab', { name: 'Capas' }).click();
}

for (const engine of ['webgl', 'basico'] as const) {
  test.describe(engine === 'webgl' ? 'familias · motor WebGL' : 'familias · motor básico', () => {
    test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

    test(`las ${FAMILIES.length} familias abren desde Recetas, dibujan y muestran su panel`, async ({ page }) => {
      test.setTimeout(1_200_000);
      const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=arte`);
      expect(await contextOf(page, '.stage canvas')).toBe(engine === 'basico' ? '2d' : 'webgl2');
      await hideStageOverlays(page);
      const bad: string[] = [];
      for (const f of FAMILIES) {
        const preset = f.presets[0];
        await applyPreset(page, preset.name);
        await expect.poll(() => stageColours(page), { message: `${f.id}: el escenario dibuja`, timeout: 60_000 }).toBeGreaterThan(2);
        // the layer's family panel: its presets and «Cómo funciona»
        await expect(page.getByRole('group', { name: `Presets de ${f.name}` }), f.id).toBeVisible();
        const failed = await page.locator('.toast').filter({ hasText: /no pudo|falló/i }).allTextContents();
        if (failed.length) bad.push(`${f.id}: ${failed.join(' / ')}`);
        if (errors.length) bad.push(`${f.id}: ${errors.splice(0).join(' / ')}`);
      }
      expect(bad, bad.join('\n')).toEqual([]);
    });
  });
}

test.describe('familias · ejecución, exportación y guardado', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('una simulación se reinicia y avanza; su PNG sale de una copia; guardada con ★ vuelve tras recargar', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = await openStudio(page, '#space=arte');
    await hideStageOverlays(page);
    const rd = FAMILIES.find(f => f.id === 'reaccion_difusion')!;
    await applyPreset(page, rd.presets[0].name);
    const run = page.getByRole('group', { name: 'Simulación en el escenario' });
    await expect(run).toBeVisible();
    // pause, then step: the stage changes by a tenth of a second of the model, and restarting changes it back
    await page.getByRole('button', { name: 'Pausar animación' }).click();
    const before = await page.locator('.stage canvas').first().screenshot();
    await run.getByRole('button', { name: 'Avanzar' }).click();
    await expect.poll(async () => Buffer.compare(before, await page.locator('.stage canvas').first().screenshot()) !== 0, { timeout: 20_000 }).toBe(true);
    await run.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(run.locator('.fam-status')).toContainText(/paso|semilla|0/i);

    // PNG of the moment on stage
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Imagen' }).click();
    const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
    expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');
    await page.keyboard.press('Escape');

    // saved with ★, the piece (its family layer) comes back after a reload
    // (the deck is hidden for the screenshots: its shortcut, S)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('s');
    await expect(page.locator('.toast').filter({ hasText: /colecci/i }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('group', { name: `Presets de ${rd.name}` })).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
  });
});
