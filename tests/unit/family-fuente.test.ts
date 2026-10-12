import { beforeAll, describe, expect, it } from 'vitest';
import { FAM } from '../../src/families/context';
import { loadFamilyNow } from '../../src/families/load';
import { analyticOf } from '../../src/families/models';
import { defaultParams, packParams } from '../../src/families/params';
import { familyById } from '../../src/families/registry';
import type { Params } from '../../src/families/types';

/**
 * Families that read the piece (PR #10 close-out): chrome takes its shape from the person's letters or the
 * tones of their photo, the tear shows their photo or the layers under it. Their CPU twins read the source
 * through families/context.ts as the field pass sets it (the shader's famSrc, VB and VC).
 */

beforeAll(async () => { await loadFamilyNow('cromado'); await loadFamilyNow('desgarro'); });

/** A source sampler on canvas points: `f(px, py)` gives rgb and luminance. */
function source(kind: 1 | 2, f: (px: number, py: number) => [number, number, number]) {
  FAM.kind = kind; FAM.c = 1; FAM.s = 0; FAM.sc = 1; FAM.ox = 0; FAM.oy = 0;
  FAM.src = (px, py, out) => { const c = f(px, py); out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; };
}
function grid(id: string, p: Params, t: number, n = 48) {
  const meta = familyById(id)!, impl = analyticOf(id)!, k = packParams(meta, { ...defaultParams(meta), ...p });
  impl.prep?.(t, k, undefined, 0.01);
  const lum: number[] = [], col: number[][] = [], at: Array<[number, number]> = [];
  const o = new Float64Array(3);
  for (let j = 0; j < n / 2; j++) for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * 2, y = 0.5 - (j + 0.5) / (n / 2);
    lum.push(impl.cpu(x, y, t, k)); impl.cpuColor!(x, y, t, k, o); col.push([o[0], o[1], o[2]]); at.push([x, y]);
  }
  return { lum, col, at };
}

describe('Cromado sobre tus letras o tu foto', () => {
  it('las letras son de cromo y lo de fuera queda oscuro: otra forma de letras, otro dibujo', () => {
    const bar = (px: number) => (Math.abs(px) < 0.15 ? 1 : 0);
    source(2, px => { const v = bar(px); return [v, v, v]; });
    const a = grid('cromado', { mask: 'fuente', size: 0.15 }, 2);
    const inside = a.lum.filter((_, i) => Math.abs(a.at[i][0]) < 0.08), outside = a.lum.filter((_, i) => Math.abs(a.at[i][0]) > 0.5);
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(mean(inside)).toBeGreaterThan(0.25);
    expect(mean(outside)).toBeLessThan(0.05);
    // other letters (a horizontal bar): the drawing follows them
    source(2, (_px, py) => { const v = Math.abs(py) < 0.08 ? 1 : 0; return [v, v, v]; });
    const b = grid('cromado', { mask: 'fuente', size: 0.15 }, 2);
    const diff = a.lum.reduce((s, v, i) => s + Math.abs(v - b.lum[i]), 0) / a.lum.length;
    expect(diff).toBeGreaterThan(0.08);
  });

  it('con una foto todo es metal y las bandas siguen sus tonos', () => {
    source(1, px => { const v = px < 0 ? 0.15 : 0.9; return [v, v, v]; });
    const a = grid('cromado', { mask: 'fuente', size: 0.2 }, 2);
    source(1, () => [0.5, 0.5, 0.5]);
    const flat = grid('cromado', { mask: 'fuente', size: 0.2 }, 2);
    expect(a.lum.some(v => v > 0.05)).toBe(true);
    const diff = a.lum.reduce((s, v, i) => s + Math.abs(v - flat.lum[i]), 0) / a.lum.length;
    expect(diff).toBeGreaterThan(0.03);
  });

  it('sin foto ni texto dibuja la gota, como la máscara «Gota»', () => {
    FAM.kind = 0; FAM.src = null;
    const a = grid('cromado', { mask: 'fuente' }, 2), b = grid('cromado', { mask: 'gota' }, 2);
    expect(a.lum).toEqual(b.lum);
  });
});

describe('Desgarro que deja ver tu foto o la capa de abajo', () => {
  it('en las aberturas se ve tu foto con sus colores; con su propia luz, no', () => {
    source(1, () => [1, 0, 0]);
    let red = 0, own = 0;
    for (const t of [3, 5, 7, 11, 14]) {
      const a = grid('desgarro', { behind: 'fuente', tears: 3, calm: 0, width: 1 }, t);
      red += a.col.filter(c => c[0] > 0.95 && c[1] < 0.05 && c[2] < 0.05).length;
      const b = grid('desgarro', { behind: 'luz', tears: 3, calm: 0, width: 1 }, t);
      own += b.col.filter(c => c[0] > 0.95 && c[1] < 0.05 && c[2] < 0.05).length;
    }
    expect(red).toBeGreaterThan(20);
    expect(own).toBe(0);
  });

  it('con «Las capas de abajo» las aberturas muestran el valor y el color de la pila de debajo', () => {
    FAM.kind = 0; FAM.src = null;
    FAM.below = 0.77; FAM.belowC[0] = 0; FAM.belowC[1] = 0.5; FAM.belowC[2] = 1;
    let seen = 0;
    for (const t of [3, 5, 7, 11, 14]) {
      const a = grid('desgarro', { behind: 'abajo', tears: 3, calm: 0, width: 1, glow: 0 }, t);
      seen += a.col.filter((c, i) => Math.abs(c[1] - 0.5) < 0.02 && c[2] > 0.98 && Math.abs(a.lum[i] - 0.77) < 0.02).length;
    }
    expect(seen).toBeGreaterThan(20);
    FAM.below = 0; FAM.belowC.fill(1);
  });
});
