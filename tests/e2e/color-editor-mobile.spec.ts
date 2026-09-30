import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { openStudio } from './helpers';

/**
 * The colour editor on a phone (touch): it opens inside the phone sheet; scrolling the sheet with a finger over
 * the hue strip or the colour square never changes the colour; a deliberate gesture does, precisely (ui/slideMath.ts):
 * the strip as a slider (a sideways drag moves the hue from where it was, a tap changes nothing), the square by a
 * tap (the knob goes there), by resting the finger a moment (then up and down change the light, and the sheet
 * stays) or by a sideways start (the knob follows from where it was). Targets are 44 px.
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
/** The piece's second colour, as the studio stored it. */
const stop2 = (page: Page) => page.evaluate(() => new Promise<string>(res => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    g.onsuccess = () => { const e = st.get('mt.v3.e:' + g.result.ids[g.result.cursor]); e.onsuccess = () => res(e.result.recipe.color.stops[1]); };
  };
}));
/** The stored colour once the last change has been saved (a drag's last frame, then the save, come a moment later). */
async function settled(page: Page) {
  let a = await stop2(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1200);
    const b = await stop2(page);
    if (b === a) return b;
    a = b;
  }
  return a;
}
/**
 * The page idle: no frame held up for long. After a change the studio renders the entry's thumbnail, which a
 * software GPU takes a second or so over; meanwhile touches arrive late, and a quick swipe would reach the page as
 * a finger resting still (a hold). On a real phone that render takes a few milliseconds.
 */
async function quiet(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<number>(res => {
    let last = performance.now(), worst = 0, n = 0;
    const f = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (++n < 20) requestAnimationFrame(f); else res(worst); };
    requestAnimationFrame(f);
  })), { timeout: 60_000, intervals: [200] }).toBeLessThan(250);
}

// the piece still (reduced motion): the software GPU then delivers the touches in time (a quick swipe stays quick)
test.use({ reducedMotion: 'reduce' });

test('en el móvil: desplazar la hoja sobre el editor no cambia el color; la tira de tonos y el cuadro sólo cambian con un gesto deliberado', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openStudio(page);
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  await page.getByRole('tab', { name: /^Color/ }).tap();
  const sw = page.getByRole('button', { name: /^Color 2 de \d/ });
  await sw.tap();
  // targets of 44 px or more
  for (const el of [sw, page.getByRole('button', { name: /^Fondo: #/ }), page.getByRole('button', { name: 'Añadir un color' })]) {
    const b = (await el.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
  }
  const client = await page.context().newCDPSession(page);
  const pane = page.locator('#pane');
  const scrollTop = () => pane.evaluate(el => el.scrollTop);
  const hue = page.getByRole('slider', { name: /^Tono de Color 2/ });
  const area = page.getByRole('slider', { name: /^Luz e intensidad de Color 2/ });
  const hueNow = async () => Number(await hue.getAttribute('aria-valuenow'));
  const lightNow = async () => Number(await area.getAttribute('aria-valuenow'));
  // the editor's own readout of the colour: it changes the moment the colour does
  const code = page.getByRole('textbox', { name: /^Código de Color 2/ });
  const hexNow = () => code.inputValue();
  /** The element in the middle of the sheet, the sheet still (a tap right after a scroll only stops it) and the page idle. */
  const inView = async (el: typeof hue) => {
    await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    await quiet(page);
    return (await el.boundingBox())!;
  };

  // the hue strip: a finger landing on it to scroll the sheet, up or down, changes nothing, and the sheet scrolls
  const s0 = await settled(page);
  const c0 = await hexNow();
  for (const dy of [-200, 200]) {
    const b = await inView(hue);
    const t0 = await scrollTop();
    await swipe(client, { x: b.x + b.width * 0.8, y: b.y + b.height / 2 }, { x: b.x + b.width * 0.8 + 4, y: b.y + b.height / 2 + dy });
    await expect.poll(scrollTop, `desplazar ${dy} sobre la tira`).not.toBe(t0);
    expect(await hexNow()).toBe(c0);
  }
  // a tap changes nothing: it says how it works
  let b = await inView(hue);
  const h0 = await hueNow();
  await swipe(client, { x: b.x + b.width * 0.15, y: b.y + b.height / 2 }, { x: b.x + b.width * 0.15, y: b.y + b.height / 2 }, 1);
  await expect(page.locator('.cp-hue.cp-tip')).toHaveCount(1);
  expect(await hueNow()).toBe(h0);
  expect(await hexNow()).toBe(c0);
  expect(await settled(page)).toBe(s0);
  // a deliberate sideways drag: taken once clearly sideways (no jump to the finger), then a quarter of the strip is
  // a quarter of the circle, from where the hue was
  b = await inView(hue);
  const dir = h0 < 180 ? 1 : -1;
  let x = b.x + b.width * (dir > 0 ? 0.1 : 0.9);
  const y = b.y + b.height / 2;
  await touch(client, 'touchStart', [{ x, y }]);
  await touch(client, 'touchMove', [{ x: x + dir * 6, y: y + 1 }]);
  await touch(client, 'touchMove', [{ x: x + dir * 14, y: y + 1 }]);
  await expect(page.locator('.cp-hue.cp-on')).toHaveCount(1);
  expect(await hueNow()).toBe(h0);
  x += dir * 14;
  for (let k = 1; k <= 10; k++) await touch(client, 'touchMove', [{ x: x + (dir * b.width * 0.25 * k) / 10, y: y + 1 }]);
  await touch(client, 'touchEnd', []);
  await expect.poll(hueNow).not.toBe(h0);
  expect(Math.abs((await hueNow()) - (h0 + dir * 90))).toBeLessThanOrEqual(6);
  // the piece takes it
  await expect.poll(() => stop2(page)).not.toBe(s0);

  // the square: a quick swipe up or down scrolls the sheet and changes nothing
  const s1 = await settled(page);
  const c1 = await hexNow();
  const L1 = await lightNow();
  for (const dy of [-150, 150]) {
    b = await inView(area);
    const t0 = await scrollTop();
    await swipe(client, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 }, { x: b.x + b.width * 0.5 + 3, y: b.y + b.height * 0.5 + dy });
    await expect.poll(scrollTop, `desplazar ${dy} sobre el cuadro`).not.toBe(t0);
    expect(await hexNow()).toBe(c1);
    expect(await lightNow()).toBe(L1);
  }
  expect(await settled(page)).toBe(s1);
  // a tap places the knob where it lands (light 75 % a quarter from the top)
  b = await inView(area);
  await swipe(client, { x: b.x + b.width * 0.3, y: b.y + b.height * 0.25 }, { x: b.x + b.width * 0.3, y: b.y + b.height * 0.25 }, 1);
  await expect.poll(lightNow).toBeGreaterThanOrEqual(72);
  expect(await lightNow()).toBeLessThanOrEqual(78);
  await expect.poll(() => stop2(page)).not.toBe(s1);
  // the finger rests a moment, then goes down: the knob comes under it and follows; the sheet stays
  b = await inView(area);
  const t1 = await scrollTop();
  const p0 = { x: b.x + b.width * 0.3, y: b.y + b.height * 0.2 };
  await touch(client, 'touchStart', [p0]);
  await page.waitForTimeout(700);
  await expect(page.locator('.cp-area.cp-on')).toHaveCount(1);
  for (let k = 1; k <= 8; k++) await touch(client, 'touchMove', [{ x: p0.x, y: p0.y + (b.height * 0.7 * k) / 8 }]);
  await touch(client, 'touchEnd', []);
  await expect.poll(lightNow).toBeLessThanOrEqual(12);
  expect(Math.abs((await scrollTop()) - t1)).toBeLessThan(4);
  // a sideways start takes it too, and then up and down move the knob from where it was (no jump)
  b = await inView(area);
  const L2 = await lightNow();
  const q = { x: b.x + b.width * 0.6, y: b.y + b.height * 0.5 };
  await touch(client, 'touchStart', [q]);
  await touch(client, 'touchMove', [{ x: q.x + 8, y: q.y }]);
  await touch(client, 'touchMove', [{ x: q.x + 16, y: q.y }]);
  await expect(page.locator('.cp-area.cp-on')).toHaveCount(1);
  expect(await lightNow()).toBe(L2);
  for (let k = 1; k <= 8; k++) await touch(client, 'touchMove', [{ x: q.x + 16, y: q.y - (b.height * 0.4 * k) / 8 }]);
  await touch(client, 'touchEnd', []);
  await expect.poll(lightNow).toBeGreaterThan(L2 + 30);
  expect(await lightNow()).toBeLessThanOrEqual(L2 + 44);

  // a vertical swipe on the palette library (outside the editor) scrolls the sheet and changes no colour
  const lib = page.locator('.pe-shelves');
  await lib.scrollIntoViewIfNeeded();
  const now = await settled(page);
  const lb = (await lib.boundingBox())!;
  const t2 = await scrollTop();
  await swipe(client, { x: lb.x + 20, y: lb.y + 10 }, { x: lb.x + 24, y: lb.y + 170 });
  await expect.poll(scrollTop).not.toBe(t2);
  expect(await settled(page)).toBe(now);
  expect(errors).toEqual([]);
});
