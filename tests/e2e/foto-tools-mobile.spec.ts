import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { needsFotoStudio, finalRender, framePoint, openFoto, project } from './foto-helpers';

/**
 * The integrated studio on a phone (Pixel 7, touch) with the real tools: the labelled palette in the sheet,
 * one finger draws a rectangle, the floating ± makes the next zone subtract, a second finger cancels the
 * gesture and zooms instead; the compact timeline in the sheet's «Tiempo» tab and the play button over
 * the art; one notice at a time, in one line.
 */
needsFotoStudio();

type Pt = { x: number; y: number };
async function touch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Pt[]) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
  if (type === 'touchEnd') await new Promise(r => setTimeout(r, 450));
}
const ui = (page: Page) => page.evaluate(() => (window as unknown as { __foto: { ui(): { zk: number; snap: string; tool: string | null; op: string; mtab: string } } }).__foto.ui());
async function swipe(client: CDPSession, a: Pt, b: Pt, n = 6) {
  await touch(client, 'touchStart', [a]);
  for (let i = 1; i <= n; i++) await touch(client, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }]);
  await touch(client, 'touchEnd', []);
}

test('herramientas reales con el dedo: rectángulo, ± para restar, dos dedos cancelan; la línea de tiempo en la hoja', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Sujeto en caracteres/ }).tap();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
  // the characters layer is the one the tools act on
  await page.evaluate(() => { const F = (window as unknown as { __foto: { project(): { layers: Array<{ id: string }> }; ps: { select(ids: string[]): void } } }).__foto; F.ps.select([F.project().layers[1].id]); });
  const client = await page.context().newCDPSession(page);
  const bar = page.getByRole('navigation', { name: 'Acciones' });

  // the sheet's palette: labelled buttons of 44 px or more, the active tool in view
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  const sheet = page.getByRole('region', { name: 'Herramientas y capas' });
  await sheet.getByRole('tab', { name: 'Herramientas' }).tap();
  const btns = sheet.locator('.frail .tbtn');
  await expect(btns).toHaveCount(15);
  for (const b of (await btns.all()).slice(0, 5)) {
    const r = (await b.boundingBox())!;
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  }
  await expect(sheet.locator('.tbtn[data-tool="rectangulo"] .t-name')).toHaveText('Rectángulo');
  await sheet.getByRole('button', { name: 'Rectángulo (M)' }).tap();
  expect((await ui(page)).tool).toBe('rectangulo');
  // the options bar says what a finger does
  await expect(sheet.locator('.fo-hint')).toContainText(/dedo/);
  await page.getByRole('button', { name: 'Cerrar la hoja' }).tap();

  // one finger draws
  const before = (await project(page)).layers[1].mask?.parts.length ?? 0;
  await swipe(client, await framePoint(page, 0.2, 0.2), await framePoint(page, 0.55, 0.6));
  await expect.poll(async () => (await project(page)).layers[1].mask?.parts.length).toBe(before + 1);
  // the ± makes the next zone subtract
  await page.getByRole('button', { name: /Sumando zonas/ }).tap();
  expect((await ui(page)).op).toBe('subtract');
  await swipe(client, await framePoint(page, 0.3, 0.3), await framePoint(page, 0.4, 0.45));
  await expect.poll(async () => (await project(page)).layers[1].mask?.parts.length).toBe(before + 2);
  expect((await project(page)).layers[1].mask?.parts.slice(-1)[0]).toMatchObject({ kind: 'rect', op: 'subtract' });
  // a second finger cancels the gesture and zooms
  const k0 = (await ui(page)).zk;
  const a = await framePoint(page, 0.3, 0.3);
  await touch(client, 'touchStart', [a]);
  await touch(client, 'touchMove', [{ x: a.x + 30, y: a.y + 30 }]);
  await touch(client, 'touchStart', [{ x: a.x + 30, y: a.y + 30 }, { x: a.x + 90, y: a.y + 60 }]);
  for (let i = 1; i <= 4; i++) await touch(client, 'touchMove', [{ x: a.x + 30 - i * 15, y: a.y + 30 - i * 8 }, { x: a.x + 90 + i * 15, y: a.y + 60 + i * 8 }]);
  await touch(client, 'touchEnd', []);
  expect((await project(page)).layers[1].mask?.parts.length).toBe(before + 2);
  expect((await ui(page)).zk).toBeGreaterThan(k0 * 1.2);

  // one notice at a time, one line, never wider than the screen
  const notes = page.locator('.fnotes .toasts > *');
  expect(await notes.count()).toBeLessThanOrEqual(1);
  if (await notes.count()) {
    const r = (await notes.first().boundingBox())!;
    expect(r.height).toBeLessThanOrEqual(48);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }

  // «Tiempo»: the compact timeline, with a clip added from the layer's settings
  await page.evaluate(() => (window as unknown as { __foto: { setUI(p: unknown): void } }).__foto.setUI({ tool: null, zoom: 'fit', pan: { x: 0, y: 0 } }));
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  await sheet.getByRole('tab', { name: 'Ajustes' }).tap();
  await sheet.getByRole('button', { name: 'Animar…' }).tap();
  const lib = page.getByRole('dialog', { name: /^Animar/ });
  await expect(lib.locator('.tl-card').first()).toBeVisible({ timeout: 30_000 });
  await lib.locator('.tl-card[data-item="foto-a-ascii"]').tap();
  await expect(lib).toBeHidden();
  await expect.poll(async () => (await ui(page)).mtab).toBe('tiempo');
  const tl = sheet.locator('.tl.compact');
  await expect(tl.locator('.tl-clip')).toHaveCount(1);
  for (const b of await tl.locator('.tl-bar button').all()) {
    // (the loop region's button is left out on phones: no box)
    const r = await b.boundingBox();
    if (r?.width) expect(r.height).toBeGreaterThanOrEqual(43.5);
  }
  // the art stays above the sheet, and the play button over it plays
  const f = (await page.locator('[data-testid=frame]').boundingBox())!, s = (await sheet.boundingBox())!;
  expect(f.y + f.height).toBeLessThanOrEqual(s.y + 1);
  await page.getByRole('button', { name: 'Cerrar la hoja' }).tap();
  await page.locator('.ftl-mini.phone').getByRole('button', { name: 'Reproducir' }).tap();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __foto: { store(): { time: number } } }).__foto.store().time), { timeout: 20_000 }).toBeGreaterThan(0.2);
  await page.locator('.ftl-mini.phone').getByRole('button', { name: 'Pausar' }).tap();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
