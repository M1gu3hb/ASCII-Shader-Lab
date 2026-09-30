import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { download } from './helpers';
import { needsFotoStudio, finalRender, openFoto, project, settle, startFromPhoto } from './foto-helpers';

/**
 * Keeping work: autosave (a reload reopens the same project with the same pixels), the project file
 * (.glyphos.zip) round trip, and the recent projects (open, duplicate, rename, delete with undo).
 */
needsFotoStudio();

test('se guarda solo: al recargar vuelve el mismo proyecto con los mismos píxeles', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await page.getByRole('button', { name: '+ Zona elíptica' }).click();
  const before = await project(page);
  expect(before.layers[1].mask?.parts).toHaveLength(1);
  const h = await settle(page);
  // «guardando…» until the save that follows the last edit, then «guardado»
  await expect(page.locator('.fsave')).toHaveText('guardado', { timeout: 30_000 });
  expect(page.url()).toContain('#p=' + before.id);
  await page.reload();
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  const after = await project(page);
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  expect((await settle(page)).hash).toBe(h.hash);
  expect(errors).toEqual([]);
});

test('el archivo del proyecto (.glyphos.zip) se abre igual; proyectos recientes con deshacer', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Zonas circulares/ }).click();
  await finalRender(page);
  // a second version: the file carries the project as it is, its versions stay in this browser (and it says so)
  await page.locator('.fdeck .act.dice').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __foto: { store(): { versions: { list: unknown[] } } } }).__foto.store().versions.list.length)).toBe(2);
  const p = await project(page);
  const h = await settle(page);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar' })).toContainText('Las versiones y las favoritas no van en el archivo');
  const file = await download(page, () => page.getByRole('button', { name: 'Descargar el proyecto (.glyphos.zip)' }).click());
  expect(file.name).toBe('zonas-circulares.glyphos.zip');
  mkdirSync(test.info().outputDir, { recursive: true });
  const zip = join(test.info().outputDir, file.name);
  copyFileSync(file.path, zip);
  await page.keyboard.press('Escape');

  // back to the projects: it is listed; open the file: a new project with the same layers and pixels
  await page.getByRole('button', { name: 'Proyectos' }).click();
  await expect(page.locator('.fs-card')).toHaveCount(1);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Abrir un proyecto' }).click();
  await (await chooser).setFiles(zip);
  await expect(page.locator('.fv-art')).toBeVisible();
  await expect.poll(async () => (await project(page))?.id ?? p.id).not.toBe(p.id);
  await finalRender(page);
  const q = await project(page);
  expect(q.id).not.toBe(p.id);
  expect(q.layers.map(l => [l.kind, l.name])).toEqual(p.layers.map(l => [l.kind, l.name]));
  expect((await settle(page)).hash).toBe(h.hash);
  expect(await page.evaluate(() => (window as unknown as { __foto: { store(): { versions: { list: unknown[] } } } }).__foto.store().versions.list.length)).toBe(1);

  // recent projects: duplicate, rename, delete and undo
  await page.getByRole('button', { name: 'Proyectos' }).click();
  await expect(page.locator('.fs-card')).toHaveCount(2);
  await page.getByRole('button', { name: /^Duplicar «Zonas circulares»/ }).first().click();
  await expect(page.locator('.fs-card')).toHaveCount(3);
  await page.getByRole('button', { name: /^Renombrar «Zonas circulares \(copia\)»/ }).click();
  const input = page.getByRole('textbox', { name: 'Nombre del proyecto' });
  await input.fill('Frutero');
  await input.press('Enter');
  await expect(page.locator('.fs-card b', { hasText: 'Frutero' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar «Frutero»' }).click();
  await expect(page.locator('.fs-card')).toHaveCount(2);
  await page.locator('.toast', { hasText: '«Frutero» eliminado' }).getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.fs-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Abrir «Frutero»' }).click();
  // opening first lets the autosaver finish, then reads the project: wait for the editor
  await expect(page.locator('.fv-art')).toBeVisible();
  await expect.poll(async () => (await project(page))?.name).toBe('Frutero');
  await finalRender(page);
  expect((await settle(page)).hash).toBe(h.hash);
  expect(errors).toEqual([]);
});

/** The project as this browser keeps it (IndexedDB 'glyphos-projects'), or null. */
const stored = (page: Page, id: string) => page.evaluate(id => new Promise<{ layers: Array<{ mask: null | { parts: unknown[] } }> } | null>((res, rej) => {
  const req = indexedDB.open('glyphos-projects');
  req.onsuccess = () => {
    const g = req.result.transaction('projects', 'readonly').objectStore('projects').get('p:' + id);
    g.onsuccess = () => { res(g.result ?? null); req.result.close(); };
    g.onerror = () => rej(g.error);
  };
  req.onerror = () => rej(req.error);
}), id);

test('un cambio hecho justo antes de recargar o de abrir otro proyecto también se guarda', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect(page.locator('.fsave')).toHaveText('guardado', { timeout: 30_000 });
  // an edit and, at once, a reload (the autosave's moment has not come yet)
  await page.getByRole('button', { name: '+ Zona elíptica' }).click();
  const first = await project(page);
  expect(first.layers[1].mask?.parts).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(page);
  expect((await project(page)).layers[1].mask?.parts).toHaveLength(1);

  // an edit and, at once, another project dropped on the editor: the first one keeps its edit
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '+ Zona elíptica' }).click();
  expect((await project(page)).layers[1].mask?.parts).toHaveLength(2);
  await page.evaluate(() => {
    const p = (window as unknown as { __foto: { project(): Record<string, unknown> } }).__foto.project();
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify({ glyphos: 'project', project: { ...p, name: 'Otro' } })], 'otro.glyphos.json', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  });
  await expect.poll(async () => (await project(page))?.name).toBe('Otro');
  // (and nothing waits long enough to overwrite it afterwards)
  await page.waitForTimeout(2500);
  expect((await stored(page, first.id))?.layers[1].mask?.parts).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('el mismo proyecto en dos pestañas: la que se quedó atrás no borra lo que guardó la otra', async ({ page, context }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect(page.locator('.fsave')).toHaveText('guardado', { timeout: 30_000 });
  const id = (await project(page)).id;
  // the same project in a second tab (a duplicated tab, or opened again from the recent projects)
  const other = await context.newPage();
  const errors2 = await openFoto(other, '#p=' + id);
  await expect(other.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(other);
  // the first tab goes on: a zone, saved
  await page.bringToFront();
  await page.getByRole('button', { name: '+ Zona elíptica' }).click();
  await expect.poll(async () => (await stored(page, id))?.layers[1].mask?.parts.length, { timeout: 30_000 }).toBe(1);
  // the second tab, still on the older project, changes something: it does not save over the zone, and says why
  await other.bringToFront();
  await other.getByRole('button', { name: /^Ocultar «Foto original»/ }).click();
  await expect(other.locator('.fsave')).toHaveText('abierto en otra pestaña', { timeout: 30_000 });
  await expect(other.locator('.toast', { hasText: 'se guardó en otra pestaña' }).getByRole('button', { name: 'Recargar' })).toBeVisible();
  await other.waitForTimeout(1500);
  const kept = await stored(page, id);
  expect(kept?.layers[1].mask?.parts).toHaveLength(1);
  // the first tab keeps saving; a reload of the second shows the zone
  await page.bringToFront();
  await page.getByRole('button', { name: '+ Zona rectangular' }).click();
  await expect.poll(async () => (await stored(page, id))?.layers[1].mask?.parts.length, { timeout: 30_000 }).toBe(2);
  await other.reload();
  await expect(other.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  await finalRender(other);
  expect((await project(other)).layers[1].mask?.parts).toHaveLength(2);
  expect(errors).toEqual([]);
  expect(errors2).toEqual([]);
});
