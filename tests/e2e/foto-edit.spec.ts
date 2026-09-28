import { expect, test } from '@playwright/test';
import { finalRender, framePoint, installTestTool, meanIn, openFoto, project, renderCount, settle, startFromPhoto } from './foto-helpers';

/**
 * The photo studio's editor: a project from a photo, an ASCII layer masked through the tool routing (a
 * spec-local test tool: pointer events in frame units, live preview, one undo step per gesture, keyboard
 * use), layer order, opacity, blend and visibility, finishes, and undo/redo.
 */

test('una foto, una capa ASCII con máscara dibujada por la herramienta, deshacer y rehacer', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  let p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo']);
  const photoOnly = await settle(page);

  // add an ASCII layer: it reads the photo, over the whole frame
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect(page.locator('.lr')).toHaveCount(2);
  await expect(page.locator('.kind-badge.graphic')).toContainText('no es texto');
  const withAscii = await settle(page);
  expect(withAscii.hash).not.toBe(photoOnly.hash);

  // the test tool: in the palette with its letter, selected by it
  await installTestTool(page);
  const btn = page.getByRole('button', { name: 'Rectángulo de prueba (Q)' });
  await expect(btn).toBeVisible();
  await page.locator('.fv-over').focus().catch(() => undefined);
  await page.keyboard.press('q');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Opciones de Rectángulo de prueba' })).toBeVisible();

  // drag a rectangle on the left half: the preview renders light while dragging, the commit is one step
  const a = await framePoint(page, 0.1, 0.1), b = await framePoint(page, 0.45, 0.9);
  const before = await renderCount(page);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 6, a.y + ((b.y - a.y) * i) / 6);
  await page.waitForFunction(n => (window as unknown as { __foto: { ui(): { render: { n: number; light: boolean } } } }).__foto.ui().render.n > n, before);
  const during = await page.evaluate(() => (window as unknown as { __foto: { ui(): { render: { light: boolean } } } }).__foto.ui().render);
  expect(during.light).toBe(true);
  await page.mouse.up();
  await finalRender(page, await renderCount(page) - 1);
  p = await project(page);
  const ascii = p.layers[1];
  expect(ascii.mask?.parts).toHaveLength(1);
  const part = ascii.mask!.parts[0] as { kind: string; op: string; x: number; y: number; w: number; h: number };
  expect(part.kind).toBe('rect');
  expect(part.op).toBe('add');
  expect(part.x).toBeCloseTo(0.1, 1);
  expect(part.w).toBeCloseTo(0.35, 1);
  expect(await page.evaluate(() => (window as unknown as { __foto: { commits: number } }).__foto.commits)).toBe(1);
  // inside the zone the ASCII shows; outside, the photo as it was
  await settle(page);
  const outside = await meanIn(page, 0.6, 0.2, 0.3, 0.6);
  const masked = await settle(page);
  expect(masked.hash).not.toBe(withAscii.hash);
  // the mask view tints the zone of the selected layer
  await expect(page.locator('.fv-mask')).toBeVisible();
  // undo removes the part (one step), redo brings it back
  await page.getByRole('button', { name: 'Deshacer' }).click();
  expect((await project(page)).layers[1].mask?.parts ?? []).toHaveLength(0);
  await page.keyboard.press('Control+Shift+Z');
  expect((await project(page)).layers[1].mask?.parts).toHaveLength(1);
  const again = await settle(page);
  expect(again.hash).toBe(masked.hash);
  const outside2 = await meanIn(page, 0.6, 0.2, 0.3, 0.6);
  for (let k = 0; k < 3; k++) expect(Math.abs(outside2[k] - outside[k])).toBeLessThan(1);

  // the keyboard reaches the tool first (Enter adds a zone, arrows move it), then the studio
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('live')).toContainText('Zona en x 0.35');
  await page.keyboard.press('Enter');
  expect((await project(page)).layers[1].mask?.parts).toHaveLength(2);
  // Escape drops the tool
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('capas: orden (teclado y arrastre), opacidad, fusión, visibilidad, acabados', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /Caracteres reales/ }).click();
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /^Texto/ }).click();
  let p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'glyphs', 'text']);
  const base = await settle(page);

  // Alt+↓ on the selected (text) layer moves it under the characters
  await page.locator('.lr.on .lr-main').focus();
  await page.keyboard.press('Alt+ArrowDown');
  p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'text', 'glyphs']);
  // drag the photo's grip to the top of the list
  const grip = page.locator('.lr', { hasText: 'Foto original' }).locator('.lr-grip');
  const top = (await page.locator('.lr').first().boundingBox())!;
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, top.y + 4, { steps: 6 });
  await page.mouse.up();
  p = await project(page);
  expect(p.layers[p.layers.length - 1].kind).toBe('photo');
  await page.keyboard.press('Control+Z');
  p = await project(page);
  expect(p.layers.map(l => l.kind)).toEqual(['photo', 'text', 'glyphs']);

  // opacity and blend of the selected layer (characters)
  await page.locator('.lr', { hasText: 'Caracteres' }).locator('.lr-main').click();
  const slider = page.locator('.fl-sel input[type=range]');
  await slider.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  p = await project(page);
  expect(p.layers[2].opacity).toBeCloseTo(0.8, 2);
  await page.getByRole('combobox', { name: 'Fusión' }).click();
  await page.getByRole('option', { name: 'Trama (aclarar)' }).click();
  p = await project(page);
  expect(p.layers[2].blend).toBe('screen');
  // visibility
  await page.getByRole('button', { name: /^Ocultar «Caracteres»/ }).click();
  expect((await project(page)).layers[2].visible).toBe(false);
  await page.getByRole('button', { name: /^Mostrar «Caracteres»/ }).click();

  // a finish from the catalogue: on, amount, off; the picture changes and comes back
  const noFinish = await settle(page);
  await page.locator('.lr', { hasText: 'Foto original' }).locator('.lr-main').click();
  await page.locator('.fsec-add').click();
  await page.getByRole('group', { name: 'Catálogo de acabados' }).getByRole('button', { name: /Tramado \(dither\)/ }).click();
  p = await project(page);
  expect(p.layers[0].finishes.map(f => f.kind)).toEqual(['dither']);
  const dithered = await settle(page);
  expect(dithered.hash).not.toBe(noFinish.hash);
  const sw = page.getByRole('switch', { name: 'Tramado (dither) encendido' });
  await expect(sw).toBeChecked();
  await page.locator('.fin-h .switch').click();
  await expect(sw).not.toBeChecked();
  const off = await settle(page);
  expect(off.hash).toBe(noFinish.hash);
  expect(base.hash).not.toBe(off.hash);
  expect(errors).toEqual([]);
});
