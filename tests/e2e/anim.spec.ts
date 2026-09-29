import { realpathSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ViteDevServer } from 'vite';

/**
 * The animation library and the timeline, through their QA pages (dev/anim.html: window.qa renders any
 * template; dev/timeline.html: the timeline on a sample project with its preview). dev/ pages are not part
 * of the production build, so this spec starts its own Vite dev server (port PW_DEV_PORT, default
 * PW_PORT + 1000). Skipped against a deployed site (BASE_URL).
 */
const remote = !!process.env.BASE_URL;
const port = Number(process.env.PW_DEV_PORT ?? Number(process.env.PW_PORT ?? 4173) + 1000);
const base = `http://127.0.0.1:${port}/dev/`;

test.describe.configure({ mode: 'serial' });
test.skip(remote, 'dev pages only exist in the dev server');

let server: ViteDevServer | null = null;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  const { createServer } = await import('vite');
  server = await createServer({
    server: { port, strictPort: true, host: '127.0.0.1', fs: { allow: [process.cwd(), realpathSync('node_modules')] } },
    logLevel: 'error',
  });
  await server.listen();
});
test.afterAll(async () => { await server?.close(); });

interface Qa { ready: boolean; error: string; errors: string[] }
type W = Window & { qa: Qa & Record<string, unknown> };

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let stale = false;
  page.on('response', r => { if (r.status() === 504) stale = true; });
  await page.goto(base + path);
  const deadline = Date.now() + 150_000;
  let reloaded = false;
  for (;;) {
    const ok = await page.evaluate(() => !!(window as unknown as W).qa?.ready || !!(window as unknown as W).qa?.error).catch(() => false);
    if (ok) break;
    if (stale && !reloaded) { reloaded = true; stale = false; await page.reload(); continue; }
    if (Date.now() > deadline) throw new Error('la página de QA no terminó de cargar');
    await page.waitForTimeout(500);
  }
  expect(await page.evaluate(() => (window as unknown as W).qa.error)).toBe('');
  return errors;
}

/* ------------------------------------------------------------------ the library */

test('every template renders at five times on its layer, and at mid-clip on every kind it supports', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = await open(page, 'anim.html?only=none');
  const res = await page.evaluate(async () => {
    const qa = (window as unknown as { qa: { ids: string[]; dur(id: string): number; kinds(id: string): string[]; render(id: string, t: number, o?: { kind?: string }): Promise<{ hash: string; std: number; notes: string[]; warnings: string[] }> } }).qa;
    const out: Array<{ id: string; kind: string; notes: string[]; hashes: string[] }> = [];
    for (const id of qa.ids) {
      const dur = qa.dur(id);
      const hashes: string[] = [], notes: string[] = [];
      for (const k of [0, 0.25, 0.5, 0.75, 1]) { const r = await qa.render(id, k * dur); hashes.push(r.hash); notes.push(...r.notes, ...r.warnings); }
      out.push({ id, kind: 'auto', notes, hashes });
      for (const kind of qa.kinds(id)) { const r = await qa.render(id, dur * 0.5, { kind }); out.push({ id, kind, notes: [...r.notes, ...r.warnings], hashes: [r.hash] }); }
    }
    return out;
  });
  expect(res.length).toBeGreaterThan(53 * 2);
  for (const r of res) expect(r.notes, `${r.id} (${r.kind})`).toEqual([]);
  // something moves: the five frames of a template are not all the same picture (brief bursts may fall
  // between the quarters: «Parpadeo» and «Glitch» are checked at their own moments by the unit tests)
  for (const r of res.filter(x => x.kind === 'auto' && x.id !== 'parpadeo' && x.id !== 'glitch')) expect(new Set(r.hashes).size, r.id).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('a reversed clip draws the forward frames in reverse order, pixel for pixel', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, 'anim.html?only=none');
  const cases: Array<[string, string]> = [['foto-a-ascii', 'glyphs'], ['dispersar', 'photo'], ['iris', 'photo'], ['escritura', 'text'], ['fragmentar', 'ascii'], ['pixelado', 'photo'], ['un-glifo', 'glyphs']];
  for (const [id, kind] of cases) {
    const r = await page.evaluate(([id, kind]) => (window as unknown as { qa: { reverseCheck(id: string, o: { kind: string; n: number }): Promise<Array<{ k: number; same: boolean; differ: number }>> } }).qa.reverseCheck(id, { kind, n: 5 }), [id, kind]);
    expect(r.every(f => f.same), `${id} en ${kind}: ${JSON.stringify(r)}`).toBe(true);
  }
});

/* ------------------------------------------------------------------ the timeline */

const QA = (fn: string) => `(async () => { const qa = window.qa; return (${fn})(qa); })()`;
const ev = <T>(page: Page, fn: string) => page.evaluate(QA(fn)) as Promise<T>;

test('the timeline: drag a clip with snapping and one undo step; resize from an edge', async ({ page }) => {
  const errors = await open(page, 'timeline.html');
  const clip = page.locator('[data-clip="c-glitch"]');
  const box = (await clip.boundingBox())!;
  const pps = Number(await page.locator('.tl').getAttribute('data-pps'));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);
  await page.mouse.up();
  const moved = await ev<{ start: number }>(page, 'qa => qa.clip("c-glitch")');
  expect(moved.start).toBeGreaterThan(3 + 60 / pps);
  expect(moved.start).toBeLessThan(3 + 140 / pps);
  // one drag = one undo step
  await ev(page, 'qa => qa.store.undo()');
  expect((await ev<{ start: number }>(page, 'qa => qa.clip("c-glitch")')).start).toBeCloseTo(3, 5);
  // snapping: dropped near the end of «Foto → ASCII» (0.4 + 2 = 2.4 s), the clip lands on it
  const b2 = (await clip.boundingBox())!;
  const target = b2.x - (3 - 2.4) * pps + 4;
  await page.mouse.move(b2.x + 20, b2.y + b2.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b2.x + 20 + ((target - b2.x) * i) / 8, b2.y + b2.height / 2);
  await page.mouse.up();
  expect((await ev<{ start: number }>(page, 'qa => qa.clip("c-glitch")')).start).toBeCloseTo(2.4, 5);
  // resize from the right edge
  const b3 = (await clip.boundingBox())!;
  await page.mouse.move(b3.x + b3.width - 3, b3.y + b3.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(b3.x + b3.width - 3 + i * 12, b3.y + b3.height / 2, { steps: 1 });
  await page.mouse.up();
  const r = await ev<{ start: number; dur: number }>(page, 'qa => qa.clip("c-glitch")');
  expect(r.start).toBeCloseTo(2.4, 5);
  expect(r.dur).toBeGreaterThan(1.2 + 40 / pps);
  expect(errors).toEqual([]);
});

test('the timeline: add a key at the playhead with K, drag it, change its curve, delete it', async ({ page }) => {
  const errors = await open(page, 'timeline.html');
  // the ASCII row's properties; focus «Opacidad»
  await page.getByRole('button', { name: /Mostrar las propiedades animadas de «ASCII/ }).click();
  await page.getByRole('button', { name: 'Opacidad', exact: true }).click();
  await ev(page, 'qa => qa.store.setTime(1.5)');
  await page.locator('.tl').focus();
  await page.keyboard.press('k');
  let keys = await ev<Array<{ t: number }>>(page, 'qa => qa.track("ascii", "opacity").keys');
  expect(keys.map(k => k.t)).toContain(1.5);
  // drag the new key right
  const key = page.locator('.tl-key[data-path="opacity"][data-t="1.5"]');
  const kb = (await key.boundingBox())!;
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(kb.x + kb.width / 2 + i * 7, kb.y + kb.height / 2);
  await page.mouse.up();
  keys = await ev<Array<{ t: number }>>(page, 'qa => qa.track("ascii", "opacity").keys');
  const moved = keys.map(k => k.t).find(t => t > 1.5 && t < 2.5);
  expect(moved).toBeTruthy();
  // double click: the key panel; pick «Rebote contenido»
  const mk = page.locator(`.tl-key[data-path="opacity"][data-t="${moved}"]`);
  await mk.click();
  await mk.click();
  await expect(page.getByRole('dialog', { name: /Llave de Opacidad/ })).toBeVisible();
  await page.getByRole('button', { name: /Rebote contenido/ }).click();
  const ease = await ev<{ kind: string; p: number[] }>(page, `qa => qa.track("ascii", "opacity").keys.find(k => k.t === ${moved}).ease`);
  expect(ease).toEqual({ kind: 'bezier', p: [0.34, 1.45, 0.64, 1] });
  // the custom curve: a handle moved with the keyboard
  await page.getByRole('button', { name: /Curva propia/ }).click();
  await page.getByRole('slider', { name: 'Tirador de salida' }).focus();
  await page.keyboard.press('ArrowRight');
  const e2 = await ev<{ kind: string; p: number[] }>(page, `qa => qa.track("ascii", "opacity").keys.find(k => k.t === ${moved}).ease`);
  expect(e2.kind).toBe('bezier');
  // close, select the key, Delete
  await page.keyboard.press('Escape');
  await mk.click();
  await page.keyboard.press('Delete');
  keys = await ev<Array<{ t: number }>>(page, 'qa => qa.track("ascii", "opacity").keys');
  expect(keys.map(k => k.t)).not.toContain(moved);
  expect(errors).toEqual([]);
});

test('the timeline: play, pause, reverse, loop region, speed, and the keyboard', async ({ page }) => {
  const errors = await open(page, 'timeline.html');
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await page.waitForTimeout(700);
  const t1 = await ev<number>(page, 'qa => qa.time()');
  expect(t1).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Pausar' }).click();
  const paused = await ev<number>(page, 'qa => qa.time()');
  await page.waitForTimeout(300);
  expect(await ev<number>(page, 'qa => qa.time()')).toBe(paused);
  // no work when idle: the preview does not render again
  await ev(page, 'qa => qa.settle()');
  const r0 = await ev<number>(page, 'qa => qa.renders');
  await page.waitForTimeout(800);
  expect(await ev<number>(page, 'qa => qa.renders')).toBe(r0);
  // backwards
  await page.getByRole('button', { name: 'Reproducir al revés' }).click();
  await page.waitForTimeout(400);
  expect(await ev<number>(page, 'qa => qa.time()')).toBeLessThan(paused);
  expect(await ev<number>(page, 'qa => qa.clock.state().rate')).toBeLessThan(0);
  await page.getByRole('button', { name: 'Reproducir al revés' }).click();
  // a loop region: playing stays inside it
  await ev(page, 'qa => qa.store.setTime(2)');
  await page.getByRole('button', { name: 'Región de bucle' }).click();
  const region = await ev<{ in: number; out: number }>(page, 'qa => qa.clock.state().region');
  expect(region.out).toBeGreaterThan(region.in);
  await page.getByLabel('Velocidad').selectOption('2');
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    const t = await ev<number>(page, 'qa => qa.time()');
    expect(t).toBeGreaterThanOrEqual(region.in - 1e-6);
    expect(t).toBeLessThanOrEqual(region.out + 1e-6);
  }
  expect(await ev<number>(page, 'qa => qa.clock.state().rate')).toBe(2);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Región de bucle' }).click();
  // keyboard: frames, seconds, home/end, space
  await page.locator('.tl').focus();
  await page.keyboard.press('Home');
  expect(await ev<number>(page, 'qa => qa.time()')).toBe(0);
  await page.keyboard.press('ArrowRight');
  expect(await ev<number>(page, 'qa => qa.time()')).toBeCloseTo(1 / 30, 6);
  await page.keyboard.press('Shift+ArrowRight');
  expect(await ev<number>(page, 'qa => qa.time()')).toBeCloseTo(1 + 1 / 30, 6);
  await page.keyboard.press('ArrowLeft');
  expect(await ev<number>(page, 'qa => qa.time()')).toBeCloseTo(1, 6);
  await page.keyboard.press('Space');
  expect(await ev<boolean>(page, 'qa => qa.clock.state().playing')).toBe(true);
  await page.keyboard.press('Space');
  expect(await ev<boolean>(page, 'qa => qa.clock.state().playing')).toBe(false);
  await page.keyboard.press('End');
  expect(await ev<number>(page, 'qa => qa.time()')).toBeCloseTo(8, 6);
  // a clip: Alt+→ moves it a frame; Enter opens its panel; Delete removes it
  await page.locator('[data-clip="c-sale"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.tl').focus();
  await page.keyboard.press('Alt+ArrowRight');
  expect((await ev<{ start: number }>(page, 'qa => qa.clip("c-sale")')).start).toBeCloseTo(5.6 + 1 / 30, 6);
  await page.keyboard.press('Delete');
  expect(await ev<unknown>(page, 'qa => qa.clip("c-sale")')).toBeNull();
  expect(errors).toEqual([]);
});

test('the timeline: the library adds a clip with animated previews, and closes to nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await open(page, 'timeline.html');
  await page.getByRole('button', { name: 'Añadir animación' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir animación' });
  await expect(dialog).toBeVisible();
  // previews draw (a card's canvas is not blank after a moment)
  const card = dialog.locator('[data-item="lupa"]');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => card.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 97) s += d[i];
    return s;
  }), { timeout: 30_000 }).toBeGreaterThan(1000);
  await card.click();
  await expect(dialog).toBeHidden();
  const templates = await ev<string[]>(page, 'qa => qa.project().layers.find(l => l.id === "ascii").clips.map(c => c.template)');
  expect(templates).toContain('lupa');
  // choreographies
  await page.getByRole('button', { name: 'Añadir animación' }).click();
  await page.getByRole('tab', { name: 'Coreografías' }).click();
  await dialog.locator('[data-choreo="iris"]').click();
  const after = await ev<string[]>(page, 'qa => qa.project().layers.find(l => l.id === "ascii").clips.map(c => c.template)');
  expect(after.filter(t => t === 'iris').length).toBe(2);
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('touch: one finger pans, two fingers zoom, a long press opens the clip menu; targets are 44 px', async ({ page }) => {
    const errors = await open(page, 'timeline.html?compact=1');
    const cdp = await page.context().newCDPSession(page);
    const lane = page.locator('.tl-lane[data-layer="foto"]');
    const lb = (await lane.boundingBox())!;
    const y = lb.y + lb.height / 2;
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<[number, number]>) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, yy], id) => ({ x, y: yy, id })) });
    // two fingers apart: zoom in
    const pps0 = Number(await page.locator('.tl').getAttribute('data-pps'));
    const cx = lb.x + lb.width / 2;
    await touch('touchStart', [[cx - 30, y], [cx + 30, y]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 30 - i * 12, y], [cx + 30 + i * 12, y]]);
    await touch('touchEnd', []);
    const pps1 = Number(await page.locator('.tl').getAttribute('data-pps'));
    expect(pps1).toBeGreaterThan(pps0 * 1.5);
    // one finger: pan
    const s0 = Number(await page.locator('.tl').getAttribute('data-start'));
    await touch('touchStart', [[cx + 60, y]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + 60 - i * 15, y]]);
    await touch('touchEnd', []);
    expect(Number(await page.locator('.tl').getAttribute('data-start'))).toBeGreaterThan(s0);
    // long press on a clip: its menu
    await page.locator('.tl').evaluate(() => undefined);
    await page.getByRole('button', { name: 'Ver todo' }).tap();
    const c = (await page.locator('[data-clip="c-entra"]').boundingBox())!;
    await touch('touchStart', [[c.x + c.width / 2, c.y + c.height / 2]]);
    await page.waitForTimeout(700);
    await touch('touchEnd', []);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Al revés' }).tap();
    expect((await ev<{ reverse: boolean }>(page, 'qa => qa.clip("c-entra")')).reverse).toBe(true);
    // a tap on a clip opens its panel as a sheet
    await page.locator('[data-clip="c-glitch"]').tap();
    await expect(page.getByRole('dialog', { name: /Glitch/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).first().tap();
    // controls of the bar and the rows are at least 44 px tall
    const small = await page.locator('.tl-bar button, .tl-head button.name, .tl-head .mini').evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 43.5).map(e => e.getAttribute('aria-label') ?? e.textContent));
    expect(small).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test('reduced motion: library previews show one still frame each', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await open(page, 'timeline.html');
  await page.getByRole('button', { name: 'Añadir animación' }).click();
  const hashes = () => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('.tl-card canvas')].slice(0, 4).map(c => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0; for (let i = 0; i < d.length; i += 13) h = (h * 31 + d[i]) >>> 0;
    return h;
  }));
  await expect.poll(async () => (await hashes()).filter(h => h !== 0).length, { timeout: 30_000 }).toBe(4);
  const a = await hashes();
  await page.waitForTimeout(1500);
  expect(await hashes()).toEqual(a);
  await ctx.close();
});

