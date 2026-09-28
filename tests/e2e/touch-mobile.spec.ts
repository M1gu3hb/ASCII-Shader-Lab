import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';
import { choose } from './clip';

/**
 * Phones for real: an iPhone 13 (390×664 viewport, touch) and a 360×800 Android. Nothing overflows
 * sideways, the controls you use with a thumb are at least 44 px (never under 40), the sheets fill the
 * screen with their close button in reach, and the toasts never cover the controls or the chip.
 */
const PHONES = {
  'iPhone 13': { ...devices['iPhone 13'] },
  'Android 360×800': { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, screen: { width: 360, height: 800 } },
};

async function phone(browser: Browser, name: keyof typeof PHONES, path = '/studio/') {
  const { defaultBrowserType: _, ...opts } = PHONES[name] as typeof PHONES['iPhone 13'] & { defaultBrowserType?: string };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(path);
  return { ctx, page, errors };
}

async function noOverflow(page: Page, where: string) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(o, `${where}: la página se desborda ${o} px`).toBeLessThanOrEqual(0);
}

/** Visible elements matching `selector` smaller than `min` px (the hit area of a switch or colour is its row or swatch). */
function smallTargets(page: Page, selector: string, min = 44) {
  return page.evaluate(([sel, m]) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const hit = (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'color' ? el.closest('label, .swatch') ?? el : el;
      const r = hit.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('[inert], .vw-area .gh-pre')) continue;
      const modal = document.querySelector('dialog[open]');
      if (modal && !modal.contains(el)) continue;
      if (r.width < m || r.height < m) out.push(`${Math.round(r.width)}×${Math.round(r.height)} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24)}`);
    }
    return out;
  }, [selector, min] as const);
}

const CONTROLS = 'button, a[href], select, input[type=checkbox], input[type=color], input[type=range], [role="switch"]';

for (const name of Object.keys(PHONES) as Array<keyof typeof PHONES>) {
  test.describe(name, () => {
    test('estudio: sin desbordes, controles de 44 px y hojas a pantalla completa', async ({ browser }) => {
      const { ctx, page, errors } = await phone(browser, name);
      await expect(page.locator('dialog.welcome[open]')).toBeVisible();
      await noOverflow(page, 'bienvenida');
      expect(await smallTargets(page, 'dialog.welcome button')).toEqual([]);
      await dismissWelcome(page);

      // the dice hint shows under the stage's top bar: it covers neither the view selector nor the deck
      const toast = page.locator('.toast').first();
      await expect(toast).toBeVisible();
      const [t, bar, deck] = await Promise.all([toast.boundingBox(), page.locator('.vbar').boundingBox(), page.locator('.deck').boundingBox()]);
      expect(t!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
      expect(t!.y + t!.height).toBeLessThanOrEqual(deck!.y);

      await noOverflow(page, 'estudio');
      // the top bar keeps to the screen (the page clips it, so its own width is what tells): Exportar whole
      expect(await page.evaluate(() => {
        const bar = document.querySelector('.topbar')!, exp = bar.querySelector('.ib.primary')!.getBoundingClientRect();
        return { bar: bar.scrollWidth <= innerWidth, exportar: exp.left >= 0 && exp.right <= innerWidth };
      })).toEqual({ bar: true, exportar: true });
      expect(await smallTargets(page, '.topbar button, .topbar select, .deck button, .seedline button, .vbar button')).toEqual([]);

      // history strip and an edited seed line (it wraps to a second row, still 44 px targets)
      for (let i = 0; i < 4; i++) await page.locator('.act.dice').tap();
      await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
      await expect(page.locator('.panel')).toBeInViewport();
      // the settings sheet opens above the deck: the dice stay in reach
      await expect(page.locator('.act.dice')).toBeInViewport();
      await expect.poll(async () => {
        const [panel, deck2] = await Promise.all([page.locator('.panel').boundingBox(), page.locator('.deck').boundingBox()]);
        return panel!.y + panel!.height - deck2!.y;
      }).toBeLessThanOrEqual(1);
      for (const tab of await page.locator('.panel .tab').all()) {
        await tab.tap();
        await noOverflow(page, 'panel ' + (await tab.textContent()));
        expect(await smallTargets(page, `.panel :is(${CONTROLS})`), 'panel ' + (await tab.textContent())).toEqual([]);
      }
      await page.locator('.panel .tab', { hasText: 'Color' }).tap();
      await page.locator('.palettes .pal').nth(3).tap();
      // the sheet's handle: a short drag springs back, a long one closes it
      const grab = (await page.locator('.sheet-grab').boundingBox())!;
      const drag = async (dy: number) => {
        await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
        await page.mouse.down();
        await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2 + dy, { steps: 6 });
        await page.mouse.up();
      };
      await drag(20);
      await expect(page.locator('.app')).not.toHaveClass(/panel-off/);
      // it springs back to where it was
      await expect.poll(async () => Math.round((await page.locator('.sheet-grab').boundingBox())!.y)).toBe(Math.round(grab.y));
      await drag(160);
      await expect(page.locator('.app')).toHaveClass(/panel-off/);
      await expect(page.locator('.panel')).not.toBeInViewport();
      await expect(page.locator('.seedline')).toContainText('editado');
      expect(await smallTargets(page, '.seedline button, .thumb')).toEqual([]);
      const seed = (await page.locator('.seedline').boundingBox())!;
      expect(seed.y + seed.height).toBeLessThanOrEqual((await page.locator('.deck').boundingBox())!.y);

      // dice settings: a popover that fits the screen
      await page.getByRole('button', { name: 'Ajustes del azar' }).tap();
      const pop = (await page.locator('.pop').boundingBox())!;
      const vp = page.viewportSize()!;
      expect(pop.x).toBeGreaterThanOrEqual(0);
      expect(pop.y).toBeGreaterThanOrEqual(0);
      expect(pop.x + pop.width).toBeLessThanOrEqual(vp.width);
      expect(pop.y + pop.height).toBeLessThanOrEqual(vp.height);
      expect(await smallTargets(page, '.pop button, .pop select')).toEqual([]);
      await page.getByRole('button', { name: 'Ajustes del azar' }).tap();

      // the export sheet fills the screen; every tab fits and its close button is in reach
      await page.locator('.topbar .ib.primary').tap();
      const sheet = page.getByRole('dialog', { name: 'Llevar la pieza fuera' });
      await expect(sheet).toBeVisible();
      const sb = (await sheet.boundingBox())!;
      expect(sb.width).toBeGreaterThanOrEqual(vp.width - 1);
      expect(sb.height).toBeGreaterThanOrEqual(vp.height - 1);
      for (const tab of await sheet.locator('.sheet-tabs .tab').all()) {
        await tab.tap();
        await noOverflow(page, 'exportar ' + (await tab.textContent()));
        expect(await smallTargets(page, 'dialog[open] :is(button, select)'), 'exportar ' + (await tab.textContent())).toEqual([]);
        await sheet.locator('.sheet-body').evaluate(el => el.scrollTo(0, el.scrollHeight));
        await expect(sheet.getByRole('button', { name: 'Cerrar' })).toBeInViewport();
      }
      await sheet.getByRole('button', { name: 'Cerrar' }).tap();
      await expect(sheet).toBeHidden();

      // destination previews (chosen in the studio's picker: a sheet at the bottom of the screen)
      for (const v of ['Fondo web', 'Pantalla de móvil', 'Tarjeta', 'Historia', 'README', 'Terminal', 'Libre']) {
        await page.getByRole('combobox', { name: 'Vista' }).tap();
        const list = page.getByRole('listbox', { name: 'Vista' });
        await expect(list).toBeVisible();
        expect(await smallTargets(page, '.pk-pop :is(button, [role=option])'), 'lista de vistas').toEqual([]);
        await list.getByRole('option', { name: new RegExp('^' + v) }).tap();
        await expect(list).toBeHidden();
        await page.waitForTimeout(300);
        await noOverflow(page, 'vista ' + v);
        expect(await smallTargets(page, '.vbar :is(button, select)'), 'vista ' + v).toEqual([]);
      }

      // the collection
      await page.getByRole('button', { name: /^Colección/ }).tap();
      await expect(page.getByRole('dialog', { name: 'Colección e historial' })).toBeVisible();
      await noOverflow(page, 'colección');
      expect(await smallTargets(page, 'dialog[open] :is(button, input)')).toEqual([]);
      await page.getByRole('dialog', { name: 'Colección e historial' }).getByRole('button', { name: 'Cerrar' }).tap();

      // components: gallery and detail
      await choose(page, page.getByRole('combobox', { name: 'Espacio' }), /^Componentes/);
      await noOverflow(page, 'galería');
      expect(await smallTargets(page, '.comp-open, .topbar button')).toEqual([]);
      await page.getByRole('button', { name: /Personalizar y copiar: Halo/ }).tap();
      await expect(page.getByRole('heading', { level: 1, name: 'Halo' })).toBeVisible();
      await noOverflow(page, 'detalle');
      expect(await smallTargets(page, `.comp-detail :is(${CONTROLS})`)).toEqual([]);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test('modo básico: el aviso del dado no tapa el chip', async ({ browser }) => {
      const { ctx, page } = await phone(browser, name, '/studio/?motor=basico');
      await expect(page.locator('dialog.welcome[open]')).toBeVisible();
      await dismissWelcome(page);
      const chip = page.locator('.bm-basic');
      const toast = page.locator('.toast').first();
      await expect(chip).toBeInViewport();
      await expect(toast).toBeVisible();
      const [c, t] = await Promise.all([chip.boundingBox(), toast.boundingBox()]);
      expect(t!.y >= c!.y + c!.height || t!.y + t!.height <= c!.y).toBe(true);
      expect(await smallTargets(page, '.bm-basic button')).toEqual([]);
      await ctx.close();
    });

    test('portada y una guía: sin desbordes ni fallos graves de accesibilidad', async ({ browser }) => {
      const { ctx, page } = await phone(browser, name, '/');
      for (const path of ['/', '/imagen-a-ascii/']) {
        await page.goto(path);
        await page.waitForTimeout(800);
        await noOverflow(page, path);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${path} ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([]);
      }
      await ctx.close();
    });
  });
}
