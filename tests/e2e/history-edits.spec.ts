import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { download, openStudio, seedText } from './helpers';

/**
 * The owner's path through the history: roll, edit colour, glyphs and motion, roll again (fast too), come back
 * with the arrow and with the thumbnail: the edited version is there, with its seed and its origin, on stage
 * and in its thumbnail; after a reload; after saving the session and opening it in another browser; in the
 * collection. Recipes are read from what the studio stored (IndexedDB), the stage from its pixels.
 */

interface StoredEntry { recipe: { color: { bg: string; stops: string[] }; glyph: { cell: number }; motion: { speed: number }; meta: { seed?: string } }; origin: { color: { bg: string } }; seed?: string; edited: boolean; thumbV?: string }
interface Stored { ids: string[]; cursor: number; bodies: Record<string, StoredEntry>; thumbs: Record<string, string> }

const stored = (page: Page) => page.evaluate(() => new Promise<Stored>((res, rej) => {
  const req = indexedDB.open('keyval-store');
  req.onsuccess = () => {
    const st = req.result.transaction('keyval').objectStore('keyval');
    const g = st.get('mt.v3.history');
    const range = (p: string) => IDBKeyRange.bound(p, p + '￿');
    const tv = st.getAll(range('mt.v3.t:')), tk = st.getAllKeys(range('mt.v3.t:'));
    const ev = st.getAll(range('mt.v3.e:')), ek = st.getAllKeys(range('mt.v3.e:'));
    ek.onsuccess = () => {
      const thumbs: Record<string, string> = {}, bodies: Record<string, StoredEntry> = {};
      (tk.result as string[]).forEach((k, i) => { thumbs[k.slice(8)] = tv.result[i] as string; });
      (ek.result as string[]).forEach((k, i) => { bodies[k.slice(8)] = ev.result[i] as StoredEntry; });
      res({ ids: g.result?.ids ?? [], cursor: g.result?.cursor ?? -1, thumbs, bodies });
    };
    ek.onerror = () => rej(ek.error);
  };
  req.onerror = () => rej(req.error);
}));

/** The stored entry at a position of the history (1-based, as the strip counts). */
const entryAt = async (page: Page, n: number) => { const s = await stored(page); return s.bodies[s.ids[n - 1]]; };

/** Share of the pixels of an image (a data URL or a PNG buffer) close to magenta (#ff00ff). */
const magenta = (page: Page, url: string) => page.evaluate(async url => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 64, 40);
  const d = x.getImageData(0, 0, 64, 40).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 190 && d[i + 1] < 90 && d[i + 2] > 190) n++;
  return n / (64 * 40);
}, url);
const stageMagenta = async (page: Page) => {
  await expect(page.locator('.stage canvas[data-busy]')).toHaveCount(0, { timeout: 60_000 });
  const shot = await page.locator('.stage canvas').first().screenshot();
  return magenta(page, 'data:image/png;base64,' + shot.toString('base64'));
};

async function editCurrent(page: Page) {
  await page.getByRole('tab', { name: /^Color/ }).click();
  await page.getByRole('button', { name: /^Fondo: #/ }).click();
  const code = page.getByRole('textbox', { name: /^Código de Fondo/ });
  await code.fill('#ff00ff');
  await code.press('Enter');
  await page.getByRole('tab', { name: /^Glifos/ }).click();
  await page.getByLabel('Tamaño de celda').fill('22');
  await page.getByRole('tab', { name: /^Movimiento/ }).click();
  await page.getByLabel('Velocidad', { exact: true }).fill('2.5');
  await expect(page.locator('.seedline')).toContainText('editado');
}

/** What the studio shows for the current piece matches the edited version. */
async function showsEdited(page: Page, n: number, total: number, seed: string) {
  await expect(page.locator('.seedline')).toContainText(`${n}/${total}`);
  expect(await seedText(page)).toBe(seed);
  await expect(page.locator('.seedline')).toContainText('editado');
  await expect.poll(() => stageMagenta(page), { timeout: 30_000 }).toBeGreaterThan(0.15);
}

test.describe('ediciones en el historial', () => {
  test.describe.configure({ timeout: 300_000 });

  test('tirar, editar, tirar más (también rápido), volver con la flecha y con la miniatura: la versión editada, con su semilla; tras recargar también', async ({ page }) => {
    const errors = await openStudio(page);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
    const seed = await seedText(page);
    await editCurrent(page);
    // (the studio saves half a second after the last change)
    await expect.poll(async () => { const e = await entryAt(page, 2); return e && [e.recipe.color.bg, e.recipe.glyph.cell, e.recipe.motion.speed]; }, { timeout: 10_000 }).toEqual(['#ff00ff', 22, 2.5]);
    const e2 = await entryAt(page, 2);
    expect(e2.edited).toBe(true);
    expect(e2.seed).toBe(seed);
    expect(e2.origin.color.bg).not.toBe('#ff00ff');

    // roll on: three at a normal pace, then a burst
    for (let i = 3; i <= 5; i++) {
      await page.keyboard.press('r');
      await expect(page.locator('.seedline')).toContainText(`${i}/${i}`);
    }
    for (let i = 0; i < 6; i++) await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('11/11');

    // the last slider touched no longer holds the arrows: after rolling with R they move through the history
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.seedline')).toContainText('10/11');
    await expect(page.locator('.seedline')).not.toContainText('editado');
    // back with the on-screen arrow, one step at a time (quickly)
    const prev = page.getByRole('button', { name: 'Resultado anterior (←)' }).first();
    for (let i = 9; i >= 2; i--) await prev.click();
    await showsEdited(page, 2, 11, seed);
    // nothing else was edited on the way
    const s0 = await stored(page);
    expect(s0.ids.map(id => s0.bodies[id].edited)).toEqual([false, true, false, false, false, false, false, false, false, false, false]);

    // forward, then with the thumbnail (and quickly between others)
    await page.locator('.thumb').nth(8).click();
    await page.locator('.thumb').nth(3).click();
    await page.locator('.thumb').nth(1).click();
    await showsEdited(page, 2, 11, seed);

    // its thumbnail is the edited version (the magenta background), made for that recipe
    await expect.poll(async () => { const s = await stored(page); const t = s.thumbs[s.ids[1]]; return t ? magenta(page, t) : 0; }, { timeout: 120_000 }).toBeGreaterThan(0.15);
    // every result of the burst has its own thumbnail
    await expect.poll(async () => { const s = await stored(page); return s.ids.filter(id => !s.thumbs[id] || !s.bodies[id].thumbV).length; }, { timeout: 240_000, intervals: [1000] }).toBe(0);

    // reload: the edited version is still the one kept
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('2/11');
    await showsEdited(page, 2, 11, seed);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.seedline')).toContainText('3/11');
    await page.keyboard.press('ArrowLeft');
    await showsEdited(page, 2, 11, seed);
    expect(errors).toEqual([]);
  });

  test('restaurar el original y deshacerlo; la colección guarda la versión editada', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('r');
    await expect(page.locator('.seedline')).toContainText('2/2');
    const seed = await seedText(page);
    await editCurrent(page);
    await page.keyboard.press('s');
    await expect(page.locator('.act.fav')).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'restaurar' }).click();
    await expect(page.locator('.seedline')).not.toContainText('editado');
    await expect.poll(async () => (await entryAt(page, 2))?.recipe.color.bg, { timeout: 10_000 }).not.toBe('#ff00ff');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.seedline')).toContainText('editado');
    await expect.poll(async () => (await entryAt(page, 2))?.recipe.color.bg, { timeout: 10_000 }).toBe('#ff00ff');
    // the collection keeps the version saved with ★ (the edited one)
    await page.keyboard.press('r');
    await page.getByRole('button', { name: /Colección/ }).click();
    await expect(page.locator('.fav-card')).toHaveCount(1);
    await page.locator('.fav-card').first().getByRole('button', { name: /Abrir/ }).first().click();
    await expect(page.locator('.seedline')).toContainText('4/4');
    await expect.poll(async () => (await entryAt(page, 4))?.recipe.color.bg, { timeout: 10_000 }).toBe('#ff00ff');
    expect((await entryAt(page, 4)).recipe.meta.seed).toBe(seed);
  });

  test('guardar la sesión con una pieza editada y abrirla en otro navegador: la versión editada, con su semilla', async ({ browser }) => {
    const a = await browser.newContext();
    const pa = await a.newPage();
    await openStudio(pa);
    await pa.keyboard.press('r');
    await expect(pa.locator('.seedline')).toContainText('2/2');
    const seed = await seedText(pa);
    await editCurrent(pa);
    await pa.keyboard.press('r');
    await expect(pa.locator('.seedline')).toContainText('3/3');
    await pa.getByRole('button', { name: /Colección/ }).click();
    const sess = await download(pa, () => pa.getByRole('button', { name: 'Guardar sesión' }).click());
    const bytes = readFileSync(sess.path);
    await a.close();

    const b = await browser.newContext();
    const pb = await b.newPage();
    await openStudio(pb);
    await pb.getByRole('button', { name: /Colección/ }).click();
    const [chooser] = await Promise.all([pb.waitForEvent('filechooser'), pb.getByRole('button', { name: 'Abrir sesión' }).click()]);
    await chooser.setFiles({ name: sess.name, mimeType: 'application/zip', buffer: bytes });
    await expect(pb.locator('.toast').filter({ hasText: 'Sesión abierta: 3 resultados añadidos' })).toBeVisible();
    await pb.keyboard.press('Escape');
    await expect(pb.locator('.seedline')).toContainText('4/4');
    await pb.locator('.thumb').nth(2).click();
    await showsEdited(pb, 3, 4, seed);
    await b.close();
  });
});
