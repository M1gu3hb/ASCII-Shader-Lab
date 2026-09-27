import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';
import { choose } from './clip';

/** On a phone, what the person works on stays in view (iPhone 13: 390×664). */

async function iphone(browser: Browser, path: string) {
  const { defaultBrowserType: _, ...opts } = devices['iPhone 13'] as typeof devices['iPhone 13'] & { defaultBrowserType?: string };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(path);
  await expect(page.locator('.stage canvas, .comp-wrap').first()).toBeVisible({ timeout: 45_000 });
  return { ctx, page };
}

type Box = { top: number; bottom: number; left: number; right: number };
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate(el => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
}) as Promise<Box>;

test.describe('en el teléfono', () => {
  test('en la guía, la palabra se ve encima de la hoja de pasos', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/?camino=palabra');
    await page.getByLabel(/Tu palabra/).fill('HOLA');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('.guide-step, .panel').getByText('Ritmo y tamaño').first()).toBeVisible();
    const sheet = await box(page, '.panel.guide-panel');
    const canvas = await box(page, '.stage canvas');
    // the whole piece is above the sheet, with room for the word
    expect(canvas.bottom).toBeLessThanOrEqual(sheet.top + 1);
    expect(canvas.bottom - canvas.top).toBeGreaterThan(120);
    await ctx.close();
  });

  test('en la guía de fondos, la página de prueba enseña titular y botones', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/?camino=fondo');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.locator('.vw-viewport')).toBeVisible();
    const vp = await box(page, '.vw-viewport');
    const sheet = await box(page, '.panel.guide-panel');
    expect(vp.bottom).toBeLessThanOrEqual(sheet.top);
    const h1 = await box(page, '.preview-content h1');
    const btns = await box(page, '.preview-content .pc-btns');
    expect(h1.top).toBeGreaterThanOrEqual(vp.top);
    expect(btns.bottom).toBeLessThanOrEqual(vp.bottom + 1);
    await ctx.close();
  });

  test('la vista Historia / Reel 9:16 cabe entera, con sus franjas de interfaz', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/#space=fondos');
    await dismissWelcome(page);
    await choose(page, page.getByRole('combobox', { name: 'Vista' }), /^Historia \/ Reel/);
    await page.getByRole('button', { name: 'Opciones de la vista' }).tap();
    await page.locator('.vbar-switch').getByText(/Zonas de interfaz/).tap();
    await page.getByRole('button', { name: 'Opciones de la vista' }).tap();
    // measured once the frame has taken the room it has (sizes settle over a couple of frames)
    await expect.poll(async () => {
      const area = await box(page, '.vw-center');
      const out: string[] = [];
      for (const sel of ['.vw-phone', '.vw-safe-top', '.vw-safe-right', '.vw-safe-bottom']) {
        const b = await box(page, sel);
        if (b.top < area.top - 1 || b.bottom > area.bottom + 1) out.push(`${sel} ${Math.round(b.top)}–${Math.round(b.bottom)} fuera de ${Math.round(area.top)}–${Math.round(area.bottom)}`);
      }
      return out;
    }).toEqual([]);
    await ctx.close();
  });

  test('la tarjeta para elegir una imagen no queda debajo de la línea de la semilla', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/#space=media');
    await dismissWelcome(page);
    await expect(page.locator('.prompt .card .privacy')).toBeVisible();
    const privacy = await box(page, '.prompt .card .privacy');
    const seed = await box(page, '.seedline');
    expect(privacy.bottom).toBeLessThanOrEqual(seed.top);
    await ctx.close();
  });

  test('una pieza abierta desde abajo en Componentes empieza por su título, y volver deja la galería donde estaba', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/#space=componentes');
    await dismissWelcome(page);
    const open = page.getByRole('button', { name: /Personalizar y copiar: Barra de progreso/ });
    await open.scrollIntoViewIfNeeded();
    const before = await page.locator('.comp-wrap').evaluate(el => el.scrollTop);
    expect(before).toBeGreaterThan(500);
    await open.click();
    const h1 = page.getByRole('heading', { level: 1, name: 'Barra de progreso' });
    await expect(h1).toBeInViewport();
    await expect(h1).toBeFocused();
    await page.getByRole('button', { name: '← Todas las piezas' }).click();
    await expect(open).toBeFocused();
    expect(Math.abs(await page.locator('.comp-wrap').evaluate(el => el.scrollTop) - before)).toBeLessThan(4);
    await ctx.close();
  });

  test('el primer aviso del dado no nombra teclas en el teléfono ni sale en Componentes', async ({ browser }) => {
    const { ctx, page } = await iphone(browser, '/studio/');
    await dismissWelcome(page);
    const hint = page.locator('.toast').filter({ hasText: 'Azar' });
    await expect(hint).toBeVisible();
    await expect(hint).not.toContainText('(R)');
    await expect(hint).not.toContainText('← →');
    await ctx.close();
    const c = await iphone(browser, '/studio/#space=componentes');
    await dismissWelcome(c.page);
    await c.page.waitForTimeout(1500);
    await expect(c.page.locator('.toast').filter({ hasText: 'Azar' })).toHaveCount(0);
    await c.ctx.close();
  });
});
