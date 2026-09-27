import { expect, test } from '@playwright/test';
import { openStudio } from './helpers';

test.describe('en pantallas de escritorio', () => {
  test('«Exportar» se ve entero en la barra superior de 901 a 1500 px, con o sin colección', async ({ page }) => {
    await openStudio(page);
    const exp = page.locator('.topbar .ib.primary');
    const check = async (label: string) => {
      for (const w of [901, 1024, 1100, 1101, 1200, 1280, 1366, 1440, 1500]) {
        await page.setViewportSize({ width: w, height: 800 });
        const r = await exp.evaluate(el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right }; });
        expect(r.right, `${label} a ${w} px`).toBeLessThanOrEqual(w);
        expect(r.left, `${label} a ${w} px`).toBeGreaterThan(0);
        await expect(exp).toContainText('Exportar');
        expect(await page.evaluate(() => document.querySelector('.topbar')!.scrollWidth <= innerWidth)).toBe(true);
      }
    };
    await check('sin colección');
    await page.setViewportSize({ width: 1366, height: 800 });
    for (let i = 0; i < 11; i++) { await page.keyboard.press('r'); await page.keyboard.press('s'); }
    await expect(page.locator('.topbar .count')).toHaveText('11');
    await check('con 11 piezas');
  });

  test('en una ventana baja, la vista vertical 9:16 se achica sin cortarse', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openStudio(page, '#space=fondos');
    await page.getByRole('button', { name: 'Vertical 9:16' }).click();
    const area = await page.locator('.vw-center').boundingBox();
    const frame = await page.locator('.vw-phone').boundingBox();
    expect(frame!.y).toBeGreaterThanOrEqual(area!.y - 1);
    expect(frame!.y + frame!.height).toBeLessThanOrEqual(area!.y + area!.height + 1);
    // centred: the same room above and below
    expect(Math.abs((frame!.y - area!.y) - (area!.y + area!.height - frame!.y - frame!.height))).toBeLessThan(3);
  });
});
