import { describe, expect, it } from 'vitest';
import { CALOR, calorSource, impl } from '../../src/families/analytic/calor.cpu';
import { META } from '../../src/families/meta/calor_radiante';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Calor que irradia» (I-12): a radial temperature around its centres, bent by the curl of an fBm
 * and broken into tongues that flow outwards; heat that rises; embers thrown out; a thermal colour map.
 */
const PX = 1 / 72;
const P = (extra: Params = {}): Params => ({ ...defaultParams(META), embers: 0, ambient: 0, ...extra });
const at = (p: Params) => {
  const k = packParams(META, p);
  const o = new Float64Array(3);
  return {
    lum: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); },
    T: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); impl.cpu(x, y, t, k); return CALOR.T; },
    col: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); impl.cpu(x, y, t, k); impl.cpuColor!(x, y, t, k, o); return [o[0], o[1], o[2]]; },
  };
};

describe('calor que irradia', () => {
  it('sin lenguas, reverberación ni subida, la temperatura es radial y cae con la distancia; con ellas deja de serlo', () => {
    const t = 3;
    const [cx, cy] = calorSource(0, 1, t);
    const plain = at(P({ turb: 0, shimmer: 0, rise: 0, flicker: 0 }));
    let prev = 2;
    for (const r of [0.02, 0.08, 0.15, 0.25, 0.35]) {
      const vals = Array.from({ length: 16 }, (_, i) => plain.T(cx + r * Math.cos(i * 0.39), cy + r * Math.sin(i * 0.39), t));
      for (const v of vals) expect(Math.abs(v - vals[0]), `r=${r}`).toBeLessThan(1e-9);
      expect(vals[0]).toBeLessThan(prev);
      prev = vals[0];
    }
    for (const extra of [{ shimmer: 1 }, { turb: 1 }]) {
      const f = at(P({ turb: 0, shimmer: 0, rise: 0, flicker: 0, ...extra }));
      const vals = Array.from({ length: 16 }, (_, i) => f.T(cx + 0.15 * Math.cos(i * 0.39), cy + 0.15 * Math.sin(i * 0.39), t));
      expect(Math.max(...vals) - Math.min(...vals), JSON.stringify(extra)).toBeGreaterThan(0.03);
    }
  });

  it('las lenguas de calor fluyen hacia fuera', () => {
    const f = at(P({ turb: 1, shimmer: 0, rise: 0, flicker: 0, flow: 1 }));
    let out = 0;
    for (const th of [0.3, 1.4, 2.6, 3.9, 5.1]) {
      const prof = (t: number) => { const [cx, cy] = calorSource(0, 1, t); return Array.from({ length: 160 }, (_, i) => { const r = 0.03 + i * 0.002; return f.T(cx + r * Math.cos(th), cy + r * Math.sin(th), t); }); };
      const a = prof(2), b = prof(2.25);
      let best = 0, bestE = Infinity;
      for (let s = -25; s <= 25; s++) { let e = 0; for (let i = 30; i < 130; i++) e += (a[i] - b[i + s]) ** 2; if (e < bestE) { bestE = e; best = s; } }
      if (best > 0) out++;
    }
    expect(out).toBeGreaterThanOrEqual(4);
  });

  it('el calor sube: llega más lejos por encima del foco que por debajo', () => {
    const f = at(P({ turb: 0, shimmer: 0, flicker: 0, rise: 1 }));
    const t = 1;
    const [cx, cy] = calorSource(0, 1, t);
    for (const d of [0.08, 0.15, 0.25]) expect(f.T(cx, cy + d, t)).toBeGreaterThan(f.T(cx, cy - d, t) * 1.3);
  });

  it('las brasas salen del foco: se ven fuera del calor', () => {
    const a = at(P({ embers: 0 })), b = at(P({ embers: 32, emberSpeed: 1 }));
    let far = 0;
    for (const t of [1.5, 4.2]) for (let y = -0.5; y <= 0.5; y += 0.006) for (let x = -0.6; x <= 0.6; x += 0.008) {
      if (b.lum(x, y, t) - a.lum(x, y, t) > 0.2 && a.T(x, y, t) < 0.15) far++;
    }
    expect(far).toBeGreaterThan(10);
  });

  it('el color es un mapa de la temperatura: blanco amarillento en el centro, rojo oscuro en el borde', () => {
    const f = at(P({ turb: 0, shimmer: 0, rise: 0, flicker: 0, heat: 1, map: 'cuerpo' }));
    const [cx, cy] = calorSource(0, 1, 2);
    const hot = f.col(cx, cy, 2), cool = f.col(cx + 0.3, cy, 2);
    expect(hot[1]).toBeGreaterThan(0.75);
    expect(cool[1]).toBeLessThan(0.3);
    expect(cool[0]).toBeGreaterThan(cool[1] * 2);
    const cam = at(P({ turb: 0, shimmer: 0, rise: 0, flicker: 0, heat: 1, map: 'termica' })).col(cx + 0.3, cy, 2);
    expect(cam[2]).toBeGreaterThan(cam[1]);
  });
});
