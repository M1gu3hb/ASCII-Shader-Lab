import { describe, expect, it } from 'vitest';
import { FACET, diamanteGlint, diamanteTurn, impl } from '../../src/families/analytic/diamante.cpu';
import { META } from '../../src/families/meta/talla_diamante';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Talla de diamante» (I-09): facets (rings × sectors) that turn with the stone, each with one
 * spectral colour that changes as it turns; sharp scintillation; star glints; an exact loop.
 */
const PX = 1 / 72;
const P = (extra: Params = {}): Params => ({ ...defaultParams(META), ...extra });
const at = (p: Params) => {
  const k = packParams(META, p);
  const o = new Float64Array(3);
  return {
    k,
    lum: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); },
    col: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); impl.cpu(x, y, t, k); impl.cpuColor!(x, y, t, k, o); return [o[0], o[1], o[2]]; },
  };
};
const quiet = { edges: 0, star: 0, caustics: 0 };

describe('talla de diamante', () => {
  it('cada faceta tiene un solo color y un solo brillo; facetas distintas, colores distintos', () => {
    for (const cut of ['brillante', 'princesa', 'rosa']) {
      const f = at(P({ ...quiet, cut, fire: 1 }));
      const by = new Map<number, number[][]>();
      for (let y = -0.4; y <= 0.4; y += 0.006) for (let x = -0.4; x <= 0.4; x += 0.006) {
        const l = f.lum(x, y, 3.1);
        if (FACET.ring < 1) continue; // the table (arrows) and the outside
        const c = f.col(x, y, 3.1);
        // away from the girdle's bright line
        if (Math.hypot(x, y) > 0.9 * (0.26 + 0.19 * 0.7) * 0.7) continue;
        const key = FACET.ring * 10000 + FACET.cell;
        if (!by.has(key)) by.set(key, []);
        by.get(key)!.push([l, ...c]);
      }
      let facets = 0;
      const hues = new Set<string>();
      for (const pts of by.values()) {
        if (pts.length < 3) continue;
        facets++;
        for (const q of pts) for (let i = 0; i < 4; i++) expect(Math.abs(q[i] - pts[0][i]), cut).toBeLessThan(1e-9);
        hues.add(pts[0].slice(1).map(v => v.toFixed(1)).join());
      }
      expect(facets, cut).toBeGreaterThan(15);
      expect(hues.size, cut).toBeGreaterThan(5);
    }
  });

  it('las facetas giran con la piedra y su color cambia al girar', () => {
    const f = at(P({ ...quiet, fire: 1 }));
    const t0 = 2, t1 = 4.5;
    const da = diamanteTurn(f.k, t1) - diamanteTurn(f.k, t0);
    let same = 0, n = 0, changed = 0;
    for (let y = -0.25; y <= 0.25; y += 0.013) for (let x = -0.25; x <= 0.25; x += 0.013) {
      f.lum(x, y, t0);
      const c0 = FACET.cell, r0 = FACET.ring;
      if (r0 < 1) continue;
      const col0 = f.col(x, y, t0);
      const xr = x * Math.cos(da) - y * Math.sin(da), yr = x * Math.sin(da) + y * Math.cos(da);
      f.lum(xr, yr, t1);
      n++;
      if (FACET.cell === c0 && FACET.ring === r0) same++;
      const col1 = f.col(xr, yr, t1);
      if (Math.hypot(col1[0] - col0[0], col1[1] - col0[1], col1[2] - col0[2]) > 0.05) changed++;
    }
    expect(same / n).toBeGreaterThan(0.95);
    expect(changed / n).toBeGreaterThan(0.3);
  });

  it('vuelve exactamente a su inicio al cabo del ciclo', () => {
    for (const pr of META.presets) {
      const f = at({ ...defaultParams(META), ...pr.params });
      expect(pr.period).toBe(pr.params.cycle);
      let same = 0, half = 0;
      for (let y = -0.48; y <= 0.48; y += 0.03) for (let x = -0.6; x <= 0.6; x += 0.03) {
        same = Math.max(same, Math.abs(f.lum(x, y, 1.3) - f.lum(x, y, 1.3 + pr.period!)));
        half += Math.abs(f.lum(x, y, 1.3) - f.lum(x, y, 1.3 + pr.period! / 2));
      }
      expect(same, pr.id).toBeLessThan(1e-3);
      expect(half, pr.id).toBeGreaterThan(1);
    }
  });

  it('el centelleo es un destello breve de cada faceta', () => {
    const f1 = at(P({ ...quiet, sparkle: 1 })), f0 = at(P({ ...quiet, sparkle: 0 }));
    // points of the crown followed as the stone turns, over a whole cycle: the scintillation is off most of the
    // time and flashes now and then
    let brief = 0;
    for (const [x, y] of [[0.2, 0.05], [-0.18, 0.12], [0.05, -0.22], [-0.1, -0.19]]) {
      let hi = 0, n = 0, max = 0;
      for (let t = 0; t < 24; t += 0.05) {
        const a = diamanteTurn(f1.k, t);
        const X = x * Math.cos(a) - y * Math.sin(a), Y = x * Math.sin(a) + y * Math.cos(a);
        const d = f1.lum(X, Y, t) - f0.lum(X, Y, t);
        n++; if (d > 0.15) hi++; max = Math.max(max, d);
      }
      if (max > 0.3 && hi / n < 0.3) brief++;
    }
    expect(brief).toBeGreaterThanOrEqual(3);
  });

  it('una estrella lanza rayos en cruz desde el destello', () => {
    const k = packParams(META, P());
    // a moment when glint 0 is fully on: sin(...) = 1
    const ph = diamanteGlint(0, k, 0).phase;
    const T = 24, m = 2;
    let t = ((Math.PI / 2 - ph) / (2 * Math.PI * m)) * T;
    while (t < 0) t += T / m;
    const g = diamanteGlint(0, k, t);
    expect(g.on).toBeGreaterThan(0.99);
    const on = at(P({ star: 1 })), off = at(P({ star: 0 }));
    const d = (dx: number, dy: number) => on.lum(g.x + dx, g.y + dy, t) - off.lum(g.x + dx, g.y + dy, t);
    expect(d(0.08, 0)).toBeGreaterThan(0.25);
    expect(d(0, 0.08)).toBeGreaterThan(0.25);
    expect(d(0.0566, 0.0566)).toBeLessThan(0.2);
  });
});
