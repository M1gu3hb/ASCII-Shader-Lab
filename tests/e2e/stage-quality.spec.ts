import { expect, test } from '@playwright/test';
import { openStudio } from './helpers';

/**
 * Transitions between pieces (chosen in the dice settings) and the preview quality (next to the frame
 * rate): both only change how the stage draws, never the recipe.
 */

const prefs = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('mt.v3.preview') || '{}'));

test.describe('transiciones y calidad de la vista previa', () => {
  test('la transición se elige en los ajustes del azar y se recuerda', async ({ page }) => {
    const errors = await openStudio(page);
    await page.getByRole('button', { name: 'Ajustes del azar' }).click();
    const group = page.getByRole('group', { name: 'Transición', exact: true });
    await expect(group.getByRole('button')).toHaveText(['Auto', 'Tejido', 'Disolución', 'Lluvia', 'Iris', 'Barrido', 'Mosaico', 'Ninguna']);
    await expect(group.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'Lluvia' }).click();
    await expect(group.getByRole('button', { name: 'Lluvia' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tr-note')).toContainText('Lluvia');
    await page.getByRole('group', { name: 'Duración de la transición' }).getByRole('button', { name: 'Corta' }).click();
    expect(await prefs(page)).toMatchObject({ transition: 'lluvia', pace: 'corta' });
    // rolling with it works as always
    await page.keyboard.press('Escape');
    for (let i = 0; i < 3; i++) await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('4/4');
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Ajustes del azar' }).click();
    await expect(page.getByRole('group', { name: 'Transición', exact: true }).getByRole('button', { name: 'Lluvia' })).toHaveAttribute('aria-pressed', 'true');
    // «Ninguna» leaves no duration to choose
    await page.getByRole('group', { name: 'Transición', exact: true }).getByRole('button', { name: 'Ninguna' }).click();
    await expect(page.getByRole('group', { name: 'Duración de la transición' }).getByRole('button', { name: 'Corta' })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('con movimiento reducido no hay transición y el ajuste lo dice', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 860 } });
    const page = await ctx.newPage();
    await openStudio(page);
    await page.getByRole('button', { name: 'Ajustes del azar' }).click();
    await expect(page.locator('.tr-note')).toContainText('sin transición');
    await ctx.close();
  });

  test('la calidad de la vista previa cambia la resolución del lienzo, no la receta', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = await openStudio(page);
    const canvasW = () => page.locator('.stage canvas').first().evaluate(c => (c as HTMLCanvasElement).width / (c as HTMLCanvasElement).clientWidth);
    const recipe = async () => {
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Receta' }).click();
      const v = await page.getByRole('textbox', { name: 'Enlace' }).inputValue();
      await page.keyboard.press('Escape');
      return v;
    };
    const before = await recipe();
    await expect.poll(canvasW, { timeout: 20_000 }).toBeGreaterThan(1.3);
    const btn = page.getByRole('button', { name: /Calidad de la vista previa/ });
    await expect(btn).toContainText('fps');
    await btn.click();
    const dlg = page.getByRole('dialog', { name: 'Calidad de la vista previa' });
    await expect(dlg).toContainText('lo que exportas sale con la calidad completa');
    await dlg.getByRole('button', { name: /Ligera/ }).click();
    await expect(dlg.getByRole('button', { name: /Ligera/ })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(btn).toBeFocused();
    await expect.poll(canvasW, { timeout: 20_000 }).toBeLessThan(1.05);
    expect(await prefs(page)).toMatchObject({ quality: 'ligera' });
    expect(await recipe()).toBe(before);
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await expect.poll(canvasW, { timeout: 20_000 }).toBeLessThan(1.05);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('si la vista previa va lenta, un aviso ofrece bajar la calidad', async ({ page }) => {
    await openStudio(page);
    // a very slow processor: frames fall well under 24 per second
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 });
    const notice = page.locator('.q-slow');
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toHaveAttribute('role', 'status');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await notice.getByRole('button', { name: 'Bajar calidad' }).click();
    await expect(notice).toHaveCount(0);
    expect(await prefs(page)).toMatchObject({ quality: 'ligera' });
    await expect(page.getByRole('button', { name: /Calidad de la vista previa: Ligera/ })).toBeVisible();
  });
});
