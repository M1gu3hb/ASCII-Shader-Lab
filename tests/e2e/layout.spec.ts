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

  test('con la pantalla al 125 %, la vista Terminal tiene las columnas y filas que exporta', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1.25 });
    const page = await ctx.newPage();
    await openStudio(page, '#space=terminal');
    await expect(page.locator('.term-bar')).toContainText('80×24');
    // the live grid (what the engine reports) settles to the window's 80×24
    await expect.poll(() => page.evaluate(() => {
      const st = (document.querySelector('.stats')?.textContent ?? '').trim();
      return st.split(' ')[0];
    }), { timeout: 20_000 }).toBe('80×24');
    await ctx.close();
  });

  test('en la vista README, mover un ajuste no dispara una captura por cada paso', async ({ page }) => {
    // count the offscreen WebGL engines the README text capture starts
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      (window as unknown as { gl2: number }).gl2 = 0;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2' && !this.isConnected) (window as unknown as { gl2: number }).gl2++;
        return (get as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof get;
    });
    await openStudio(page);
    await page.getByRole('radio', { name: 'README' }).click();
    await expect(page.locator('.gh-pre code')).not.toHaveText(/Tejiendo/, { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const before = await page.evaluate(() => (window as unknown as { gl2: number }).gl2);
    const slider = page.locator('.panel input[type=range]').first();
    await slider.focus();
    for (let i = 0; i < 20; i++) { await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(150); }
    await page.waitForTimeout(3000);
    const made = await page.evaluate(() => (window as unknown as { gl2: number }).gl2) - before;
    // 20 steps over 3 s: one capture at a time, 700 ms apart at least, and the last one of the latest piece
    expect(made).toBeGreaterThan(0);
    expect(made).toBeLessThanOrEqual(7);
  });

  test('inmersivo en escritorio: la pieza a toda la ventana, cuatro controles, y todo vuelve como estaba', async ({ page }) => {
    await openStudio(page);
    await expect(page.locator('.app')).not.toHaveClass(/panel-off/);
    await page.getByRole('button', { name: 'Modo inmersivo' }).click();
    const bar = page.getByRole('group', { name: 'Modo inmersivo' });
    await expect(bar).toBeVisible();
    for (const sel of ['.topbar', '.deck', '.seedline', '.vbar']) await expect(page.locator(sel).first()).toBeHidden();
    // the settings step aside; the piece takes the window
    await expect(page.locator('.app')).toHaveClass(/panel-off/);
    await expect.poll(async () => {
      const c = (await page.locator('.stage canvas').boundingBox())!;
      return Math.round(c.width) === 1366 && Math.round(c.height) === 860;
    }).toBe(true);
    // «Ajustes» brings the column back beside the piece, still immersive
    await bar.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.locator('aside.panel')).toBeInViewport();
    await expect(page.locator('.topbar')).toBeHidden();
    await bar.getByRole('button', { name: 'Ajustes' }).click();
    // Escape leaves, and the settings are as they were before
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.app')).not.toHaveClass(/panel-off/);
    await expect(page.getByRole('button', { name: 'Modo inmersivo' })).toBeFocused();
    // the I key does the same
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('i');
    await expect(bar).toBeVisible();
    await page.keyboard.press('i');
    await expect(bar).toBeHidden();
  });

  test('en una ventana baja, la vista Historia / Reel 9:16 se achica sin cortarse', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openStudio(page, '#space=fondos');
    await page.getByRole('radio', { name: 'Historia / Reel 9:16' }).click();
    // once the frame has taken the room it has (sizes settle over a couple of frames): inside, and centred
    await expect.poll(async () => {
      const area = (await page.locator('.vw-center').boundingBox())!;
      const frame = (await page.locator('.vw-phone').boundingBox())!;
      const above = frame.y - area.y, below = area.y + area.height - frame.y - frame.height;
      return above >= -1 && below >= -1 && Math.abs(above - below) < 3 ? 'ok' : `arriba ${Math.round(above)}, abajo ${Math.round(below)}`;
    }).toBe('ok');
  });
});
