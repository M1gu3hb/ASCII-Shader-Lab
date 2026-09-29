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
  // the part is drawn live (host.preview) and not committed until release
  expect(await page.evaluate(() => (window as unknown as { __foto: { commits?: number; sched(): { preview: boolean } } }).__foto.sched().preview)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __foto: { commits?: number } }).__foto.commits ?? 0)).toBe(0);
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as { __foto: { sched(): { preview: boolean } } }).__foto.sched().preview)).toBe(false);
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

  // the keyboard reaches the tool first (Enter adds a zone, arrows move it), then the studio — once the
  // focus has left the «Deshacer» button (Enter on a focused button presses that button)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('live')).toContainText('Zona en x 0.35');
  await page.keyboard.press('Enter');
  expect((await project(page)).layers[1].mask?.parts).toHaveLength(2);
  // Escape drops the tool
  await page.keyboard.press('Escape');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  // like a quick mask: without a tool the art shows as it exports, unless «Ver la máscara» is pinned
  await expect(page.locator('.fv-mask')).toBeHidden();
  const pin = page.getByRole('button', { name: 'Ver la máscara' });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fv-mask')).toBeVisible();
  await pin.click();
  await expect(page.locator('.fv-mask')).toBeHidden();

  // the host's optional verbs: a live part that stands in for part 0 (editing it), setTool, openCutout
  const live = await page.evaluate(() => {
    const F = (window as unknown as { __foto: any }).__foto; // eslint-disable-line @typescript-eslint/no-explicit-any
    const l = F.project().layers[1];
    F.host.preview({ layer: l.id, part: { ...l.mask.parts[0], x: 0.5 }, replace: 0 });
    const replaced = F.viewProject().layers[1].mask.parts.map((q: { x: number }) => q.x);
    F.host.preview({ layer: l.id, part: { ...l.mask.parts[0], x: 0.5 } });
    const appended = F.viewProject().layers[1].mask.parts.length;
    F.host.preview(null);
    return { replaced, appended, stored: F.project().layers[1].mask.parts.length };
  });
  expect(live.replaced).toEqual([0.5, expect.any(Number)]);
  expect(live.appended).toBe(3);
  expect(live.stored).toBe(2);
  await page.evaluate(() => (window as unknown as { __foto: { host: { setTool(id: string): void } } }).__foto.host.setTool('prueba-rect'));
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as unknown as { __foto: { host: { openCutout(): void } } }).__foto.host.openCutout());
  await expect(page.getByRole('heading', { name: 'Recorte' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar el recorte' }).click();
  expect(errors).toEqual([]);
});

test('«Vista ligera»: con «Siempre ligera» se dibuja a menor escala; al volver a automática, la calidad final', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  const full = await settle(page);
  await page.getByRole('button', { name: 'Ajustes del estudio' }).click();
  await page.getByRole('radio', { name: 'Siempre ligera' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /ASCII \(render gráfico\)/ }).click();
  await expect(page.locator('.fq')).toContainText('Vista ligera');
  const r = await page.evaluate(() => (window as unknown as { __foto: { ui(): { render: { scale: number; light: boolean } } } }).__foto.ui().render);
  expect(r.light).toBe(true);
  expect(r.scale).toBeLessThan(full.scale);
  await page.locator('.fq').click();
  await expect(page.locator('.fq')).toContainText('Calidad final');
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

test('«Quitar fondo» abre el panel «Recorte» (con su cierre); los ajustes dicen qué modelos hay guardados', async ({ page }) => {
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('toolbar', { name: 'Herramientas' }).getByRole('button', { name: 'Quitar fondo' }).click();
  const panel = page.getByRole('complementary', { name: 'Recorte' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Recorte' })).toBeVisible();
  await panel.getByRole('button', { name: 'Cerrar el recorte' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.fl-list')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes del estudio' }).click();
  const settings = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(settings.locator('.fmodels')).toContainText(/Ninguno|MB/);
  await expect(settings.getByRole('button', { name: 'Borrar los modelos descargados' })).toBeVisible();
  expect(errors).toEqual([]);
});
