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

  test('portada: el titular tejido llega después de la carga, sin cambiar el LCP ni mover nada', async ({ page }) => {
    await page.addInitScript(() => {
      const v = { lcp: 0, lcpEl: '', cls: 0 };
      (window as unknown as { __v: typeof v }).__v = v;
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as Array<{ startTime: number; element?: Element }>) { v.lcp = e.startTime; v.lcpEl = e.element?.id ?? ''; }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(l => {
        for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) v.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await expect.poll(async () => (await scripts(page)).some(u => /\/assets\/titulo-/.test(u)), { timeout: 30_000 }).toBe(true);
    // the woven headline is its own chunk, asked for once the page has loaded: never part of the first paint
    const timing = await page.evaluate(() => ({
      chunk: performance.getEntriesByType('resource').find(r => /\/assets\/titulo-/.test(r.name))!.startTime,
      load: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventStart,
    }));
    expect(timing.chunk).toBeGreaterThanOrEqual(timing.load);
    // (the page's HTML does not preload it either; Vite adds its own preload link only when it is imported)
    expect(await (await page.request.get('/')).text()).not.toMatch(/assets\/titulo-/);
    await expect.poll(() => page.locator('#hero-title').evaluate(h => (h as HTMLElement).dataset.glyph ?? ''), { timeout: 30_000 }).toMatch(/^(palabras|letras|azar)$/);
    await page.waitForTimeout(1500);
    const v = await page.evaluate(() => (window as unknown as { __v: { lcp: number; lcpEl: string; cls: number } }).__v);
    // the largest paint is still the real headline (a lab number, logged for the record), and nothing moved
    expect(v.lcpEl).toBe('hero-title');
    expect(v.cls).toBeLessThan(0.01);
    test.info().annotations.push({ type: 'LCP de laboratorio (SwiftShader, sin limitar)', description: `${Math.round(v.lcp)} ms · CLS ${v.cls.toFixed(4)}` });
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
