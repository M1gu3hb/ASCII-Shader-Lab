import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';

/**
 * Sliders under a finger or a pen (ui/Range.tsx), on a phone (the mobile project: touch, coarse pointer).
 * Scrolling the settings with a finger over a slider never changes it; a deliberate sideways drag does,
 * precisely (the value follows the finger from where it was, finer farther from the track); a tap changes
 * nothing; a pen behaves the same; − + and the typed value are exact.
 */

const NAME = 'Forma de la celda (alto ÷ ancho)';
const MIN = 0.6, MAX = 2.4;

async function openGlifos(page: Page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('mt.intro', '1'); } catch { /* */ } });
  await page.goto('/studio/#space=arte');
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await expect(page.locator('aside.panel')).toHaveAttribute('data-snap', 'half');
  await page.getByRole('tab', { name: 'Glifos' }).tap();
  // the sheet at full height: several sliders in view, and room to scroll
  await page.getByRole('button', { name: /^Tamaño de los ajustes/ }).tap();
  await expect(page.locator('aside.panel')).toHaveAttribute('data-snap', 'full');
  await page.waitForTimeout(400);
}

/** Touches through the browser's own input pipeline (so the page scrolls as it would under a finger). */
function fingers(cdp: CDPSession, page: Page) {
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  return {
    send,
    async swipe(x0: number, y0: number, x1: number, y1: number, steps = 12) {
      await send('touchStart', x0, y0);
      for (let i = 1; i <= steps; i++) { await send('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(16); }
      await send('touchEnd', x1, y1);
    },
  };
}

const value = async (page: Page) => Number(await page.getByRole('slider', { name: NAME }).inputValue());
/** The slider's track (its box) with the pane scrolled back to the top. */
async function track(page: Page) {
  await page.locator('#pane').evaluate(el => el.scrollTo(0, 0));
  await page.waitForTimeout(200);
  return (await page.getByRole('slider', { name: NAME }).boundingBox())!;
}

test('con el dedo: desplazar el panel sobre un deslizador no lo cambia; un gesto de lado sí, y con precisión', async ({ page }) => {
  // many small touch events through the browser's input pipeline: slow on a software GPU
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openGlifos(page);
  const cdp = await page.context().newCDPSession(page);
  const f = fingers(cdp, page);
  const v0 = await value(page);

  // a swipe up over the slider scrolls the settings, and the slider stays
  let b = await track(page);
  await f.swipe(b.x + b.width * 0.7, b.y + b.height / 2, b.x + b.width * 0.72, b.y + b.height / 2 - 170);
  await expect.poll(() => page.locator('#pane').evaluate(el => el.scrollTop)).toBeGreaterThan(40);
  expect(await value(page)).toBe(v0);
  // down, and a slightly slanted swipe (mostly up-down), from the middle and from the ends of the track
  for (const [fx, dx, dy] of [[0.3, 8, 140], [0.05, -6, -120], [0.95, 9, 150], [0.5, 12, -160]]) {
    b = await track(page);
    await f.swipe(b.x + b.width * fx, b.y + b.height / 2, b.x + b.width * fx + dx, b.y + b.height / 2 + dy);
    await page.waitForTimeout(150);
    expect(await value(page), `deslizar ${dx}, ${dy} desde ${fx}`).toBe(v0);
  }

  // a tap changes nothing (the row says how it works)
  b = await track(page);
  await f.swipe(b.x + b.width * 0.9, b.y + b.height / 2, b.x + b.width * 0.9, b.y + b.height / 2, 1);
  await expect(page.locator('.ctl.sl.sl-tip')).toHaveCount(1);
  expect(await value(page)).toBe(v0);

  // a deliberate sideways drag: the finger takes the slider once it has clearly moved sideways (the value
  // does not jump there), then a quarter of the track is a quarter of the range
  b = await track(page);
  let x = b.x + b.width * 0.15;
  const y = b.y + b.height / 2;
  await f.send('touchStart', x, y);
  await f.send('touchMove', x + 6, y + 1);
  await f.send('touchMove', x + 14, y + 1);
  await expect(page.locator('.ctl.sl.sl-drag')).toHaveCount(1);
  expect(await value(page)).toBe(v0);
  x += 14;
  for (let i = 1; i <= 10; i++) { await f.send('touchMove', x + (b.width * 0.25 * i) / 10, y + 1); await page.waitForTimeout(16); }
  await f.send('touchEnd', 0, 0);
  const v1 = await value(page);
  expect(Math.abs(v1 - (v0 + 0.25 * (MAX - MIN)))).toBeLessThanOrEqual(0.02);

  // the same movement with the finger well away from the track (130 px below): about a third of it
  b = await track(page);
  x = b.x + b.width * 0.15;
  await f.send('touchStart', x, y);
  await f.send('touchMove', x + 14, y);
  await f.send('touchMove', x + 14, y + 130);
  await expect(page.locator('.ctl.sl[data-fine]')).toHaveCount(1);
  for (let i = 1; i <= 10; i++) { await f.send('touchMove', x + 14 + (b.width * 0.25 * i) / 10, y + 130); await page.waitForTimeout(16); }
  await f.send('touchEnd', 0, 0);
  const v2 = await value(page);
  expect(v2 - v1).toBeGreaterThan(0.25 * (MAX - MIN) * 0.25);
  expect(v2 - v1).toBeLessThan(0.25 * (MAX - MIN) * 0.45);
  expect(errors).toEqual([]);
});

test('con un lápiz: lo mismo que con el dedo (y un toque no cambia nada)', async ({ page }) => {
  test.setTimeout(240_000);
  await openGlifos(page);
  const cdp = await page.context().newCDPSession(page);
  const pen = async (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, y: number) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'pen' });
  const stroke = async (x0: number, y0: number, x1: number, y1: number, steps = 12) => {
    await pen('mousePressed', x0, y0);
    for (let i = 1; i <= steps; i++) { await pen('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(16); }
    await pen('mouseReleased', x1, y1);
  };
  const v0 = await value(page);
  let b = await track(page);
  // up and down over the slider (a pen scrolling the page): nothing
  await stroke(b.x + b.width * 0.5, b.y + b.height / 2, b.x + b.width * 0.52, b.y + b.height / 2 - 120);
  expect(await value(page)).toBe(v0);
  b = await track(page);
  await stroke(b.x + b.width * 0.5, b.y + b.height / 2, b.x + b.width * 0.5, b.y + b.height / 2);
  expect(await value(page)).toBe(v0);
  // sideways: once taken (a clear sideways start, no jump), a fifth of the track to the left is a fifth of the range
  b = await track(page);
  const x = b.x + b.width * 0.6, y = b.y + b.height / 2;
  await pen('mousePressed', x, y);
  await pen('mouseMoved', x - 14, y);
  await expect(page.locator('.ctl.sl.sl-drag')).toHaveCount(1);
  expect(await value(page)).toBe(v0);
  for (let i = 1; i <= 10; i++) { await pen('mouseMoved', x - 14 - (b.width * 0.2 * i) / 10, y); await page.waitForTimeout(16); }
  await pen('mouseReleased', x - 14 - b.width * 0.2, y);
  expect(Math.abs(await value(page) - (v0 - 0.2 * (MAX - MIN)))).toBeLessThanOrEqual(0.02);
});

test('− y + dan pasos exactos; el valor se escribe, y fuera de su rango se ajusta y lo dice', async ({ page }) => {
  await openGlifos(page);
  const slider = page.getByRole('slider', { name: NAME });
  const v0 = Number(await slider.inputValue());
  const row = page.locator('.panel .ctl.sl').filter({ has: slider });
  const plus = row.getByRole('button', { name: 'Más', exact: true });
  const minus = row.getByRole('button', { name: 'Menos', exact: true });
  for (const b of [plus, minus]) {
    const r = (await b.boundingBox())!;
    expect(r.width >= 44 && r.height >= 44).toBe(true);
  }
  await plus.tap();
  await plus.tap();
  await expect(slider).toHaveValue(String(Number((v0 + 0.02).toFixed(2))));
  await minus.tap();
  await expect(slider).toHaveValue(String(Number((v0 + 0.01).toFixed(2))));
  // the value: a 44 px target that opens a field with the number keypad
  const val = row.getByRole('button', { name: /^Escribir el valor exacto/ });
  expect((await val.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await val.tap();
  const field = row.getByRole('spinbutton', { name: NAME, exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('inputmode', 'decimal');
  await field.fill('2,1');
  await field.press('Enter');
  await expect(slider).toHaveValue('2.1');
  await val.tap();
  await field.fill('9');
  await field.press('Enter');
  await expect(slider).toHaveValue('2.4');
  await expect(row.locator('.nf-hint')).toHaveText('Va de 0.6 a 2.4: queda en 2.4.');
  // emptied and left: it keeps its value
  await val.tap();
  await field.fill('');
  await field.press('Enter');
  await expect(slider).toHaveValue('2.4');
});
