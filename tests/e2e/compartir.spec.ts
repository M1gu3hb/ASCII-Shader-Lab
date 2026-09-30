import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { decodeRecipe, encodeRecipe, readPieceHash } from '../../src/shared/share';
import { defaultFrame, encodeFrame, frameFor, gridOf } from '../../src/shared/frame';
import { normalizeRecipe } from '../../src/engine/recipe';
import { dismissWelcome } from './helpers';

/*
 * «Compartir» and the public viewer (/ver/), across devices.
 *
 * A person makes a piece on one device, shares its link, and people open it on others. The viewer must show
 * the SAME composition (same cells, same crop of the pattern, same moment), only scaled to fit, never
 * reflowed to the screen that opens it. Each sender below makes a different kind of piece (several spaces,
 * an edited result of the dice, a text piece; all of them animated), pauses it and shares it; each receiver
 * opens the link, and the two frames are compared after bringing both to the same small size (the only
 * difference left is resampling). A control — the same piece reflowed to the receiver's screen, which is
 * what a link without its frame gives — shows the comparison tells the two apart.
 * Numbers go to the test output (COMPARTIR_SHOTS=<dir> also saves the screenshots).
 */

interface Device { id: string; viewport: { width: number; height: number }; deviceScaleFactor: number; hasTouch: boolean; isMobile: boolean }
const DEVICES: Record<string, Device> = {
  desk: { id: '1440×900', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  tabL: { id: '1024×768', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false },
  tabP: { id: '820×1180', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false },
  phone: { id: '390×844', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  land: { id: '844×390', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  small: { id: '360×740', viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const ctxOf = (d: Device, extra: BrowserContextOptions = {}): BrowserContextOptions => ({
  viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, hasTouch: d.hasTouch, isMobile: d.isMobile, ...extra,
});
const SHOTS = process.env.COMPARTIR_SHOTS;

/** The lab draws at full resolution and switches pieces without a transition (a frame to compare, not a dissolve). */
const PREFS = JSON.stringify({ quality: 'alta', transition: 'ninguna', pace: 'corta' });

async function openLab(browser: Browser, d: Device, hash: string) {
  const ctx = await browser.newContext(ctxOf(d, { permissions: ['clipboard-read', 'clipboard-write'] }));
  await ctx.addInitScript(p => { try { localStorage.setItem('mt.v3.preview', p); } catch { /* none */ } }, PREFS);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/studio/' + hash);
  await expect(page.locator('.cv-host canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.seedline')).toBeVisible({ timeout: 60_000 });
  await dismissWelcome(page);
  return { ctx, page, errors };
}

/**
 * A canvas's own pixels — the frame the engine rendered, before any screen scales it — brought to `tw` pixels
 * wide by successive halvings and one smooth last step (the same code on both sides). RGB only.
 * A WebGL canvas that is shown and paused cannot be read back (its buffer is handed to the screen), so the
 * engine is asked for one more frame of the same moment (the event it redraws on when a font arrives) and the
 * canvas is copied in that same animation frame, right after the engine drew it.
 */
function pixels(page: Page, selector: string, tw = 160, th?: number) {
  return page.evaluate(([sel, w, h]) => new Promise<{ W: number; H: number; w: number; h: number; rgb: number[] }>(done => {
    document.fonts.dispatchEvent(new Event('loadingdone'));
    requestAnimationFrame(() => {
      const c = document.querySelector<HTMLCanvasElement>(sel)!;
      const W = c.width, H = c.height;
      const outH = h || Math.max(1, Math.round((w * H) / W));
      let src = document.createElement('canvas');
      src.width = W; src.height = H;
      src.getContext('2d')!.drawImage(c, 0, 0);
      let sw = W, sh = H;
      while (sw / 2 >= w * 1.5) {
        const n = document.createElement('canvas');
        n.width = Math.round(sw / 2); n.height = Math.round(sh / 2);
        const x = n.getContext('2d')!;
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, 0, 0, n.width, n.height);
        src = n; sw = n.width; sh = n.height;
      }
      const out = document.createElement('canvas');
      out.width = w; out.height = outH;
      const x = out.getContext('2d', { willReadFrequently: true })!;
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, w, outH);
      const d = x.getImageData(0, 0, w, outH).data;
      const rgb: number[] = [];
      for (let i = 0; i < d.length; i += 4) rgb.push(d[i], d[i + 1], d[i + 2]);
      done({ W, H, w, h: outH, rgb });
    });
  }), [selector, tw, th ?? 0] as const);
}

/** The lab's own layers over the stage (bars, notes, marks) out of the picture, without moving anything. */
const labBare = (page: Page) => page.addStyleTag({ content: '.app .stage-top, .app .deck, .app .seedline, .app .stage-marks, .app .vw-veil, .app .toast, .app .notices, .app .prompt, .app .ph-strip { visibility: hidden !important; }' });
/** The viewer's controls out of the picture (as when they step aside). */
async function viewerBare(page: Page) {
  await page.evaluate(() => { (document.querySelector('.ver') as HTMLElement).dataset.ui = 'off'; (document.activeElement as HTMLElement | null)?.blur?.(); });
  await page.waitForTimeout(450);
}

/** Mean absolute difference per channel (0–255). */
function mad(a: number[], b: number[]) {
  expect(a.length).toBe(b.length);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
/** How much a frame varies at all (so a flat or empty frame cannot pass for a match). */
function spread(a: number[]) {
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return a.reduce((x, y) => x + Math.abs(y - m), 0) / a.length;
}

/** Pauses the lab, waits for the stage to settle, and returns the link «Compartir» gives. */
async function shareFromLab(page: Page, d: Device) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('.cv-host canvas:not([data-busy])')).toHaveCount(1);
  await page.waitForTimeout(900);
  const phone = d.viewport.width <= 900;
  await page.locator(phone ? '.deck .ph-share' : '.topbar .share-btn').click();
  const sheet = page.getByRole('dialog', { name: 'Compartir' });
  await expect(sheet).toBeVisible();
  const url = sheet.getByRole('textbox', { name: 'Enlace público a esta pieza' });
  await expect(url).toHaveValue(/\/ver\/#r=z[\w-]+&f=\d+x\d+-\d+x\d+&t=[\d.]+&p=1$/);
  await expect(sheet.locator('.shr-prev img')).toBeVisible({ timeout: 60_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sheet-${d.id}.png` });
  const link = await url.inputValue();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(300);
  return new URL(link);
}

async function openViewer(browser: Browser, d: Device, path: string, extra: BrowserContextOptions = {}) {
  const ctx = await browser.newContext(ctxOf(d, extra));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(path);
  await expect(page.locator('.ver-stage[data-state="ready"]')).toHaveCount(1, { timeout: 60_000 });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

/** A recipe as a link of its own (#r=j…: plain JSON, as links from before the compressed form). */
const enc = (r: object) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');
/** A background that answers to the finger: each tap or click opens rings of characters (they last). */
const TAP_PIECE = {
  v: 2, source: 'pattern', layers: [{ pattern: 'nube', scale: 1.3, speed: 0.4 }], glyph: { cell: 12 },
  color: { stops: ['#0f1720', '#2b6b86', '#9fd0d8', '#f3e6c4'], bg: '#0a0d11' },
  interact: { mode: 'rings', strength: 0.9, radius: 0.25, decay: 1 }, meta: { name: 'Anillos al tocar', space: 'fondos' },
};

interface Piece { name: string; sender: keyof typeof DEVICES; hash: string; edit?: boolean; space: string; gesture?: boolean }
const PIECES: Piece[] = [
  // an edited result of the dice in Arte, on a desktop
  { name: 'Arte, editada', sender: 'desk', hash: '#seed=telar-arte-4&space=arte&gen=4', edit: true, space: 'arte' },
  // a text piece, on a tablet on its side
  { name: 'Texto (Tipo)', sender: 'tabL', hash: '#seed=telar-tipo-61&space=tipo&gen=4', space: 'tipo' },
  // a background, on a tablet held upright (pixel ratio 2)
  { name: 'Fondos', sender: 'tabP', hash: '#seed=telar-fondos-3&space=fondos&gen=4', space: 'fondos' },
  // an edited terminal piece in its Terminal view, on a phone (pixel ratio 2)
  { name: 'Terminal, editada', sender: 'phone', hash: '#seed=telar-terminal-237&space=terminal&gen=4', edit: true, space: 'terminal' },
  // a piece of the generator's current version (5: the pattern library, its styles and palettes), on a small phone
  { name: 'Arte, generador 5', sender: 'small', hash: '#seed=telar-arte-5&space=arte&gen=5', space: 'arte' },
  // a piece that answers to the finger (Anillos), on a touch tablet on its side
  { name: 'Fondos que responden al toque', sender: 'tabL', hash: enc(TAP_PIECE), space: 'fondos', gesture: true },
];

/** Mean difference (0–255) of two frames of `pixels()` inside a box given in fractions of the frame. */
function madIn(a: { w: number; h: number; rgb: number[] }, b: { rgb: number[] }, [x0, y0, x1, y1]: [number, number, number, number]) {
  let s = 0, n = 0;
  for (let y = Math.floor(y0 * a.h); y < Math.ceil(y1 * a.h); y++) {
    for (let x = Math.floor(x0 * a.w); x < Math.ceil(x1 * a.w); x++) {
      const i = (y * a.w + x) * 3;
      s += Math.abs(a.rgb[i] - b.rgb[i]) + Math.abs(a.rgb[i + 1] - b.rgb[i + 1]) + Math.abs(a.rgb[i + 2] - b.rgb[i + 2]);
      n += 3;
    }
  }
  return s / Math.max(1, n);
}

/**
 * A piece that answers to the finger, in the viewer: a click (mouse) or a tap (finger) opens rings where it
 * lands and nowhere far from it, and its canvas takes the finger (touch-action: none: a drag or a pinch
 * reaches the piece, not the page).
 */
async function answersInViewer(browser: Browser, d: Device, path: string) {
  const v = await openViewer(browser, d, path);
  const cv = v.page.locator('.ver-stage canvas');
  expect(await cv.evaluate(c => getComputedStyle(c).touchAction), d.id).toBe('none');
  await viewerBare(v.page);
  const b = (await cv.boundingBox())!;
  const before = await pixels(v.page, '.ver-stage canvas', 96);
  const at = { x: b.x + b.width * 0.28, y: b.y + b.height * 0.55 };
  if (d.hasTouch) await v.page.touchscreen.tap(at.x, at.y);
  else await v.page.mouse.click(at.x, at.y);
  // the rings grow from where it landed (the piece is paused: nothing else changes)
  let near = 0, far = 0;
  await expect.poll(async () => {
    const after = await pixels(v.page, '.ver-stage canvas', 96);
    near = madIn(after, before, [0.12, 0.35, 0.44, 0.75]);
    far = madIn(after, before, [0.8, 0, 1, 0.25]);
    return near;
  }, { message: `${d.id}: anillos donde se toca` }).toBeGreaterThan(2);
  expect(far, `${d.id}: cerca ${near.toFixed(1)}, lejos ${far.toFixed(1)}`).toBeLessThan(near / 3);
  expect(v.errors, d.id).toEqual([]);
  await v.ctx.close();
}

/** Changes the first slider of the settings with the keyboard: an edit the history marks as such. */
async function editPiece(page: Page, d: Device) {
  const phone = d.viewport.width <= 900;
  if (phone) await page.locator('.deck .ph-tools').click();
  const slider = page.locator('.panel input[type=range]:visible').first();
  // a section without sliders (Terminal's own) opens on this space: Movimiento has them in every space
  if (!(await slider.count())) await page.locator('.panel').getByRole('tab', { name: 'Movimiento' }).click();
  await expect(slider).toBeVisible();
  await slider.focus();
  // towards whichever end it is not at
  const down = await slider.evaluate(el => Number((el as HTMLInputElement).value) > Number((el as HTMLInputElement).min));
  for (let i = 0; i < 6; i++) await page.keyboard.press(down ? 'ArrowLeft' : 'ArrowRight');
  await expect(page.locator('.seedline')).toContainText('editado');
  if (phone) {
    await page.locator('.deck .ph-tools').click();
    await expect(page.locator('.deck .ph-tools')).toHaveAttribute('aria-pressed', 'false');
  }
}

test.describe('una pieza compartida se ve igual en cualquier pantalla', () => {
  for (const piece of PIECES) {
    test(`${piece.name}: hecha en ${DEVICES[piece.sender].id}, abierta en las demás pantallas`, async ({ browser }, info) => {
      test.setTimeout(420_000);
      const sd = DEVICES[piece.sender];
      const lab = await openLab(browser, sd, piece.hash);
      if (piece.edit) await editPiece(lab.page, sd);
      const link = await shareFromLab(lab.page, sd);
      const { code, view } = readPieceHash(link.hash);
      expect(view.paused).toBe(true);
      const frame = view.frame!;
      const recipe = (await decodeRecipe(code!))!;
      expect(recipe.meta.space).toBe(piece.space);
      // the frame is the stage as the sender sees it: its canvas, at its pixel ratio, with the piece's cells
      const labCanvas = await lab.page.locator('.cv-host canvas').evaluate(c => ({ W: (c as HTMLCanvasElement).width, H: (c as HTMLCanvasElement).height, cssW: c.clientWidth, cssH: c.clientHeight }));
      expect({ w: labCanvas.W, h: labCanvas.H }).toEqual({ w: frame.w, h: frame.h });
      expect(frame).toEqual(frameFor(labCanvas.cssW, labCanvas.cssH, sd.deviceScaleFactor, recipe.glyph.cell, recipe.glyph.aspect));
      if (piece.hash.includes('gen=5')) expect(recipe.meta.gen).toBe(5);
      if (piece.gesture) expect(recipe.interact.mode).toBe('rings');
      await labBare(lab.page);
      // fine enough to see each cell (about four pixels per cell): a reflowed grid cannot hide in the blur
      const tw = Math.min(frame.w, Math.max(160, gridOf(frame).cols * 4));
      const sent = await pixels(lab.page, '.cv-host canvas', tw);
      expect(spread(sent.rgb), 'the sender\'s frame shows something').toBeGreaterThan(4);
      if (SHOTS) await lab.page.screenshot({ path: `${SHOTS}/lab-${sd.id}.png` });
      expect(lab.errors).toEqual([]);

      const rows: string[] = [];
      for (const rd of Object.values(DEVICES)) {
        if (rd === sd) continue;
        const v = await openViewer(browser, rd, link.pathname + link.hash);
        const stage = v.page.locator('.ver-stage');
        await expect(stage).toHaveAttribute('data-frame', encodeFrame(frame));
        const g = gridOf(frame);
        await expect(stage).toHaveAttribute('data-grid', `${g.cols}x${g.rows}`);
        const divisor = Number(await stage.getAttribute('data-divisor'));
        if (SHOTS) await v.page.screenshot({ path: `${SHOTS}/viewer-${sd.id}-en-${rd.id}.png` });
        await viewerBare(v.page);
        const got = await pixels(v.page, '.ver-stage canvas', sent.w, sent.h);
        // drawn at the frame's own size (or an exact fraction of it), whatever this screen's size and density
        expect({ W: got.W * divisor, H: got.H * divisor }).toEqual({ W: frame.w, H: frame.h });
        // shown whole, centred, scaled uniformly: never cropped, never stretched
        const box = await v.page.locator('.ver-stage canvas').boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(-0.5);
        expect(box!.y).toBeGreaterThanOrEqual(-0.5);
        expect(box!.x + box!.width).toBeLessThanOrEqual(rd.viewport.width + 0.5);
        expect(box!.y + box!.height).toBeLessThanOrEqual(rd.viewport.height + 0.5);
        expect(box!.width / box!.height).toBeCloseTo(frame.w / frame.h, 2);
        expect(Math.min(rd.viewport.width - box!.width, rd.viewport.height - box!.height)).toBeLessThan(1);
        const diff = mad(sent.rgb, got.rgb);
        let row = `${sd.id} → ${rd.id}: diferencia ${diff.toFixed(2)} (de 255)${divisor > 1 ? `, dibujada a 1/${divisor}` : ''}`;
        expect(v.errors, rd.id).toEqual([]);
        await v.ctx.close();
        // the control: the same piece reflowed to this screen, which is what a link without its frame shows
        const own = frameFor(rd.viewport.width, rd.viewport.height, 1, recipe.glyph.cell, recipe.glyph.aspect);
        const c = await openViewer(browser, rd, `/ver/#r=${code}&f=${encodeFrame(own)}&t=${view.t}&p=1`);
        await viewerBare(c.page);
        const reflowed = await pixels(c.page, '.ver-stage canvas', sent.w, sent.h);
        await c.ctx.close();
        const control = mad(sent.rgb, reflowed.rgb);
        row += ` · la misma pieza reacomodada a esta pantalla: ${control.toFixed(2)}`;
        rows.push(row);
        console.log(row);
        // the very same pixels: nothing but resampling where the viewer drew an exact fraction of the frame,
        // and a message's letters, whose scramble follows the page's own clock (engine.ts, the compose pass);
        // well under what a reflowed composition gives on the same screen
        const limit = (divisor > 1 ? 3 : 0.5) + (recipe.msg.on ? 3.5 : 0);
        expect(diff, row).toBeLessThan(limit);
        expect(control, row).toBeGreaterThan(Math.max(1.2, diff * 2.5));
      }
      await info.attach('comparación', { body: rows.join('\n'), contentType: 'text/plain' });

      // a piece that answers to the finger keeps answering in the viewer, with the mouse and with a finger
      if (piece.gesture) {
        await answersInViewer(browser, DEVICES.desk, link.pathname + link.hash);
        await answersInViewer(browser, DEVICES.phone, link.pathname + link.hash);
      }

      // the viewer's «Abrir en el estudio» opens the same piece in the lab, as a new entry, with its frame
      if (piece.sender === 'desk') {
        const v = await openViewer(browser, DEVICES.phone, link.pathname + link.hash);
        const open = v.page.getByRole('link', { name: 'Abrir en el estudio' });
        await expect(open).toHaveAttribute('href', `/studio/#r=${code}&f=${encodeFrame(frame)}`);
        await open.click();
        await expect(v.page.locator('.seedline')).toBeVisible({ timeout: 60_000 });
        await dismissWelcome(v.page);
        await expect(v.page.locator('.toast').filter({ hasText: 'Pieza abierta desde un enlace' })).toBeVisible();
        await v.page.locator('.deck .ph-share').click();
        const box = v.page.getByRole('textbox', { name: 'Enlace público a esta pieza' });
        await expect(box).toHaveValue(/\/ver\/#r=z/);
        const again = new URL(await box.inputValue());
        // the very same recipe, and the frame it came in (shared again unedited, it keeps its composition)
        expect(readPieceHash(again.hash).code).toBe(code);
        expect(readPieceHash(again.hash).view.frame).toEqual(frame);
        await v.ctx.close();
      }
      await lab.ctx.close();
    });
  }
});

test.describe('el visor', () => {
  test('mueve la pieza, se pausa y reanuda (botón y espacio), esconde los controles y abre el estudio o la portada', async ({ browser }) => {
    const lab = await openLab(browser, DEVICES.desk, '#seed=telar-fondos-3&space=fondos&gen=4');
    const link = await shareFromLab(lab.page, DEVICES.desk);
    await lab.ctx.close();
    // the same link without its pause: the piece moves
    const moving = link.hash.replace(/&t=[\d.]+&p=1$/, '');
    const v = await openViewer(browser, DEVICES.desk, '/ver/' + moving);
    const page = v.page;
    const a = await pixels(page, '.ver-stage canvas');
    await page.waitForTimeout(1500);
    const b = await pixels(page, '.ver-stage canvas');
    expect(mad(a.rgb, b.rgb), 'it moves').toBeGreaterThan(0.5);
    const play = page.locator('.ver-bar button').first();
    await expect(play).toHaveAttribute('aria-label', 'Pausar (espacio)');
    await expect(page.locator('.ver-stage')).toHaveAttribute('aria-label', /^Pieza de arte ASCII en movimiento/);
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Reproducir (espacio)');
    // the pointer leaves the controls, and stays off the piece (it answers to the pointer)
    await page.mouse.move(80, 450);
    await expect(page.locator('.ver-stage')).toHaveAttribute('aria-label', /^Pieza de arte ASCII en pausa/);
    await page.waitForTimeout(300);
    const c = await pixels(page, '.ver-stage canvas');
    await page.waitForTimeout(1200);
    expect(mad(c.rgb, (await pixels(page, '.ver-stage canvas')).rgb), 'paused, it stays').toBeLessThan(0.3);
    // Space from the page (not a button) plays again
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(play).toHaveAttribute('aria-label', 'Pausar (espacio)');
    // while it plays and nobody touches anything, the controls step aside; a key brings them back
    const wrap = page.locator('.ver');
    await expect(wrap).toHaveAttribute('data-ui', 'off', { timeout: 8000 });
    await page.keyboard.press('ArrowDown');
    await expect(wrap).toHaveAttribute('data-ui', 'on');
    await page.keyboard.press('Escape');
    await expect(wrap).toHaveAttribute('data-ui', 'off');
    // Tab reaches them, and they show while they have the focus
    await page.keyboard.press('Tab');
    await expect(page.locator('.ver-top a:focus, .ver-bar :focus')).toHaveCount(1);
    await expect(page.locator('.ver-brand')).toBeVisible();
    // the two ways out
    await expect(page.getByRole('link', { name: 'Ir a GLYPHOS', exact: true })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Ir a GLYPHOS, la portada' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Abrir en el estudio' })).toHaveAttribute('href', /^\/studio\/#r=z[\w-]+&f=\d+x\d+-\d+x\d+$/);
    expect(await page.title()).toMatch(/· GLYPHOS$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/pieza de arte ASCII hecha con GLYPHOS/);
    expect(v.errors).toEqual([]);
    await v.ctx.close();
  });

  test('una pieza con gestos recibe el dedo: pellizcar la acerca (no la página); ni arrastrar ni tocarla esconde los controles, tocar fuera sí, y en movimiento se quedan', async ({ browser }) => {
    const ZOOM = { ...TAP_PIECE, interact: { mode: 'zoom', strength: 0.9, radius: 0.25, decay: 1 }, meta: { name: 'Zoom con los dedos', space: 'fondos' } };
    const v = await openViewer(browser, DEVICES.phone, '/ver/' + enc(ZOOM) + '&p=1');
    const page = v.page;
    const cv = page.locator('.ver-stage canvas');
    expect(await cv.evaluate(c => getComputedStyle(c).touchAction)).toBe('none');
    // a piece that does not answer leaves the page its own gestures
    expect(await page.locator('.ver-stage').evaluate(el => getComputedStyle(el).touchAction)).toBe('manipulation');
    const client = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
      client.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 4, radiusY: 4, force: 0.5 })) });
    const b = (await cv.boundingBox())!;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    // paused, the controls stay; a one-finger drag across the piece is not a tap: they stay
    const wrap = page.locator('.ver');
    await expect(wrap).toHaveAttribute('data-ui', 'on');
    await touch('touchStart', [{ x: cx - 100, y: cy }]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: cx - 100 + i * 25, y: cy }]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    await expect(wrap).toHaveAttribute('data-ui', 'on');
    // two fingers apart: the piece comes closer under them, and the page itself does not zoom
    await viewerBare(page);
    const before = await pixels(page, '.ver-stage canvas', 96);
    await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: cx - 30 - i * 12, y: cy }, { x: cx + 30 + i * 12, y: cy }]); await page.waitForTimeout(16); }
    await touch('touchEnd', []);
    await expect.poll(async () => mad(before.rgb, (await pixels(page, '.ver-stage canvas', 96)).rgb), { message: 'la pieza se acerca' }).toBeGreaterThan(4);
    expect(await page.evaluate(() => [window.visualViewport?.scale ?? 1, scrollX, scrollY])).toEqual([1, 0, 0]);
    // a tap on the piece is the gesture's (Anillos, Chispas…): the controls stay as they are
    await page.touchscreen.tap(b.x + b.width * 0.8, b.y + b.height * 0.3);
    await page.waitForTimeout(300);
    await expect(wrap).toHaveAttribute('data-ui', 'off');
    // a tap beside the piece (the band around it) shows them
    expect(b.y).toBeGreaterThan(40);
    await page.touchscreen.tap(b.x + b.width / 2, b.y / 2);
    await expect(wrap).toHaveAttribute('data-ui', 'on');
    expect(v.errors).toEqual([]);
    await v.ctx.close();
    // moving, on a touch screen, they do not step aside (no tap on the piece could bring them back)
    const m = await openViewer(browser, DEVICES.phone, '/ver/' + enc(ZOOM));
    await expect(m.page.locator('.ver-bar button').first()).toHaveAttribute('aria-label', 'Pausar (espacio)');
    await m.page.waitForTimeout(4500);
    await expect(m.page.locator('.ver')).toHaveAttribute('data-ui', 'on');
    expect(m.errors).toEqual([]);
    await m.ctx.close();
  });

  test('con «reducir movimiento» abre en pausa y lo dice', async ({ browser }) => {
    const lab = await openLab(browser, DEVICES.desk, '#seed=telar-tipo-61&space=tipo&gen=4');
    const link = await shareFromLab(lab.page, DEVICES.desk);
    await lab.ctx.close();
    const v = await openViewer(browser, DEVICES.phone, '/ver/' + link.hash.replace(/&t=[\d.]+&p=1$/, ''), { reducedMotion: 'reduce' });
    await expect(v.page.locator('.ver-bar button').first()).toHaveAttribute('aria-label', 'Reproducir (espacio)');
    await expect(v.page.locator('.ver-note')).toContainText('En pausa porque tu sistema pide menos movimiento');
    const a = await pixels(v.page, '.ver-stage canvas');
    await v.page.waitForTimeout(1200);
    expect(mad(a.rgb, (await pixels(v.page, '.ver-stage canvas')).rgb)).toBeLessThan(0.3);
    expect(v.errors).toEqual([]);
    await v.ctx.close();
  });

  test('abre sin errores en un navegador dentro de otra app (sin pantalla completa, portapapeles, almacenamiento ni WebGL 2)', async ({ browser }) => {
    const lab = await openLab(browser, DEVICES.desk, '#seed=telar-arte-4&space=arte&gen=4');
    const link = await shareFromLab(lab.page, DEVICES.desk);
    await labBare(lab.page);
    const sent = await pixels(lab.page, '.cv-host canvas');
    await lab.ctx.close();
    const ctx = await browser.newContext(ctxOf(DEVICES.phone));
    // what in-app browsers often lack, or refuse
    await ctx.addInitScript(() => {
      Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
      Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
      Object.defineProperty(window, 'ResizeObserver', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { get: () => undefined, configurable: true });
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('denied', 'SecurityError'); }, configurable: true });
      Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined, configurable: true });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(link.pathname + link.hash);
    const stage = page.locator('.ver-stage');
    await expect(stage).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
    // the basic engine (Canvas 2D) draws the same frame
    await expect(stage).toHaveAttribute('data-renderer', 'basic');
    const g = gridOf(readPieceHash(link.hash).view.frame!);
    await expect(stage).toHaveAttribute('data-grid', `${g.cols}x${g.rows}`);
    await viewerBare(page);
    const got = await pixels(page, '.ver-stage canvas', sent.w, sent.h);
    const diff = mad(sent.rgb, got.rgb);
    console.log(`motor básico (sin WebGL 2), 1440×900 → 390×844: diferencia ${diff.toFixed(2)}`);
    expect(diff).toBeLessThan(12);
    // no full screen button where there is no full screen
    await expect(page.getByRole('button', { name: /Pantalla completa/ })).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('girar el teléfono: la pieza se dibuja con todos sus píxeles, con la misma composición', async ({ browser }) => {
    // a retina desktop's frame (2880 × 1624, cells 20 × 28) on a phone held upright: drawn at half its pixels
    const recipe = normalizeRecipe({ v: 2, layers: [{ pattern: 'plasma', on: true }], glyph: { cell: 10, aspect: 1.4 }, meta: { name: 'Giro' } });
    const frame = frameFor(1440, 812, 2, 10, 1.4);
    expect(encodeFrame(frame)).toBe('2880x1624-20x28');
    const v = await openViewer(browser, { ...DEVICES.phone, deviceScaleFactor: 3 }, `/ver/#r=${await encodeRecipe(recipe)}&f=${encodeFrame(frame)}&t=3&p=1`);
    const stage = v.page.locator('.ver-stage');
    const canvasPx = () => v.page.locator('.ver-stage canvas').evaluate(c => ({ W: (c as HTMLCanvasElement).width, H: (c as HTMLCanvasElement).height }));
    await expect(stage).toHaveAttribute('data-divisor', '2');
    expect(await canvasPx()).toEqual({ W: 1440, H: 812 });
    await expect(v.page.locator('.ver-note')).toContainText('Gira el teléfono');
    await viewerBare(v.page);
    const upright = await pixels(v.page, '.ver-stage canvas', 160);
    // turned: shown 2075 device px wide, more than the 1440 drawn; the whole frame is drawn again
    await v.page.setViewportSize({ width: 844, height: 390 });
    await expect(stage).toHaveAttribute('data-divisor', '1');
    await expect.poll(canvasPx).toEqual({ W: 2880, H: 1624 });
    await expect(v.page.locator('.ver-note', { hasText: 'Gira el teléfono' })).toHaveCount(0);
    await expect(stage).toHaveAttribute('data-grid', `${gridOf(frame).cols}x${gridOf(frame).rows}`);
    const box = (await v.page.locator('.ver-stage canvas').boundingBox())!;
    expect(box.width * 3, 'never scaled up').toBeLessThanOrEqual(2880 + 1);
    expect(box.width / box.height).toBeCloseTo(frame.w / frame.h, 2);
    await viewerBare(v.page);
    await v.page.waitForTimeout(300);
    const turned = await pixels(v.page, '.ver-stage canvas', 160);
    // the very same composition and moment, at twice the pixels (only resampling differs)
    const diff = mad(upright.rgb, turned.rgb);
    console.log(`girado: diferencia ${diff.toFixed(2)} (de 255) con la pieza antes de girar`);
    expect(spread(turned.rgb)).toBeGreaterThan(4);
    expect(diff).toBeLessThan(3);
    // back upright: it keeps its pixels (nothing to redraw)
    await v.page.setViewportSize({ width: 390, height: 844 });
    await v.page.waitForTimeout(400);
    await expect(stage).toHaveAttribute('data-divisor', '1');
    expect(v.errors).toEqual([]);
    await v.ctx.close();
  });

  test('en pausa no dibuja nada, tampoco una pieza de video o de cámara, cuyo medio no viaja (los dos motores)', async ({ browser }) => {
    test.setTimeout(240_000);
    for (const basic of [false, true]) {
      for (const source of ['pattern', 'video', 'camera'] as const) {
        const ctx = await browser.newContext(ctxOf(DEVICES.desk));
        await ctx.addInitScript(basic => {
          const w = window as unknown as { __draws: number };
          w.__draws = 0;
          const count = <T extends object>(P: T, names: string[]) => {
            for (const n of names) {
              const f = (P as Record<string, (...a: unknown[]) => unknown>)[n];
              (P as Record<string, unknown>)[n] = function (this: unknown, ...a: unknown[]) { w.__draws++; return f.apply(this, a); };
            }
          };
          if (basic) {
            Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined, configurable: true });
            count(CanvasRenderingContext2D.prototype, ['drawImage', 'putImageData']);
          } else count(WebGL2RenderingContext.prototype, ['drawArrays', 'drawElements']);
        }, basic);
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        const media = source === 'video' ? { ref: { kind: 'video', type: 'video/mp4', w: 640, h: 480 } } : {};
        const code = await encodeRecipe(normalizeRecipe({ v: 2, source, media, layers: [{ pattern: 'plasma', on: true }], glyph: { cell: 12 } }));
        await page.goto(`/ver/#r=${code}&f=800x450-12x17&t=3&p=1`);
        await expect(page.locator('.ver-stage[data-state="ready"]')).toHaveCount(1, { timeout: 60_000 });
        await expect(page.locator('.ver-stage')).toHaveAttribute('data-renderer', basic ? 'basic' : 'webgl2');
        await expect(page.locator('.ver-bar button').first()).toHaveAttribute('aria-label', 'Reproducir (espacio)');
        await page.waitForTimeout(800);
        const a = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
        await page.waitForTimeout(2000);
        const b = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
        console.log(`${basic ? 'básico' : 'WebGL'} · ${source}: ${b - a} llamadas de dibujo en 2 s de pausa`);
        expect(b - a, `${basic ? 'basic' : 'webgl'} ${source}`).toBe(0);
        // it still answers: playing draws
        await page.locator('.ver-bar button').first().click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { __draws: number }).__draws)).toBeGreaterThan(b);
        expect(errors).toEqual([]);
        await ctx.close();
      }
    }
  });

  test('un encuadre que ningún estudio da (celdas diminutas en un lienzo enorme) abre en el encuadre de siempre, sin colgarse', async ({ browser }) => {
    const recipe = normalizeRecipe({ v: 2, layers: [{ pattern: 'plasma', on: true }], glyph: { cell: 12 } });
    const code = await encodeRecipe(recipe);
    for (const gl of [true, false]) {
      const ctx = await browser.newContext(ctxOf(DEVICES.phone));
      if (!gl) await ctx.addInitScript(() => Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined, configurable: true }));
      const page = await ctx.newPage();
      const t0 = Date.now();
      await page.goto(`/ver/#r=${code}&f=8191x8191-2x2`);
      const stage = page.locator('.ver-stage');
      await expect(stage).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
      await expect(stage).toHaveAttribute('data-frame', encodeFrame(defaultFrame(recipe)));
      const ms = Date.now() - t0;
      // the page answers at once: an animation frame comes in well under a second
      const raf = await page.evaluate(() => new Promise<number>(res => { const a = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - a))); }));
      console.log(`${gl ? 'WebGL' : 'básico'}: lista en ${ms} ms, dos cuadros en ${raf.toFixed(0)} ms`);
      expect(raf).toBeLessThan(1000);
      await ctx.close();
    }
  });

  test('un enlace roto, uno vacío, y una semilla que llega al visor', async ({ page }) => {
    await page.goto('/ver/#r=zAAAAnoesunareceta');
    await expect(page.getByRole('heading', { name: 'No se pudo leer esta pieza' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir el estudio' })).toHaveAttribute('href', '/studio/');
    await page.goto('/ver/');
    await expect(page.getByRole('heading', { name: 'Este enlace no trae ninguna pieza' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a GLYPHOS', exact: true })).toHaveAttribute('href', '/');
    // a seed belongs to the studio, as it always did
    await page.goto('/ver/#seed=faro-lunar-417&space=arte&gen=2');
    await expect(page).toHaveURL(/\/studio\/$/, { timeout: 30_000 });
    await expect(page.locator('.seedline')).toContainText('faro-lunar-417', { timeout: 60_000 });
  });
});

test.describe('la página del visor', () => {
  test('se sirve fuera de los buscadores, con su dirección canónica y la imagen de la marca para las apps', async ({ page, request }) => {
    // /ver goes to /ver/, as every page of the site does: on the host that is vercel.json (clean URLs, a
    // trailing slash, a permanent 308); `vite preview` does the same (scripts/seo-plugin.ts), wherever the
    // build it serves lives. The Location may be relative (the preview) or absolute: it must lead to /ver/.
    const host = JSON.parse(readFileSync('vercel.json', 'utf8')) as { cleanUrls?: boolean; trailingSlash?: boolean };
    expect(host).toMatchObject({ cleanUrls: true, trailingSlash: true });
    const r = await request.get('/ver', { maxRedirects: 0, headers: { accept: 'text/html' } });
    expect(r.status()).toBe(308);
    const to = new URL(r.headers().location, r.url());
    expect(to.pathname + to.search).toBe('/ver/');
    expect(to.origin).toBe(new URL(r.url()).origin);
    await page.goto('/ver/');
    const meta = (sel: string, attr = 'content') => page.locator(sel).getAttribute(attr);
    expect(await meta('meta[name="robots"]')).toBe('noindex');
    expect(await meta('link[rel="canonical"]', 'href')).toBe('https://glyphos-ascii.vercel.app/ver/');
    expect(await meta('meta[property="og:image"]')).toBe('https://glyphos-ascii.vercel.app/og.jpg');
    expect(await meta('meta[property="og:image:alt"]')).toContain('«Haz arte ASCII»');
    expect(await meta('meta[name="twitter:image:alt"]')).toBe(await meta('meta[property="og:image:alt"]'));
    // the share image is there, and it is a picture
    const img = await request.get('/og.jpg');
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/jpeg');
    // and the page is not in the sitemap
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('/ver/');
  });
});

test.describe('los enlaces de antes', () => {
  test('#r= y #seed= siguen abriendo el estudio como siempre', async ({ browser }) => {
    const lab = await openLab(browser, DEVICES.desk, '#seed=telar-arte-4&space=arte&gen=4');
    const link = await shareFromLab(lab.page, DEVICES.desk);
    await lab.ctx.close();
    const { code } = readPieceHash(link.hash);
    // a link from before the viewer: the recipe alone, in the studio
    const old = await openLab(browser, DEVICES.desk, `#r=${code}`);
    await expect(old.page.locator('.toast').filter({ hasText: 'Pieza abierta desde un enlace' })).toBeVisible();
    await expect(old.page.locator('.seedline')).toContainText('telar-arte-4');
    expect(new URL(old.page.url()).hash).toBe('');
    await old.page.locator('.topbar .share-btn').click();
    // shared again, it is the same recipe (framed by this stage)
    const again = old.page.getByRole('textbox', { name: 'Enlace público a esta pieza' });
    await expect(again).toHaveValue(/\/ver\/#r=z/);
    expect(readPieceHash(new URL(await again.inputValue()).hash).code).toBe(code);
    expect(old.errors).toEqual([]);
    await old.ctx.close();
    const seed = await openLab(browser, DEVICES.phone, '#seed=faro-lunar-417&space=arte&gen=2');
    await expect(seed.page.locator('.seedline .ell')).toHaveText('faro-lunar-417');
    await seed.ctx.close();
  });
});

test.describe('la hoja «Compartir»', () => {
  test('copiar, compartir del sistema, WhatsApp y otras apps; semilla, receta y archivo, cada uno dicho', async ({ browser }) => {
    const lab = await openLab(browser, DEVICES.desk, '#seed=telar-arte-4&space=arte&gen=4');
    const page = lab.page;
    // where the browser has a share sheet of its own, «Compartir…» uses it
    await page.evaluate(() => {
      (window as unknown as { shared: unknown[] }).shared = [];
      Object.defineProperty(navigator, 'share', { value: (d: unknown) => { (window as unknown as { shared: unknown[] }).shared.push(d); return Promise.resolve(); }, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    });
    await page.locator('.topbar .share-btn').click();
    const sheet = page.getByRole('dialog', { name: 'Compartir' });
    const box = sheet.getByRole('textbox', { name: 'Enlace público a esta pieza' });
    await expect(box).toHaveValue(/\/ver\/#r=z/);
    const link = await box.inputValue();
    // a piece that moves: its link carries no moment and no pause
    expect(link).toMatch(/&f=\d+x\d+-\d+x\d+$/);
    await sheet.getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(sheet.getByRole('button', { name: 'Enlace copiado ✓' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await sheet.getByRole('button', { name: 'Compartir…' }).click();
    expect(await page.evaluate(() => (window as unknown as { shared: Array<{ url: string }> }).shared.map(s => s.url))).toEqual([link]);
    const e = encodeURIComponent(link);
    await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', new RegExp(`^https://wa\\.me/\\?text=.*${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    await expect(sheet.getByRole('link', { name: 'Telegram' })).toHaveAttribute('href', `https://t.me/share/url?url=${e}&text=${encodeURIComponent('Una pieza de arte ASCII hecha con GLYPHOS')}`);
    await expect(sheet.getByRole('link', { name: 'X' })).toHaveAttribute('href', new RegExp(`^https://twitter\\.com/intent/tweet\\?text=.*&url=`));
    await expect(sheet.getByRole('link', { name: 'Correo' })).toHaveAttribute('href', /^mailto:\?subject=/);
    for (const name of ['WhatsApp', 'Telegram', 'X']) await expect(sheet.getByRole('link', { name })).toHaveAttribute('rel', 'noopener noreferrer');
    // the seed, apart, for what it is
    await expect(sheet.getByRole('heading', { name: /Semilla/ })).toContainText('para reproducir el resultado del azar');
    await expect(sheet.locator('.shr-seed b')).toHaveText('telar-arte-4');
    await expect(sheet.getByRole('heading', { name: /Receta editable/ })).toBeVisible();
    await expect(sheet.getByRole('heading', { name: /Archivo exportado/ })).toBeVisible();
    // the editable recipe is a file
    const [dl] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Descargar receta' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.glyphos\.json$/);
    // «Exportar archivo…» leads to the export sheet
    await sheet.getByRole('button', { name: 'Exportar archivo…' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Imagen' })).toBeVisible();
    await page.keyboard.press('Escape');
    // «L» copies the same link at once
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('l');
    await expect(page.locator('.toast').filter({ hasText: 'Enlace copiado' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    expect(lab.errors).toEqual([]);
    await lab.ctx.close();
  });
});
