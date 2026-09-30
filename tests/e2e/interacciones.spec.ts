import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { download, openStudio } from './helpers';

/**
 * Cursor, finger and pen (engine/touch.ts, engine/pointer.ts, studio/ui/Touch.tsx):
 * - on the engine module itself: every mode leaves its mark where it is touched and not far from it, the
 *   WebGL and the basic engine draw the same, and a replay (the same gestures, at another frame rate) gives
 *   the same pixels; grain, flicker, the colour cycle and the message follow the piece's clock;
 * - in the studio, with the mouse: each gesture changes the stage where it happens, «Cursor y tacto» shows
 *   the settings each mode uses with its example, and an idle piece stops drawing;
 * - in the export sheet: what a fixed format cannot keep, said; the pasted code keeps the interaction (the
 *   pointer changes its canvas where it goes) and, without its web font, still draws the studio's picture.
 */

const enc = (r: object) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');
const engineModule = async () => Buffer.from((await build({ entryPoints: [join(process.cwd(), 'src/engine/index.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' })).outputFiles[0].contents);

async function withEngine(page: Page) {
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/licencia/');
}

test('cada modo deja su marca donde se toca, igual en WebGL y en el motor básico, y se repite igual', async ({ page }) => {
  test.setTimeout(420_000);
  await withEngine(page);
  const modes = ['trail', 'blossom', 'rings', 'sparks', 'stretch', 'reveal', 'zoom', 'follow', 'magnet', 'paint', 'ripple', 'light'];
  const out = await page.evaluate(async modes => {
    const E = await import('/__snap/engine.js' as string);
    const W = 360, H = 240;
    const recipe = (mode: string) => {
      const r = E.defaultRecipe();
      r.layers = [{ ...E.DEFAULT_LAYER, pattern: 'ondas', scale: 1.2, speed: 0 }];
      r.color.stops = ['#10161f', '#2c6e8a', '#e8d9b0'];
      r.color.bg = '#0b0d10';
      r.glyph.cell = 9;
      r.interact = { mode, strength: 0.7, radius: 0.2, auto: false };
      return r;
    };
    /** The gesture of each mode, in fractions of the canvas, around the left half (the right quarter stays untouched). */
    const gesture = (mode: string) => {
      const ev: Array<Record<string, unknown>> = [], t0 = 0.05;
      if (mode === 'zoom') {
        ev.push({ kind: 'down', id: 1, x: 0.3, y: 0.5, t: t0 }, { kind: 'down', id: 2, x: 0.36, y: 0.5, t: t0 + 0.01 });
        for (let i = 1; i <= 24; i++) { ev.push({ kind: 'move', id: 1, x: 0.3 - i * 0.006, y: 0.5, t: t0 + 0.01 + i / 60 }); ev.push({ kind: 'move', id: 2, x: 0.36 + i * 0.006, y: 0.5, t: t0 + 0.01 + i / 60 }); }
      } else if (mode === 'blossom') ev.push({ kind: 'down', id: 1, x: 0.3, y: 0.5, t: t0 });
      else if (mode === 'rings') ev.push({ kind: 'down', id: 1, x: 0.3, y: 0.5, t: t0 }, { kind: 'up', id: 1, x: 0.3, y: 0.5, t: t0 + 0.05 });
      else if (mode === 'sparks') {
        ev.push({ kind: 'down', id: 1, x: 0.15, y: 0.7, t: t0 });
        for (let i = 1; i <= 8; i++) ev.push({ kind: 'move', id: 1, x: 0.15 + i * 0.03, y: 0.7 - i * 0.03, t: t0 + i / 120 });
        ev.push({ kind: 'up', id: 1, x: 0.39, y: 0.46, t: t0 + 8 / 120 + 0.001 });
      } else {
        const type = ['follow', 'reveal', 'magnet', 'light'].includes(mode) ? 'mouse' : 'touch';
        if (type === 'touch') ev.push({ kind: 'down', id: 1, x: 0.1, y: 0.5, t: t0, type });
        for (let i = 1; i <= 24; i++) ev.push({ kind: 'move', id: 1, x: 0.1 + i * 0.015, y: 0.5 + 0.12 * Math.sin(i / 5), t: t0 + i / 60, type });
      }
      return ev;
    };
    const run = async (kind: string, mode: string, touched: boolean, fps = 30, seconds = 0.8) => {
      const cv = document.createElement('canvas');
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: W, height: H, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, recipe(mode), opts) : new E.BasicEngine(cv, recipe(mode), opts);
      await e.ready();
      e.renderAt(0, 0);
      if (touched) for (const g of gesture(mode)) e.gesture(g);
      const n = Math.round(seconds * fps);
      for (let i = 1; i <= n; i++) e.renderAt(i / fps, i / fps);
      const s = await e.snapshot(0, 0, W, H);
      e.destroy();
      return s!.data;
    };
    /** Mean absolute difference (0..255) over a box of the canvas (fractions). */
    const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray, x0 = 0, y0 = 0, x1 = 1, y1 = 1) => {
      let d = 0, n = 0;
      for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
        const i = (y * W + x) * 4;
        d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3;
      }
      return d / n;
    };
    const res: Record<string, { near: number; far: number; all: number; parity: number; replay: number; rate: number }> = {};
    for (const mode of modes) {
      const still = await run('webgl', mode, false);
      const gl = await run('webgl', mode, true);
      const basic = await run('basic', mode, true);
      const again = await run('webgl', mode, true);
      // (sparks fly off along the flick, up and to the right: their «near» is where they go)
      const [near, far]: Array<[number, number, number, number]> = mode === 'sparks' ? [[0.25, 0, 1, 0.65], [0, 0.85, 0.1, 1]] : [[0.05, 0.25, 0.5, 0.75], [0.82, 0, 1, 1]];
      res[mode] = {
        near: diff(gl, still, ...near), far: diff(gl, still, ...far), all: diff(gl, still),
        parity: diff(gl, basic), replay: diff(gl, again), rate: diff(basic, await run('basic', mode, true, 60)),
      };
    }
    return res;
  }, modes);
  for (const [mode, r] of Object.entries(out)) {
    const say = `${mode}: ${JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(2)])))}`;
    console.log(say);
    // it changes where it was touched…
    expect.soft(r.near, say).toBeGreaterThan(mode === 'follow' ? 0.5 : 2);
    // …and not far from it (the view modes move the whole field: by design)
    if (!['zoom', 'follow', 'ripple'].includes(mode)) expect.soft(r.far, say).toBeLessThan(0.6);
    // both engines draw the same (under one level in 255 on average)
    expect.soft(r.parity, say).toBeLessThan(1);
    // the same gestures replayed: the same picture; and at 60 frames per second instead of 30 too (the
    // older ripples and brush step with the frames, so only the replay at the same rate is exact for them)
    expect.soft(r.replay, say).toBe(0);
    // (the older modes' pointer eases toward the cursor frame by frame: equal to the eye, not to the bit)
    if (!['paint', 'ripple'].includes(mode)) expect.soft(r.rate, say).toBeLessThan(['magnet', 'light'].includes(mode) ? 0.05 : 1e-9);
  }
});

test('grano, parpadeo, ciclo de color y mensaje siguen el reloj de la pieza: el mismo instante, los mismos píxeles', async ({ page }) => {
  await withEngine(page);
  const out = await page.evaluate(async () => {
    const E = await import('/__snap/engine.js' as string);
    const r = E.defaultRecipe();
    r.layers = [{ ...E.DEFAULT_LAYER, pattern: 'plasma', speed: 1 }];
    r.fx = { ...r.fx, grain: 0.7, flicker: 0.9, scan: 0.3 };
    r.color.cycle = 0.4;
    r.msg = { ...r.msg, on: true, text: 'GLYPHOS', mode: 'decode', speed: 6 };
    const W = 240, H = 160;
    const shot = async (kind: string, t: number, realT: number) => {
      const cv = document.createElement('canvas');
      const opts = { library: E.PATTERN_GLSL, googleFonts: false, fixedSize: { width: W, height: H, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true };
      const e = kind === 'webgl' ? new E.AsciiEngine(cv, r, opts) : new E.BasicEngine(cv, r, opts);
      await e.ready();
      e.renderAt(t, realT);
      const s = await e.snapshot(0, 0, W, H);
      e.destroy();
      return Array.from(s!.data);
    };
    const same = (a: number[], b: number[]) => a.every((v, i) => v === b[i]);
    const o: Record<string, boolean> = {};
    for (const kind of ['webgl', 'basic']) {
      const a = await shot(kind, 3.3, 0.4), b = await shot(kind, 3.3, 11.7), c = await shot(kind, 4.1, 0.4);
      o[kind + ' mismo instante'] = same(a, b);
      o[kind + ' otro instante distinto'] = !same(a, c);
    }
    return o;
  });
  expect(out).toEqual({ 'webgl mismo instante': true, 'webgl otro instante distinto': true, 'basic mismo instante': true, 'basic otro instante distinto': true });
});

/* ------------------------------------------------------------------ */
/* The studio                                                          */
/* ------------------------------------------------------------------ */

const CALM = (mode: string, extra: object = {}, pattern = 'nube') => ({
  v: 2, source: 'pattern', layers: [{ pattern, scale: 1.4, speed: 0 }], motion: { speed: 0 },
  glyph: { cell: 16 }, color: { stops: ['#10161f', '#2c6e8a', '#e8d9b0'], bg: '#0b0d10' },
  interact: { mode, strength: 0.8, radius: 0.22, ...extra }, meta: { name: 'Prueba de tacto', space: 'fondos' },
});

/** The stage's pixels as shown (a screenshot), as luminance on a grid of cols × rows. */
async function stageGrid(page: Page, cols = 48, rows = 30): Promise<number[]> {
  const png = (await page.locator('.stage canvas').first().screenshot()).toString('base64');
  return page.evaluate(async ([png, cols, rows]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = cols as number; c.height = rows as number;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(img, 0, 0, cols as number, rows as number);
    const d = x.getImageData(0, 0, cols as number, rows as number).data, out: number[] = [];
    for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return out;
  }, [png, cols, rows] as const);
}
/** Mean change between two grids over a box (fractions of the stage). */
function change(a: number[], b: number[], box: [number, number, number, number], cols = 48, rows = 30) {
  let d = 0, n = 0;
  for (let r = Math.floor(box[1] * rows); r < Math.ceil(box[3] * rows); r++) for (let c = Math.floor(box[0] * cols); c < Math.ceil(box[2] * cols); c++) { d += Math.abs(a[r * cols + c] - b[r * cols + c]); n++; }
  return d / Math.max(1, n);
}

async function stageBox(page: Page) {
  const b = (await page.locator('.stage canvas').first().boundingBox())!;
  return { X: (f: number) => b.x + b.width * f, Y: (f: number) => b.y + b.height * f };
}

test('en el estudio, con el ratón: cada gesto cambia la pieza donde ocurre y, quieta, la pieza deja de dibujar', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1100, height: 720 });
  // the piece paused (reduced motion): it draws only what the pointer does, at a resolution that stays put
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // counts what the stage draws (WebGL draw calls): an idle piece draws nothing
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    const d = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (this: WebGL2RenderingContext, ...a: Parameters<typeof d>) {
      if ((this.canvas as HTMLCanvasElement).closest?.('.stage')) w.__draws++;
      return d.apply(this, a);
    };
  });
  const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
  const cases: Array<[string, (p: Page, X: (f: number) => number, Y: (f: number) => number) => Promise<void>, [number, number, number, number]]> = [
    ['trail', async (p, X, Y) => { await p.mouse.move(X(0.12), Y(0.5)); for (let i = 1; i <= 16; i++) await p.mouse.move(X(0.12 + i * 0.02), Y(0.5), { steps: 2 }); }, [0.1, 0.35, 0.45, 0.65]],
    ['rings', async (p, X, Y) => { await p.mouse.click(X(0.3), Y(0.5)); }, [0.05, 0.1, 0.55, 0.9]],
    ['stretch', async (p, X, Y) => { await p.mouse.move(X(0.25), Y(0.35)); await p.mouse.down(); await p.mouse.move(X(0.33), Y(0.65), { steps: 12 }); }, [0.18, 0.45, 0.45, 0.85]],
    ['zoom', async (p, X, Y) => { await p.mouse.move(X(0.3), Y(0.5)); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -150); await p.waitForTimeout(40); } }, [0.05, 0.1, 0.55, 0.9]],
    ['blossom', async (p, X, Y) => { await p.mouse.move(X(0.3), Y(0.5)); await p.mouse.down(); await p.waitForTimeout(1500); }, [0.2, 0.35, 0.4, 0.65]],
  ];
  for (const [mode, act, near] of cases) {
    await page.goto('about:blank');
    // (Estirar on a checkerboard: what the finger drags shows clearly)
    // (a long trail: this machine draws the stage slowly, a screenshot takes a while)
    const errors = await openStudio(page, enc(CALM(mode, mode === 'trail' ? { decay: 1 } : {}, mode === 'stretch' ? 'tablero' : 'nube')));
    // only the piece: no notes over the stage, and no change still being shown
    await page.addStyleTag({ content: '.motion-note, .stage-marks, .stage-top, .stage-notes, .deck, .seedline, .toasts, .vbar { visibility: hidden !important; }' });
    await expect(page.locator('.stage canvas[data-busy]')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const { X, Y } = await stageBox(page);
    await page.mouse.move(X(0.9), Y(1.3));
    const before = await stageGrid(page);
    await act(page, X, Y);
    // the stage draws a frame or two after the gesture (software GL here: slow; a ring grows fast)
    await page.waitForTimeout(mode === 'rings' ? 250 : 700);
    const after = await stageGrid(page);
    await page.mouse.up();
    const n = change(after, before, near), f = change(after, before, [0.8, 0, 1, 0.25]);
    expect(n, `${mode}: cerca ${n.toFixed(1)}, lejos ${f.toFixed(1)}`).toBeGreaterThan(2.5);
    if (mode !== 'zoom') expect(f, `${mode}: lejos`).toBeLessThan(n / 3);
    expect(errors, mode).toEqual([]);
  }
  // quiet: the last piece (a flower that faded) is paused and nobody touches it — nothing is drawn
  await page.mouse.move(10, 10);
  await page.waitForTimeout(11_000);
  const d0 = await draws();
  await page.waitForTimeout(1500);
  expect(await draws() - d0, 'dibujos con la pieza quieta').toBe(0);
});

test('«Cursor y tacto»: modos por gesto, cada uno con sus ajustes y su ejemplo', async ({ page }) => {
  const errors = await openStudio(page, enc(CALM('light')));
  await page.locator('.panel').getByRole('tab', { name: 'Movimiento' }).click();
  const pick = async (name: string) => {
    await page.locator('.panel .ctl', { hasText: 'Qué hace el cursor o el dedo' }).locator('button.pk').click();
    const list = page.getByRole('listbox');
    for (const g of ['Al pasar', 'Dejan rastro', 'Gestos']) await expect(list.getByRole('group', { name: g })).toBeVisible();
    await list.getByRole('option', { name: new RegExp(name) }).first().click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
  };
  await pick('Anillos');
  const pane = page.locator('#pane');
  await expect(pane.locator('.tx-demo figcaption')).toContainText('Toca o haz clic');
  await expect(pane.locator('.tx-demo canvas')).toHaveCount(1);
  for (const l of ['Intensidad', 'Alcance', 'Duración de los anillos', 'Color del toque', 'Caracteres del toque']) await expect(pane.getByText(l, { exact: true })).toBeVisible();
  await pane.getByRole('radio', { name: 'Al azar' }).click();
  await expect(pane.getByRole('radio', { name: 'Al azar' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.seedline')).toContainText('editado');
  await pick('Zoom con los dedos');
  await expect(pane.getByText('Zoom máximo', { exact: true })).toBeVisible();
  await expect(pane.getByText('Radio', { exact: true })).toHaveCount(0);
  await expect(pane.getByText(/Ctrl \+ rueda/).first()).toBeVisible();
  await pick('Ninguna');
  await expect(pane.locator('.tx-demo')).toHaveCount(0);
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

async function pastedPage(browser: Browser, file: string, o: { w: number; h: number; offline?: boolean; reduced?: boolean }) {
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  if (o.offline) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + file);
  await expect.poll(() => p.evaluate(() => !!document.querySelector('canvas')?.width), { timeout: 20_000 }).toBe(true);
  await p.waitForTimeout(2500);
  return { ctx, p, errors };
}

test('la hoja de exportar dice qué guarda cada formato, y el código pegado responde al puntero', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const errors = await openStudio(page, enc(CALM('trail', { decay: 0.9, ink: 0.9, glyphs: 'dense' })));
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Imagen' }).click();
  await expect(page.getByText(/«Rastro» responde a quien toca la pieza: una imagen fija no puede guardarlo/)).toBeVisible();
  await page.getByRole('tab', { name: 'Video y GIF' }).click();
  await expect(page.getByText(/un video o un GIF no puede guardar eso/)).toBeVisible();
  const demo = page.getByRole('switch', { name: 'Grabar el cursor automático (demostración)' });
  await expect(demo).not.toBeChecked();
  await page.getByText('Grabar el cursor automático (demostración)').click();
  await expect(demo).toBeChecked();
  await page.getByRole('tab', { name: 'Código' }).click();
  await expect(page.getByText(/el código lo conserva/)).toBeVisible();
  // the recipe in the code keeps the gesture's settings
  await expect(page.locator('textarea.code')).toHaveValue(/"interact":\{"mode":"trail","strength":0\.8,"radius":0\.22,"auto":false,"decay":0\.9,"ink":0\.9,"glyphs":"dense"\}/);
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
  const file = test.info().outputPath('tacto.html');
  await d.saveAs(file);
  expect(errors).toEqual([]);

  // the pasted page: a background (the pointer anywhere on the page); the mouse leaves a trail where it goes
  const { ctx, p, errors: e2 } = await pastedPage(browser, file, { w: 900, h: 600, reduced: true });
  expect(await p.evaluate(() => (window as unknown as { Glyphos: { version: string } }).Glyphos.version)).toBe('2.4.0');
  const shot = async () => (await p.locator('canvas').first().screenshot()).toString('base64');
  const grid = (png: string) => p.evaluate(async png => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
    const c = document.createElement('canvas'); c.width = 48; c.height = 32;
    const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, 48, 32);
    const dd = x.getImageData(0, 0, 48, 32).data, out: number[] = [];
    for (let i = 0; i < dd.length; i += 4) out.push(0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2]);
    return out;
  }, png);
  const before = await grid(await shot());
  await p.mouse.move(100, 300);
  for (let i = 1; i <= 16; i++) await p.mouse.move(100 + i * 16, 300, { steps: 2 });
  await p.waitForTimeout(400);
  const after = await grid(await shot());
  const near = change(after, before, [0.1, 0.35, 0.42, 0.65], 48, 32), far = change(after, before, [0.8, 0, 1, 0.25], 48, 32);
  expect(near, `cerca ${near.toFixed(1)}, lejos ${far.toFixed(1)}`).toBeGreaterThan(4);
  expect(far).toBeLessThan(near / 3);
  expect(e2).toEqual([]);
  await ctx.close();
});

test('el código pegado sin su tipografía web (sin conexión) pone los mismos caracteres en las mismas celdas que el estudio', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // «Bruma» of the library with its web font (JetBrains Mono): offline, a fallback font draws it
  const recipe = {
    v: 2, source: 'pattern', layers: [{ pattern: 'bruma_lejana', a: 0.45, b: 0.45, speed: 0, phase: 3.3 }], glyph: { cell: 10, font: 'jetbrains' },
    color: { stops: ['#143449', '#4998b7', '#b2e7dd', '#ffefd0'], bg: '#05101a' }, interact: { mode: 'none' }, meta: { name: 'Bruma sin red', space: 'arte' },
  };
  const body = await engineModule();
  await page.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await page.route('**/__snap/blank.html', r => r.fulfill({ body: '<!doctype html><meta charset="utf-8"><title>sin tipografía</title>', contentType: 'text/html' }));
  const errors = await openStudio(page, enc(recipe));
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: 'Código' }).click();
  const dl = await download(page, () => page.getByRole('button', { name: /Descargar página/ }).click());
  const { copyFileSync, readFileSync } = await import('node:fs');
  const file = test.info().outputPath('bruma.html');
  copyFileSync(dl.path, file);
  // the studio's order of the glyphs travels with the code
  const m = /"charset":("(?:[^"\\]|\\.)*"),"sort":false/.exec(readFileSync(file, 'utf8'));
  expect(m, 'orden del estudio en el código').not.toBeNull();
  const ramp = JSON.parse(m![1]) as string;
  await page.keyboard.press('Escape');

  /** The character grid of the piece (basic engine, fixed size) with the fonts this page has. */
  const gridOf = (p: Page, r: object) => p.evaluate(async r => {
    const E = await import('/__snap/engine.js' as string);
    const cv = document.createElement('canvas');
    const e = new E.BasicEngine(cv, E.normalizeRecipe(r), { fonts: E.createFontLoader({ google: false }), fixedSize: { width: 480, height: 300, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false });
    await e.ready();
    e.renderAt(0);
    const g = e.readGrid(), ramp = e.glyphChars.slice(0, 10).join('');
    e.destroy();
    return { chars: g.chars, ramp, fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family) };
  }, r);
  const studio = await gridOf(page, recipe);
  expect(studio.fonts.join()).toMatch(/JetBrains/);
  expect(studio.ramp, 'el orden medido en el estudio').toBe(ramp);
  const blank = await page.context().newPage();
  await blank.route('**/__snap/engine.js', r => r.fulfill({ body, contentType: 'text/javascript' }));
  await blank.route('**/__snap/blank.html', r => r.fulfill({ body: '<!doctype html><meta charset="utf-8"><title>sin tipografía</title>', contentType: 'text/html' }));
  await blank.goto('/__snap/blank.html');
  const kept = await gridOf(blank, { ...recipe, glyph: { ...recipe.glyph, charset: ramp, sort: false } });
  const own = await gridOf(blank, recipe);
  expect(kept.fonts.join()).not.toMatch(/JetBrains/);
  const same = (a: string[], b: string[]) => a.filter((c, i) => c === b[i]).length / a.length;
  const keptSame = same(kept.chars, studio.chars), ownSame = same(own.chars, studio.chars);
  test.info().annotations.push({ type: 'celdas iguales', description: `con el orden del estudio ${(keptSame * 100).toFixed(1)} %, ordenado con la tipografía de reserva ${(ownSame * 100).toFixed(1)} %` });
  expect(keptSame, 'mismos caracteres en las mismas celdas').toBe(1);
  await blank.close();

  // the pasted page itself, offline: it draws, without errors
  const { ctx, p, errors: e2 } = await pastedPage(browser, file, { w: 900, h: 600, offline: true, reduced: true });
  const lit = await p.evaluate(() => { const c = document.querySelector('canvas')!; return c.width > 0 && c.height > 0; });
  expect(lit).toBe(true);
  await ctx.close();
  expect(errors).toEqual([]);
  expect(e2).toEqual([]);
});
