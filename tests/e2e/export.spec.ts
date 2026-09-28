import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { deflateSync, gunzipSync } from 'node:zlib';
import { crc32 } from '../../src/shared/zip';
import { download, openStudio } from './helpers';

/** A colour gradient PNG made here (no fixtures): every cell gets a different luminance. */
function gradientPng(w: number, h: number): Buffer {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * row + 1 + x * 3;
    raw[o] = (255 * x) / w; raw[o + 1] = (255 * y) / h; raw[o + 2] = 255 * (1 - x / w);
  }
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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
    expect(parsed.glyphos).toBe('recipe');
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
    expect(await other.evaluate(() => typeof (window as unknown as { Glyphos?: unknown }).Glyphos)).toBe('object');
    expect(errors).toEqual([]);
  });

  test('código: póster PNG de respaldo; video: MP4 sólo si el navegador codifica H.264', async ({ page }) => {
    await openStudio(page);
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Código' }).click();
    const poster = await download(page, () => page.getByRole('button', { name: 'Descargar póster (PNG)' }).click());
    expect(poster.name).toMatch(/-poster\.png$/);
    expect(readFileSync(poster.path).subarray(1, 4).toString()).toBe('PNG');
    // before copying: what the code does without WebGL 2, and what each choice weighs
    const basicBtn = page.getByRole('button', { name: /^Motor básico \(\+\d+ KB\)$/ });
    await expect(basicBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/el procesador dibuja la misma pieza con Canvas 2D/)).toBeVisible();
    await expect(page.getByText(/Este código: \d+ KB \(\d+ KB comprimido con gzip/)).toBeVisible();
    const withBasic = (await page.getByRole('textbox', { name: 'Código' }).inputValue()).length;
    await page.getByRole('button', { name: 'Póster o color' }).click();
    await expect(page.getByText(/Sin WebGL 2 la pieza no se mueve/)).toBeVisible();
    const lighter = (await page.getByRole('textbox', { name: 'Código' }).inputValue()).length;
    expect(withBasic - lighter).toBeGreaterThan(30_000);

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

  test('una pieza se dibuja igual la primera vez que se abre y al volver a ella', async ({ page }) => {
    // a first visit on a slow connection (the font arrives after the first frames) and the same piece
    // reopened later must give the same picture; tests/unit/atlas-fonts.test.ts covers the glyph order itself
    const recipe = {
      v: 2, source: 'image', glyph: { cell: 10, aspect: 1.2, charset: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", font: 'jetbrains' },
      color: { mode: 'source', vivid: 0.8, stops: ['#000000', '#ffffff'], bg: '#050505' }, interact: { mode: 'none' }, fx: { cellBg: 0.35 },
      meta: { name: 'Primera vez', space: 'media' },
    };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // a slow connection: the piece's font arrives after the first frames were drawn
    const font = /jetbrains-mono-latin-500-normal[^/]*\.woff2$/;
    await page.route(font, async r => { await new Promise(res => setTimeout(res, 2500)); await r.continue(); });
    await openStudio(page, '#r=j' + Buffer.from(JSON.stringify(recipe)).toString('base64url'));
    await expect.poll(() => page.evaluate(() => document.fonts.check('500 20px "JetBrains Mono"')), { timeout: 20_000 }).toBe(true);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Elegir imagen' }).first().click();
    await (await chooser).setFiles({ name: 'degradado.png', mimeType: 'image/png', buffer: gradientPng(480, 320) });
    await expect(page.getByRole('region', { name: 'Cargar fuente' })).toHaveCount(0);
    const png = async () => {
      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Imagen' }).click();
      const f = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      await page.keyboard.press('Escape');
      return readFileSync(f.path);
    };
    const first = await png();
    await page.unroute(font);
    await page.reload();
    await expect(page.locator('.seedline')).toContainText('Primera vez');
    await expect(page.getByRole('region', { name: 'Cargar fuente' })).toHaveCount(0);
    const again = await png();
    expect(again.equals(first)).toBe(true);
  });

  test('el código exportado vuelve a dibujar cuando su tipografía llega tarde', async ({ page, browser }) => {
    // exported code fetches its font from Google Fonts: on a slow connection the font lands after the
    // runtime stopped waiting (5 s), and a still piece («reducir movimiento») kept the fallback face for good
    const recipe = {
      v: 2, source: 'pattern', layers: [{ pattern: 'marmol', a: 0.45, b: 0.35 }], glyph: { cell: 12, charset: ' .:-=+*#%@', font: 'jetbrains', weight: 500 },
      color: { stops: ['#2b0d06', '#ff5b1f', '#ffe9c7'], bg: '#0b0708' }, interact: { mode: 'none' }, meta: { name: 'Tipografía lenta', space: 'arte' },
    };
    await openStudio(page, '#r=j' + Buffer.from(JSON.stringify(recipe)).toString('base64url'));
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Código' }).click();
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
    const file = test.info().outputPath('lenta.html');
    await d.saveAs(file);
    const woff2 = readFileSync('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2').toString('base64');
    /** The exported page, whose font is added `late` (after its first frames) or before it starts. */
    const still = async (late: boolean) => {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
      // no network here: the stylesheet fails at once, and the face is added by hand
      await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 404, body: '' }));
      const p = await ctx.newPage();
      const addFace = (b64: string) => {
        const f = new FontFace('JetBrains Mono', `url(data:font/woff2;base64,${b64})`, { weight: '100 800' });
        document.fonts.add(f);
        return f.load().then(() => true);
      };
      if (!late) await p.addInitScript(`(${addFace.toString()})(${JSON.stringify(woff2)})`);
      await p.goto('file://' + file);
      await p.waitForTimeout(2500);
      const before = await p.locator('canvas').first().screenshot();
      if (late) {
        await p.evaluate(addFace, woff2);
        await p.waitForTimeout(1500);
      }
      const after = await p.locator('canvas').first().screenshot();
      await ctx.close();
      return { before, after };
    };
    const onTime = await still(false);
    const late = await still(true);
    expect(late.before.equals(onTime.after), 'antes de llegar la tipografía se ve la de reserva').toBe(false);
    expect(late.after.equals(onTime.after), 'cuando llega, el mismo fotograma que con ella a tiempo').toBe(true);
  });

  test('con Estela, un bucle perfecto exportado enlaza: su primer fotograma ya lleva la estela', async ({ page }) => {
    test.setTimeout(240_000);
    // Estela keeps a trail from frame to frame: a clip that started cold opened with no trail (a seam when it
    // loops). Two loops of the piece as terminal frames: frame 0 must be the frame one loop later, character
    // for character (the frames are exact grids, not compressed video)
    const recipe = {
      v: 2, source: 'text', text: { content: 'LUZ', font: 'martian', weight: 800, size: 0.9 },
      media: { xform: [{ kind: 'ondular', on: true, amount: 0.7, p: 0.5 }, { kind: 'estela', on: true, amount: 0.8, p: 0.35 }] },
      glyph: { cell: 12, charset: ' .:-=+*#%@', font: 'jetbrains' }, color: { stops: ['#10131c', '#3f7bd9', '#f4e9c8'], bg: '#07090f' },
      motion: { speed: 1, loop: 2 }, interact: { mode: 'none' }, meta: { name: 'Estela en bucle', space: 'tipo' },
    };
    await openStudio(page, '#r=j' + Buffer.from(JSON.stringify(recipe)).toString('base64url'));
    await page.keyboard.press('e');
    await page.getByRole('tab', { name: 'Texto y terminal' }).click();
    await page.locator('.ex-anim').getByLabel('Duración (s)').fill('4');
    const script = await download(page, () => page.getByRole('button', { name: /Script de Node/ }).click());
    const src = readFileSync(script.path, 'utf8');
    const fps = Number(/const FPS = (\d+)/.exec(src)![1]);
    const frames: string[] = JSON.parse(gunzipSync(Buffer.from(/Buffer\.from\("([^"]+)"/.exec(src)![1], 'base64')).toString('utf8'));
    expect(frames.length).toBe(4 * fps);
    expect(frames[fps / 2], 'la pieza se mueve').not.toBe(frames[0]);
    expect(frames[2 * fps], 'un bucle después, el mismo fotograma').toBe(frames[0]);
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
