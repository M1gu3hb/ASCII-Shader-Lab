import { expect, test, type Page } from '@playwright/test';
import { normalizeRecipe, type Recipe } from '../../src/engine/recipe';
import { familyLayer, familyRecipe } from '../../src/families/recipes';
import '../../src/families/all';
import { familyById } from '../../src/families/registry';
import { encodeRecipe } from '../../src/shared/share';
import { openStudio } from './helpers';

/**
 * The whole frame in the browser (closing of PR #10, §12): pieces with one and four simulation layers on the stage,
 * in both engines, and how long the page takes between frames while they run (requestAnimationFrame intervals over
 * a few seconds, after a warm-up): the models' steps, their rasters, the field pass, the glyphs and the
 * presentation together. Here WebGL 2 is SwiftShader (the GPU emulated on the CPU): its numbers are not those of a
 * real GPU. A measurement (it reports; the bound only catches a page that stops drawing): not in the CI subset.
 */

function piece(layers: Array<[string, string]>): Recipe {
  const [first, ...rest] = layers;
  const r = familyRecipe(first[0], first[1], undefined, 'coste-0');
  rest.forEach(([id, preset], i) => r.layers.push(familyLayer(familyById(id)!, `coste-${i + 1}`, preset, { blend: 'screen', mix: 0.5 })));
  return normalizeRecipe(r);
}

const PIECES: Array<[string, Array<[string, string]>]> = [
  ['reacción–difusión (una capa)', [['reaccion_difusion', 'coral']]],
  ['ecos de color (una capa)', [['ecos', 'tunel_arcoiris']]],
  ['humo de color (una capa)', [['humo', 'aurora']]],
  ['cuatro capas (RD, fluido, ecos, humo)', [['reaccion_difusion', 'coral'], ['fluido', 'lazos'], ['ecos', 'tunel_arcoiris'], ['humo', 'aurora']]],
];

async function frames(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(ms => new Promise<number[]>(res => {
    const out: number[] = [];
    let last = 0;
    const end = performance.now() + ms;
    const tick = (t: number) => {
      if (last) out.push(t - last);
      last = t;
      if (t < end) requestAnimationFrame(tick); else res(out);
    };
    requestAnimationFrame(tick);
  }), ms);
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };

for (const engine of ['webgl', 'basico'] as const) {
  test(`cuadro completo · ${engine === 'webgl' ? 'WebGL 2 (SwiftShader)' : 'motor básico'}`, async ({ page }) => {
    test.setTimeout(300_000);
    const notes: string[] = [];
    for (const [label, layers] of PIECES) {
      const code = await encodeRecipe(piece(layers));
      await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#r=${code}`);
      await page.waitForTimeout(6000);
      const f = await frames(page, 8000);
      const fps = 1000 / q(f, 0.5);
      notes.push(`${label}: mediana ${q(f, 0.5).toFixed(1)} ms entre cuadros (≈${fps.toFixed(0)} fps), p95 ${q(f, 0.95).toFixed(1)} ms, máx ${Math.max(...f).toFixed(0)} ms, ${f.length} cuadros en 8 s`);
      expect(f.length, label).toBeGreaterThan(8);
    }
    console.log(notes.join('\n'));
    test.info().annotations.push({ type: 'cuadro', description: notes.join('\n') });
  });
}
