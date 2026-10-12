import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/humo';
import { META } from '../../src/families/meta/humo';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Mechanism checks of the curl-noise smoke (positions in world units; three floats per particle). */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });

/** Squared coefficient of variation of the counts of a set of points in an n³ grid over a box. */
function clumping(pos: Float32Array, count: number, half: number, n = 5) {
  const c = new Float64Array(n * n * n);
  let inside = 0;
  for (let i = 0; i < count; i++) {
    const g = [0, 1, 2].map(k => Math.floor(((pos[i * 3 + k] + half) / (2 * half)) * n));
    if (g.some(v => v < 0 || v >= n)) continue;
    c[(g[0] * n + g[1]) * n + g[2]]++; inside++;
  }
  const m = inside / c.length;
  let v = 0;
  for (const x of c) v += (x - m) * (x - m);
  return v / c.length / (m * m);
}

describe('humo: mecanismo', () => {
  it('el flujo rizado no tiene divergencia: una nube uniforme sigue uniforme mientras se enrosca', () => {
    const count = 6000, half = 0.6;
    const m = create({ seed: 'div', params: base({ count, attract: 0, rise: 0, life: 12, speed: 1, scale: 0.5 }), res: 48 });
    // a uniform cube of particles, all at the start of a long life
    const s = m.snapshot();
    const pos = s.arrays.pos as Float32Array, life = s.arrays.life as Float32Array, span = s.arrays.span as Float32Array;
    let k = 0x9e3779b9;
    const rnd = () => { k ^= k << 13; k ^= k >>> 17; k ^= k << 5; return ((k >>> 0) / 4294967296); };
    for (let i = 0; i < count; i++) { for (let j = 0; j < 3; j++) pos[i * 3 + j] = (rnd() * 2 - 1) * half * 2.2; life[i] = 1; span[i] = 1.4; }
    m.restore(s);
    const before = clumping(pos, count, half);
    m.step(45);
    const after = m.snapshot();
    const moved = after.arrays.pos as Float32Array;
    let disp = 0;
    for (let i = 0; i < count * 3; i++) disp += Math.abs(moved[i] - pos[i]);
    // it did move (a good part of a cell of the grid) and the inner box did not clump or empty
    expect(disp / (count * 3)).toBeGreaterThan(0.05);
    expect(clumping(moved, count, half)).toBeLessThan(before * 1.6 + 0.02);
    // a converging field (the pull towards a target) does clump: the check can fail
    const pulled = create({ seed: 'div', params: base({ count, attract: 1, radius: 0.03, target: 'fijo', rise: 0, life: 12, speed: 0.05, scale: 0.5 }), res: 48 });
    pulled.restore(s);
    pulled.step(45);
    expect(clumping(pulled.snapshot().arrays.pos as Float32Array, count, half)).toBeGreaterThan(before * 3);
  });

  it('con un foco fijo y ascenso, el humo sube; cada partícula renace al agotar su vida', () => {
    const run = (rise: number) => {
      const m = create({ seed: 'sube', params: base({ target: 'fijo', rise, attract: 0, life: 2, count: 2000 }), res: 48 });
      m.step(120);
      const s = m.snapshot(), pos = s.arrays.pos as Float32Array, life = s.arrays.life as Float32Array;
      let y = 0;
      for (let i = 0; i < 2000; i++) { y += pos[i * 3 + 1]; expect(life[i]).toBeGreaterThan(0); expect(life[i]).toBeLessThanOrEqual(1); }
      return y / 2000;
    };
    // the column stands higher than the same smoke without the rise (about 0.35 heights per second of age)
    expect(run(1) - run(0)).toBeGreaterThan(0.15);
  });

  it('la cámara gira con el reloj de la capa sin tocar el estado', () => {
    const m = create({ seed: 'cam', params: base({ orbit: 1 }), res: 48 });
    m.step(30);
    const a = new Uint8Array(m.w * m.h), b = new Uint8Array(m.w * m.h), c = new Uint8Array(m.w * m.h);
    m.render(a, 0); m.render(b, 3); m.render(c, 0);
    let d = 0, same = 0;
    for (let i = 0; i < a.length; i++) { d += Math.abs(a[i] - b[i]); same += Math.abs(a[i] - c[i]); }
    expect(d / a.length).toBeGreaterThan(1);
    expect(same).toBe(0);
  });
});
