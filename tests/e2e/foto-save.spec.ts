import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { download } from './helpers';
import { finalRender, openFoto, project, settle, startFromPhoto } from './foto-helpers';

/**
 * Keeping work: autosave (a reload reopens the same project with the same pixels), the project file
 * (.glyphos.zip) round trip, and the recent projects (open, duplicate, rename, delete with undo).
 */

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
  const p = await project(page);
  const h = await settle(page);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
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
  await finalRender(page);
  expect((await project(page)).name).toBe('Frutero');
  expect((await settle(page)).hash).toBe(h.hash);
  expect(errors).toEqual([]);
});
