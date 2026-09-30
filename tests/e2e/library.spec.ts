import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { download, openStudio } from './helpers';
import { chooseRecipe } from './recipes';

/**
 * The library ported from the pattern-library branch in the real studio: its recipes open in their space and draw,
 * and a sample of its pieces (a solid, a particle motion, a curve, a field) exports what the stage shows —
 * PNG, a GIF frame and the pasted code, with WebGL 2 and with the basic engine. The layers' speed is 0 so
 * every renderer shows the very same moment; pictures are compared as grids of luminance (r: correlation).
 * The system's monospace font: a pasted page asks Google Fonts for a web font, and where that fails (a test
 * machine offline) its fallback orders the glyphs by ink differently, which is not what is tested here.
 */

const enc = (r: object) => '#r=j' + Buffer.from(JSON.stringify(r)).toString('base64url');
const piece = (name: string, pattern: string, a: number, b: number, stops: string[], bg: string, charset = ' .:-=+*#%@') => ({
  name,
  recipe: {
    v: 2, source: 'pattern', layers: [{ pattern, a, b, speed: 0, phase: 3.3 }], glyph: { cell: 10, charset, font: 'system' },
    color: { stops, bg }, interact: { mode: 'none' }, meta: { name, space: 'arte' },
  },
});
const PIECES = [
  piece('Medusa de prueba', 'medusa', 0.53, 0.46, ['#1f3963', '#74c5de', '#e4eeec'], '#061224'),
  piece('Constelación de prueba', 'constelacion_dinamica', 0.6, 0.6, ['#2d2350', '#b369d3', '#f5c9f0'], '#090617'),
  piece('Armonógrafo de prueba', 'armonografo', 0.48, 0.36, ['#3c2d3b', '#b182a1', '#f5dace'], '#160f1c'),
  piece('Bruma de prueba', 'bruma_lejana', 0.45, 0.45, ['#143449', '#4998b7', '#b2e7dd', '#ffefd0'], '#05101a'),
];

/** Luminance of an image (data URL, canvas or the stage) on a coarse grid, and their correlation. */
async function compare(page: Page, a: string, b: string, W = 96, H = 60): Promise<{ r: number; mad: number }> {
  return page.evaluate(async ([a, b, W, H]) => {
    const lum = async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data, out: number[] = [];
      for (let i = 0; i < d.length; i += 4) out.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      return out;
    };
    const p = await lum(a), q = await lum(b);
    const n = p.length, mp = p.reduce((s, v) => s + v, 0) / n, mq = q.reduce((s, v) => s + v, 0) / n;
    let cov = 0, vp = 0, vq = 0, mad = 0;
    for (let i = 0; i < n; i++) { cov += (p[i] - mp) * (q[i] - mq); vp += (p[i] - mp) ** 2; vq += (q[i] - mq) ** 2; mad += Math.abs(p[i] - q[i]); }
    return { r: cov / Math.sqrt(vp * vq || 1), mad: mad / n };
  }, [a, b, W, H] as const);
}

/** The stage as shown (a screenshot: the WebGL canvas keeps no copy of its last frame), without the notes over it. */
async function stageImage(page: Page) {
  await page.addStyleTag({ content: '.motion-note, .stage-marks, .stage-top, .stage-notes, .deck, .seedline, .toasts { visibility: hidden !important; }' });
  return 'data:image/png;base64,' + (await page.locator('.stage canvas').first().screenshot()).toString('base64');
}
/** Distinct colours of an image (scaled down): 1 is an empty picture. */
const colours = (page: Page, src: string) => page.evaluate(async src => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 200; c.height = 120;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, 200, 120);
  const d = x.getImageData(0, 0, 200, 120).data, seen = new Set<number>();
  for (let i = 0; i < d.length; i += 4) seen.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
  return seen.size;
}, src);
const drawn = (page: Page) => expect.poll(async () => colours(page, await stageImage(page)), { message: 'the stage draws', timeout: 30_000 }).toBeGreaterThan(3);
const dataUrl = (path: string, type: string) => `data:${type};base64,${readFileSync(path).toString('base64')}`;

/** The exported page on its own, at the stage's size (the same grid of cells), optionally without WebGL. */
async function pasted(browser: Browser, file: string, size: { w: number; h: number }, webgl: boolean) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, reducedMotion: 'reduce' });
  if (!webgl) await ctx.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    // a browser without WebGL: the runtime falls back to the basic engine it carries
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      return /webgl/.test(kind) ? null : (get as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
    } as typeof get;
  });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + file);
  await expect.poll(() => p.evaluate(() => !!document.querySelector('canvas')?.width), { timeout: 20_000 }).toBe(true);
  await p.waitForTimeout(2500);
  const shot = 'data:image/png;base64,' + (await p.locator('canvas').first().screenshot()).toString('base64');
  await ctx.close();
  return { shot, errors };
}

test.describe('biblioteca', () => {
  test('las recetas nuevas abren en su espacio y dibujan', async ({ page }) => {
    for (const [space, name] of [['fondos', 'Luciérnagas'], ['arte', 'Medusa bioluminiscente'], ['tipo', 'Cascada tipográfica'], ['terminal', 'Prisma ANSI']]) {
      // a fresh load per space (a new hash alone does not reload the studio)
      await page.goto('about:blank');
      const errors = await openStudio(page, `#space=${space}`);
      // from the recipe browser (the card is marked as the piece's own once applied)
      await chooseRecipe(page, name);
      await expect(page.locator('.seedline')).toContainText(name);
      await drawn(page);
      expect(errors, `${space}/${name}`).toEqual([]);
    }
  });

  for (const { name, recipe } of PIECES) {
    test(`${name}: la imagen, el GIF y el código exportados muestran lo mismo que la vista`, async ({ page, browser }) => {
      test.setTimeout(240_000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = await openStudio(page, enc(recipe));
      await drawn(page);
      const stage = await stageImage(page);
      const size = await page.evaluate(() => { const c = document.querySelector('.stage canvas')!; return { w: Math.round(c.clientWidth), h: Math.round(c.clientHeight) }; });

      await page.keyboard.press('e');
      await page.getByRole('tab', { name: 'Imagen' }).click();
      const png = await download(page, () => page.getByRole('button', { name: 'Descargar imagen' }).click());
      if (process.env.LIB_DEBUG) {
        const { writeFileSync, copyFileSync } = await import('node:fs');
        writeFileSync(test.info().outputPath('stage.png'), Buffer.from(stage.split(',')[1], 'base64'));
        copyFileSync(png.path, test.info().outputPath('export.png'));
      }
      const still = await compare(page, stage, dataUrl(png.path, 'image/png'));
      if (process.env.LIB_DEBUG) console.log(name, 'PNG', still);
      expect(still.r, `PNG r=${still.r.toFixed(3)} Δ=${still.mad.toFixed(1)}`).toBeGreaterThan(0.95);

      await page.getByRole('tab', { name: 'Video y GIF' }).click();
      await page.getByLabel('Duración (s)').fill('1');
      await page.getByRole('radio', { name: '320 px' }).click();
      const gif = await download(page, () => page.getByRole('button', { name: 'Descargar GIF' }).click());
      if (process.env.LIB_DEBUG) (await import('node:fs')).copyFileSync(gif.path, test.info().outputPath('export.gif'));
      // 320 px wide with 64–256 colours: the same picture, coarser (compared on a coarser grid)
      const frame = await compare(page, stage, dataUrl(gif.path, 'image/gif'), 32, 20);
      if (process.env.LIB_DEBUG) console.log(name, 'GIF', frame);
      expect(frame.r, `GIF r=${frame.r.toFixed(3)} Δ=${frame.mad.toFixed(1)}`).toBeGreaterThan(0.85);

      await page.getByRole('tab', { name: 'Código' }).click();
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar página/ }).click()]);
      const file = test.info().outputPath('pieza.html');
      await d.saveAs(file);
      for (const webgl of [true, false]) {
        const out = await pasted(browser, file, size, webgl);
        expect(out.errors, webgl ? 'WebGL 2' : 'básico').toEqual([]);
        if (process.env.LIB_DEBUG) (await import('node:fs')).writeFileSync(test.info().outputPath(`code-${webgl}.png`), Buffer.from(out.shot.split(',')[1], 'base64'));
        const code = await compare(page, stage, out.shot);
        if (process.env.LIB_DEBUG) console.log(name, webgl ? 'code WebGL 2' : 'code básico', code);
        expect(code.r, `${webgl ? 'WebGL 2' : 'básico'} r=${code.r.toFixed(3)} Δ=${code.mad.toFixed(1)}`).toBeGreaterThan(0.98);
      }
      expect(errors).toEqual([]);
    });
  }
});
