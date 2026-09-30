import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FOTO_STUDIO } from '../../src/shared/site';

/** Helpers of the photo studio's specs (tests/e2e/foto-*.spec.ts). The page runs with ?qa: window.__foto. */

/**
 * The photo and video studio is paused unless the build has VITE_FOTO_STUDIO=1 (src/shared/site.ts). The same
 * variable in this run says which build is served: the web server of playwright.config.ts builds with it.
 */
export { FOTO_STUDIO };
export const FOTO_PAUSED = 'El estudio de foto y video está en pausa en esta compilación (VITE_FOTO_STUDIO sin definir): '
  + 'estas pruebas corren contra la compilación con el estudio, VITE_FOTO_STUDIO=1 PW_PORT=<otro puerto> npx playwright test foto-';
/** At the top of a spec that needs the photo studio: while it is paused, every test in the file skips and says why. */
export const needsFotoStudio = () => test.skip(!FOTO_STUDIO, FOTO_PAUSED);

export const PHOTO = join(import.meta.dirname, '../fixtures/photos/retrato-pelo.jpg');
export const PHOTO2 = join(import.meta.dirname, '../fixtures/photos/guitarra-mantas.jpg');

export interface RenderInfo { ms: number; scale: number; light: boolean; w: number; h: number; warnings: string[]; n: number }

/** Opens the photo studio; returns the page errors and console errors seen from then on. */
export async function openFoto(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // any test that opens the studio skips while it is paused (e.g. the scenarios of escenarios.spec.ts)
  test.skip(!FOTO_STUDIO, FOTO_PAUSED);
  await page.goto('/studio/foto/?qa' + hash);
  // a server reused from a build without the studio (same port) answers with the «en revisión» page: say so
  await expect(page.locator('.fstart, .fedit, [data-foto-review]').first()).toBeVisible({ timeout: 45_000 });
  if (await page.locator('[data-foto-review]').count()) {
    throw new Error('VITE_FOTO_STUDIO=1, pero el servidor sirve la compilación con el estudio en pausa: detén el servidor de este puerto (o usa otro PW_PORT) para que se compile con el estudio.');
  }
  return errors;
}

/** Waits until the viewport has drawn a final (not light) frame newer than render number `after`. */
export async function finalRender(page: Page, after = 0): Promise<RenderInfo> {
  await page.waitForFunction(n => {
    const r = (window as unknown as { __foto?: { ui(): { render: RenderInfo } } }).__foto?.ui().render;
    return !!r && r.n > n && !r.light;
  }, after, { timeout: 90_000 });
  return page.evaluate(() => (window as unknown as { __foto: { ui(): { render: RenderInfo } } }).__foto.ui().render);
}

export const renderCount = (page: Page) => page.evaluate(() => (window as unknown as { __foto: { ui(): { render: RenderInfo } } }).__foto.ui().render.n);

/** Starts a project from the fixture photo through the drop zone's file picker. */
export async function startFromPhoto(page: Page, file = PHOTO) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.fs-drop').click();
  await (await chooser).setFiles(file);
  await expect(page.locator('.fv-art')).toBeVisible({ timeout: 45_000 });
  return finalRender(page);
}

/** Hash and size of the viewport's art after a settled final render (at `scale` when given). */
export async function settle(page: Page, scale?: number): Promise<{ w: number; h: number; hash: string; scale: number }> {
  const r = await page.evaluate(s => (window as unknown as { __foto: { settle(s?: number): Promise<unknown> } }).__foto.settle(s), scale);
  expect(r).not.toBeNull();
  return r as { w: number; h: number; hash: string; scale: number };
}

export async function project(page: Page) {
  return page.evaluate(() => (window as unknown as { __foto: { project(): unknown } }).__foto.project()) as Promise<{
    id: string; name: string; canvas: { w: number; h: number; transparent: boolean; bg: string };
    layers: Array<{ id: string; name: string; kind: string; opacity: number; blend: string; visible: boolean; locked: boolean; finishes: Array<{ kind: string; on: boolean; amount: number }>; mask: null | { off?: boolean; invert: boolean; feather: number; opacity: number; parts: Array<Record<string, unknown>> }; style?: { glyph: { charset: string; cell: number } } }>;
  }>;
}

/**
 * A spec-local rectangle tool pushed into the palette through window.__foto (never shipped): drag draws a
 * rectangle part (live preview through host.preview, committed on release as one undo step), Enter adds a
 * centred one, the arrows move the pending one, Escape cancels. It counts its cancels.
 */
export async function installTestTool(page: Page) {
  await page.evaluate(() => {
    type P = { x: number; y: number };
    const F = (window as unknown as { __foto: Record<string, any> }).__foto; // eslint-disable-line @typescript-eslint/no-explicit-any
    const st: { a: P | null; b: P | null; kx: number; ky: number } = { a: null, b: null, kx: 0.3, ky: 0.3 };
    const rect = (a: P, b: P, op: string) => ({ kind: 'rect', op, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), rot: 0, soft: 0, alpha: 1 });
    const commit = (part: Record<string, unknown>, host: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const id = host.target();
      if (!id) return;
      F.ps.updateLayer(id, (l: any) => { l.mask = l.mask ? { ...l.mask, parts: [...l.mask.parts, part] } : { invert: false, feather: 0, opacity: 1, parts: [part] }; }); // eslint-disable-line @typescript-eslint/no-explicit-any
      F.commits = (F.commits ?? 0) + 1;
    };
    F.cancels = 0; F.downs = 0; F.moves = 0;
    F.addTool({
      id: 'prueba-rect', name: 'Rectángulo de prueba', hint: 'Arrastra para dibujar una zona. En teléfono: un dedo.', shortcut: 'q', group: 'seleccion',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>', draws: true,
      down(e: { p: P }) { st.a = e.p; st.b = e.p; F.downs++; },
      move(e: { p: P; native: PointerEvent }, host: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!st.a) return;
        F.moves++;
        st.b = e.p;
        host.preview({ layer: host.target(), part: rect(st.a, st.b, host.op()) });
        host.redrawOverlay();
      },
      up(e: { p: P }, host: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!st.a) return;
        const part = rect(st.a, e.p, host.op());
        st.a = st.b = null;
        host.preview(null);
        if (part.w > 0.005 && part.h > 0.005) commit(part, host);
      },
      cancel(host: any) { st.a = st.b = null; F.cancels++; host.preview(null); }, // eslint-disable-line @typescript-eslint/no-explicit-any
      onKey(e: KeyboardEvent, host: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (e.key === 'ArrowRight') { st.kx += 0.05; host.say(`Zona en x ${st.kx.toFixed(2)}`); return true; }
        if (e.key === 'ArrowDown') { st.ky += 0.05; return true; }
        if (e.key === 'Enter') { commit(rect({ x: st.kx, y: st.ky }, { x: st.kx + 0.4, y: st.ky + 0.4 }, host.op()), host); host.say('Zona añadida.'); return true; }
        return false;
      },
      overlay(ctx: CanvasRenderingContext2D, host: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!st.a || !st.b) return;
        const v = host.view(), a = v.toScreen(st.a), b = v.toScreen(st.b);
        ctx.strokeStyle = '#ede6da';
        ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      },
    });
  });
}

/** Screen position (page CSS px) of a frame point (0..1) in the viewport. */
export async function framePoint(page: Page, x: number, y: number) {
  const box = (await page.locator('[data-testid=frame]').boundingBox())!;
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}

/** Mean RGBA of the art canvas inside a frame-unit rectangle. */
export async function meanIn(page: Page, x: number, y: number, w: number, h: number) {
  return page.evaluate(([x, y, w, h]) => {
    const c = document.querySelector<HTMLCanvasElement>('.fv-art')!;
    const X = Math.round(x * c.width), Y = Math.round(y * c.height), W = Math.max(1, Math.round(w * c.width)), H = Math.max(1, Math.round(h * c.height));
    const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(X, Y, W, H).data;
    const m = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 4; k++) m[k] += d[i + k];
    return m.map(v => v / (d.length / 4));
  }, [x, y, w, h]);
}
