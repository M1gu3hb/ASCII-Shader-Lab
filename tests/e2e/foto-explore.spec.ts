import { expect, test, type Page } from '@playwright/test';
import { finalRender, framePoint, openFoto, project, settle } from './foto-helpers';

/**
 * Exploring: the dice (button, space tap, →), locks, versions with thumbnails, previous/next, favourites,
 * linked variants (a roll from an older version is its child), compare two versions and restore exactly.
 */

type V = { id: string; kind: string; parent?: string; fav: boolean; thumb?: string; project: unknown };
const versions = (page: Page) => page.evaluate(() => (window as unknown as { __foto: { store(): { versions: { list: V[]; cursor: number } } } }).__foto.store().versions) as Promise<{ list: V[]; cursor: number }>;

async function fromTemplate(page: Page, name: RegExp) {
  await page.locator('.fs-tpl-main', { hasText: name }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
}

test('azar, versiones, favorita, variantes enlazadas, comparar y restaurar exacto', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  const first = await project(page);
  const h0 = await settle(page);
  let vl = await versions(page);
  expect(vl.list.map(v => v.kind)).toEqual(['inicio']);

  // the dice: a new ASCII style, kept as a version linked to the one it came from
  await page.locator('.fdeck .act.dice').click();
  await expect.poll(async () => (await versions(page)).list.length).toBe(2);
  vl = await versions(page);
  expect(vl.list[1].kind).toBe('azar');
  expect(vl.list[1].parent).toBe(vl.list[0].id);
  const rolled = await project(page);
  expect(JSON.stringify(rolled.layers[1].style)).not.toBe(JSON.stringify(first.layers[1].style));
  const h1 = await settle(page);
  expect(h1.hash).not.toBe(h0.hash);
  // thumbnails arrive for the strip
  await expect.poll(async () => (await versions(page)).list.every(v => !!v.thumb), { timeout: 60_000 }).toBe(true);
  await expect(page.locator('.fd-strip .fthumb')).toHaveCount(2);

  // ← back to the start: the exact project it was (pixels too)
  await page.locator('.fv-over').hover();
  await page.keyboard.press('ArrowLeft');
  expect(JSON.stringify(await project(page))).toBe(JSON.stringify((await versions(page)).list[0].project));
  expect((await settle(page)).hash).toBe(h0.hash);
  // a roll from the first version is a new variant of it (a sibling of the first roll)
  await page.keyboard.press(' ');
  await expect.poll(async () => (await versions(page)).list.length).toBe(3);
  vl = await versions(page);
  expect(vl.list[2].parent).toBe(vl.list[0].id);
  // the strip groups the variants under their parent
  await expect(page.locator('.fd-strip li.child')).toHaveCount(2);

  // F: favourite of the current version
  await page.keyboard.press('f');
  vl = await versions(page);
  expect(vl.list[vl.cursor].fav).toBe(true);
  await expect(page.locator('.fdeck .act.fav')).toHaveAttribute('aria-pressed', 'true');

  // a held space bar that drags the view does not roll
  const c = await framePoint(page, 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down(' ');
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  expect((await versions(page)).list.length).toBe(3);
  const pan = await page.evaluate(() => (window as unknown as { __foto: { ui(): { pan: { x: number; y: number } } } }).__foto.ui().pan);
  expect(Math.round(pan.x)).toBe(80);

  // locks: with «Glifos» and «Color» locked the characters and colours stay
  await page.getByRole('button', { name: 'Opciones del dado' }).click();
  await page.getByRole('dialog', { name: 'Opciones del dado' }).getByRole('button', { name: /Glifos/ }).click();
  await page.getByRole('dialog', { name: 'Opciones del dado' }).getByRole('button', { name: /Color/ }).click();
  await page.keyboard.press('Escape');
  const before = (await project(page)).layers[1].style as unknown as { glyph: { charset: string }; color: unknown };
  await page.locator('.fdeck .act.dice').click();
  await expect.poll(async () => (await versions(page)).list.length).toBe(4);
  const after = (await project(page)).layers[1].style as unknown as { glyph: { charset: string }; color: unknown };
  expect(after.glyph.charset).toBe(before.glyph.charset);
  expect(after.color).toEqual(before.color);

  // the versions sheet: compare two, restore exactly
  await page.locator('.fdeck').getByRole('button', { name: 'Versiones' }).click();
  const sheet = page.getByRole('dialog', { name: 'Versiones' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Comparar' }).first().click();
  await expect(sheet.locator('.fcmp canvas')).toHaveCount(2);
  await sheet.getByRole('radio', { name: 'Lado a lado' }).click();
  await expect(sheet.locator('.fcmp-view.side')).toBeVisible();
  await sheet.getByRole('button', { name: /Restaurar la versión 1/ }).click();
  expect(JSON.stringify(await project(page))).toBe(JSON.stringify((await versions(page)).list[0].project));
  await page.keyboard.press('Escape');
  expect((await settle(page)).hash).toBe(h0.hash);

  // the project's name belongs to the project: a rename stays while versions are browsed, and F stars the
  // version on show instead of keeping a copy of it only because the name changed
  await page.locator('.fproj-name').click();
  await page.getByRole('textbox', { name: 'Nombre del proyecto' }).fill('Mi frutero');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await project(page)).name).toBe('Mi frutero');
  await page.locator('.fv-over').hover();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await versions(page)).cursor).toBe(1);
  expect((await project(page)).name).toBe('Mi frutero');
  const n = (await versions(page)).list.length;
  const wasFav = (await versions(page)).list[1].fav;
  await page.keyboard.press('f');
  vl = await versions(page);
  expect(vl.list).toHaveLength(n);
  expect(vl.list[1].fav).toBe(!wasFav);
  expect(errors).toEqual([]);
});
