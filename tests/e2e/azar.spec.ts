import { expect, test } from '@playwright/test';
import { openStudio, seedText } from './helpers';

/**
 * Seeds and generator versions: a seed with its version reproduces its piece, the seed sheet says which
 * version wove the piece on screen and lets you choose one, and «Llevar fuera» shows the version next to
 * the seed. (The odds themselves are measured by scripts/azar-report.mjs and tests/unit/azar.test.ts.)
 */
test.describe('semillas y versiones del generador', () => {
  test('un enlace con gen=1 teje la pieza de la versión 1, y la hoja de la semilla lo dice', async ({ page }) => {
    const errors = await openStudio(page, '#seed=faro-lunar-417&space=arte&gen=1');
    expect(await seedText(page)).toBe('faro-lunar-417');
    // «Llevar fuera» → Receta: the seed with its space, style and version
    await page.keyboard.press('e');
    const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
    await sheet.getByRole('tab', { name: 'Receta' }).click();
    await expect(sheet.locator('.seed-big')).toContainText('faro-lunar-417');
    await expect(sheet.locator('.seed-big')).toContainText('generador v1');
    await page.keyboard.press('Escape');

    // the seed sheet preselects the version of the piece on screen and explains it
    await page.locator('.seedline').getByRole('button', { name: 'semilla' }).click();
    const seedSheet = page.getByRole('dialog', { name: 'Semilla' });
    await expect(seedSheet).toBeVisible();
    const gen = seedSheet.getByRole('combobox', { name: 'Versión del generador' });
    await expect(gen).toContainText('Versión 1');
    await expect(seedSheet.getByText(/salió de la versión 1 del generador/)).toBeVisible();
    // another seed: the current version, unless one is chosen
    await seedSheet.getByLabel('Semilla', { exact: true }).fill('marea-leve-001');
    await expect(gen).toContainText('Versión 3 (actual)');
    await gen.click();
    await page.getByRole('option', { name: /Versión 1/ }).click();
    await expect(gen).toContainText('Versión 1');
    await seedSheet.getByRole('button', { name: 'Tejer esta semilla' }).click();
    await expect(page.locator('.toast').last()).toContainText('versión 1');
    expect(await seedText(page)).toBe('marea-leve-001');
    expect(errors).toEqual([]);
  });

  test('la misma semilla sin versión teje con la actual, igual en dos navegadores', async ({ browser }) => {
    const links: string[] = [];
    for (const hash of ['#seed=faro-lunar-417&space=terminal', '#seed=faro-lunar-417&space=terminal&gen=3', '#seed=faro-lunar-417&space=terminal&gen=1']) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await openStudio(page, hash);
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Receta' }).click();
      const url = page.getByRole('textbox', { name: 'Enlace' });
      await expect(url).toHaveValue(/#r=z/);
      links.push(await url.inputValue());
      await ctx.close();
    }
    expect(links[1]).toBe(links[0]);
    expect(links[2]).not.toBe(links[0]);
  });
});
