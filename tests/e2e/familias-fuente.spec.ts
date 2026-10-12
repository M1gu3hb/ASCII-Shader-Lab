import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';
import { openStudio } from './helpers';
import { chooseRecipe, hideStageOverlays } from './recipes';

/**
 * Families that read the piece (PR #10 close-out, FamilyMeta.reads): their picture is made from the person's
 * photo or words, so another photo or other words change it materially — not just its size. In both engines,
 * from the recipe browser of Imagen and Texto, as a person would.
 */

/** A PNG made of one colour field with a disc and stripes, in the given tones (rgb 0..255). */
function png(w: number, h: number, a: [number, number, number], b: [number, number, number]): Buffer {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    const disc = Math.hypot(x - w * 0.42, y - h * 0.5) < h * 0.3;
    const stripe = x > w * 0.7 && Math.floor(x / 10) % 2 === 0;
    const c = disc || stripe ? b : a;
    const k = 0.55 + 0.45 * (y / h);
    raw[o] = Math.round(c[0] * k); raw[o + 1] = Math.round(c[1] * k); raw[o + 2] = Math.round(c[2] * k);
  }
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const WARM = png(320, 200, [70, 20, 10], [255, 150, 40]);
const COOL = png(200, 320, [8, 30, 60], [60, 200, 255]);

async function drop(page: Page, file: Buffer, name: string) {
  await page.evaluate(([b64, n]) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], n, { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, [file.toString('base64'), name] as const);
  await expect(page.locator('.toast').filter({ hasText: /cargad/ }).first()).toBeAttached();
}

/** The stage's inked pixels: how many, and their mean colour (screenshot of its canvas). */
async function ink(page: Page): Promise<{ share: number; r: number; g: number; b: number }> {
  const shot = await page.locator('.stage canvas').first().screenshot();
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 320, 200);
    const d = x.getImageData(0, 0, 320, 200).data;
    let n = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] < 90) continue;
      n++; r += d[i]; g += d[i + 1]; b += d[i + 2];
    }
    return { share: n / (d.length / 4), r: n ? r / n : 0, g: n ? g / n : 0, b: n ? b / n : 0 };
  }, 'data:image/png;base64,' + shot.toString('base64'));
}

for (const engine of ['webgl', 'basico'] as const) {
  test.describe(`familias que leen la pieza · ${engine === 'webgl' ? 'WebGL' : 'motor básico'}`, () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('«Ecos de tu foto» se hace con tu foto: otra foto cambia sus colores', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=media`);
      await hideStageOverlays(page);
      await drop(page, WARM, 'calida.png');
      await chooseRecipe(page, 'Ecos de tu foto');
      // the loop fills with the photo within a few seconds
      await expect.poll(async () => (await ink(page)).share, { timeout: 60_000 }).toBeGreaterThan(0.04);
      await page.waitForTimeout(3000);
      const warm = await ink(page);
      expect(warm.r, JSON.stringify(warm)).toBeGreaterThan(warm.b + 30);
      await drop(page, COOL, 'fria.png');
      // the new photo goes round the loop: its colours take over
      await expect.poll(async () => { const c = await ink(page); return c.b - c.r; }, { timeout: 60_000 }).toBeGreaterThan(30);
      expect(errors).toEqual([]);
    });

    test('«Ecos de tus palabras» se hace con tus letras: otras palabras cambian el dibujo', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#space=tipo`);
      await hideStageOverlays(page);
      await chooseRecipe(page, 'Ecos de tus palabras');
      await page.getByRole('tab', { name: 'Tu texto', exact: true }).click();
      const field = page.getByRole('textbox', { name: /^Texto \(Enter para otra línea\)/ });
      await field.fill('I');
      await page.waitForTimeout(6000);
      const thin = (await ink(page)).share;
      await field.fill('MMMMM\nWWWWW');
      // wide, heavy letters feed far more ink into the loop than a single thin one
      await expect.poll(async () => (await ink(page)).share, { timeout: 60_000 }).toBeGreaterThan(thin * 1.6 + 0.02);
      expect(errors).toEqual([]);
    });
  });
}
