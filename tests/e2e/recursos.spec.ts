import { expect, test, type Page } from '@playwright/test';
import { normalizeRecipe, type Recipe } from '../../src/engine/recipe';
import { familyLayer, familyRecipe } from '../../src/families/recipes';
import { familyById } from '../../src/families/registry';
import { encodeRecipe } from '../../src/shared/share';
import { openStudio } from './helpers';

/**
 * Resources over time (PR #10 review, A-07): a piece with one simulation layer and one with four run for
 * minutes on the stage, in both engines, and the page's memory settles instead of growing with the time run.
 * A directed test (minutes long): not part of the quick CI subset. Heap sizes come from Chromium's DevTools
 * protocol after a full collection; the bound is on growth between two moments of the steady state, not on a
 * raw size (which depends on the machine).
 */

const MB = 1024 * 1024;

async function heap(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage') as { usedSize: number };
  await cdp.detach();
  return usedSize;
}

function piece(layers: Array<[string, string]>): Recipe {
  const [first, ...rest] = layers;
  const r = familyRecipe(first[0], first[1], undefined, 'recursos-0');
  rest.forEach(([id, preset], i) => r.layers.push(familyLayer(familyById(id)!, `recursos-${i + 1}`, preset, { blend: 'screen', mix: 0.5 })));
  return normalizeRecipe(r);
}

const ONE: Array<[string, string]> = [['reaccion_difusion', familyById('reaccion_difusion')!.presets[0].id]];
const FOUR: Array<[string, string]> = ['reaccion_difusion', 'physarum', 'boids', 'fluido'].map(id => [id, familyById(id)!.presets[0].id]);

for (const engine of ['webgl', 'basico'] as const) {
  for (const [label, layers] of [['una capa', ONE], ['cuatro capas', FOUR]] as const) {
    test(`${engine === 'webgl' ? 'WebGL' : 'básico'} · ${label} de simulación: la memoria no crece con el tiempo`, async ({ page }) => {
      test.setTimeout(600_000);
      const code = await encodeRecipe(piece(layers));
      const errors = await openStudio(page, `${engine === 'basico' ? '?motor=basico' : ''}#r=${code}`);
      await expect(page.locator('.stage canvas').first()).toBeVisible();
      // warm-up: every model loaded and stepping, caches filled
      await page.waitForTimeout(30_000);
      const a = await heap(page);
      await page.waitForTimeout(90_000);
      const b = await heap(page);
      await page.waitForTimeout(90_000);
      const c = await heap(page);
      test.info().annotations.push({ type: 'memoria', description: `${(a / MB).toFixed(1)} → ${(b / MB).toFixed(1)} → ${(c / MB).toFixed(1)} MB` });
      // the steady state: what the second stretch adds is small, and not more than the first
      expect(c - b, `${label}: ${(a / MB).toFixed(1)} → ${(b / MB).toFixed(1)} → ${(c / MB).toFixed(1)} MB`).toBeLessThan(6 * MB);
      expect(c - a, `${label}: crece ${((c - a) / MB).toFixed(1)} MB en 3 minutos`).toBeLessThan(12 * MB);
      expect(errors).toEqual([]);
    });
  }
}
