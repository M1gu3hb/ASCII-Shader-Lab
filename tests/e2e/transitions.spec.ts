import { expect, test, type Page } from '@playwright/test';
import { openStudio } from './helpers';
import { openRecipes, recipeCard } from './recipes';

/**
 * The formation of characters between two pieces on stage, sampled frame by frame. It used to be dropped
 * whenever the stage changed size under it (a new space with its own view, a terminal window that grows
 * with the piece's cells): the old frame was thrown away, so a change of space or recipe sometimes showed
 * no transition at all. Now the old frame is drawn at the new size and the transition runs to its end.
 *
 * A frame «in transition» shows colours of the old piece and of the new one at once (colours only one of
 * the two pieces has, taken from the first and the last frames); a change without transition never does.
 */

interface Frame { t: number; w: number; h: number; busy: boolean; bins: number[] }

/**
 * Starts sampling the stage: a small copy of each frame, as a histogram of 512 colours, until the stage has
 * been busy (preparing the piece, then its transition) and is quiet again, or `ms` pass. (Frames can come
 * seconds apart on a software GPU under load: the sampling follows the stage, not the clock.)
 */
async function startSampling(page: Page, ms: number) {
  await page.evaluate(ms => {
    const w = window as unknown as { __frames: Frame[]; __done: boolean };
    w.__frames = [];
    w.__done = false;
    const t = document.createElement('canvas');
    t.width = 64; t.height = 40;
    const x = t.getContext('2d', { willReadFrequently: true })!;
    const t0 = performance.now();
    const tick = () => {
      const cv = document.querySelector<HTMLCanvasElement>('.stage canvas');
      if (cv && cv.width) {
        x.drawImage(cv, 0, 0, 64, 40);
        const d = x.getImageData(0, 0, 64, 40).data;
        const bins = new Array(512).fill(0);
        for (let i = 0; i < d.length; i += 4) bins[((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5)]++;
        w.__frames.push({ t: performance.now() - t0, w: cv.width, h: cv.height, busy: cv.hasAttribute('data-busy'), bins });
      }
      const fs = w.__frames, n = fs.length;
      const settled = fs.some(f => f.busy) && n > 3 && !fs[n - 1].busy && !fs[n - 2].busy && !fs[n - 3].busy;
      if (performance.now() - t0 < ms && !settled) requestAnimationFrame(tick); else w.__done = true;
    };
    requestAnimationFrame(tick);
  }, ms);
}

async function frames(page: Page): Promise<Frame[]> {
  await page.waitForFunction(() => (window as unknown as { __done: boolean }).__done, undefined, { timeout: 150_000, polling: 500 });
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

/** For a failure's message: each frame's time, size and whether the stage was busy. */
const pattern = (fs: Frame[]) => fs.map(f => `${Math.round(f.t)}${f.busy ? 'B' : ''}@${f.w}x${f.h}`).join(' ');

/**
 * Frames that show both pieces: pixels in colours only the old piece has, and in colours only the new one
 * has, each over 2 % of the frame. (First frame: the old piece; last: the new one, settled.)
 */
function mixed(fs: Frame[]): Frame[] {
  const first = fs[0], last = fs[fs.length - 1];
  const n = 64 * 40;
  const only = (a: Frame, b: Frame) => a.bins.map((c, i) => c > n * 0.01 && b.bins[i] < n * 0.002);
  const oldOnly = only(first, last), newOnly = only(last, first);
  const share = (f: Frame, mask: boolean[]) => f.bins.reduce((s, c, i) => s + (mask[i] ? c : 0), 0) / n;
  return fs.slice(1, -1).filter(f => share(f, oldOnly) > 0.02 && share(f, newOnly) > 0.02);
}

test.beforeEach(async ({ page }) => {
  // a transition that mixes the two pieces all over the frame, at its normal length
  await page.addInitScript(() => {
    try { localStorage.setItem('mt.v3.preview', JSON.stringify({ transition: 'disolucion', pace: 'normal', quality: 'auto' })); } catch { /* */ }
  });
});

test('al cambiar de espacio y de vista (Arte → Terminal), los caracteres forman la pieza nueva aunque el lienzo cambie de tamaño', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, '#space=arte');
  await page.waitForTimeout(1500);
  const size0 = await page.locator('.stage canvas').evaluate(c => `${(c as HTMLCanvasElement).width}x${(c as HTMLCanvasElement).height}`);
  await startSampling(page, 120_000);
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('5');
  const fs = await frames(page);
  const last = fs[fs.length - 1];
  // the stage changed size (the terminal window)…
  expect(`${last.w}x${last.h}`).not.toBe(size0);
  // …and frames at the new size still show the old piece dissolving into the new one
  const mid = mixed(fs).filter(f => f.w === last.w && f.h === last.h);
  expect(mid.length, `${fs.length} cuadros (${pattern(fs)}); mezclados al tamaño nuevo: ${mid.length}`).toBeGreaterThanOrEqual(1);
  // it ends: the last frames are the new piece alone, and the stage is no longer busy
  expect(last.busy).toBe(false);
});

test('también con el motor básico (sin WebGL): Arte → Terminal forma la pieza nueva al tamaño nuevo', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, '?motor=basico#space=arte');
  await page.waitForTimeout(1500);
  await startSampling(page, 120_000);
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('5');
  const fs = await frames(page);
  const last = fs[fs.length - 1];
  const mid = mixed(fs).filter(f => f.w === last.w && f.h === last.h);
  expect(mid.length, `${fs.length} cuadros (${pattern(fs)}); mezclados al tamaño nuevo: ${mid.length}`).toBeGreaterThanOrEqual(1);
  expect(last.busy).toBe(false);
});

test('al cambiar de receta, la transición se ve varios cuadros y termina en la pieza nueva', async ({ page }) => {
  test.setTimeout(180_000);
  await openStudio(page, '#space=arte');
  await openRecipes(page);
  await page.waitForTimeout(1500);
  await startSampling(page, 120_000);
  await page.waitForTimeout(300);
  // a recipe with other colours than the one on stage (paper instead of ink), from the recipe browser
  await recipeCard(page, 'Mecanismo').click();
  const fs = await frames(page);
  const mid = mixed(fs);
  expect(mid.length, `${fs.length} cuadros (${pattern(fs)}); mezclados: ${mid.length}`).toBeGreaterThanOrEqual(1);
  expect(fs[fs.length - 1].busy).toBe(false);
});

test('con movimiento reducido no hay transición: la pieza nueva aparece de una vez', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  await openStudio(page, '#space=arte');
  await openRecipes(page);
  await page.waitForTimeout(1500);
  await startSampling(page, 6000);
  await page.waitForTimeout(300);
  await recipeCard(page, 'Mecanismo').click();
  const fs = await frames(page);
  expect(mixed(fs)).toHaveLength(0);
  // and a change of space that keeps the piece does not cover the stage with glyphs
  expect(await page.locator('canvas.mt-curtain').count()).toBe(0);
  await ctx.close();
});
