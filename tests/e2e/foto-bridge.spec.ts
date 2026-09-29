import { expect, test } from '@playwright/test';
import { openStudio } from './helpers';
import { finalRender, PHOTO, project } from './foto-helpers';

/**
 * Bridges between the lab and the photo studio: the switch in both top bars, «Llevar al estudio de foto»
 * (the lab piece and its photo become a project), «Abrir estilo en el laboratorio» (an ASCII layer's
 * recipe, with its photo, becomes a lab entry) and «Usar estilo del laboratorio» (lab pieces as styles).
 * Only a key travels in the address; the recipe goes through IndexedDB.
 */

test('laboratorio ⇄ foto y video: el interruptor, llevar la pieza, abrir el estilo y usar estilos del laboratorio', async ({ page }) => {
  const errors = await openStudio(page, '#space=media');
  // the switch in the lab's top bar
  const sw = page.getByRole('navigation', { name: 'Estudios de GLYPHOS' });
  await expect(sw.getByRole('link', { name: /Laboratorio|Lab/ })).toHaveAttribute('aria-current', 'page');
  // a photo in the lab
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Elegir imagen' }).first().click();
  await (await chooser).setFiles(PHOTO);
  await expect(page.locator('.prompt .card')).toHaveCount(0, { timeout: 30_000 });
  const labCharset = await page.evaluate(async () => {
    // the lab's current piece, as it is saved (its history index and entries in IndexedDB)
    const open = indexedDB.open('keyval-store');
    const db: IDBDatabase = await new Promise(r => { open.onsuccess = () => r(open.result); });
    const get = (k: string) => new Promise<unknown>(r => { const q = db.transaction('keyval').objectStore('keyval').get(k); q.onsuccess = () => r(q.result); });
    for (let i = 0; i < 40; i++) {
      const idx = await get('mt.v3.history') as { ids: string[]; cursor: number } | undefined;
      const e = idx ? await get('mt.v3.e:' + idx.ids[idx.cursor]) as { recipe: { glyph: { charset: string }; media: { ref?: { id?: string } } } } : null;
      if (e?.recipe.media.ref?.id) return e.recipe.glyph.charset;
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  });
  expect(labCharset).not.toBeNull();

  // «Llevar al estudio de foto»
  await sw.getByRole('button', { name: /Foto y video|Foto/ }).click();
  await page.getByRole('menuitem', { name: /Llevar al estudio de foto/ }).click();
  await page.waitForURL(/\/studio\/foto\/\?*#p=/, { timeout: 45_000 });
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await page.goto(page.url().replace('/studio/foto/', '/studio/foto/?qa'));
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'ascii']);
  expect(p.layers[1].style?.glyph.charset).toBe(labCharset);
  const photoSource = (p as unknown as { sources: Array<{ id: string; media: Array<{ id: string }> }> }).sources[0];
  expect((p.layers[1] as unknown as { source: string }).source).toBe(photoSource.id);
  // the switch here too, with «Foto y video» current
  await expect(page.getByRole('navigation', { name: 'Estudios de GLYPHOS' }).getByRole('link', { name: /Foto y video|Foto/ })).toHaveAttribute('aria-current', 'page');

  // «Usar estilo del laboratorio»: the lab's history is there to pick from
  await page.locator('.lr', { hasText: p.layers[1].name }).locator('.lr-main').click();
  await page.getByRole('button', { name: 'Usar estilo del laboratorio' }).click();
  const styles = page.getByRole('dialog', { name: 'Usar estilo del laboratorio' });
  await expect(styles.locator('.lab-card').first()).toBeVisible({ timeout: 20_000 });
  await styles.locator('.lab-card').first().click();
  await expect(styles).toBeHidden();

  // «Abrir estilo en el laboratorio»: a new lab entry with this layer's recipe and its photo
  await page.getByRole('button', { name: 'Abrir estilo en el laboratorio' }).click();
  await page.waitForURL(/\/studio\/$/, { timeout: 45_000 });
  await expect(page.locator('.toast', { hasText: 'Estilo abierto desde el estudio de foto' })).toBeVisible({ timeout: 30_000 });
  // its photo came along (the lab is not asking for one)
  await expect(page.locator('.prompt .card')).toHaveCount(0);
  expect(errors).toEqual([]);
});
