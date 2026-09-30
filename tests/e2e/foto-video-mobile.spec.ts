import { expect, test, type Page } from '@playwright/test';
import { finalRender, openFoto } from './foto-helpers';

/**
 * A video on the phone (Pixel 7, the «mobile» project): the studio opens it, the play button that rides with the
 * view tools plays it on the video clock (its time advances, its sound is on) and pauses it, and the timeline in the
 * sheet's «Tiempo» tab shows it. Regression: the video clock hands out a new state object on each call, and the
 * phone's play button read it through React's store hook, which then looped until React gave up (error #185).
 */

type W = Window & { __foto: Record<string, any>; __fotoVideo: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function openClip(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as W).__fotoVideo, null, { timeout: 30_000 });
  const c = await page.evaluate(() => (window as unknown as W).__fotoVideo.clip({ seconds: 3 })) as { b64: string; name: string };
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').tap();
  await (await chooser).setFiles({ name: c.name, mimeType: 'video/webm', buffer: Buffer.from(c.b64, 'base64') });
  await expect(page.locator('.fv-art')).toBeAttached({ timeout: 45_000 });
  await finalRender(page);
}

test('un video en el teléfono: se reproduce con su sonido desde el botón de la vista, se pausa, y la línea de tiempo está en «Tiempo»', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await openFoto(page);
  await openClip(page);
  const play = page.locator('.fvt-phone .ftl-mini button');
  await expect(play).toBeVisible();
  await play.tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__fotoVideo.playState().playing)).toBe(true);
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => (window as unknown as W).__fotoVideo.playState()) as { t: number; clock: string; elements: Array<{ muted: boolean; paused: boolean }> };
  expect(s.clock).toBe('video');
  expect(s.t).toBeGreaterThan(0.3);
  expect(s.elements.some(e => !e.paused && !e.muted)).toBe(true);
  await play.tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__fotoVideo.playState().playing)).toBe(false);
  const bar = page.getByRole('navigation', { name: 'Acciones' });
  await bar.getByRole('button', { name: 'Herramientas' }).tap();
  const sheet = page.getByRole('region', { name: 'Herramientas y capas' });
  await sheet.getByRole('tab', { name: 'Tiempo' }).tap();
  await expect(sheet.getByRole('region', { name: 'Línea de tiempo' })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
