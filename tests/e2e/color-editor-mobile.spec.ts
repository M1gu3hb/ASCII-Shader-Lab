import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { openStudio } from './helpers';

/**
 * The colour editor on a phone (touch): it opens inside the phone sheet, a finger drag on the square changes the
 * colour (and does not scroll the sheet), a vertical swipe outside it scrolls the sheet, targets are 44 px.
 */

type Pt = { x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
}
async function swipe(client: CDPSession, a: Pt, b: Pt, n = 8) {
  await touch(client, 'touchStart', [a]);
  for (let k = 1; k <= n; k++) await touch(client, 'touchMove', [{ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }]);
  await touch(client, 'touchEnd', []);
}
const stop2 = (page: Page) => page.evaluate(() => new Promise<string>(res => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    g.onsuccess = () => { const e = st.get('mt.v3.e:' + g.result.ids[g.result.cursor]); e.onsuccess = () => res(e.result.recipe.color.stops[1]); };
  };
}));

test('en el móvil: el editor abre en la hoja, el dedo cambia el color en el cuadro y fuera de él la hoja se desplaza', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page);
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await page.getByRole('tab', { name: /^Color/ }).tap();
  const sw = page.getByRole('button', { name: /^Color 2 de \d/ });
  await sw.tap();
  // targets of 44 px or more
  for (const el of [sw, page.getByRole('button', { name: /^Fondo: #/ }), page.getByRole('button', { name: 'Añadir un color' })]) {
    const b = (await el.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  const area = page.getByRole('slider', { name: /^Luz e intensidad de Color 2/ });
  await area.scrollIntoViewIfNeeded();
  const before = await stop2(page);
  const client = await page.context().newCDPSession(page);
  const box = (await area.boundingBox())!;
  const pane = page.locator('#pane');
  const top0 = await pane.evaluate(el => el.scrollTop);
  // a vertical drag on the square: the colour changes, the sheet stays where it was
  await swipe(client, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.8 }, { x: box.x + box.width * 0.35, y: box.y + box.height * 0.15 });
  await expect.poll(() => stop2(page)).not.toBe(before);
  expect(Math.abs((await pane.evaluate(el => el.scrollTop)) - top0)).toBeLessThan(4);
  await expect.poll(async () => Number(await area.getAttribute('aria-valuenow'))).toBeGreaterThan(70);
  // a vertical swipe on the palette library (outside the square) scrolls the sheet and changes no colour
  const lib = page.locator('.pe-shelves');
  await lib.scrollIntoViewIfNeeded();
  const now = await stop2(page);
  const lb = (await lib.boundingBox())!;
  const t1 = await pane.evaluate(el => el.scrollTop);
  // the finger goes down: the sheet scrolls back up
  await swipe(client, { x: lb.x + 20, y: lb.y + 10 }, { x: lb.x + 24, y: lb.y + 170 });
  await expect.poll(() => pane.evaluate(el => el.scrollTop)).not.toBe(t1);
  expect(await stop2(page)).toBe(now);
});
