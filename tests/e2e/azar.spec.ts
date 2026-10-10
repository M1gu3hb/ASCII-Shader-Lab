import { GEN_VERSION } from '../../src/random/generator';
import { expect, test, type Page } from '@playwright/test';
import { diceWord5 } from '../../src/random/gen5';
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
    await expect(gen).toContainText('Versión 6 (actual)');
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
    // without a version a seed weaves with the current one (GEN_VERSION, 6)
    for (const hash of ['#seed=faro-lunar-417&space=terminal', `#seed=faro-lunar-417&space=terminal&gen=${GEN_VERSION}`, '#seed=faro-lunar-417&space=terminal&gen=4', '#seed=faro-lunar-417&space=terminal&gen=1']) {
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
    // versions 4 and 1 weave that seed their own way (and differently from each other)
    expect(links[2]).not.toBe(links[0]);
    expect(links[3]).not.toBe(links[0]);
    expect(links[3]).not.toBe(links[2]);
  });
});

/** The number of results, and the text and seed of the one on screen, as the studio stored them. */
const current = (page: Page) => page.evaluate(() => new Promise<{ n: number; text: string; seed?: string } | null>(res => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    g.onsuccess = () => {
      const id = g.result?.ids?.[g.result.cursor];
      if (!id) { res(null); return; }
      const e = st.get('mt.v3.e:' + id);
      e.onsuccess = () => res({ n: g.result.ids.length, text: e.result.recipe.text.content, seed: e.result.seed });
    };
  };
  req.onerror = () => res(null);
}));

test('Texto: tirar el dado cambia la palabra que nadie escribió (la de la receta de inicio); la que escribes se queda', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openStudio(page, '#space=tipo');
  await expect.poll(async () => (await current(page))?.text).toBe('TRAMA');
  const roll = async () => {
    const n = (await current(page))!.n;
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('r');
    await expect.poll(async () => (await current(page))?.n).toBe(n + 1);
    return (await current(page))!;
  };
  // the starting recipe's word goes: each result has the dice's own word for its seed
  const words: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await roll();
    words.push(r.text);
    expect(r.text, `tirada ${i + 1}: ${words.join(' ')}`).toBe(diceWord5(r.seed!));
  }
  expect(new Set(words).size, words.join(' ')).toBeGreaterThan(1);
  // written by the person: it stays, roll after roll, even a word the dice also use
  await page.getByRole('tab', { name: 'Tu texto', exact: true }).click();
  const field = page.getByRole('textbox', { name: /^Texto \(Enter para otra línea\)/ });
  for (const mine of ['PALABRA MÍA', 'LUZ']) {
    await field.fill(mine);
    await expect.poll(async () => (await current(page))?.text).toBe(mine);
    expect((await roll()).text).toBe(mine);
    expect((await roll()).text).toBe(mine);
  }
  expect(errors).toEqual([]);
});
