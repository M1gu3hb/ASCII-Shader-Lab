import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { download } from './helpers';
import { finalRender, openFoto, PHOTO, PHOTO2, project, renderCount, startFromPhoto } from './foto-helpers';

/**
 * The extras of the photo studio, in the real page: every poster applied to the fixture photo exports a PNG
 * equal to the preview (and keeps before/after and versions working); a saved setting made on one photo
 * applies to another (and travels as a file); three photos become an animation exported as PNG frames; a
 * parallax move plays both ways and becomes keyframes; words fill a figure.
 */

type W = { __foto: any; __extras: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Differences between the viewport's art canvas and a PNG. */
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

async function menu(page: Page, name: RegExp) {
  await page.locator('.xm-btn').click();
  await page.getByRole('menuitem', { name }).click();
}

/** A third photo (a drawn gradient) written to a temporary file. */
function thirdPhoto(page: Page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 700;
    const x = c.getContext('2d')!; const g = x.createLinearGradient(0, 0, 900, 700);
    g.addColorStop(0, '#1b3a5c'); g.addColorStop(1, '#f2c14e'); x.fillStyle = g; x.fillRect(0, 0, 900, 700);
    x.fillStyle = '#ede6da'; x.beginPath(); x.arc(450, 330, 180, 0, Math.PI * 2); x.fill();
    return c.toDataURL('image/png').split(',')[1];
  }).then(b64 => { const p = join(tmpdir(), `glyphos-extras-${Date.now()}.png`); writeFileSync(p, Buffer.from(b64, 'base64')); return p; });
}

test('cada cartel sobre la foto se exporta en PNG igual a la vista; comparar y versiones siguen funcionando', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = await openFoto(page);
  await startFromPhoto(page);
  const ids: string[] = await page.evaluate(() => (window as unknown as W).__extras.posters().map((p: { id: string }) => p.id));
  expect(ids.length).toBeGreaterThanOrEqual(10);
  for (const [i, id] of ids.entries()) {
    await menu(page, /Aplicar plantilla de cartel/);
    const sheet = page.getByRole('dialog', { name: 'Aplicar plantilla de cartel' });
    await sheet.locator(`.xp-card[data-poster=${id}]`).click();
    await sheet.getByRole('radio', { name: 'Redes' }).click();
    await sheet.getByRole('radio', { name: 'Cuadrado 1:1' }).click();
    await expect(sheet.getByText('1080 × 1080 px', { exact: true })).toBeVisible();
    const n = await renderCount(page);
    await sheet.getByRole('button', { name: 'Aplicar al proyecto' }).click();
    await expect(sheet).toBeHidden();
    const p = await project(page);
    expect([p.canvas.w, p.canvas.h]).toEqual([1080, 1080]);
    // editable: separate layers, the texts as text layers
    expect(p.layers.length).toBeGreaterThan(3);
    expect(p.layers.some(l => l.kind === 'text')).toBe(true);
    await finalRender(page, n);
    // 100 %: the final render is the export at 1×
    const n2 = await renderCount(page);
    await page.locator('.fv-over').hover();
    await page.keyboard.press('1');
    const r = await finalRender(page, n2);
    expect(r.scale).toBe(1);
    await page.getByRole('button', { name: /Exportar/ }).first().click();
    const ex = page.getByRole('dialog', { name: 'Exportar' });
    const file = await download(page, () => ex.getByRole('button', { name: 'Exportar PNG' }).click());
    const cmp = await compareWithArt(page, readFileSync(file.path));
    expect(cmp.size, id).toEqual([1080, 1080, 1080, 1080]);
    expect(cmp.differ, `${id}: píxeles distintos (máx. ${cmp.max})`).toBe(0);
    await ex.getByRole('button', { name: 'Cerrar' }).click();
    await page.keyboard.press('0');
    if (i === 0) {
      // before/after over a poster shows the original photo; the poster is a version linked to the first one
      await page.keyboard.press('c');
      await expect(page.locator('.fv-orig')).toBeVisible();
      await page.keyboard.press('c');
      const vs = await page.evaluate(() => (window as unknown as W).__foto.store().versions.list.map((v: { kind: string; label?: string; parent?: string }) => [v.kind, v.label ?? '', !!v.parent]));
      expect(vs).toEqual([['inicio', '', false], ['edición', 'Cartel: Cartel anotado', true]]);
      await page.getByRole('button', { name: /^Versión 1:/ }).click();
      expect((await project(page)).layers.map(l => l.kind)).toEqual(['photo']);
      await page.getByRole('button', { name: /^Versión 2:/ }).click();
      expect((await project(page)).canvas.w).toBe(1080);
      // the dice works on the poster's character layer: a variant linked to the poster's version
      await page.getByRole('button', { name: 'Azar', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as W).__foto.store().versions.list.length)).toBe(3);
      const last = await page.evaluate(() => { const l = (window as unknown as W).__foto.store().versions.list; return { kind: l[2].kind, parent: l[2].parent === l[1].id }; });
      expect(last).toEqual({ kind: 'azar', parent: true });
    }
  }
  // a print size: the canvas takes the page with its bleed, and the guides show over the art (not in the file)
  await menu(page, /Aplicar plantilla de cartel/);
  const sheet = page.getByRole('dialog', { name: 'Aplicar plantilla de cartel' });
  await sheet.locator('.xp-card[data-poster=suizo]').click();
  await sheet.getByRole('radio', { name: 'Impresión' }).click();
  await sheet.getByRole('radio', { name: 'A3' }).click();
  await sheet.getByRole('switch', { name: 'Sangrado de 3 mm' }).setChecked(true, { force: true });
  await expect(sheet.getByText('3578 × 5031 px', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Aplicar al proyecto' }).click();
  await expect(page.getByTestId('guias')).toBeVisible();
  await expect(page.getByTestId('guias')).toContainText('A3 vertical a 300 ppp · sangrado de 3 mm');
  // texts stay editable after applying: a new title refits its box
  await menu(page, /Aplicar plantilla de cartel/);
  const title = sheet.getByRole('textbox', { name: 'Título', exact: true }).last();
  await title.fill('Otro título');
  await expect.poll(async () => (await project(page)).layers.find(l => l.name === 'Título') as unknown as { text: string }).toMatchObject({ text: 'Otro título' });
  expect(errors).toEqual([]);
});

test('un ajuste guardado en una foto se aplica a otra, y viaja como archivo', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.getByRole('button', { name: /Añadir capa/ }).click();
  await page.getByRole('menuitem', { name: /Caracteres reales/ }).click();
  const a = await project(page);
  const g = a.layers.find(l => l.kind === 'glyphs')!;
  // a clip and a shape zone, to see them travel
  await page.evaluate(id => {
    const w = window as unknown as W;
    w.__foto.ps.updateLayer(id, (l: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      l.glyphs = { ...l.glyphs, charset: 'braille', cell: 7 };
      l.mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.2, y: 0.1, w: 0.6, h: 0.8, rot: 0, soft: 8, alpha: 1 }] };
      l.clips = [{ id: 'c1', template: 'foto-a-ascii', start: 0, dur: 2, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }];
    });
  }, g.id);
  await page.getByRole('button', { name: /^Ajustes guardados/ }).click();
  await page.getByRole('textbox', { name: 'Nombre del ajuste' }).fill('Braille ovalado');
  await page.getByRole('button', { name: 'Guardar como ajuste' }).click();
  await expect(page.getByTestId('live')).toContainText('Braille ovalado', { timeout: 20_000 });
  // another photo, another project
  await page.getByRole('button', { name: 'Proyectos' }).click();
  await startFromPhoto(page, PHOTO2);
  const b = await project(page);
  await menu(page, /Ajustes guardados/);
  const sheet = page.getByRole('dialog', { name: 'Ajustes guardados' });
  await sheet.getByRole('radio', { name: 'Como capa nueva' }).click();
  const card = sheet.locator('.xr-card', { hasText: 'Braille ovalado' });
  // the file: downloaded, checked, imported back
  const file = await download(page, () => card.getByRole('button', { name: 'Descargar «Braille ovalado»' }).click());
  expect(file.name).toBe('braille-ovalado.glyphos-ajuste.json');
  const json = JSON.parse(readFileSync(file.path, 'utf8'));
  expect(json.glyphos).toBe('ajuste');
  expect(JSON.stringify(json)).not.toContain(a.layers[0].id);
  await card.getByRole('button', { name: 'Aplicar «Braille ovalado»' }).click();
  await expect(sheet).toBeHidden();
  const c = await project(page);
  const added = c.layers[c.layers.length - 1] as unknown as { kind: string; source: string; glyphs: { charset: string; cell: number }; mask: { parts: Array<{ kind: string; x: number }> }; clips: unknown[] };
  expect(added.kind).toBe('glyphs');
  expect(added.source).toBe((b.layers[0] as unknown as { source: string }).source);
  expect(added.glyphs).toMatchObject({ charset: 'braille', cell: 7 });
  expect(added.mask.parts[0]).toMatchObject({ kind: 'ellipse', x: 0.2 });
  expect(added.clips).toHaveLength(1);
  await finalRender(page);
  // importing: a broken file is refused with a reason; the real one comes back (as a new copy)
  await menu(page, /Ajustes guardados/);
  const bad = join(tmpdir(), `malo-${Date.now()}.glyphos-ajuste.json`);
  writeFileSync(bad, '{"glyphos":"ajuste","version":1,"preset":{"kind":"otra"}}');
  let chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Importar un ajuste…' }).click();
  await (await chooser).setFiles(bad);
  await expect(page.getByTestId('live')).toContainText('no es un ajuste', { timeout: 10_000 });
  chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Importar un ajuste…' }).click();
  await (await chooser).setFiles(file.path);
  await expect(sheet.locator('.xr-card', { hasText: 'Braille ovalado' })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('tres fotos se vuelven una animación y se exportan como cuadros PNG', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = await openFoto(page);
  const third = await thirdPhoto(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.xs-way', { hasText: 'Secuencia de fotos' }).click();
  await (await chooser).setFiles([PHOTO, PHOTO2, third]);
  const sheet = page.getByRole('dialog', { name: 'Secuencia de fotos' });
  await expect(sheet.locator('.xq-ph')).toHaveCount(3);
  // the last photo first: Alt+← twice on it
  await sheet.locator('.xq-ph').nth(2).focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await sheet.getByRole('slider', { name: 'Cada foto' }).fill('0.5');
  await sheet.getByRole('radio', { name: 'Fundido' }).click();
  await sheet.getByRole('button', { name: 'Crear la animación' }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
  const p = await project(page) as unknown as { time: { duration: number; fps: number }; sources: Array<{ kind: string; media: Array<{ name: string }>; hold: number }>; layers: Array<{ name: string }> };
  const seq = p.sources.find(s => s.kind === 'sequence')!;
  expect(seq.media.map(m => m.name)).toEqual([expect.stringMatching(/^glyphos-extras-/), 'retrato-pelo.jpg', 'guitarra-mantas.jpg']);
  expect(seq.hold).toBeCloseTo(0.5);
  expect(p.time.duration).toBeCloseTo(1.5);
  expect(p.layers.map(l => l.name)).toContain('Fundido a la foto siguiente');
  // the photos really change over time
  const shots = await page.evaluate(async () => {
    const w = window as unknown as W;
    const pr = w.__foto.project();
    const out: string[] = [];
    for (const t of [0.1, 0.7, 1.2]) out.push((await w.__extras.shot(pr, 200, t)).url);
    return out;
  });
  expect(new Set(shots).size).toBe(3);
  // PNG frames: one per frame of the timeline
  await menu(page, /Secuencia de fotos/);
  await expect(sheet.getByText('36 cuadros')).toBeVisible();
  const zip = await download(page, () => sheet.getByRole('button', { name: 'Cuadros PNG (.zip)' }).click());
  expect(zip.name).toMatch(/cuadros\.zip$/);
  const names = new Set(readFileSync(zip.path).toString('latin1').match(/cuadro-\d{3}\.png/g));
  expect(names.size).toBe(36);
  expect(errors).toEqual([]);
});

test('un paralaje se reproduce hacia delante y al revés y queda como llaves', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openFoto(page);
  await startFromPhoto(page);
  await page.evaluate(() => (window as unknown as W).__extras.fakeCutout());
  await menu(page, /Profundidad y paralaje/);
  const sheet = page.getByRole('dialog', { name: 'Profundidad y paralaje' });
  await sheet.getByRole('button', { name: 'Separar sujeto y fondo' }).click();
  await expect.poll(async () => (await project(page)).layers.map(l => [l.name, (l as unknown as { depth?: number }).depth])).toEqual([['Relleno del fondo', -1.2], ['Foto original', -1], ['Recorte', 1]]);
  await sheet.getByRole('radio', { name: /Paralaje suave/ }).click();
  const canvas = sheet.locator('.xpl canvas');
  const time = async () => Number(await canvas.getAttribute('data-time'));
  await sheet.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect.poll(time, { timeout: 30_000 }).toBeGreaterThan(1);
  await sheet.getByRole('button', { name: 'Pausar' }).click();
  const t1 = await time();
  await sheet.getByRole('button', { name: 'Reproducir al revés' }).click();
  await expect.poll(time, { timeout: 30_000 }).toBeLessThan(t1 - 0.3);
  await sheet.getByRole('button', { name: 'Pausar' }).click();
  await sheet.getByRole('button', { name: 'Aplicar el movimiento' }).click();
  await expect(sheet).toBeHidden();
  const p = await project(page) as unknown as { time: { duration: number }; tracks: Array<{ path: string }> };
  expect(p.time.duration).toBe(6);
  expect(p.tracks.filter(t => t.path === 'xf.x').length).toBe(3);
  // the frames: the rest position at 0 and at the end, moved in between; the same instant forwards or backwards
  const r = await page.evaluate(async () => {
    const w = window as unknown as W;
    const pr = w.__foto.project();
    const u = async (t: number) => (await w.__extras.shot(pr, 240, t)).url;
    return { a: await u(0), b: await u(1.5), c: await u(6), b2: await u(1.5) };
  });
  expect(r.b).not.toBe(r.a);
  expect(r.c).toBe(r.a);
  expect(r.b2).toBe(r.b);
  expect(errors).toEqual([]);
});

test('tus palabras llenan la figura, llegan volando y quedan listas para exportar', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await openFoto(page);
  await page.locator('.xs-way', { hasText: 'Tus palabras forman la figura' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tus palabras forman la figura' });
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Elegir mi foto' }).click();
  await (await chooser).setFiles(PHOTO);
  await expect(sheet.locator('.xp-photo-name')).toHaveText('retrato-pelo.jpg');
  await sheet.getByRole('textbox', { name: 'Palabras' }).fill('mirada luz cabello');
  await sheet.getByRole('radio', { name: 'Bermellón' }).click();
  await sheet.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(page.locator('.fv-art')).toBeVisible();
  await finalRender(page);
  const p = await project(page) as unknown as { time: { duration: number }; layers: Array<{ kind: string; name: string; glyphs?: { chars: string; fill: string; ink: string }; clips?: Array<{ template: string }> }> };
  const g = p.layers.find(l => l.kind === 'glyphs')!;
  expect(g.glyphs).toMatchObject({ chars: 'mirada luz cabello', fill: 'words', ink: '#ff5b1f' });
  expect(g.clips!.map(c => c.template)).toEqual(['palabras-figura']);
  expect(p.time.duration).toBeGreaterThan(4);
  // with a cut-out, the words fill only the subject
  await page.evaluate(() => (window as unknown as W).__extras.fakeCutout());
  await menu(page, /Tus palabras forman la figura/);
  await sheet.getByRole('radio', { name: 'El sujeto recortado' }).click();
  await sheet.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(sheet).toBeHidden();
  const q = await project(page) as unknown as { sources: Array<{ id: string; kind: string }>; layers: Array<{ kind: string; source?: string }> };
  const words = q.layers.filter(l => l.kind === 'glyphs');
  expect(words).toHaveLength(1);
  expect(words[0].source).toBe(q.sources.find(s => s.kind === 'cutout')!.id);
  // real characters: the export sheet offers them as text
  await page.getByRole('button', { name: /Exportar/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'Exportar' }).getByText('Tus palabras', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
