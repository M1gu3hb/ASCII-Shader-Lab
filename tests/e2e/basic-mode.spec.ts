import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { contextOf, drawn, openExport } from './canvas';
import { download, openStudio } from './helpers';

/**
 * Honest exports: the export sheet never shows a button for a file this browser cannot produce.
 * And the basic engine on request (?motor=basico, or a saved preference), or after WebGL goes away.
 */

test.describe('capacidades de exportación', () => {
  test('sin WebCodecs: el video lo explica, sin botones MP4/WebM, y el GIF funciona', async ({ page }) => {
    await page.addInitScript(() => {
      for (const k of ['VideoEncoder', 'VideoDecoder', 'VideoFrame', 'AudioEncoder', 'EncodedVideoChunk']) delete (window as unknown as Record<string, unknown>)[k];
    });
    await openStudio(page);
    await openExport(page, 'Video y GIF');
    await expect(page.getByText('MP4 y WebM: no disponibles.')).toBeVisible();
    await expect(page.getByText(/no tiene WebCodecs/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'MP4 (H.264)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'WebM', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Empezar a grabar' })).toBeEnabled();
    await page.getByLabel('Duración (s)').fill('1');
    await page.locator('#gif-w').selectOption('320');
    const gif = await download(page, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
    expect(readFileSync(gif.path).subarray(0, 6).toString()).toBe('GIF89a');
  });

  test('sin códecs: filas que explican, sin botones MP4/WebM', async ({ page }) => {
    await page.addInitScript(() => {
      VideoEncoder.isConfigSupported = async () => ({ supported: false });
    });
    await openStudio(page);
    await openExport(page, 'Video y GIF');
    await expect(page.getByText('Video renderizado: no disponible.')).toBeVisible();
    await expect(page.getByText(/no puede codificar video en ningún tamaño/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'MP4 (H.264)' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'WebM', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descargar GIF' })).toBeEnabled();
  });

  test('un tamaño que no se puede codificar ofrece uno menor con un clic', async ({ page }) => {
    await page.addInitScript(() => {
      const real = VideoEncoder.isConfigSupported.bind(VideoEncoder);
      VideoEncoder.isConfigSupported = async c => (c.width * c.height > 1920 * 1080 ? { supported: false } : real(c));
    });
    await openStudio(page);
    await openExport(page, 'Video y GIF');
    await page.locator('#v-size').selectOption('4k');
    const row = page.locator('.ex-na', { hasText: 'Video a 3840×2160: no disponible.' });
    await expect(row).toBeVisible();
    await expect(page.getByRole('button', { name: 'WebM', exact: true })).toHaveCount(0);
    await row.getByRole('button', { name: /^Usar / }).click();
    await expect(page.locator('#v-size')).not.toHaveValue('4k');
    await expect(page.getByRole('button', { name: 'WebM', exact: true })).toBeEnabled();
  });

  test('sin MediaRecorder: la grabación en directo se explica', async ({ page }) => {
    await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).MediaRecorder; });
    await openStudio(page);
    await openExport(page, 'Video y GIF');
    await expect(page.getByText('Grabación en directo: no disponible.')).toBeVisible();
    await expect(page.getByText(/no tiene MediaRecorder/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Empezar a grabar' })).toHaveCount(0);
  });

  test('WebP que el navegador no codifica aparece como no disponible', async ({ page }) => {
    await page.addInitScript(() => {
      const P = HTMLCanvasElement.prototype;
      const toBlob = P.toBlob, toDataURL = P.toDataURL;
      // what old Safari does: asked for WebP, it silently hands back a PNG
      P.toBlob = function (cb, type, q) { return toBlob.call(this, cb, type === 'image/webp' ? 'image/png' : type, q); };
      P.toDataURL = function (type, q) { return toDataURL.call(this, type === 'image/webp' ? 'image/png' : type, q); };
    });
    await openStudio(page);
    await openExport(page, 'Imagen');
    await expect(page.getByText('WebP: no disponible.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'WEBP' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'JPEG' })).toBeVisible();
    await page.getByRole('button', { name: 'JPEG' }).click();
    const jpg = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
    expect(jpg.name).toMatch(/\.jpg$/);
    expect(readFileSync(jpg.path).subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });

  test('sin portapapeles, copiar selecciona el texto y lo dice', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined });
      document.execCommand = () => false;
    });
    await openStudio(page);
    await openExport(page, 'Texto y terminal');
    await expect(page.locator('.ansi-pre')).toBeVisible();
    await page.getByRole('button', { name: 'Copiar texto' }).click();
    await expect(page.getByText(/no da acceso al portapapeles/)).toBeVisible();
    const box = page.getByLabel('Texto para copiar a mano');
    await expect(box).toBeFocused();
    expect((await box.inputValue()).length).toBeGreaterThan(100);
    expect(await box.evaluate((t: HTMLTextAreaElement) => t.selectionEnd - t.selectionStart)).toBe((await box.inputValue()).length);
  });
});

test.describe('motor básico pedido', () => {
  test('?motor=basico: el aviso dice que lo pediste y «Usar el motor completo» lo quita', async ({ page }) => {
    await openStudio(page, '?motor=basico');
    const chip = page.locator('.bm-basic');
    await expect(chip).toContainText('Lo pediste con «?motor=basico»');
    await drawn(page, '.stage canvas');
    expect(await contextOf(page, '.stage canvas')).toBe('2d');
    await chip.getByRole('button', { name: '¿Por qué?' }).click();
    await page.getByRole('button', { name: 'Usar el motor completo' }).click();
    await expect(page).toHaveURL(/\/studio\/$/);
    await expect(page.locator('.seedline')).toBeVisible();
    await expect.poll(() => contextOf(page, '.stage canvas')).toBe('webgl2');
    await expect(page.locator('.bm-basic')).toHaveCount(0);
  });

  test('como preferencia guardada: se quita igual', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('mt.motor', 'basico'); } });
    await openStudio(page);
    const chip = page.locator('.bm-basic');
    await expect(chip).toContainText('Lo elegiste como preferencia en este navegador.');
    await chip.getByRole('button', { name: '¿Por qué?' }).click();
    await page.getByRole('button', { name: 'Usar el motor completo' }).click();
    // the page reloads meanwhile: a read that lands during the reload is simply tried again
    await expect.poll(() => page.evaluate(() => localStorage.getItem('mt.motor')).catch(() => 'recargando')).toBeNull();
    await expect.poll(() => contextOf(page, '.stage canvas').catch(() => 'none')).toBe('webgl2');
    await expect(page.locator('.bm-basic')).toHaveCount(0);
  });

  test('si WebGL pierde el contexto y no vuelve, el escenario pasa al motor básico', async ({ page }) => {
    await openStudio(page);
    await expect.poll(() => contextOf(page, '.stage canvas')).toBe('webgl2');
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>('.stage canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('.bm-basic')).toContainText('WebGL dejó de responder', { timeout: 10_000 });
    await drawn(page, '.stage canvas');
    expect(await contextOf(page, '.stage canvas')).toBe('2d');
  });
});

test('el único callejón sin salida que queda: ni siquiera Canvas 2D, y se dice por qué', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('/studio/');
  await expect(page.locator('.deck')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('no puede dibujar en un lienzo');
  await expect(page.locator('.stage canvas')).toHaveCount(0);
});
