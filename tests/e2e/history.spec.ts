import { expect, test } from '@playwright/test';
import { openStudio, pressUntil, seedText } from './helpers';

test.describe('azar con memoria', () => {
  test('tirar diez veces, volver a la cuarta, avanzar, guardar y recuperar tras recargar', async ({ page }) => {
    const errors = await openStudio(page);
    const seeds: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('r');
      await expect(page.locator('.seedline')).toContainText(`${i + 2}/${i + 2}`);
      seeds.push(await seedText(page));
    }
    expect(new Set(seeds).size).toBe(10);

    // back to the fourth roll (entry 5: entry 1 is the welcome piece)
    await page.locator('.thumb').nth(4).click();
    await expect(page.locator('.seedline')).toContainText('5/11');
    expect(await seedText(page)).toBe(seeds[3]);

    // forward and back again with the keyboard
    await page.keyboard.press('ArrowRight');
    expect(await seedText(page)).toBe(seeds[4]);
    await page.keyboard.press('ArrowLeft');
    expect(await seedText(page)).toBe(seeds[3]);

    // save it and keep editing: the edit amends the same entry
    await page.keyboard.press('s');
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: /Efectos/ }).click();
    const glow = page.getByLabel('Resplandor en la celda');
    await glow.fill('1.2');
    await expect(page.locator('.seedline')).toContainText('editado');

    // rolling from an old result appends, never truncates
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('12/12');

    // reload: history, cursor and collection persist (wait until IndexedDB holds all 12, not a fixed delay)
    await expect.poll(() => page.evaluate(() => new Promise<number>(res => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => {
        const st = req.result.transaction('keyval').objectStore('keyval');
        const g = st.get('mt.v3.history'), f = st.get('mt.v2.favorites');
        f.onsuccess = () => res((g.result?.ids?.length ?? 0) + (g.result?.cursor === 11 ? 100 : 0) + (f.result?.length === 1 ? 1000 : 0));
        f.onerror = () => res(-1);
      };
      req.onerror = () => res(-1);
    })), { timeout: 15_000 }).toBe(1112);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('12/12');
    await expect(page.locator('.thumb')).toHaveCount(12);
    await page.locator('.thumb').nth(4).click();
    expect(await seedText(page)).toBe(seeds[3]);
    await expect(page.locator('.seedline')).toContainText('editado');
    await page.getByRole('button', { name: /Colección/ }).click();
    await expect(page.locator('.fav-card')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('deshacer y rehacer ediciones', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('tab', { name: /Glifos/ }).click();
    const cell = page.getByLabel('Tamaño de celda');
    const before = await cell.inputValue();
    await cell.fill('20');
    await expect(cell).toHaveValue('20');
    await page.keyboard.press('Control+z');
    await expect(cell).toHaveValue(before);
    await page.keyboard.press('Control+Shift+z');
    await expect(cell).toHaveValue('20');
  });

  test('«Laboratorio» en la barra (la página en la que estás) no la recarga: deshacer sigue ahí', async ({ page }) => {
    await openStudio(page);
    await page.getByRole('tab', { name: /Glifos/ }).click();
    const cell = page.getByLabel('Tamaño de celda');
    const before = await cell.inputValue();
    await cell.fill('20');
    await expect(cell).toHaveValue('20');
    await page.evaluate(() => { (window as unknown as { sinRecargar: boolean }).sinRecargar = true; });
    await page.getByRole('navigation', { name: 'Estudios de GLYPHOS' }).getByRole('link', { name: 'Laboratorio' }).click();
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as { sinRecargar?: boolean }).sinRecargar)).toBe(true);
    await page.keyboard.press('Control+z');
    await expect(cell).toHaveValue(before);
  });

  test('la misma semilla reproduce la misma pieza', async ({ browser }) => {
    const urls: string[] = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await openStudio(page, '#seed=faro-lunar-417&space=arte');
      expect(await seedText(page)).toBe('faro-lunar-417');
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Receta' }).click();
      const url = page.getByRole('textbox', { name: 'Enlace' });
      await expect(url).toHaveValue(/#r=z/);
      urls.push(await url.inputValue());
      await ctx.close();
    }
    expect(urls[0]).toBe(urls[1]);
  });

  test('un enlace compartido abre exactamente la misma pieza', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    await pa.keyboard.press('r');
    await pa.keyboard.press('e');
    await pa.getByRole('tab', { name: 'Receta' }).click();
    const box = pa.getByRole('textbox', { name: 'Enlace' });
    await expect(box).toHaveValue(/#r=z/);
    const link = await box.inputValue();
    const b = await browser.newContext();
    const pb = await b.newPage();
    await pb.goto(link);
    // (shared links open the public viewer; its «Abrir en el estudio» brings the piece to the studio, and
    // shared again from there, unedited, it is the same link: same recipe, same frame)
    await pb.getByRole('link', { name: 'Abrir en el estudio' }).click();
    await expect(pb.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await pressUntil(pb, 'e', pb.getByRole('tab', { name: 'Receta' }));
    await pb.getByRole('tab', { name: 'Receta' }).click();
    await expect(pb.getByRole('textbox', { name: 'Enlace' })).toHaveValue(link);
    await a.close();
    await b.close();
  });
});
