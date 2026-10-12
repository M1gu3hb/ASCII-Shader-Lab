import { describe, expect, it } from 'vitest';
import { eclipseGeometry, impl } from '../../src/families/analytic/eclipse.cpu';
import { META } from '../../src/families/meta/eclipse_total';
import { defaultParams, packParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/**
 * Mechanism of «Eclipse total» (I-08): a black disc; a corona of polar rays that falls with the height, is
 * stretched along an axis and flows outwards; a diamond ring when the sun's limb shows; stars only in the dark.
 */
const PX = 1 / 72;
const P = (extra: Params = {}): Params => ({ ...defaultParams(META), ...extra });
const field = (p: Params) => {
  const k = packParams(META, p);
  return { k, f: (x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); } };
};
/** Mean luminance on a ring of radius r (optionally only within ±w of the angles a and a + π). */
function ringMean(f: (x: number, y: number, t: number) => number, r: number, t: number, a?: number, w = 0.35) {
  let s = 0, n = 0;
  for (let i = 0; i < 720; i++) {
    const th = (i / 720) * 2 * Math.PI;
    if (a !== undefined) { const d = Math.abs(Math.atan2(Math.sin(2 * (th - a)), Math.cos(2 * (th - a)))) / 2; if (d > w) continue; }
    s += f(r * Math.cos(th), r * Math.sin(th), t); n++;
  }
  return s / n;
}

describe('eclipse total', () => {
  it('el disco de la luna es negro (en totalidad) y la corona cae con la altura', () => {
    const { f, k } = field(P({ contact: 0, stars: 0 }));
    const { Rm, Rs } = eclipseGeometry(k, 5);
    for (let y = -Rm; y <= Rm; y += 0.01) for (let x = -Rm; x <= Rm; x += 0.01) if (Math.hypot(x, y) < Rm * 0.95) expect(f(x, y, 5)).toBe(0);
    const m = [1.08, 1.5, 2.2, 3].map(q => ringMean(f, q * Rs, 5));
    for (let i = 1; i < m.length; i++) expect(m[i], `${m}`).toBeLessThan(m[i - 1]);
    expect(m[0]).toBeGreaterThan(0.3);
  });

  it('la corona se estira a lo largo de su eje', () => {
    const axis = 0.3;
    const a = field(P({ asym: 1, axis, stars: 0, contact: 0 })), b = field(P({ asym: 0, axis, stars: 0, contact: 0 }));
    const { Rs } = eclipseGeometry(a.k, 3);
    const along = ringMean(a.f, 2 * Rs, 3, axis * Math.PI), across = ringMean(a.f, 2 * Rs, 3, axis * Math.PI + Math.PI / 2);
    expect(along / across).toBeGreaterThan(2);
    const along0 = ringMean(b.f, 2 * Rs, 3, axis * Math.PI), across0 = ringMean(b.f, 2 * Rs, 3, axis * Math.PI + Math.PI / 2);
    expect(along0 / across0).toBeLessThan(1.6);
  });

  it('el viento solar: los rayos se desplazan hacia fuera', () => {
    const { f, k } = field(P({ wind: 1, stars: 0, contact: 0, prom: 0 }));
    const { Rs } = eclipseGeometry(k, 0);
    let out = 0;
    for (const th of [0.4, 1.3, 2.9, 4.4, 5.6]) {
      // the profile along one direction, in log r, at two moments
      const prof = (t: number) => Array.from({ length: 200 }, (_, i) => { const r = Rs * Math.exp(0.15 + i * 0.006); return f(r * Math.cos(th), r * Math.sin(th), t) / Math.pow(1 + (r - Rs) / Rs, -2); });
      const a = prof(3), b = prof(4);
      let best = 0, bestE = Infinity;
      for (let s = -40; s <= 40; s++) { let e = 0; for (let i = 45; i < 155; i++) e += (a[i] - b[i + s]) ** 2; if (e < bestE) { bestE = e; best = s; } }
      if (best > 0) out++;
    }
    expect(out).toBeGreaterThanOrEqual(4);
  });

  it('el anillo de diamante se enciende sólo cuando el borde del sol asoma', () => {
    const on = field(P({ contact: 1, diamond: 1 })), off = field(P({ contact: 1, diamond: 0 }));
    const g = eclipseGeometry(on.k, 8);
    const x = g.Rs * Math.cos(g.thd), y = g.Rs * Math.sin(g.thd);
    // t = 8: the moon furthest from the sun's centre; t = 0: centred (totality)
    expect(on.f(x, y, 8)).toBeGreaterThan(0.9);
    expect(on.f(x, y, 0)).toBeLessThan(0.6);
    // the flare is the diamond's: a little outside the limb it shines only with «Anillo de diamante»
    const x2 = (g.Rs + 0.06) * Math.cos(g.thd), y2 = (g.Rs + 0.06) * Math.sin(g.thd);
    expect(on.f(x2, y2, 8) - off.f(x2, y2, 8)).toBeGreaterThan(0.1);
    expect(Math.abs(on.f(x2, y2, 0) - off.f(x2, y2, 0))).toBeLessThan(1e-9);
  });

  it('las estrellas sólo se ven donde la corona no ilumina el cielo', () => {
    const a = field(P({ stars: 0 })), b = field(P({ stars: 1 }));
    let n = 0;
    for (let y = -0.5; y <= 0.5; y += 0.004) for (let x = -0.88; x <= 0.88; x += 0.006) {
      const d = b.f(x, y, 2) - a.f(x, y, 2);
      if (d > 0.05) { n++; expect(a.f(x, y, 2), `(${x}, ${y})`).toBeLessThan(0.25); }
    }
    expect(n).toBeGreaterThan(20);
  });
});
