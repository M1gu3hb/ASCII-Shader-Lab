import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { download } from './helpers';
import { finalRender, openFoto, project, settle } from './foto-helpers';

/**
 * Without WebGL (Chromium with --disable-3d-apis): the photo studio draws its ASCII layers with the basic
 * Canvas 2D engine, says so, and still exports.
 */
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('sin WebGL 2: capas ASCII con el motor básico, exportación incluida', async ({ page }) => {
  const errors = await openFoto(page);
  await page.locator('.fs-tpl-main', { hasText: /Zonas circulares/ }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  const r = await finalRender(page);
  expect(r.basic).toBe(true);
  await expect(page.locator('.fq.basic')).toHaveText('Motor básico');
  const p = await project(page);
  expect(p.layers.filter(l => l.kind === 'ascii')).toHaveLength(2);
  const a = await settle(page);
  // the dice works the same way
  await page.locator('.fdeck .act.dice').click();
  await expect.poll(async () => (await settle(page)).hash).not.toBe(a.hash);
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const file = await download(page, () => page.getByRole('dialog', { name: 'Exportar' }).getByRole('button', { name: 'Exportar PNG' }).click());
  const png = readFileSync(file.path);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(20_000);
  expect(errors).toEqual([]);
});
