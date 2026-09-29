import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { finalRender, openFoto, project, settle } from './foto-helpers';

/**
 * Other ways in: a video (opened, shown, stepped through in its timeline with the preview provider) and the camera (front = mirrored by default, the person's choice kept, the photo as previewed).
 */

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('un video se abre, se ve y la línea de tiempo lo recorre', async ({ page }) => {
  const errors = await openFoto(page);
  // a video of the site's own examples (4.3 s, VP9)
  const file = join(import.meta.dirname, '../../public/ex/salidas/glyphos-saturno.webm');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const p = await project(page);
  expect(p.layers[0].kind).toBe('photo');
  // a video opens its timeline by itself; its arrows step through the frames and the viewport follows
  const tl = page.getByRole('region', { name: 'Línea de tiempo' });
  await expect(tl).toBeVisible({ timeout: 30_000 });
  await expect(tl.getByRole('button', { name: p.layers[0].name, exact: true })).toBeVisible();
  const a = await settle(page);
  await tl.focus();
  for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __foto: { store(): { time: number } } }).__foto.store().time)).toBeGreaterThan(1.5);
  await expect.poll(async () => (await settle(page)).hash, { timeout: 30_000 }).not.toBe(a.hash);
  // before/after: the original is the video's frame at the playhead, and it follows the playhead (a photo-only
  // project, so both sides are the same picture)
  await page.getByRole('button', { name: 'Antes y después (C)' }).click();
  const gap = () => page.evaluate(() => {
    const small = (sel: string) => {
      const s = document.querySelector<HTMLCanvasElement>(sel)!;
      const c = document.createElement('canvas');
      c.width = 64; c.height = 36;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(s, 0, 0, 64, 36);
      return x.getImageData(0, 0, 64, 36).data;
    };
    const o = small('.fv-orig'), r = small('.fv-art');
    let d = 0;
    for (let i = 0; i < o.length; i += 4) d += Math.abs(o[i] - r[i]) + Math.abs(o[i + 1] - r[i + 1]) + Math.abs(o[i + 2] - r[i + 2]);
    return d / (o.length / 4) / 3;
  });
  await expect.poll(gap, { timeout: 20_000 }).toBeLessThan(1);
  await tl.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __foto: { store(): { time: number } } }).__foto.store().time)).toBeGreaterThan(2.8);
  await settle(page);
  await expect.poll(gap, { timeout: 20_000 }).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('la cámara: frontal en espejo por defecto, la elección se recuerda, la foto es lo que se ve', async ({ page }) => {
  const errors = await openFoto(page);
  await page.getByRole('button', { name: 'Cámara: foto o clip' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cámara' });
  await expect(sheet.locator('video')).toBeVisible();
  const mirror = sheet.getByRole('switch', { name: /Espejo/ });
  await expect(mirror).toBeChecked({ timeout: 20_000 });
  await expect(sheet.locator('video')).toHaveCSS('transform', /matrix\(-1/);
  // the person's choice wins and is kept for this camera
  await mirror.setChecked(false, { force: true });
  await expect(sheet.locator('video')).not.toHaveCSS('transform', /matrix\(-1/);
  expect(await page.evaluate(() => sessionStorage.getItem('glyphos.foto.espejo'))).toContain('"user":false');
  await mirror.setChecked(true, { force: true });
  await sheet.getByRole('button', { name: 'Tomar la foto' }).click();
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const p = await project(page);
  expect(p.name).toBe('Foto de la cámara');
  expect(p.layers.map(l => l.kind)).toEqual(['photo']);
  expect(errors).toEqual([]);
});
