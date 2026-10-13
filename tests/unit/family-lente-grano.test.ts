import { beforeAll, describe, expect, it } from 'vitest';
import { loadFamilyNow } from '../../src/families/load';
import { analyticOf } from '../../src/families/models';
import { defaultParams, packParams } from '../../src/families/params';
import { familyById } from '../../src/families/registry';

/**
 * The black hole's disk after ten minutes (PR #10 close-out, §9 of the review): with the disk turning, version 1
 * winds its streaks for ever (Keplerian shear) until a cell holds several of them and the disk reads as grain;
 * version 2 bounds the shear to one 40 s cycle. Measured as the cell-to-cell change inside the disk.
 */
beforeAll(async () => { await loadFamilyNow('lente_gravitacional'); });

function disk(v: number, t: number, n = 200, preset = 'cerca') {
  const meta = familyById('lente_gravitacional')!, impl = analyticOf('lente_gravitacional')!;
  const pr = meta.presets.find(p => p.id === preset)!;
  const k = packParams(meta, { ...defaultParams(meta), ...pr.params }, undefined, v);
  impl.prep?.(t, k, undefined, 1 / n);
  const g: number[][] = [];
  for (let j = 0; j < n / 2; j++) { const row: number[] = []; for (let i = 0; i < n; i++) row.push(impl.cpu(((i + 0.5) / n - 0.5) * 2, 0.5 - (j + 0.5) / (n / 2), t, k)); g.push(row); }
  return g;
}
/** Mean change between horizontally adjacent cells where there is light (the disk). */
function grain(g: number[][]) {
  let s = 0, c = 0;
  for (const row of g) for (let i = 1; i < row.length; i++) if (row[i] > 0.08 && row[i - 1] > 0.08) { s += Math.abs(row[i] - row[i - 1]); c++; }
  return c ? s / c : 0;
}

describe('agujero negro: el disco a los diez minutos', () => {
  it('la versión 2 no se vuelve grano: a los 600 s su disco cambia entre celdas vecinas como al empezar', () => {
    const g2start = grain(disk(2, 5)), g2late = grain(disk(2, 600));
    const g1start = grain(disk(1, 5)), g1late = grain(disk(1, 600));
    expect(g2late, `v2 ${g2start.toFixed(4)} → ${g2late.toFixed(4)}`).toBeLessThan(g2start * 1.5);
    // version 1, kept as it was for older pieces, grows grainier with time (the fault the close-out fixes)
    expect(g1late, `v1 ${g1start.toFixed(4)} → ${g1late.toFixed(4)}`).toBeGreaterThan(g1start * 2);
    expect(g1late).toBeGreaterThan(g2late * 1.5);
  }, 60_000);

  it('la versión 2 sigue girando: el disco cambia con el tiempo y no se repite en un ciclo', () => {
    const a = disk(2, 600), b = disk(2, 601), c = disk(2, 640);
    const d = (x: number[][], y: number[][]) => x.flat().reduce((s, v, i) => s + Math.abs(v - y.flat()[i]), 0) / x.flat().length;
    expect(d(a, b)).toBeGreaterThan(0.002);
    expect(d(a, c)).toBeGreaterThan(0.002);
  }, 60_000);
});
