import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { clipped } from './clip';
import { dismissWelcome } from './helpers';

/**
 * Controls on phones (touch, 390×844 and 360×800): rows that do not fit scroll and say so, nothing
 * else clips sideways, the lists open as a sheet at the bottom with 44 px options, and the «?» of a
 * control is a 44 px target beside it.
 */
const PHONES = {
  '390×844': { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } },
  '360×800': { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, screen: { width: 360, height: 800 } },
};

async function phone(browser: Browser, name: keyof typeof PHONES, path = '/studio/#space=arte') {
  const { defaultBrowserType: _, ...opts } = PHONES[name] as typeof PHONES['390×844'] & { defaultBrowserType?: string };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(path);
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  return { ctx, page, errors };
}

const openPanel = async (page: Page) => {
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await expect(page.locator('.panel')).toBeInViewport();
};

for (const name of Object.keys(PHONES) as Array<keyof typeof PHONES>) {
  test.describe(name, () => {
    test('filas que no caben: se desplazan, avisan de «más» y nada más recorta', async ({ browser }) => {
      const { ctx, page, errors } = await phone(browser, name);
      await openPanel(page);
      const found: string[] = [];
      const look = async (where: string) => { for (const c of await clipped(page)) found.push(`${where}: ${c}`); };
      await look('inicio');
      // the section tabs scroll in one row, with «más» on the side where more waits
      const box = page.locator('.panel .ptabs-box');
      await expect(box.locator('.srow-next')).toBeVisible();
      await expect(box.locator('.srow-next')).toContainText('más');
      expect(await box.locator('.srow-next').evaluate(el => { const r = el.getBoundingClientRect(); return [r.width >= 44, r.height >= 44]; })).toEqual([true, true]);
      for (const tab of await page.locator('.panel [role=tab]').all()) {
        await tab.tap();
        // the chosen one is fully in view inside its row
        await expect.poll(() => tab.evaluate(el => { const row = el.closest('.srow-list')!.getBoundingClientRect(), b = el.getBoundingClientRect(); return b.left >= row.left - 1 && b.right <= row.right + 1; })).toBe(true);
        await look('pestaña ' + (await tab.textContent())?.trim());
      }
      await expect(box.locator('.srow-prev')).toBeVisible();
      // the chevron pages back
      await box.locator('.srow-prev').tap();
      await expect(box.locator('.srow-next')).toBeVisible();
      // the recipes too
      await expect(page.locator('.panel .recipes').locator('xpath=..').locator('.srow-next')).toBeVisible();
      await page.getByRole('button', { name: 'Cerrar ajustes' }).tap();

      // the export sheet's formats
      await page.locator('.topbar .ib.primary').tap();
      const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
      for (const tab of await sheet.getByRole('tab').all()) {
        await tab.tap();
        await look('exportar ' + (await tab.textContent())?.trim());
      }
      await sheet.getByRole('button', { name: 'Cerrar' }).tap();
      expect(found, found.join('\n')).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test('las listas se abren como hoja abajo, con opciones de 44 px, y «?» es un objetivo de 44 px', async ({ browser }) => {
      const { ctx, page } = await phone(browser, name);
      await openPanel(page);
      await page.getByRole('tab', { name: 'Glifos' }).tap();
      const cs = page.getByRole('combobox', { name: 'Caracteres', exact: true });
      await cs.tap();
      const list = page.getByRole('listbox', { name: 'Caracteres', exact: true });
      await expect(list).toBeVisible();
      await expect(list).toBeFocused();
      const pop = (await page.locator('.pk-pop').boundingBox())!;
      const vp = page.viewportSize()!;
      expect(pop.x).toBeLessThanOrEqual(1);
      expect(pop.width).toBeGreaterThanOrEqual(vp.width - 2);
      expect(pop.y + pop.height).toBeGreaterThanOrEqual(vp.height - 2);
      for (const o of (await list.getByRole('option').all()).slice(0, 6)) {
        const r = (await o.boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(44);
      }
      await list.getByRole('option', { name: /^Bloques/ }).tap();
      await expect(list).toBeHidden();
      await expect(cs).toHaveAttribute('data-value', 'bloques');
      // «Cerrar» closes without choosing
      await cs.tap();
      await page.locator('.pk-sheet-x').tap();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(cs).toHaveAttribute('data-value', 'bloques');

      // «?»: 44 px, beside its control, opens the explanation inline
      const q = page.getByRole('button', { name: 'Qué es «Tamaño de celda»' });
      const qr = (await q.boundingBox())!;
      expect(qr.width).toBeGreaterThanOrEqual(44);
      expect(qr.height).toBeGreaterThanOrEqual(44);
      await q.tap();
      await expect(page.locator('#' + (await q.getAttribute('aria-controls')))).toContainText('Pequeña: más detalle');
      await ctx.close();
    });
  });
}
