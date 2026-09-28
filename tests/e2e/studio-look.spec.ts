import { expect, test, type Page } from '@playwright/test';
import { dismissWelcome, openStudio } from './helpers';

/**
 * The studio's look and motion («Telar de precisión»): the opening that forms the interface out of
 * characters (once per session, ended by any key, none with reduced motion), content swaps that
 * recompose without blocking anything, the quality «Ligera» lowering motion, one notification area that
 * never covers a control, and the history strip that says when more waits on a side.
 */

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: Page, sel: string): Promise<Box> => (await page.locator(sel).first().boundingBox())!;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('apertura', () => {
  test('la interfaz se teje una vez por sesión, funciona debajo y una tecla la termina', async ({ page }) => {
    // count every opening canvas added to the page (it removes itself when it ends)
    await page.addInitScript(() => {
      const w = window as unknown as { weaves: number };
      w.weaves = 0;
      new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if ((n as Element).classList?.contains('mt-weave')) w.weaves++; })
        .observe(document, { childList: true, subtree: true });
    });
    await page.goto('/studio/#space=arte');
    const weave = page.locator('canvas.mt-weave');
    await expect(weave).toHaveCount(1, { timeout: 15_000 });
    // decoration only: hidden from assistive tech, no pointer events
    await expect(weave).toHaveAttribute('aria-hidden', 'true');
    expect(await weave.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
    // the interface underneath works while it plays: a click reaches the space button (and ends the opening)
    const spaces = page.getByRole('navigation', { name: 'Espacios del estudio' });
    await spaces.getByRole('button', { name: 'Fondos' }).click();
    await expect(spaces.getByRole('button', { name: 'Fondos' })).toHaveAttribute('aria-pressed', 'true');
    await expect(weave).toHaveCount(0, { timeout: 2000 });
    // once per session: a reload does not play it again
    await page.reload();
    await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => (window as unknown as { weaves: number }).weaves)).toBe(0);
  });

  test('una tecla termina la apertura al momento', async ({ page }) => {
    await page.goto('/studio/#space=fondos');
    const weave = page.locator('canvas.mt-weave');
    await expect(weave).toHaveCount(1, { timeout: 15_000 });
    await page.keyboard.press('Shift');
    await expect(weave).toHaveCount(0, { timeout: 1000 });
  });

  test('con movimiento reducido no hay apertura ni velos, y los cambios son inmediatos', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 860 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { fx: number };
      w.fx = 0;
      new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if ((n as Element).matches?.('.mt-weave, .mt-curtain, .mt-scr')) w.fx++; })
        .observe(document, { childList: true, subtree: true });
    });
    await openStudio(page, '#space=arte');
    await page.getByRole('tab', { name: 'Color' }).click();
    await page.keyboard.press('1');
    await expect(page.locator('.panel-title .eyebrow')).toContainText('Fondos');
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Fondo web', exact: true }).click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { fx: number }).fx)).toBe(0);
    await ctx.close();
  });
});

test.describe('cambios de contenido', () => {
  test('una sección, un espacio y una vista se recomponen sin bloquear nada', async ({ page }) => {
    // count the veils and the resolving labels as they are added (they remove themselves in ≈0.2–0.35 s)
    await page.addInitScript(() => {
      const w = window as unknown as { fx: Record<string, number> };
      w.fx = { curtain: 0, scr: 0 };
      new MutationObserver(ms => {
        for (const m of ms) for (const n of m.addedNodes) {
          const el = n as Element;
          if (el.classList?.contains('mt-curtain')) w.fx.curtain++;
          if (el.classList?.contains('mt-scr')) w.fx.scr++;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    const fx = () => page.evaluate(() => ({ ...(window as unknown as { fx: Record<string, number> }).fx }));
    await openStudio(page, '#space=arte');
    // a group of settings: a light veil over the pane, and the new controls answer at once
    let before = await fx();
    await page.getByRole('tab', { name: 'Color' }).click();
    const sat = page.getByRole('slider', { name: 'Saturación' });
    await sat.fill('1.5');
    await expect(sat).toHaveValue('1.5');
    await expect(page.locator('.seedline')).toContainText('editado');
    expect((await fx()).curtain).toBeGreaterThan(before.curtain);
    // (a busy main thread — thumbnails drawn by a software GPU — may hold its last frames a moment)
    await expect(page.locator('canvas.mt-curtain')).toHaveCount(0, { timeout: 8000 });
    // a new space: the panel recomposes and its name resolves out of glyphs, while its real text is already the new one
    before = await fx();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('1');
    await expect(page.locator('.panel-title .eyebrow')).toHaveText('Recetas·Fondos');
    await expect.poll(async () => { const f = await fx(); return f.scr > before.scr && f.curtain > before.curtain; }).toBe(true);
    await expect(page.locator('.mt-scr')).toHaveCount(0, { timeout: 8000 });
    // a view: the stage's room recomposes
    before = await fx();
    await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Tarjeta', exact: true }).click();
    await expect(page.locator('.vw-card').first()).toBeVisible();
    expect((await fx()).curtain).toBeGreaterThan(before.curtain);
  });

  test('la calidad «Ligera» baja el movimiento de toda la interfaz', async ({ page }) => {
    await openStudio(page);
    const html = page.locator('html');
    await expect(html).not.toHaveAttribute('data-motion', 'low');
    await page.locator('.q-btn').click();
    await page.getByRole('dialog', { name: 'Calidad de la vista previa' }).getByRole('button', { name: /^Ligera/ }).click();
    await expect(html).toHaveAttribute('data-motion', 'low');
    // light swaps are left out under low motion: a tab change draws no veil
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Glifos' }).click();
    await page.waitForTimeout(100);
    await expect(page.locator('canvas.mt-curtain')).toHaveCount(0);
    await page.locator('.q-btn').click();
    await page.getByRole('dialog', { name: 'Calidad de la vista previa' }).getByRole('button', { name: /^Auto/ }).click();
    await expect(html).not.toHaveAttribute('data-motion', 'low');
  });
});

test.describe('avisos y barras', () => {
  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]] as const) {
    test(`a ${w} px, los avisos quedan bajo la barra de vistas sin tapar controles`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto('/studio/#space=arte');
      await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
      await dismissWelcome(page);
      // the first visit's dice hint
      const toast = page.locator('.toast').filter({ hasText: 'Azar' });
      await expect(toast).toBeVisible();
      const check = async (where: string) => {
        const t = await toast.boundingBox();
        if (!t) return;
        for (const sel of ['.topbar', '.vbar', '.panel', '.deck', '.seedline']) {
          const b = await page.locator(sel).first().boundingBox();
          if (b) expect(overlaps(t, b), `${where}: el aviso tapa ${sel}`).toBe(false);
        }
        const bar = await box(page, '.vbar');
        expect(t.y, where).toBeGreaterThanOrEqual(bar.y + bar.height);
      };
      await check('vista Libre');
      // a view with its options row: the notes go under it
      await page.getByRole('radiogroup', { name: 'Vista' }).getByRole('radio', { name: 'Fondo web', exact: true }).click();
      await page.waitForTimeout(300);
      await check('vista Fondo web');
      await ctx.close();
    });
  }

  test('la barra superior: marca, seis espacios con icono y nombre, y una sola acción principal', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStudio(page, '#space=arte');
    const spaces = page.getByRole('navigation', { name: 'Espacios del estudio' }).getByRole('button');
    await expect(spaces).toHaveCount(6);
    for (const b of await spaces.all()) {
      await expect(b.locator('svg')).toBeVisible();
      expect((await b.textContent())?.trim().length).toBeGreaterThan(2);
    }
    await expect(page.getByRole('button', { name: 'Guías' })).toContainText('Guías');
    await expect(page.getByRole('button', { name: /^Colección/ })).toContainText('Colección');
    // vermilion marks the one primary action in the bar
    const signal = await page.evaluate(() => [...document.querySelectorAll('.topbar button')].filter(b => getComputedStyle(b).backgroundColor === 'rgb(255, 91, 31)').map(b => b.textContent?.trim()));
    expect(signal).toEqual(['Exportar']);
  });

  test('el historial es una fila que avisa de lo que queda a los lados', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openStudio(page, '#space=arte');
    for (let i = 0; i < 16; i++) await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('17/17');
    const strip = page.locator('.strip');
    await expect(strip).toHaveAttribute('role', 'list');
    const box = page.locator('.strip-box');
    // at the newest result: older ones wait on the left
    await expect.poll(() => strip.evaluate(el => el.scrollWidth > el.clientWidth + 1)).toBe(true);
    await expect(box.locator('.srow-prev')).toBeVisible();
    await box.locator('.srow-prev').click();
    await expect(box.locator('.srow-next')).toBeVisible();
    // the thumbnails being made say so
    expect(await page.locator('.thumb[data-prep] .prep, .thumb:not([data-prep])').count()).toBeGreaterThan(0);
  });
});
