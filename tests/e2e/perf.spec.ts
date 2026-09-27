import { expect, test, type Page } from '@playwright/test';
import { contextOf, drawn } from './canvas';
import { dismissWelcome } from './helpers';

/**
 * What loads with a page's first view. The basic engine (Canvas 2D ports of every pattern) is only for
 * browsers without WebGL 2, and the exporters only for exporting: none of them may slip back into the
 * startup bundle. vite.config.ts names those chunks after what they carry, so the check reads file names.
 */

const HEAVY = /\/assets\/(basic-engine|mediabunny|gifenc|opentype|exporter-code|export-sheet)-[\w-]+\.js$/;

/** Scripts fetched so far (the page's own resource timing: works against a deployed site too). */
const scripts = (page: Page) => page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(n => /\.js(\?|$)/.test(n)));

test.describe('peso de la primera vista', () => {
  test('portada: el motor llega aparte y sin el motor básico ni los exportadores', async ({ page }) => {
    await page.goto('/');
    // the hero's engine is its own chunk: wait until it has drawn, then look at what came with it
    await expect.poll(async () => (await scripts(page)).some(u => /\/assets\/engines-/.test(u)), { timeout: 30_000 }).toBe(true);
    await page.waitForLoadState('load');
    const loaded = await scripts(page);
    expect(loaded.filter(u => HEAVY.test(u))).toEqual([]);
    // and nothing heavy is preloaded by the HTML either
    const preloads = await page.locator('link[rel=modulepreload]').evaluateAll(ls => ls.map(l => (l as HTMLLinkElement).href));
    expect(preloads.filter(u => HEAVY.test(u))).toEqual([]);
  });

  test('estudio: arranca sin el motor básico ni la hoja de exportar, que llega al abrirla', async ({ page }) => {
    // «ahorro de datos»: no idle prefetch, so what loads is exactly what the first view and the clicks ask for
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }));
    await page.goto('/studio/');
    await expect(page.locator('.stage canvas').first()).toBeVisible();
    await expect(page.locator('.seedline')).toBeVisible();
    expect((await scripts(page)).filter(u => HEAVY.test(u))).toEqual([]);
    await dismissWelcome(page);
    // opening the sheet loads it (or finds it prefetched) and it works as before
    await page.keyboard.press('e');
    await expect(page.locator('dialog.sheet[open]')).toContainText('Llevar la pieza fuera');
    expect((await scripts(page)).some(u => /\/assets\/export-sheet-/.test(u))).toBe(true);
    expect((await scripts(page)).some(u => /\/assets\/basic-engine-/.test(u))).toBe(false);
  });

  test('estudio: con la página quieta, la hoja de exportar llega sola (sin abrirla)', async ({ page }) => {
    await page.goto('/studio/');
    await expect(page.locator('.seedline')).toBeVisible();
    await expect.poll(async () => (await scripts(page)).some(u => /\/assets\/export-sheet-/.test(u)), { timeout: 30_000 }).toBe(true);
    expect((await scripts(page)).some(u => /\/assets\/(basic-engine|exporter-code)-/.test(u))).toBe(false);
  });

  test('estudio con ?motor=basico: el motor básico se descarga y dibuja', async ({ page }) => {
    await page.goto('/studio/?motor=basico');
    await expect(page.locator('.stage canvas').first()).toBeVisible();
    await drawn(page, '.stage canvas');
    expect(await contextOf(page, '.stage canvas')).toBe('2d');
    expect((await scripts(page)).some(u => /\/assets\/basic-engine-/.test(u))).toBe(true);
  });
});
