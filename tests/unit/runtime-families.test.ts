import { beforeAll, describe, expect, it } from 'vitest';
import { buildRuntimes } from '../../scripts/runtime-plugin';
import { LOADABLE, loadFamilyNow } from '../../src/families/load';
import { FAMILIES } from '../../src/families/registry';
import { analyticOf, modelOf } from '../../src/families/models';
import { defaultParams, packParams } from '../../src/families/params';
import { familyRecipe } from '../../src/families/recipes';
import { familyExportNotes, familyIds } from '../../src/families/export';
import type { AnalyticImpl, ModelFactory } from '../../src/families/types';

/**
 * Exported code carries the code of the visual families its piece uses as separate scripts, each
 * registering itself in the runtime (Glyphos.registerFamily). A family without a script, or a script that
 * computes something else than the studio, would draw an empty or different layer on someone's website.
 */
let built: Awaited<ReturnType<typeof buildRuntimes>>;

function load(id: string): { create?: ModelFactory; impl?: AnalyticImpl } {
  const got: Record<string, { create?: ModelFactory; impl?: AnalyticImpl }> = {};
  const window = { Glyphos: { registerFamily: (k: string, m: { create?: ModelFactory; impl?: AnalyticImpl }) => { got[k] = m; }, hasFamily: (k: string) => k in got } };
  new Function('window', built.families[id])(window);
  return got[id];
}

beforeAll(async () => {
  built = await buildRuntimes();
  for (const id of LOADABLE) await loadFamilyNow(id);
}, 120_000);

describe('familias en el código exportado', () => {
  it('un script por familia con código', () => {
    expect(Object.keys(built.families).sort()).toEqual([...LOADABLE].sort());
  });

  it.each(FAMILIES.map(f => f.id))('%s: el script calcula lo mismo que el estudio', id => {
    const meta = FAMILIES.find(f => f.id === id)!;
    const m = load(id);
    expect(m, id).toBeTruthy();
    const p = { ...defaultParams(meta), ...meta.presets[0].params };
    if (meta.kind === 'analytic') {
      const k = packParams(meta, p);
      const a = m.impl!, b = analyticOf(id)!;
      for (const t of [0, 2.7]) {
        a.prep?.(t, k); const va = [[-0.4, 0.1], [0.2, -0.3], [0, 0]].map(([x, y]) => a.cpu(x, y, t, k));
        b.prep?.(t, k); const vb = [[-0.4, 0.1], [0.2, -0.3], [0, 0]].map(([x, y]) => b.cpu(x, y, t, k));
        expect(va).toEqual(vb);
      }
      return;
    }
    const res = meta.budget.res![0];
    const x = m.create!({ seed: 's', params: p, res }), y = modelOf(id)!({ seed: 's', params: p, res });
    const n = Math.min(300, (meta.budget.warmup ?? 0) + 30);
    x.step(n); y.step(n);
    const ra = new Uint8Array(x.w * x.h), rb = new Uint8Array(y.w * y.h);
    x.render(ra, 1); y.render(rb, 1);
    expect(Buffer.from(ra).equals(Buffer.from(rb))).toBe(true);
  });

  it('el código de una pieza lleva sólo las familias que usa, y sin el motor básico sólo las que lo necesitan', () => {
    const raster = FAMILIES.find(f => f.kind !== 'analytic')!, analytic = FAMILIES.find(f => f.kind === 'analytic')!;
    const r = familyRecipe(raster.id);
    r.layers.push({ ...familyRecipe(analytic.id).layers[0], blend: 'screen' });
    expect(familyIds(r, true).sort()).toEqual([raster.id, analytic.id].sort());
    expect(familyIds(r, false)).toEqual([raster.id]);
    // a hidden layer needs no code
    r.layers[0].on = false;
    expect(familyIds(r, true)).toEqual([analytic.id]);
  });

  it('un estado guardado no viaja en el código: la receta exportada empieza desde su semilla y lo dice', () => {
    const r = familyRecipe(FAMILIES.find(f => f.caps.checkpoint)!.id);
    r.layers[0].fam!.ck = '0123456789abcdef';
    const notes = familyExportNotes(r);
    expect(r.layers[0].fam!.ck).toBeUndefined();
    expect(notes.join(' ')).toMatch(/semilla/);
  });

  it('los scripts de familia no evalúan texto y pesan decenas de KB como mucho', () => {
    for (const [id, code] of Object.entries(built.families)) {
      expect(/\beval\(|new Function\(|Function\(\s*["'`]/.test(code), id).toBe(false);
      expect(code.length, id).toBeLessThan(40_000);
    }
  });
});
