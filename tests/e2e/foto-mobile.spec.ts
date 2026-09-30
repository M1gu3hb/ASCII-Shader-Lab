import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { needsFotoStudio, finalRender, framePoint, installTestTool, openFoto, project } from './foto-helpers';

/**
 * The photo studio on a phone (Pixel 7, touch): immersive by default (the art and four actions), the
 * tools sheet with snap points that keeps the art in view, two fingers pan and zoom (and cancel a tool's
 * gesture), one finger reaches the tool (or pans when no tool draws).
 */
needsFotoStudio();

type Pt = { x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
  // a quick one-finger swipe ends in a fling, and Chrome swallows the click of a tap that lands while it
  // stops one (measured: every tap within ~0 ms of such a swipe, none after 450 ms), as on a real phone
  if (type === 'touchEnd') await new Promise(r => setTimeout(r, 450));
}
const ui = (page: Page) => page.evaluate(() => (window as unknown as { __foto: { ui(): { zk: number; pan: { x: number; y: number }; snap: string; tool: string | null } } }).__foto.ui());

test('inmersivo en el teléfono, hoja de herramientas, dos dedos mueven y acercan, un dedo dibuja', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Foto → ASCII completo/ }).tap();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
  // immersive: no top bar, the art and the four actions
  await expect(page.locator('.topbar')).toHaveCount(0);
  const bar = page.getByRole('navigation', { name: 'Acciones' });
  for (const n of ['Versión anterior', 'Azar', 'Siguiente (al final, azar)', 'Herramientas']) await expect(bar.getByRole('button', { name: n, exact: true })).toBeVisible();
  for (const b of await bar.getByRole('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const frame0 = (await page.locator('[data-testid=frame]').boundingBox())!;
  expect(frame0.width).toBeGreaterThan(300);

  // Azar from the bar
  await bar.getByRole('button', { name: 'Azar', exact: true }).tap();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __foto: { store(): { versions: { list: unknown[] } } } }).__foto.store().versions.list.length)).toBe(2);

  // the tools sheet at half: the art stays above it
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  const sheet = page.getByRole('region', { name: 'Herramientas y capas' });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => {
    const s = (await sheet.boundingBox())!, f = (await page.locator('[data-testid=frame]').boundingBox())!;
    return f.y + f.height <= s.y + 1 && f.height > 80;
  }).toBe(true);
  // layers in the sheet, compact list with 44 px targets
  await sheet.getByRole('tab', { name: 'Capas' }).tap();
  await expect(sheet.locator('.lr')).toHaveCount(2);
  // the handle: a tap goes to full, a swipe down closes
  const grab = sheet.getByRole('slider', { name: 'Altura de la hoja' });
  await grab.tap();
  await expect.poll(async () => (await ui(page)).snap).toBe('full');
  const g = (await grab.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await touch(client, 'touchStart', [{ x: g.x + g.width / 2, y: g.y + 10 }]);
  for (let i = 1; i <= 8; i++) await touch(client, 'touchMove', [{ x: g.x + g.width / 2, y: g.y + 10 + i * 100 }]);
  await touch(client, 'touchEnd', []);
  await expect(sheet).toHaveCount(0);

  // two fingers: pinch out zooms in, and the pair pans
  const k0 = (await ui(page)).zk;
  const c = await framePoint(page, 0.5, 0.5);
  await touch(client, 'touchStart', [{ x: c.x - 40, y: c.y }, { x: c.x + 40, y: c.y }]);
  for (let i = 1; i <= 6; i++) await touch(client, 'touchMove', [{ x: c.x - 40 - i * 15 + i * 5, y: c.y + i * 5 }, { x: c.x + 40 + i * 15 + i * 5, y: c.y + i * 5 }]);
  await touch(client, 'touchEnd', []);
  const after = await ui(page);
  expect(after.zk).toBeGreaterThan(k0 * 1.5);
  expect(Math.abs(after.pan.y)).toBeGreaterThan(0);

  // one finger without a drawing tool pans
  const pan0 = after.pan;
  await touch(client, 'touchStart', [{ x: c.x, y: c.y }]);
  for (let i = 1; i <= 5; i++) await touch(client, 'touchMove', [{ x: c.x - i * 12, y: c.y }]);
  await touch(client, 'touchEnd', []);
  expect((await ui(page)).pan.x).toBeLessThan(pan0.x - 30);

  // back to the fitted view (a tap on the art does nothing)
  await page.evaluate(() => (window as unknown as { __foto: { setUI(p: unknown): void } }).__foto.setUI({ zoom: 'fit', pan: { x: 0, y: 0 } }));

  // one finger reaches a drawing tool: a drag makes a mask part (with the loupe while it draws)
  await installTestTool(page);
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  await page.getByRole('region', { name: 'Herramientas y capas' }).getByRole('tab', { name: 'Herramientas' }).tap();
  await page.getByRole('button', { name: 'Rectángulo de prueba (Q)' }).tap();
  await page.getByRole('button', { name: 'Cerrar la hoja' }).tap();
  expect((await ui(page)).tool).toBe('prueba-rect');
  // the floating ± switches add / subtract without keys
  await page.getByRole('button', { name: /Sumando zonas/ }).tap();
  await page.getByRole('button', { name: /Restando zonas/ }).tap();
  const a = await framePoint(page, 0.2, 0.2), b = await framePoint(page, 0.6, 0.7);
  await touch(client, 'touchStart', [a]);
  for (let i = 1; i <= 6; i++) await touch(client, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 }]);
  await expect(page.locator('.fv-loupe')).toBeVisible();
  await touch(client, 'touchEnd', []);
  let p = await project(page);
  expect(p.layers[1].mask?.parts).toHaveLength(1);
  // a second finger during a drawing gesture cancels it: nothing is added, the view zooms instead
  const cancels0 = await page.evaluate(() => (window as unknown as { __foto: { cancels: number } }).__foto.cancels);
  await touch(client, 'touchStart', [a]);
  await touch(client, 'touchMove', [{ x: a.x + 30, y: a.y + 30 }]);
  await touch(client, 'touchStart', [{ x: a.x + 30, y: a.y + 30 }, { x: a.x + 120, y: a.y + 60 }]);
  await touch(client, 'touchMove', [{ x: a.x + 10, y: a.y + 20 }, { x: a.x + 160, y: a.y + 80 }]);
  await touch(client, 'touchEnd', []);
  expect(await page.evaluate(() => (window as unknown as { __foto: { cancels: number } }).__foto.cancels)).toBe(cancels0 + 1);
  p = await project(page);
  expect(p.layers[1].mask?.parts).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('antes y después con el dedo; salir del inmersivo muestra la barra superior', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Foto → ASCII completo/ }).tap();
  await finalRender(page);
  await page.getByRole('button', { name: 'Antes y después (C)' }).tap();
  const split = page.getByRole('slider', { name: /Antes y después/ });
  await expect(split).toBeVisible();
  const s = (await split.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await touch(client, 'touchStart', [{ x: s.x + s.width / 2, y: s.y + s.height / 2 }]);
  for (let i = 1; i <= 5; i++) await touch(client, 'touchMove', [{ x: s.x + s.width / 2 + i * 20, y: s.y + s.height / 2 }]);
  await touch(client, 'touchEnd', []);
  await expect.poll(async () => Number(await split.getAttribute('aria-valuenow'))).toBeGreaterThan(60);
  await page.getByRole('button', { name: /Mostrar la barra superior/ }).tap();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByRole('button', { name: /Exportar/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // and back to the art alone: the switch works both ways
  await page.getByRole('button', { name: 'Herramientas', exact: true }).tap();
  await page.getByRole('tab', { name: 'Explorar' }).tap();
  await page.getByRole('button', { name: 'Ocultar la barra superior' }).tap();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.getByRole('button', { name: /Mostrar la barra superior/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('la hoja de herramientas, cerrada con Esc o con «Cerrar la hoja», devuelve el foco a «Herramientas»', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Foto → ASCII completo/ }).tap();
  await finalRender(page);
  const tools = page.getByRole('button', { name: 'Herramientas', exact: true });
  for (const close of ['Escape', 'Cerrar la hoja']) {
    await tools.focus();
    await page.keyboard.press('Enter');
    // the sheet takes the focus to its selected tab
    await expect(page.getByRole('tab', { selected: true })).toBeFocused();
    if (close === 'Escape') await page.keyboard.press('Escape');
    else { await page.getByRole('button', { name: close }).focus(); await page.keyboard.press('Enter'); }
    await expect(page.locator('.fsheet')).toHaveCount(0);
    await expect(tools).toBeFocused();
  }
  expect(errors).toEqual([]);
});
