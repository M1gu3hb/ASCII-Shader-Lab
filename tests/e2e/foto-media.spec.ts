import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { finalRender, openFoto, project, settle } from './foto-helpers';

/**
 * Other ways in: a video (opened, shown, scrubbed with the preview provider; still exports only in this
 * version) and the camera (front = mirrored by default, the person's choice kept, the photo as previewed).
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
  // the timeline slot: play/pause and the playhead
  const slot = page.getByRole('region', { name: 'Línea de tiempo' });
  await expect(slot).toBeVisible();
  const scrub = slot.getByRole('slider', { name: 'Posición en el tiempo' });
  const a = await settle(page);
  await scrub.focus();
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await settle(page)).hash, { timeout: 30_000 }).not.toBe(a.hash);
  await expect(slot.getByText(/llega en la próxima versión/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('la cámara: frontal en espejo por defecto, la elección se recuerda, la foto es lo que se ve', async ({ page }) => {
  const errors = await openFoto(page);
  await page.getByRole('button', { name: 'Tomar una foto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tomar una foto' });
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
