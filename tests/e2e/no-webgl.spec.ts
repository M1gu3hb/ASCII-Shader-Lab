import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { contextOf, drawn, honestVideoTab, openExport } from './canvas';
import { download, openStudio } from './helpers';

/**
 * A real browser without WebGL: Chromium with --disable-3d-apis. Every canvas must still draw (basic
 * engine), the studio must say so plainly, and the exports must work.
 */
test.use({ launchOptions: { args: ['--disable-3d-apis'] } });

test('la portada dibuja el héroe, el escenario de los espacios, el azar y el final', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await drawn(page, '.hero-canvas');
  expect(await contextOf(page, '.hero-canvas')).toBe('2d');
  // the note next to the seed says so, and explains on demand
  const note = page.getByRole('button', { name: 'modo básico' });
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator('#hero-basic-why')).toContainText('WebGL');
  await expect(note).toHaveAttribute('aria-expanded', 'true');

  // the six spaces share one stage: it draws, and keeps drawing when another space is chosen
  await page.locator('#telar-panel canvas').scrollIntoViewIfNeeded();
  await drawn(page, '#telar-panel canvas');
  expect(await contextOf(page, '#telar-panel canvas')).toBe('2d');
  for (const space of ['Imagen', 'Terminal']) {
    await page.getByRole('tablist', { name: 'Espacios del estudio' }).getByRole('tab', { name: new RegExp(space) }).click();
    await drawn(page, '#telar-panel canvas');
  }
  await page.locator('[data-azar]').scrollIntoViewIfNeeded();
  await drawn(page, '[data-azar]');
  await page.getByRole('button', { name: 'Tirar', exact: true }).click();
  await expect(page.locator('[data-azar-strip] button')).toHaveCount(4);
  await page.locator('.final-canvas').scrollIntoViewIfNeeded();
  await drawn(page, '.final-canvas');
  expect(errors).toEqual([]);
});

test('el estudio usa el motor básico, lo explica y exporta PNG y TXT', async ({ page }) => {
  const errors = await openStudio(page);
  const chip = page.locator('.bm-basic');
  await expect(chip).toContainText('Modo básico');
  await expect(chip).toContainText('WebGL');
  await expect(chip).not.toContainText(/actualiza/i);
  await drawn(page, '.stage canvas');
  expect(await contextOf(page, '.stage canvas')).toBe('2d');
  await expect(page.locator('.fatal')).toHaveCount(0);

  await chip.getByRole('button', { name: '¿Por qué?' }).click();
  const sheet = page.getByRole('dialog', { name: 'Modo básico' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Qué cambia en modo básico')).toBeVisible();
  await expect(sheet.getByText(/necesita WebGL 2 en el navegador de quien la visite/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Volver a intentar' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(sheet.getByText(/Lo probé de nuevo y sigue igual/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Cerrar' }).first().click();
  await expect(sheet).toBeHidden();

  // effects panel: the one honest cost hint
  await page.getByRole('tab', { name: 'Efectos' }).click();
  await expect(page.getByText(/En modo básico, curvatura CRT y resplandor cuestan más/)).toBeVisible();

  await openExport(page, 'Imagen');
  const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
  expect(png.name).toMatch(/\.png$/);
  const buf = readFileSync(png.path);
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  expect(buf.length).toBeGreaterThan(5000);

  await page.getByRole('tab', { name: 'Texto y terminal' }).click();
  await expect(page.locator('.ansi-pre')).toBeVisible();
  const txt = await download(page, () => page.getByRole('button', { name: '.txt' }).click());
  const lines = readFileSync(txt.path, 'utf8').split('\n');
  expect(lines.length).toBeGreaterThan(20);
  expect(lines.join('').replace(/\s/g, '').length).toBeGreaterThan(50);

  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  await honestVideoTab(page);
  await expect(page.getByText(/Se guarda como (WebM|MP4)/)).toBeVisible();

  await page.getByRole('tab', { name: 'Código' }).click();
  await expect(page.getByText('Tu vista previa usa el motor básico.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar póster (PNG)' })).toHaveCount(1);

  // dismissing the chip lasts for the session
  await page.keyboard.press('Escape');
  await chip.getByRole('button', { name: /Ocultar el aviso/ }).click();
  await expect(chip).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.seedline')).toBeVisible();
  await drawn(page, '.stage canvas');
  await expect(page.locator('.bm-basic')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('las guías cargan su demo en modo básico', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const path of ['/imagen-a-ascii/', '/video-a-ascii/', '/fondos-ascii/', '/texto-animado-ascii/', '/arte-ascii-terminal/']) {
    await page.goto(path);
    const example = page.locator('[data-demo]');
    await example.scrollIntoViewIfNeeded();
    await expect(example, path).toHaveAttribute('data-state', 'live', { timeout: 30_000 });
    if (path === '/arte-ascii-terminal/') {
      const before = await example.locator('pre').textContent();
      await expect.poll(() => example.locator('pre').textContent(), { message: 'the text frame moves' }).not.toBe(before);
    } else await drawn(page, '[data-demo] .ex-live');
    await expect(example.locator('figcaption'), path).toContainText('Modo básico (WebGL está desactivado o bloqueado)');
    await expect(page.getByRole('button', { name: /Pausar la animación/ })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
