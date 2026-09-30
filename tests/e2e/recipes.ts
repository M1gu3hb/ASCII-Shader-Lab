import { deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import { crc32 } from '../../src/shared/zip';

/* The lab's recipe browser (src/studio/recipes/), for the specs that choose a recipe. */

export const recipeLine = (page: Page) => page.locator('.panel .rx-line');
export const recipeBrowser = (page: Page) => page.locator('#rx-browser');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A card's accessible name starts with the recipe's name and a full stop («Dona. Figuras 3D…»). */
export const cardName = (name: string) => new RegExp('^' + esc(name) + '\\. ');
export const recipeCard = (page: Page, name: string) => recipeBrowser(page).getByRole('button', { name: cardName(name) });

/** Opens the settings (phones: the sheet) when they are closed. */
export async function openSettings(page: Page) {
  if (await page.locator('.app.panel-off').count()) await page.getByRole('button', { name: 'Ajustes de la pieza' }).first().click();
  await expect(page.locator('.panel')).toBeInViewport();
}

/** Opens the recipe browser (from the recipe line), with every recipe of the space in view («Todas», no search). */
export async function openRecipes(page: Page) {
  await openSettings(page);
  const line = recipeLine(page);
  if (await line.getAttribute('aria-expanded') !== 'true') await line.click();
  await expect(recipeBrowser(page)).toBeVisible();
  const clear = recipeBrowser(page).getByRole('button', { name: 'Borrar la búsqueda' });
  if (await clear.count()) await clear.click();
  const all = recipeBrowser(page).getByRole('radio', { name: /^Todas/ });
  if (await all.count() && await all.getAttribute('aria-checked') !== 'true') await all.click();
}

/** Back to the settings (the browser closes). */
export async function closeRecipes(page: Page) {
  const line = recipeLine(page);
  if (await line.getAttribute('aria-expanded') === 'true') await line.click();
  await expect(recipeBrowser(page)).toHaveCount(0);
}

/** Types in the browser's search (phones: its button first). */
export async function searchRecipes(page: Page, q: string) {
  const find = recipeBrowser(page).getByRole('button', { name: 'Buscar recetas y escenas' });
  if (await find.count()) await find.click();
  await recipeBrowser(page).getByRole('searchbox').fill(q);
}

/**
 * Applies a recipe of the space by its name (searching for it when it is another space's), and closes the
 * browser unless `stay`. The card is marked as the piece's own afterwards.
 */
export async function chooseRecipe(page: Page, name: string, o: { stay?: boolean } = {}) {
  await openRecipes(page);
  if (!(await recipeCard(page, name).count())) await searchRecipes(page, name);
  await recipeCard(page, name).first().click();
  await expect(recipeCard(page, name).first()).toHaveAttribute('aria-pressed', 'true');
  if (!o.stay) await closeRecipes(page);
}

/** A small photo-like PNG (a gradient, a bright disc and stripes), dropped on the stage as the person's photo. */
export function photo(w = 320, h = 200): Buffer {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    const disc = Math.hypot(x - w * 0.4, y - h * 0.5) < h * 0.28;
    const stripe = x > w * 0.72 && Math.floor(x / 8) % 2 === 0;
    raw[o] = disc ? 250 : stripe ? 40 : (x * 200 / w) | 0;
    raw[o + 1] = disc ? 210 : stripe ? 160 : (y * 180 / h) | 0;
    raw[o + 2] = disc ? 150 : stripe ? 90 : 110;
  }
  const chunk = (t: string, d: Buffer) => { const td = Buffer.concat([Buffer.from(t), d]); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Drops the photo on the stage, as a person would. */
export async function dropPhoto(page: Page) {
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'foto.png', { type: 'image/png' }));
    document.querySelector('.stage')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, photo().toString('base64'));
  await expect(page.locator('.toast').filter({ hasText: /cargad/ }).first()).toBeVisible();
}

/** Distinct colours of the stage as it shows (a screenshot of its canvas): 1 is an empty stage. */
export async function stageColours(page: Page): Promise<number> {
  const png = await page.locator('.stage canvas').first().screenshot();
  return page.evaluate(async src => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, 160, 100);
    const d = x.getImageData(0, 0, 160, 100).data, seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return seen.size;
  }, 'data:image/png;base64,' + png.toString('base64'));
}

/** The overlays of the stage out of the way of its screenshots. */
export const hideStageOverlays = (page: Page) =>
  page.addStyleTag({ content: '.motion-note, .stage-marks, .stage-top, .stage-notes, .deck, .seedline, .toasts { visibility: hidden !important; }' });
