import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../../src/shared/zip';
import { clipped } from './clip';
import { dismissWelcome } from './helpers';

/**
 * The creative additions on a 390 px phone (touch): the «Transformar» stack, the letters that move and
 * the ramp editor fit sideways, their buttons are 44 px targets, and the lists open as a sheet.
 */
const PHONE = { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 } };

function photo(w = 240, h = 160): Buffer {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    const disc = Math.hypot(x - w * 0.4, y - h * 0.5) < h * 0.28;
    raw[o] = disc ? 250 : (x * 200 / w) | 0; raw[o + 1] = disc ? 210 : (y * 180 / h) | 0; raw[o + 2] = disc ? 150 : 110;
  }
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const openPanel = async (page: Page) => {
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await expect(page.locator('.panel')).toBeInViewport();
};

/** Targets under 44 × 44 px among the visible buttons of a part of the panel. */
const small = (where: Locator) => where.evaluateAll(els => els.flatMap(el => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return [];
  return r.width < 43.5 || r.height < 43.5 ? [`${el.getAttribute('aria-label') ?? el.textContent?.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`] : [];
}));

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('en un teléfono: Transformar, las letras que se mueven y la rampa caben y se tocan bien', async ({ browser }) => {
  test.setTimeout(240_000);
  const { defaultBrowserType: _, ...opts } = PHONE as typeof PHONE & { defaultBrowserType?: string };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio/#space=media');
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'foto.png', { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, photo().toString('base64'));
  await openPanel(page);

  // Transformar: two cards through the sheet list
  await page.getByRole('tab', { name: 'Transformar' }).tap();
  const add = page.getByRole('combobox', { name: 'Añadir una transformación' });
  for (const name of [/Semitono/, /Ondular/]) {
    await add.tap();
    const list = page.getByRole('listbox', { name: 'Añadir una transformación' });
    await expect(list).toBeVisible();
    const opt = list.getByRole('option', { name });
    expect((await opt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await opt.tap();
    await expect(list).toBeHidden();
  }
  await expect(page.locator('.xf-card')).toHaveCount(2);
  expect(await page.locator('.xf-card button').count()).toBeGreaterThanOrEqual(8);
  expect(await small(page.locator('.xf-card button, .xf-card [role=combobox], .pane .xf-add button'))).toEqual([]);
  await page.getByRole('button', { name: 'Bajar «Semitono»' }).tap();
  await expect(page.getByRole('combobox', { name: 'Transformación 1' })).toContainText('Ondular');
  expect(await clipped(page)).toEqual([]);
  expect(await sideways(page)).toBe(false);

  // Tipo: the letters that move
  await page.getByRole('button', { name: 'Cerrar ajustes' }).tap();
  await page.goto('about:blank');
  await page.goto('/studio/#space=tipo');
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  await openPanel(page);
  await page.getByRole('tab', { name: 'Texto', exact: true }).tap();
  const move = page.getByRole('combobox', { name: 'Cómo se mueven las letras' });
  await move.scrollIntoViewIfNeeded();
  await move.tap();
  await page.getByRole('listbox', { name: 'Cómo se mueven las letras' }).getByRole('option', { name: /^Rebote/ }).tap();
  await expect(move).toContainText('Rebote');
  await expect(page.getByRole('slider', { name: 'Velocidad' }).first()).toBeVisible();
  expect(await clipped(page)).toEqual([]);
  expect(await sideways(page)).toBe(false);

  // Glifos: the ramp editor
  await page.getByRole('tab', { name: 'Glifos' }).tap();
  const field = page.getByLabel('Tus caracteres (del vacío al lleno)');
  await field.scrollIntoViewIfNeeded();
  await field.fill(' .oO@');
  await expect(page.locator('.ramp-bars li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Guardar esta rampa en este navegador' }).tap();
  await expect(page.getByLabel('Nombre de la rampa')).toBeVisible();
  expect(await page.locator('.ramp-ed button').count()).toBeGreaterThanOrEqual(3);
  expect(await small(page.locator('.ramp-ed button'))).toEqual([]);
  expect(await clipped(page)).toEqual([]);
  expect(await sideways(page)).toBe(false);
  expect(errors).toEqual([]);
  await ctx.close();
});
