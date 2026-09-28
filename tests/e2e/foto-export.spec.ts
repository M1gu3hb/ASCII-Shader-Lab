import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { download } from './helpers';
import { finalRender, openFoto, project } from './foto-helpers';

/**
 * Preview = export: the PNG exported at 1× is, pixel for pixel, the viewport's final render at 100 %;
 * a transparent composition exports real alpha; the parts come out separately; text only from real
 * characters.
 */

/** Differences between the viewport's art canvas and a PNG (base64), both read unpremultiplied. */
async function compareWithArt(page: Page, png: Buffer) {
  return page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const art = document.querySelector<HTMLCanvasElement>('.fv-art')!;
    const a = art.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, art.width, art.height).data;
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let differ = 0, max = 0, clear = 0, solid = 0;
    for (let i = 0; i < d.length; i += 4) {
      let m = 0;
      for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(a[i + k] - d[i + k]));
      if (m) { differ++; max = Math.max(max, m); }
      if (d[i + 3] === 0) clear++; else if (d[i + 3] === 255) solid++;
    }
    return { size: [bmp.width, bmp.height, art.width, art.height], differ, max, clear, solid, total: d.length / 4 };
  }, png.toString('base64'));
}

async function fromTemplate(page: Page, name: RegExp) {
  await page.locator('.fs-tpl-main', { hasText: name }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
}

test('el PNG exportado a 1× es, píxel a píxel, la vista final al 100 %', async ({ page }) => {
  const errors = await openFoto(page);
  // two ASCII zones in circles, a dithered square: engines, masks and a finish
  await fromTemplate(page, /Zonas circulares/);
  const p = await project(page);
  const n = await page.evaluate(() => (window as unknown as { __foto: { ui(): { render: { n: number } } } }).__foto.ui().render.n);
  await page.locator('.fv-over').hover();
  await page.keyboard.press('1');
  const r = await finalRender(page, n);
  expect(r.scale).toBe(1);
  expect([r.w, r.h]).toEqual([p.canvas.w, p.canvas.h]);
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Exportar' });
  await expect(sheet.getByRole('radio', { name: 'PNG' })).toHaveAttribute('aria-checked', 'true');
  const file = await download(page, () => sheet.getByRole('button', { name: 'Exportar PNG' }).click());
  expect(file.name).toMatch(/^glyphos-zonas-circulares\.png$/);
  const cmp = await compareWithArt(page, readFileSync(file.path));
  expect(cmp.size).toEqual([p.canvas.w, p.canvas.h, p.canvas.w, p.canvas.h]);
  expect(cmp.differ, `píxeles distintos (máx. ${cmp.max})`).toBe(0);
  expect(errors).toEqual([]);
});

test('una composición transparente exporta PNG con alfa real; las partes salen por separado; el texto sólo de caracteres reales', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  // only the characters of the ASCII layer, over a transparent canvas without the photo
  await page.locator('.lr', { hasText: 'ASCII' }).locator('.lr-main').click();
  await page.getByRole('switch', { name: 'Con su fondo (como en el laboratorio)' }).setChecked(false, { force: true });
  await page.getByRole('button', { name: /^Ocultar «Foto original»/ }).click();
  await page.getByRole('button', { name: /^Lienzo/ }).click();
  await page.getByRole('switch', { name: 'Fondo transparente' }).setChecked(true, { force: true });
  expect((await project(page)).canvas.transparent).toBe(true);
  await expect(page.locator('.fv-frame.alpha')).toBeVisible();
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Exportar' });
  await expect(sheet.getByText('La composición tiene zonas transparentes')).toBeVisible({ timeout: 30_000 });
  const png = await download(page, () => sheet.getByRole('button', { name: 'Exportar PNG' }).click());
  const alpha = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, drawn = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) clear++; else drawn++; }
    return { clear, drawn };
  }, readFileSync(png.path).toString('base64'));
  expect(alpha.clear).toBeGreaterThan(1000);
  expect(alpha.drawn).toBeGreaterThan(1000);

  // separately: the original, a layer alone
  const orig = await download(page, () => sheet.locator('.fexp-list li', { hasText: /^Original:/ }).getByRole('button', { name: 'Descargar' }).click());
  expect(orig.name).toMatch(/paisaje/);
  const layer = await download(page, () => sheet.locator('.fexp-list li', { hasText: 'Capa sola: ASCII' }).getByRole('button').click());
  expect(layer.name).toMatch(/capa-ascii\.png$/);
  // no characters layer: the text section says so honestly
  await expect(sheet.getByText(/render gráfico \(una imagen, no texto\)/)).toBeVisible();
  // the video section asks src/video and says what it got
  await expect(sheet.getByText(/llega en la próxima versión|MP4|WebM|GIF/).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // a characters layer gives real text
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /Caracteres reales/ }).click();
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const txt = await download(page, () => sheet.getByRole('button', { name: 'Texto (TXT)' }).click());
  const text = readFileSync(txt.path, 'utf8');
  expect(txt.name).toMatch(/\.txt$/);
  expect(text.split('\n').length).toBeGreaterThan(10);
  expect(text).toMatch(/[@#%*+=:.-]/);
  expect(errors).toEqual([]);
});
