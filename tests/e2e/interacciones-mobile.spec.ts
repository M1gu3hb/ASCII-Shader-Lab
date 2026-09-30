import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { dismissWelcome } from './helpers';

/**
 * Cursor y tacto with a finger (Pixel 7, touch): a stroke on the stage leaves its mark there and never
 * scrolls the page; a vertical swipe in the settings sheet scrolls it (also when it starts on the small
 * example, which lets vertical swipes through); two fingers zoom «Zoom con los dedos». The pasted code on
 * a phone: a tap on the piece opens rings, and a vertical swipe on it still scrolls the page.
 */

type Pt = { x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
}
async function swipe(client: CDPSession, a: Pt, b: Pt, n = 10, gap = 16) {
  await touch(client, 'touchStart', [a]);
  for (let i = 1; i <= n; i++) { await touch(client, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }]); await new Promise(r => setTimeout(r, gap)); }
  await touch(client, 'touchEnd', []);
}

const enc = (r: object) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');
const PIECE = (mode: string, extra: object = {}) => ({
  v: 2, source: 'pattern', layers: [{ pattern: 'nube', scale: 1.4, speed: 0 }], motion: { speed: 0 },
  glyph: { cell: 14 }, color: { stops: ['#10161f', '#2c6e8a', '#e8d9b0'], bg: '#0b0d10' },
  interact: { mode, strength: 0.8, radius: 0.22, ...extra }, meta: { name: 'Tacto en el teléfono', space: 'fondos' },
});

/** Luminance of an element's screenshot on a coarse grid. */
async function grid(page: Page, sel: string, cols = 24, rows = 40): Promise<number[]> {
  const png = (await page.locator(sel).first().screenshot()).toString('base64');
  return page.evaluate(async ([png, cols, rows]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = cols as number; c.height = rows as number;
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, cols as number, rows as number);
    const d = x.getImageData(0, 0, cols as number, rows as number).data, out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return out;
  }, [png, cols, rows] as const);
}
function change(a: number[], b: number[], box: [number, number, number, number], cols = 24, rows = 40) {
  let d = 0, n = 0;
  for (let r = Math.floor(box[1] * rows); r < Math.ceil(box[3] * rows); r++) for (let c = Math.floor(box[0] * cols); c < Math.ceil(box[2] * cols); c++) { d += Math.abs(a[r * cols + c] - b[r * cols + c]); n++; }
  return d / Math.max(1, n);
}
const HIDE = '.motion-note, .stage-marks, .stage-top, .stage-notes, .toasts, .vbar, .ph-dock, .deck, .seedline { visibility: hidden !important; }';

async function openPiece(page: Page, r: object) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/studio/' + enc(r));
  await expect(page.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(page);
  await expect(page.locator('.stage canvas[data-busy]')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  return errors;
}

test('con el dedo: el trazo deja rastro en la pieza sin mover la página, y deslizar en los ajustes los desplaza', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openPiece(page, PIECE('trail', { decay: 1 }));
  const client = await page.context().newCDPSession(page);
  const cv = (await page.locator('.stage canvas').first().boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: cv.x + cv.width * fx, y: cv.y + cv.height * fy });
  const style = await page.addStyleTag({ content: HIDE });
  const before = await grid(page, '.stage canvas');
  const scroll0 = await page.evaluate(() => [scrollX, scrollY, document.scrollingElement?.scrollTop ?? 0]);
  // a stroke across the middle, then up (a swipe that would scroll a page)
  await swipe(client, at(0.15, 0.5), at(0.8, 0.5));
  await swipe(client, at(0.5, 0.7), at(0.5, 0.25));
  await page.waitForTimeout(500);
  if (process.env.TX_DEBUG) await page.screenshot({ path: test.info().outputPath('after.png') });
  const after = await grid(page, '.stage canvas');
  // (the freshest stroke: the one going up the middle)
  const near = change(after, before, [0.4, 0.3, 0.6, 0.66]), far = change(after, before, [0, 0.85, 0.2, 1]);
  expect(near, `cerca ${near.toFixed(1)}, lejos ${far.toFixed(1)}`).toBeGreaterThan(2.5);
  expect(far).toBeLessThan(near / 3);
  expect(await page.evaluate(() => [scrollX, scrollY, document.scrollingElement?.scrollTop ?? 0]), 'la página no se mueve').toEqual(scroll0);
  expect(await page.locator('.stage canvas').first().evaluate(c => getComputedStyle(c).touchAction)).toBe('none');
  await style.evaluate(s => s.remove());

  // the settings sheet: Movimiento, then a vertical swipe inside it scrolls it
  await page.getByRole('button', { name: 'Ajustes de la pieza' }).tap();
  const sheet = page.locator('aside.panel');
  await sheet.getByRole('tab', { name: 'Movimiento' }).tap();
  const pane = page.locator('#pane');
  await expect(pane.locator('.tx-demo canvas')).toHaveCount(1);
  await page.waitForTimeout(600);
  const pb = (await pane.boundingBox())!;
  const top0 = await pane.evaluate(el => el.scrollTop);
  await swipe(client, { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.75 }, { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.2 }, 8, 12);
  await expect.poll(() => pane.evaluate(el => el.scrollTop), { message: 'el panel se desplaza' }).toBeGreaterThan(top0 + 40);
  // a swipe that starts on the example scrolls the sheet too (pan-y)
  await pane.locator('.tx-demo').evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const ex = (await pane.locator('.tx-demo canvas').boundingBox())!;
  expect(await pane.locator('.tx-demo canvas').evaluate(c => getComputedStyle(c).touchAction)).toBe('pan-y');
  const top1 = await pane.evaluate(el => el.scrollTop);
  await swipe(client, { x: ex.x + ex.width / 2, y: ex.y + ex.height * 0.8 }, { x: ex.x + ex.width / 2, y: ex.y - 150 }, 8, 12);
  await expect.poll(() => pane.evaluate(el => el.scrollTop), { message: 'deslizar sobre el ejemplo desplaza el panel' }).not.toBe(top1);
  expect(errors).toEqual([]);
});

test('con dos dedos: «Zoom con los dedos» acerca la pieza bajo ellos', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openPiece(page, PIECE('zoom', { decay: 1 }));
  const client = await page.context().newCDPSession(page);
  await page.addStyleTag({ content: HIDE });
  const cv = (await page.locator('.stage canvas').first().boundingBox())!;
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
  const before = await grid(page, '.stage canvas');
  await touch(client, 'touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
  for (let i = 1; i <= 10; i++) { await touch(client, 'touchMove', [{ x: cx - 30 - i * 12, y: cy }, { x: cx + 30 + i * 12, y: cy }]); await page.waitForTimeout(16); }
  await touch(client, 'touchEnd', []);
  await page.waitForTimeout(600);
  const after = await grid(page, '.stage canvas');
  const all = change(after, before, [0, 0, 1, 1]);
  expect(all, `cambio ${all.toFixed(1)}`).toBeGreaterThan(4);
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test('el código pegado en un teléfono: un toque abre anillos y deslizar en vertical sigue desplazando la página', async ({ page, browser }) => {
  test.setTimeout(240_000);
  // exported from the studio on a computer, as a block in a page
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const dp = await desk.newPage();
  await dp.goto('/studio/' + enc(PIECE('rings', { decay: 1 })));
  await expect(dp.locator('.stage canvas').first()).toBeVisible({ timeout: 45_000 });
  await dismissWelcome(dp);
  await dp.keyboard.press('e');
  await dp.getByRole('tab', { name: 'Código' }).click();
  await dp.getByRole('button', { name: 'Bloque' }).click();
  const [d] = await Promise.all([dp.waitForEvent('download'), dp.getByRole('button', { name: /Descargar página/ }).click()]);
  const file = test.info().outputPath('bloque.html');
  await d.saveAs(file);
  await desk.close();

  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('file://' + file);
  // a page with more to read below the piece
  await page.evaluate(() => { const p = document.createElement('div'); p.style.height = '2400px'; p.textContent = 'Más contenido'; document.body.appendChild(p); });
  await expect.poll(() => page.evaluate(() => !!document.querySelector('canvas')?.width), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(2000);
  const canvas = page.locator('canvas').first();
  expect(await canvas.evaluate(c => getComputedStyle(c).touchAction)).toBe('pan-y');
  const client = await page.context().newCDPSession(page);
  const b = (await canvas.boundingBox())!;
  const before = await grid(page, 'canvas', 24, 16);
  await touch(client, 'touchStart', [{ x: b.x + b.width * 0.3, y: b.y + b.height * 0.5 }]);
  await touch(client, 'touchEnd', []);
  await page.waitForTimeout(350);
  const after = await grid(page, 'canvas', 24, 16);
  const ring = change(after, before, [0, 0, 0.7, 1], 24, 16);
  expect(ring, `anillos: ${ring.toFixed(1)}`).toBeGreaterThan(2);
  // a vertical swipe that starts on the piece scrolls the page
  await page.waitForTimeout(500);
  await swipe(client, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.8 }, { x: b.x + b.width * 0.5, y: b.y + b.height * 0.1 }, 8, 12);
  await expect.poll(() => page.evaluate(() => scrollY), { message: 'la página se desplaza' }).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
