import { describe, expect, it } from 'vitest';
import { formedAt, impl } from '../../src/families/analytic/anillos_tronco.cpu';
import { META } from '../../src/families/meta/anillos_tronco';
import { defaultParams, packParams, timeContract } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of «Anillos de tronco» (I-32): rings bent by polar noise that grow and pile up. */

const PX = 14 / 720;
const params = (id: string, extra: Params = {}): Params => ({ ...defaultParams(META), ...META.presets.find(p => p.id === id)!.params, ...extra });
const v = (k: Float32Array, x: number, y: number, t: number) => { impl.prep!(t, k, undefined, PX); return impl.cpu(x, y, t, k); };

/** The radii along a ray where a new year starts (the ring boundaries), at time t. */
function boundaries(k: Float32Array, a: number, t: number, Y: number): number[] {
  const out: number[] = [];
  let prev = formedAt(0.02 * Math.cos(a), 0.02 * Math.sin(a), t, k);
  for (let r = 0.02; r < 0.95; r += 0.0005) {
    const tau = formedAt(r * Math.cos(a), r * Math.sin(a), t, k);
    if (Math.floor(tau / Y) !== Math.floor(prev / Y)) out.push(r);
    prev = tau;
  }
  return out;
}

describe('anillos de tronco', () => {
  it('«Fluye»: los anillos nacen en el centro y se alejan, más juntos cuanto más lejos (se acumulan)', () => {
    const p = params('tronco', { wobble: 0, ecc: 0 });
    const k = packParams(META, p);
    const Y = p.year as number;
    const b0 = boundaries(k, 0.7, 20, Y), b1 = boundaries(k, 0.7, 20.4, Y);
    expect(b0.length).toBeGreaterThan(6);
    // the same ring, a moment later, farther out
    expect(b1[2]).toBeGreaterThan(b0[2]);
    // spacing shrinks outward
    const gaps = b0.slice(1).map((r, i) => r - b0[i]);
    expect(gaps[gaps.length - 1]).toBeLessThan(0.6 * gaps[0]);
  });

  it('el ruido polar hace irregulares los anillos: el radio de un mismo anillo cambia con el ángulo', () => {
    const spread = (k: Float32Array) => {
      const rs = Array.from({ length: 36 }, (_, i) => boundaries(k, (i / 36) * Math.PI * 2, 20, 1.6)[3]);
      return Math.max(...rs) - Math.min(...rs);
    };
    expect(spread(packParams(META, params('tronco', { wobble: 1, ecc: 0 })))).toBeGreaterThan(0.02);
    expect(spread(packParams(META, params('tronco', { wobble: 0, ecc: 0 })))).toBeLessThan(0.002);
  });

  it('«Crece»: el tronco engorda desde la médula, lo ya formado no cambia, y al llenar el lienzo se queda quieto', () => {
    const p = params('rodaja');
    const k = packParams(META, p);
    expect(timeContract(META, p)).toBe('construccion');
    expect(timeContract(META, params('tronco'))).toBe('continuo');
    const lit = (t: number) => { let n = 0; for (let x = -0.85; x < 0.85; x += 0.02) for (let y = -0.49; y < 0.49; y += 0.02) if (v(k, x, y, t) > 0.05) n++; return n; };
    expect(lit(10)).toBeGreaterThan(lit(3));
    // the wood inside the trunk at t = 3 is the same later
    let same = 0, n = 0;
    for (let x = -0.08; x < 0.08; x += 0.01) for (let y = -0.08; y < 0.08; y += 0.01) { n++; if (Math.abs(v(k, x, y, 3) - v(k, x, y, 12)) < 1e-9) same++; }
    expect(same / n).toBeGreaterThan(0.9);
    // finished: the canvas is full and nothing moves any more
    let d = 0;
    for (let x = -0.85; x < 0.85; x += 0.05) for (let y = -0.49; y < 0.49; y += 0.05) d += Math.abs(v(k, x, y, 400) - v(k, x, y, 500));
    expect(d).toBe(0);
  });
});
