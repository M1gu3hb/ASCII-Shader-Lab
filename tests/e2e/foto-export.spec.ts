import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { unzip } from '../../src/shared/zip';
import { download } from './helpers';
import { needsFotoStudio, finalRender, openFoto, project } from './foto-helpers';

/**
 * The photo studio's export sheet. Preview = export: the PNG at 1× is, pixel for pixel, the viewport's final
 * render at 100 %; JPEG/WebP only when this browser encodes them; transparency is real; each part comes out
 * separately; text only from real characters, and the text of a frame is what the studio draws for that frame
 * (its characters, drawn again with the studio's glyph drawing, give the compositor's pixels); an animated glyph
 * layer's .cast holds those frames; the README bundle; the sheet says each format's limits; cancel stops.
 */
needsFotoStudio();

type W = Window & { __foto: Record<string, any>; __fotoExport: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function fromTemplate(page: Page, name: RegExp) {
  await page.locator('.fs-tpl-main', { hasText: name }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
}

async function openExport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Exportar' });
  await expect(sheet.locator('.xp-fmts')).toBeVisible({ timeout: 30_000 });
  return sheet;
}

async function pickWhat(page: Page, sheet: Locator, option: RegExp) {
  await sheet.getByRole('combobox', { name: 'Qué exportar' }).click();
  await page.getByRole('listbox').getByRole('option', { name: option }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

const pickFormat = (sheet: Locator, name: string) => sheet.getByRole('radio', { name, exact: true }).check();
const exportButton = (sheet: Locator) => sheet.locator('.xp-btns .btn.primary');
const exportNow = (page: Page, sheet: Locator) => download(page, () => exportButton(sheet).click());

/** Pixels of an image file (PNG/JPEG/WebP), unpremultiplied, read in the page. */
async function pixelsOf(page: Page, file: Buffer, type: string) {
  return page.evaluate(async ([b64, t]) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: t }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, solid = 0, grey = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) clear++; else if (d[i + 3] === 255) solid++;
      if (d[i] === d[i + 1] && d[i + 1] === d[i + 2]) grey++;
    }
    return { w: bmp.width, h: bmp.height, clear, solid, grey, total: d.length / 4 };
  }, [file.toString('base64'), type] as const);
}

/** Differences between the viewport's art canvas and a PNG, both read unpremultiplied. */
async function compareWithArt(page: Page, png: Buffer) {
  return page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const art = document.querySelector<HTMLCanvasElement>('.fv-art')!;
    const a = art.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, art.width, art.height).data;
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let differ = 0, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      let m = 0;
      for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(a[i + k] - d[i + k]));
      if (m) { differ++; max = Math.max(max, m); }
    }
    return { size: [bmp.width, bmp.height, art.width, art.height], differ, max };
  }, png.toString('base64'));
}

/**
 * A glyph layer's frame at t: its characters drawn again with the studio's glyph drawing, against the
 * compositor's own render of the layer alone. Premultiplied comparison (edges of glyphs are partly
 * transparent); colours may differ by the drawing's 5-bit grouping of picture colours (≤ 8 of 255).
 */
async function textEqualsDrawn(page: Page, id: string, t: number) {
  return page.evaluate(async ([id, t]) => {
    const r = await (window as unknown as W).__fotoExport.drawnVsText(id, t);
    const read = async (url: string) => {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const a = await read(r.text), b = await read(r.drawn);
    let differ = 0, ink = 0, max = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] || b[i + 3]) ink++;
      let m = Math.abs(a[i + 3] - b[i + 3]);
      for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs((a[i + k] * a[i + 3] - b[i + k] * b[i + 3]) / 255));
      max = Math.max(max, m);
      if (m > 8) differ++;
    }
    return { differ, ink, max, n: a.length / 4 };
  }, [id, t] as const);
}

/** Adds a characters layer from the layer menu; returns its id. */
async function addGlyphLayer(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Añadir capa' }).click();
  await page.getByRole('menuitem', { name: /Caracteres reales/ }).click();
  await finalRender(page);
  const p = await project(page);
  return p.layers.filter(l => l.kind === 'glyphs').at(-1)!.id;
}

test('el PNG exportado a 1× es, píxel a píxel, la vista final al 100 %; JPEG y WebP cuando este navegador los codifica', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Zonas circulares/);
  const p = await project(page);
  const n = await page.evaluate(() => (window as unknown as W).__foto.ui().render.n);
  await page.locator('.fv-over').hover();
  await page.keyboard.press('1');
  const r = await finalRender(page, n);
  expect(r.scale).toBe(1);
  const sheet = await openExport(page);
  await expect(sheet.getByRole('radio', { name: 'PNG', exact: true })).toBeChecked();
  // the sheet's preview is drawn: the same code, smaller
  await expect(sheet.locator('.xp-view canvas')).toBeVisible();
  const png = await exportNow(page, sheet);
  expect(png.name).toBe('glyphos-zonas-circulares.png');
  const cmp = await compareWithArt(page, readFileSync(png.path));
  expect(cmp.size).toEqual([p.canvas.w, p.canvas.h, p.canvas.w, p.canvas.h]);
  expect(cmp.differ, `píxeles distintos (máx. ${cmp.max})`).toBe(0);
  await expect(sheet.locator('.xp-res')).toContainText('Descargado: glyphos-zonas-circulares.png');

  const encodes = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const t = async (m: string) => (await new Promise<Blob | null>(res => c.toBlob(res, m)))?.type === m;
    return { jpeg: await t('image/jpeg'), webp: await t('image/webp') };
  });
  for (const [label, mime, magic] of [['JPEG', 'image/jpeg', 'ffd8ff'], ['WebP', 'image/webp', '52494646']] as const) {
    const ok = label === 'JPEG' ? encodes.jpeg : encodes.webp;
    const radio = sheet.getByRole('radio', { name: label, exact: true });
    if (!ok) {
      // said, not faked: disabled with the reason and PNG instead
      await expect(radio).toBeDisabled();
      await expect(sheet.locator('.xp-fmt', { hasText: label }).first()).toContainText(`no codifica ${label}`);
      continue;
    }
    await radio.check();
    await expect(exportButton(sheet)).toHaveText(`Exportar ${label}`);
    const f = await exportNow(page, sheet);
    const bytes = readFileSync(f.path);
    expect(bytes.subarray(0, magic.length / 2).toString('hex')).toBe(magic);
    if (label === 'WebP') expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
    const px = await pixelsOf(page, bytes, mime);
    expect([px.w, px.h]).toEqual([p.canvas.w, p.canvas.h]);
    expect(px.solid).toBe(px.total);
  }
  // another size: 1080 × 1350 covers (a centred crop)
  await pickFormat(sheet, 'PNG');
  await sheet.getByRole('combobox', { name: 'Tamaño' }).click();
  await page.getByRole('listbox').getByRole('option', { name: /1080 × 1350/ }).first().click();
  await expect(sheet.locator('.xp-sum')).toContainText('1080 × 1350 px');
  const sized = await exportNow(page, sheet);
  expect(sized.name).toBe('glyphos-zonas-circulares-ig45.png');
  const spx = await pixelsOf(page, readFileSync(sized.path), 'image/png');
  expect([spx.w, spx.h]).toEqual([1080, 1350]);
  expect(errors).toEqual([]);
});

test('transparencia real en PNG; cada parte por separado (capa, máscara, original, recorte y mate, proyecto)', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  // only the characters of the ASCII layer, over a transparent canvas without the photo
  await page.locator('.lr', { hasText: 'ASCII' }).locator('.lr-main').click();
  await page.getByRole('switch', { name: 'Con su fondo (como en el laboratorio)' }).setChecked(false, { force: true });
  await page.getByRole('button', { name: /^Ocultar «Foto original»/ }).click();
  await page.getByRole('button', { name: /^Lienzo/ }).click();
  await page.getByRole('switch', { name: 'Fondo transparente' }).setChecked(true, { force: true });
  expect((await project(page)).canvas.transparent).toBe(true);
  // a mask on the ASCII layer, and a cut-out source made from the photo (as the cut-out panel stores one)
  await page.evaluate(() => {
    const F = (window as unknown as W).__foto;
    const p = F.project();
    const ascii = p.layers.find((l: { kind: string }) => l.kind === 'ascii');
    F.ps.updateLayer(ascii.id, (l: { mask: unknown }) => { l.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.2, y: 0.2, w: 0.6, h: 0.6, rot: 0, soft: 0, alpha: 1 }] }; });
    F.ps.edit((d: { sources: unknown[] }) => { const s = p.sources[0]; d.sources.push({ id: 'recorte1', kind: 'cutout', name: 'Sujeto', media: [s.media[0]], w: s.w, h: s.h, cutout: { from: s.id, matte: s.media[0] } }); });
  });
  await finalRender(page);
  const sheet = await openExport(page);
  await expect(sheet.getByRole('switch', { name: 'Fondo transparente' })).toBeChecked();
  await expect(sheet.getByText('La composición tiene zonas transparentes')).toBeVisible({ timeout: 30_000 });
  const png = await exportNow(page, sheet);
  const alpha = await pixelsOf(page, readFileSync(png.path), 'image/png');
  expect(alpha.clear).toBeGreaterThan(1000);
  expect(alpha.total - alpha.clear).toBeGreaterThan(1000);

  // a layer alone
  await pickWhat(page, sheet, /Capa sola: ASCII/);
  const layer = await exportNow(page, sheet);
  expect(layer.name).toMatch(/capa-ascii\.png$/);
  // its mask, grey (white shows)
  await pickWhat(page, sheet, /Máscara de ASCII/);
  await expect(sheet.getByRole('radio', { name: 'PNG en grises' })).toBeChecked();
  const mask = await exportNow(page, sheet);
  expect(mask.name).toMatch(/mascara-ascii\.png$/);
  const mpx = await pixelsOf(page, readFileSync(mask.path), 'image/png');
  expect(mpx.grey).toBe(mpx.total);
  // the original, untouched
  await pickWhat(page, sheet, /Original:/);
  const orig = await exportNow(page, sheet);
  expect(orig.name).toMatch(/paisaje/);
  // the cut-out and its matte
  await pickWhat(page, sheet, /Recorte y mate: Sujeto/);
  const cut = await exportNow(page, sheet);
  expect(cut.name).toMatch(/\.png$/);
  await pickFormat(sheet, 'Mate (PNG en grises)');
  expect((await exportNow(page, sheet)).name).toMatch(/\.png$/);
  // the project file
  await pickWhat(page, sheet, /El proyecto/);
  await expect(sheet.locator('.xp-files')).toContainText('proyecto.glyphos.json');
  const zipFile = await exportNow(page, sheet);
  expect(zipFile.name).toMatch(/\.glyphos\.zip$/);
  const names = (await unzip(new Uint8Array(readFileSync(zipFile.path)))).map(f => f.name);
  expect(names).toContain('proyecto.glyphos.json');
  expect(names.some(n => n.startsWith('medios/'))).toBe(true);
  expect(errors).toEqual([]);
});

test('el texto sale sólo de caracteres reales y es lo que el estudio dibuja: TXT, ANSI, HTML, SVG, copiar', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  let sheet = await openExport(page);
  // no characters layer: said honestly
  await pickWhat(page, sheet, /Texto \(no hay capas de caracteres reales\)/);
  await expect(sheet.locator('.xp-fmt.off').first()).toContainText('render de shader (una imagen, no texto)');
  await expect(exportButton(sheet)).toBeDisabled();
  await page.keyboard.press('Escape');

  const id = await addGlyphLayer(page);
  sheet = await openExport(page);
  await pickWhat(page, sheet, /Caracteres de «Caracteres»/);
  await expect(sheet.getByRole('radio', { name: 'Texto (TXT)' })).toBeChecked();
  await expect(sheet.locator('.xp-text')).toBeVisible();
  const want = await page.evaluate(id => (window as unknown as W).__fotoExport.frameText(id, 0), id);
  expect(want.text.split('\n').length).toBeGreaterThan(10);
  // what TXT holds is the frame's text; the same is what «Copiar el texto» copies
  const txt = await exportNow(page, sheet);
  expect(readFileSync(txt.path, 'utf8')).toBe(want.text);
  await sheet.getByRole('button', { name: 'Copiar el texto' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(want.text);
  // and that text is what the compositor draws: its characters drawn again give the layer's pixels
  const same = await textEqualsDrawn(page, id, 0);
  expect(same.ink).toBeGreaterThan(5000);
  expect(same.differ, `píxeles distintos (máx. ${same.max})`).toBe(0);

  await pickFormat(sheet, 'ANSI (color de terminal)');
  const ansi = readFileSync((await exportNow(page, sheet)).path, 'utf8');
  expect(ansi).toMatch(/\x1b\[38;2;/);
  const plain = ansi.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  expect(plain).toBe(want.text);
  await pickFormat(sheet, 'HTML');
  const html = readFileSync((await exportNow(page, sheet)).path, 'utf8');
  expect(html).toMatch(/^<!doctype html>/);
  const lines = await page.evaluate(h => { const d = new DOMParser().parseFromString(h, 'text/html'); return d.querySelector('pre')!.textContent!; }, html);
  expect(lines.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/^\n/, '') + '\n').toBe(want.text);
  await pickFormat(sheet, 'SVG con texto');
  await expect(sheet.locator('.xp-view img')).toBeVisible();
  const svg = readFileSync((await exportNow(page, sheet)).path, 'utf8');
  expect(svg).toMatch(/^<svg/);
  const svgText = await page.evaluate(s => { const d = new DOMParser().parseFromString(s, 'image/svg+xml'); return [...d.querySelectorAll('text')].map(t => t.textContent).join('').replace(/\s/g, ''); }, svg);
  expect(svgText).toBe(want.text.replace(/\s/g, ''));
  expect(errors).toEqual([]);
});

test('una capa de caracteres animada: el .cast guarda los cuadros tal como se dibujan; cancelar no guarda nada', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  const id = await addGlyphLayer(page);
  // «Escritura de terminal» over 2.5 s of a 3 s project at 12 fps
  await page.evaluate(id => {
    const F = (window as unknown as W).__foto;
    F.ps.edit((d: { time: { duration: number; fps: number } }) => { d.time.duration = 3; d.time.fps = 12; });
    F.ps.updateLayer(id, (l: { clips: unknown[] }) => { l.clips.push({ id: 'tecleo', template: 'escritura', start: 0, dur: 2.5, params: { unidad: 'linea' }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }); });
  }, id);
  await finalRender(page);
  const sheet = await openExport(page);
  await sheet.getByRole('radio', { name: 'Terminal', exact: true }).click();
  await expect(sheet.getByRole('combobox', { name: 'Qué exportar' })).toContainText('Caracteres de «Caracteres»');
  await expect(sheet.getByRole('radio', { name: 'Grabación de terminal (.cast)' })).toBeChecked();
  await expect(sheet.locator('.xp-sum')).toContainText('36 cuadros');
  const cast = await exportNow(page, sheet);
  expect(cast.name).toMatch(/\.cast$/);
  const events = readFileSync(cast.path, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const frames = events.slice(2, -1) as Array<[number, string, string]>;
  expect(frames).toHaveLength(36);
  const want = await page.evaluate(id => (window as unknown as W).__fotoExport.framesText(id, { fps: 12, from: 0, to: 3 }), id);
  expect(events[0]).toMatchObject({ version: 2, width: want.cols, height: want.rows });
  const texts = frames.map(f => f[2].replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').split('\r\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, ''));
  expect(texts).toEqual(want.texts.map((t: string) => t.replace(/\n+$/, '')));
  // typing: the text grows, then holds
  expect(texts[0].replace(/\s/g, '').length).toBeLessThan(texts[20].replace(/\s/g, '').length);
  // the frames as text are the frames as drawn (a cursor, hidden and swapped cells included)
  for (const t of [0.5, 1.25, 2.9]) {
    const same = await textEqualsDrawn(page, id, t);
    expect(same.differ, `t=${t}: píxeles distintos (máx. ${same.max})`).toBe(0);
  }
  // the web player: a snippet that plays these frames as text, with nothing fetched from anywhere
  await sheet.getByRole('radio', { name: 'Web', exact: true }).click();
  await pickWhat(page, sheet, /Caracteres de «Caracteres»/);
  await pickFormat(sheet, 'Código para tu web');
  const web = await exportNow(page, sheet);
  expect(web.name).toMatch(/-web\.html$/);
  const snippet = readFileSync(web.path, 'utf8');
  await expect(sheet.locator('.xp-snip textarea')).toHaveValue(/glyphos-texto/);
  const player = await page.context().newPage();
  const requests: string[] = [];
  player.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('about:')) requests.push(r.url()); });
  await player.emulateMedia({ reducedMotion: 'reduce' });
  await player.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;width:1200px">${snippet}</body>`);
  const shown = () => player.evaluate(() => document.querySelector('.glyphos-texto pre')!.textContent!.split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, ''));
  // with reduced motion: the last frame, still
  expect(await shown()).toBe(want.texts[35].replace(/\n+$/, ''));
  await player.locator('.glyphos-texto').click();
  await expect.poll(shown, { timeout: 5000 }).not.toBe(want.texts[35].replace(/\n+$/, ''));
  expect(want.texts.map((t: string) => t.replace(/\n+$/, ''))).toContain(await shown());
  expect(requests).toEqual([]);
  await player.close();

  // the player preview plays those frames
  await sheet.getByRole('radio', { name: 'Terminal', exact: true }).click();
  await sheet.getByRole('button', { name: 'Reproducir los 36 cuadros' }).click();
  await expect(sheet.getByRole('button', { name: 'Parar la vista previa' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Parar la vista previa' }).click();

  // a long export, cancelled: progress with time left, then nothing saved
  await page.evaluate(() => {
    const F = (window as unknown as W).__foto;
    F.ps.edit((d: { time: { duration: number } }) => { d.time.duration = 120; });
  });
  await page.keyboard.press('Escape');
  const again = await openExport(page);
  await again.getByRole('radio', { name: 'Terminal', exact: true }).click();
  await pickFormat(again, 'Reproductor Node.js');
  await expect(again.locator('.xp-sum')).toContainText('1440 cuadros');
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await exportButton(again).click();
  await expect(again.getByRole('progressbar', { name: 'Progreso de la exportación' })).toBeVisible();
  await expect(again.locator('.xp-busy-row')).toContainText(/Cuadro \d+ de 1440/);
  await again.getByRole('button', { name: 'Cancelar' }).click();
  await expect(again.locator('.xp-res')).toHaveText('Cancelado: no se guardó nada.');
  await page.waitForTimeout(500);
  expect(downloaded).toBe(false);
  await expect(exportButton(again)).toBeEnabled();
  expect(errors).toEqual([]);
});

test('README: la pieza como imagen y su texto, listos para GitHub; el paquete trae lo que dice', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  const id = await addGlyphLayer(page);
  const sheet = await openExport(page);
  await sheet.getByRole('radio', { name: 'README', exact: true }).click();
  await expect(sheet.getByRole('radio', { name: 'Paquete README (.zip)' })).toBeChecked();
  await expect(sheet.locator('.xp-readme')).toBeVisible();
  await expect(sheet.locator('.xp-readme-code')).not.toBeEmpty();
  const zipFile = await exportNow(page, sheet);
  expect(zipFile.name).toMatch(/-readme\.zip$/);
  const files = await unzip(new Uint8Array(readFileSync(zipFile.path)));
  expect(files.map(f => f.name).sort()).toEqual(['README.md', 'pieza.png', 'pieza.txt']);
  const md = await files.find(f => f.name === 'README.md')!.text();
  const txt = await files.find(f => f.name === 'pieza.txt')!.text();
  const want = await page.evaluate(id => (window as unknown as W).__fotoExport.frameText(id, 0), id);
  expect(txt).toBe(want.text);
  expect(md).toContain('<img src="pieza.png"');
  expect(md).toContain('```text\n' + want.text);
  const img = await pixelsOf(page, Buffer.from(await files.find(f => f.name === 'pieza.png')!.read()), 'image/png');
  expect(img.w).toBe(800);
  // the snippet to paste is shown, with a copy button
  await expect(sheet.locator('.xp-snip textarea')).toHaveValue(/<img src="pieza\.png"/);
  expect(errors).toEqual([]);
});

test('la hoja dice los límites de cada formato; SVG vectorial sólo cuando es fiel', async ({ page }) => {
  const errors = await openFoto(page);
  await fromTemplate(page, /Zonas circulares/);
  let sheet = await openExport(page);
  // each format has its one line
  await expect(sheet.locator('.xp-fmt', { hasText: 'WebP' }).first()).toContainText('algunos programas');
  // SVG: not faithful here, and why; an SVG with an image, labelled as such
  const svgRow = sheet.locator('.xp-fmt', { hasText: 'SVG (vector)' });
  await expect(sheet.getByRole('radio', { name: 'SVG (vector)' })).toBeDisabled();
  await expect(svgRow).toContainText('Aquí no sería fiel: la composición tiene fotos, ASCII de shader, acabados de píxel y máscaras.');
  // moving formats: this project does not move
  await expect(sheet.locator('.xp-fmt.off', { hasText: 'MP4' })).toContainText('El proyecto no se mueve');
  await svgRow.getByRole('button', { name: /Usar SVG con imagen/ }).click();
  await expect(sheet.getByRole('radio', { name: 'SVG con imagen (no es vector)' })).toBeChecked();
  await expect(sheet.locator('.xp-more')).toContainText('Por qué no es vector');
  const img = readFileSync((await exportNow(page, sheet)).path, 'utf8');
  expect(img).toContain('NO es vector');
  expect(img).toMatch(/<image [^>]*href="data:image\/png;base64,/);
  // print sizes: the memory note
  await pickFormat(sheet, 'PNG');
  await sheet.getByRole('radio', { name: 'Cartel para imprimir', exact: true }).click();
  await expect(sheet.locator('.xp-sum')).toContainText('3508 × 2480 px');
  await expect(sheet.locator('.xp-opts')).toContainText(/Memoria: cada lienzo ocupa unos \d+ MB/);
  await page.keyboard.press('Escape');

  // only characters, a text and a shape: the SVG is vector
  await page.evaluate(() => {
    const F = (window as unknown as W).__foto;
    F.ps.edit((d: { layers: Array<{ kind: string; visible: boolean; mask: unknown; finishes: unknown[] }> }) => {
      for (const l of d.layers) if (l.kind !== 'glyphs') l.visible = false;
    });
  });
  const gid = await addGlyphLayer(page);
  await page.evaluate(() => {
    const F = (window as unknown as W).__foto;
    F.ps.edit((d: { layers: unknown[] }) => {
      d.layers.push({ id: 'titulo', name: 'Título', kind: 'text', visible: true, locked: false, opacity: 1, blend: 'normal', mask: null, span: null, xf: { x: 0, y: 0, scale: 1, rot: 0 }, finishes: [], clips: [],
        text: 'Hola SVG', font: 'jetbrains', weight: 700, size: 0.08, color: '#ff5b1f', align: 'left', box: { x: 0.05, y: 0.05, w: 0.9 }, tracking: 0, leading: 1.2, italic: false, upper: false });
      d.layers.push({ id: 'marco', name: 'Marco', kind: 'shape', visible: true, locked: false, opacity: 1, blend: 'normal', mask: null, span: null, xf: { x: 0, y: 0, scale: 1, rot: 0 }, finishes: [], clips: [],
        shape: 'callout', pts: [0.5, 0.5, 0.8, 0.2], stroke: '#ede6da', width: 2, fill: null, dash: null, label: { text: 'FL33', font: 'jetbrains', size: 0.03, color: '#ede6da' } });
    });
  });
  await finalRender(page);
  sheet = await openExport(page);
  await expect(sheet.getByRole('radio', { name: 'SVG (vector)' })).toBeEnabled({ timeout: 30_000 });
  await pickFormat(sheet, 'SVG (vector)');
  await expect(sheet.locator('.xp-view img')).toBeVisible();
  const vec = readFileSync((await exportNow(page, sheet)).path, 'utf8');
  expect(vec).not.toContain('<image');
  const parsed = await page.evaluate(s => {
    const d = new DOMParser().parseFromString(s, 'image/svg+xml');
    return { err: !!d.querySelector('parsererror'), texts: [...d.querySelectorAll('text')].map(t => t.textContent ?? ''), paths: d.querySelectorAll('path, circle, rect').length };
  }, vec);
  expect(parsed.err).toBe(false);
  expect(parsed.texts).toContain('Hola SVG');
  expect(parsed.texts).toContain('FL33');
  const glyphText = await page.evaluate(id => (window as unknown as W).__fotoExport.frameText(id, 0), gid);
  expect(parsed.texts.join('').replace(/\s/g, '')).toContain(glyphText.text.replace(/\s/g, '').slice(0, 200));
  expect(parsed.paths).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ moving pictures (lane video) */

/**
 * Thresholds (the same as lane video's own spec, tests/e2e/video.spec.ts): the PNG sequence is lossless, so its
 * frames must equal a fresh render at the same time (MAE ≤ 0.5 of 255: only the PNG round trip); video is lossy,
 * 26 dB PSNR is the floor for «same picture, codec loss only», and each decoded frame must be closer to render(t)
 * than to render(t ± one frame) — a one-frame shift fails that; GIF (256 colours, dithering): MAE ≤ 14.
 */
type MovieCmp = Array<{ t: number; mae: number; psnr: number; maePrev: number | null; maeNext: number | null; w: number; h: number }>;

async function movieFormatsHere(page: Page): Promise<Array<{ format: string; available: boolean; alpha: boolean; audio: boolean }>> {
  return page.evaluate(() => (window as unknown as W).__fotoExport.movieFormats());
}

function expectFrames(c: MovieCmp, o: { minPsnr?: number; maxMae?: number }) {
  expect(c.length).toBeGreaterThanOrEqual(3);
  for (const f of c) {
    if (o.minPsnr !== undefined) expect(f.psnr, `t=${f.t}`).toBeGreaterThanOrEqual(o.minPsnr);
    if (o.maxMae !== undefined) expect(f.mae, `t=${f.t}`).toBeLessThanOrEqual(o.maxMae);
    if (f.maePrev !== null && Number.isFinite(f.maePrev)) expect(f.mae, `t=${f.t} frente al cuadro anterior`).toBeLessThan(f.maePrev);
    if (f.maeNext !== null && Number.isFinite(f.maeNext)) expect(f.mae, `t=${f.t} frente al cuadro siguiente`).toBeLessThan(f.maeNext);
  }
}

const b64 = (path: string) => readFileSync(path).toString('base64');
const MIME: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', zip: 'application/zip' };
const NO_VIDEO = 'Esta rama todavía no tiene la exportación de video (src/video es el contrato vacío): se prueba cuando el carril «video» se fusione.';

test('video, GIF y cuadros de una animación de foto: decodificados, son los cuadros del estudio', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  const id = await addGlyphLayer(page);
  await page.evaluate(id => {
    const F = (window as unknown as W).__foto;
    F.ps.edit((d: { time: { duration: number; fps: number } }) => { d.time.duration = 1; d.time.fps = 12; });
    F.ps.updateLayer(id, (l: { clips: unknown[] }) => { l.clips.push({ id: 'tecleo', template: 'escritura', start: 0, dur: 1, params: { unidad: 'linea' }, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }); });
  }, id);
  await finalRender(page);
  const sheet = await openExport(page);
  const formats = await movieFormatsHere(page);
  test.skip(!formats.length, NO_VIDEO);
  const p = await project(page);
  for (const f of formats) {
    const radio = sheet.locator(`input[name="xp-format"][value="${f.format}"]`);
    if (!f.available) {
      await expect(radio).toBeDisabled();
      continue;
    }
    await radio.check();
    await expect(sheet.locator('.xp-sum')).toContainText('12 cuadros');
    const file = await exportNow(page, sheet);
    const ext = file.name.split('.').pop()!;
    const info = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.inspectMovie(d, t), [b64(file.path), MIME[ext]] as const);
    if (f.format === 'gif') { expect(info.gif.frames).toBe(12); expect([info.gif.w, info.gif.h]).toEqual([p.canvas.w, p.canvas.h]); }
    else if (f.format === 'png-zip') { expect(info.zip.pngs).toBe(12); expect([info.zip.w, info.zip.h]).toEqual([p.canvas.w, p.canvas.h]); }
    else { expect(info.video.frames).toBe(12); expect([info.video.w, info.video.h]).toEqual([p.canvas.w, p.canvas.h]); }
    const cmp: MovieCmp = await page.evaluate(([d, t, w]) => (window as unknown as W).__fotoExport.compareMovie(d, t, { fps: 12, start: 0, end: 1, width: w, transparent: false }), [b64(file.path), MIME[ext], p.canvas.w] as const);
    if (f.format === 'png-zip') expectFrames(cmp, { maxMae: 0.5 });
    else if (f.format === 'gif') expectFrames(cmp, { maxMae: 14 });
    else expectFrames(cmp, { minPsnr: 26 });
    await expect(sheet.locator('.xp-res')).toContainText('Descargado:');
  }
  expect(errors).toEqual([]);
});

test('un video con sonido: MP4/WebM con el sonido del original y los cuadros del estudio', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await openFoto(page);
  await fromTemplate(page, /Foto → ASCII completo/);
  // the sheet's code (and its test hooks) loads with the sheet
  let sheet = await openExport(page);
  const formats = await movieFormatsHere(page);
  test.skip(!formats.length, NO_VIDEO);
  await page.keyboard.press('Escape');
  const clip = await page.evaluate(() => (window as unknown as W).__fotoExport.makeVideoProject({ w: 320, h: 180, fps: 12, seconds: 1.5 }));
  await finalRender(page);
  sheet = await openExport(page);
  // a video project opens on a video format
  await expect(sheet.locator('input[name="xp-format"][value="mp4"], input[name="xp-format"][value="webm"]').and(sheet.locator(':checked'))).toHaveCount(1);
  await expect(sheet.locator('.xp-sum')).toContainText('18 cuadros');
  const here = await movieFormatsHere(page);
  let checked = 0;
  for (const fmt of ['webm', 'mp4']) {
    const radio = sheet.locator(`input[name="xp-format"][value="${fmt}"]`);
    if (!(await radio.isEnabled())) continue;
    await radio.check();
    if (clip.sound) await sheet.getByRole('radio', { name: 'Conservar el del video' }).check();
    const file = await exportNow(page, sheet);
    const ext = file.name.split('.').pop()!;
    const info = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.inspectMovie(d, t), [b64(file.path), MIME[ext]] as const);
    expect(info.video.frames).toBe(18);
    expect([info.video.w, info.video.h]).toEqual([320, 180]);
    // the sound: said after the export; when it went in, the tone is there and lasts as long as the picture
    await expect(sheet.locator('.xp-res')).toContainText(/[Ss]onido/);
    if (clip.sound && here.find(f => f.format === fmt)?.audio) {
      expect(info.audio, 'el video exportado no trae sonido').toBeTruthy();
      expect(info.audio.peak).toBeGreaterThan(0.2);
      expect(Math.abs(info.audio.duration - info.video.duration)).toBeLessThan(0.1);
    }
    const cmp: MovieCmp = await page.evaluate(([d, t]) => (window as unknown as W).__fotoExport.compareMovie(d, t, { fps: 12, start: 0, end: 1.5, width: 320, transparent: false }), [b64(file.path), MIME[ext]] as const);
    expectFrames(cmp, { minPsnr: 26 });
    checked++;
  }
  expect(checked, 'ningún formato de video disponible aquí').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
