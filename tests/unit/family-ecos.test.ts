import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/ecos';
import { META } from '../../src/families/meta/ecos';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Mechanism checks of the feedback loop (the buffer is 2 × 2 buffer pixels per raster pixel). */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const still: Params = { zoom: 0, curve: 0, rot: 0, swirl: 0, wander: 0, drift: 0, warp: 0, ink: 0, pulse: 0, mirror: 'no', echo: 'no', contrast: 0.5 };
const raster = (m: FieldModel) => { const o = new Uint8Array(m.w * m.h); m.render(o, 0); return o; };
const mean = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };

/** Mean distance from the centre of the lit raster pixels, weighted by their value (domain units). */
function radius(m: FieldModel) {
  const r = raster(m);
  let s = 0, wsum = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = r[y * m.w + x];
    if (!v) continue;
    const dx = ((x + 0.5) / m.w) * 2 - 1, dy = 0.5 - (y + 0.5) / m.h;
    s += v * Math.sqrt(dx * dx + dy * dy); wsum += v;
  }
  return s / wsum;
}

describe('ecos: mecanismo', () => {
  it('con «Avance» positivo lo dibujado se aleja del centro; con negativo se hunde hacia él', () => {
    const run = (zoom: number) => {
      const m = create({ seed: 'z', params: base({ ...still, amount: 0, memory: 1, zoom }), res: 48 });
      // a ring drawn by hand, then left to the loop alone
      m.stroke!({ brush: 'trazo', x0: -0.15, y0: 0, x1: 0.15, y1: 0, r: 0.02, strength: 1 });
      const r0 = radius(m);
      m.step(15);
      return radius(m) / r0;
    };
    expect(run(0.6)).toBeGreaterThan(1.15);
    expect(run(-0.6)).toBeLessThan(0.9);
  });

  it('sin semilla, la memoria decide cuánto dura lo dibujado', () => {
    const run = (memory: number) => {
      const m = create({ seed: 'mem', params: base({ ...still, amount: 0, memory }), res: 48 });
      m.stroke!({ brush: 'trazo', x0: -0.5, y0: 0, x1: 0.5, y1: 0.1, r: 0.03, strength: 1 });
      const a = mean(raster(m));
      m.step(30);
      return mean(raster(m)) / a;
    };
    const long = run(0.95), short = run(0.3);
    expect(long).toBeGreaterThan(0.5);
    expect(short).toBeLessThan(long * 0.3);
  });

  it('el espejo de cuatro cuartos deja el fotograma simétrico en los dos ejes', () => {
    const m = create({ seed: 'esp', params: base({ ...still, seed: 'puntos', amount: 1, mirror: 'cuatro', rot: 0.3, zoom: 0.2 }), res: 48 });
    m.step(40);
    const r = raster(m);
    let diff = 0, ink = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const v = r[y * m.w + x];
      ink += v;
      diff += Math.abs(v - r[y * m.w + (m.w - 1 - x)]) + Math.abs(v - r[(m.h - 1 - y) * m.w + x]);
    }
    expect(ink / r.length).toBeGreaterThan(5);
    // (bilinear folding at the mirror lines leaves a little difference)
    expect(diff / (2 * ink)).toBeLessThan(0.08);
  });

  it('«Tinta» convierte una mancha en laberinto: ni vacío ni lleno, con mucho borde', () => {
    const m = create({ seed: 'tinta', params: base({ ...still, seed: 'puntos', amount: 0.5, ink: 0.7, memory: 0.9, zoom: 0.1 }), res: 48 });
    m.step(240);
    const r = raster(m);
    let lit = 0, edges = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w - 1; x++) {
      const a = r[y * m.w + x] > 127, b = r[y * m.w + x + 1] > 127;
      if (a) lit++;
      if (a !== b) edges++;
    }
    const frac = lit / r.length;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.8);
    // a labyrinth crosses from ink to paper every few pixels along a row
    expect(edges / r.length).toBeGreaterThan(0.08);
  });
});
