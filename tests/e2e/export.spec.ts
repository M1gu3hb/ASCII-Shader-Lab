import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { download, openStudio } from './helpers';

test.describe('exportar', () => {
  test('imagen, vector, texto y receta', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Imagen' }).click();
    const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
    expect(png.name).toMatch(/\.png$/);
    expect(readFileSync(png.path).subarray(1, 4).toString()).toBe('PNG');

    await page.getByRole('tab', { name: 'Vector' }).click();
    const svg = await download(page, () => page.getByRole('button', { name: 'Descargar SVG' }).click());
    const svgText = readFileSync(svg.path, 'utf8');
    expect(svgText).toContain('<svg');
    expect(svgText).toContain('<use xlink:href="#g');

    await page.getByRole('tab', { name: 'Texto y terminal' }).click();
    await expect(page.locator('.ansi-pre')).toBeVisible();
    const txt = await download(page, () => page.getByRole('button', { name: '.txt' }).click());
    const lines = readFileSync(txt.path, 'utf8').split('\n');
    expect(lines.length).toBeGreaterThan(20);
    const mjs = await download(page, () => page.getByRole('button', { name: /Script de Node/ }).click());
    expect(readFileSync(mjs.path, 'utf8')).toContain('gunzipSync');

    await page.getByRole('tab', { name: 'Receta' }).click();
    const json = await download(page, () => page.getByRole('button', { name: /Descargar receta/ }).click());
    const parsed = JSON.parse(readFileSync(json.path, 'utf8'));
    expect(parsed.monotrama).toBe('recipe');
    expect(parsed.recipe.layers.length).toBeGreaterThan(0);
  });

  test('el HTML exportado funciona solo en otra página', async ({ page, context }) => {
    await openStudio(page);
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Código' }).click();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
    const file = test.info().outputPath('exportado.html');
    await d.saveAs(file);
    const other = await context.newPage();
    const errors: string[] = [];
    other.on('pageerror', e => errors.push(e.message));
    await other.goto('file://' + file);
    await other.waitForTimeout(1500);
    const size = await other.evaluate(() => { const c = document.querySelector('canvas')!; return [c.width, c.height]; });
    expect(size[0]).toBeGreaterThan(100);
    expect(await other.evaluate(() => typeof (window as unknown as { Monotrama?: unknown }).Monotrama)).toBe('object');
    expect(errors).toEqual([]);
  });

  test('código: póster PNG de respaldo; video: MP4 sólo si el navegador codifica H.264', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Código' }).click();
    const poster = await download(page, () => page.getByRole('button', { name: 'Descargar póster (PNG)' }).click());
    expect(poster.name).toMatch(/-poster\.png$/);
    expect(readFileSync(poster.path).subarray(1, 4).toString()).toBe('PNG');
    await expect(page.getByText(/Sin WebGL 2 se ve el color de fondo/)).toBeVisible();

    await page.getByRole('tab', { name: 'Video y GIF' }).click();
    await expect(page.getByRole('button', { name: 'WebM' })).toBeEnabled();
    const avc = await page.evaluate(async () => (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 1280, height: 720 })).supported);
    const mp4 = page.getByRole('button', { name: 'MP4 (H.264)' });
    if (avc) await expect(mp4).toBeEnabled();
    else {
      // not a dead button: an explanation row says why, and what to use instead
      await expect(mp4).toHaveCount(0);
      await expect(page.getByText(/no puede codificar H\.264/)).toBeVisible();
    }
  });

  test('GIF animado', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Video y GIF' }).click();
    await page.getByLabel('Duración (s)').fill('1');
    await page.getByRole('radio', { name: '320 px' }).click();
    const gif = await download(page, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
    const buf = readFileSync(gif.path);
    expect(buf.subarray(0, 6).toString()).toBe('GIF89a');
    expect(buf.readUInt16LE(6)).toBe(320);
  });

  test('abre los ajustes JSON del laboratorio original', async ({ page }) => {
    await openStudio(page);
    const v1 = { source: 'pattern', patA: 7, patB: 0, blend: 2, mix: 0.45, scale: 1, scaleB: 1.4, speed: 1, speedB: 0.4, rot: 0, warp: 0, mouse: 0.4, cell: 14, aspect: 1.3,
      charset: ' .:-=+*#%@', sortDensity: true, font: 'vt', weight: 400, glyph: 1, bright: 0, contrast: 1.35, gamma: 1, invert: false, dither: 0, edge: 0, colorMode: 1,
      colA: '#c8ffd8', colB: '#0a5a26', bg: '#000000', sat: 1, hue: 0, vivid: 0.5, cycle: 0, cellBg: 0, glow: 0.6, scan: 0.2, vig: 0.5, paused: false, mediaSrc: '' };
    await page.getByRole('button', { name: /Colección/ }).click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Importar receta/ }).click()]);
    await chooser.setFiles({ name: 'ajustes-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
    await expect(page.locator('.seedline')).toContainText('ajustes-v1');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Capas/ }).click();
    await expect(page.getByRole('combobox', { name: 'Patrón de la capa 1' })).toHaveAttribute('data-value', 'lluvia');
  });
});
