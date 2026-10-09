import { describe, expect, it } from 'vitest';
import { agentCount, create } from '../../src/families/sims/physarum';
import { META } from '../../src/families/meta/physarum';
import { defaultParams } from '../../src/families/params';
import type { Params } from '../../src/families/types';

/** Physarum (Jones 2010): the mechanism, not only the picture. */

const base = (p: Params = {}) => ({ ...defaultParams(META), ...p });
const trail = (m: ReturnType<typeof create>) => { let s = 0; for (const v of m.snapshot().arrays.T as Float32Array) s += v; return s; };

describe('physarum', () => {
  it('el rastro crece con el depósito (los giros sólo comparan, así que es proporcional)', () => {
    const a = create({ seed: 's', params: base({ deposit: 0.5 }), res: 48 });
    const b = create({ seed: 's', params: base({ deposit: 2 }), res: 48 });
    a.step(150); b.step(150);
    const r = trail(b) / trail(a);
    expect(r).toBeGreaterThan(3.9);
    expect(r).toBeLessThan(4.1);
  });

  it('la difusión conserva el rastro y la evaporación lo equilibra con lo depositado', () => {
    const p = base({ decay: 0.1, deposit: 1, density: 10 });
    const m = create({ seed: 's', params: p, res: 48 });
    m.step(400);
    const n = agentCount(m.w, m.h, 10);
    // steady state: Σ T = deposits per step × (1 − e) / e; at most every agent deposits (blocked ones do not)
    const top = n * 1 * 0.9 / 0.1;
    const s = trail(m);
    expect(s).toBeLessThanOrEqual(top * 1.0001);
    expect(s).toBeGreaterThan(top * 0.2);
    // and it settles: a hundred steps later the total barely moves
    m.step(100);
    expect(Math.abs(trail(m) - s) / s).toBeLessThan(0.1);
  });

  it('una celda admite un solo agente', () => {
    const m = create({ seed: 'x', params: base({ density: 30, layout: 'centro' }), res: 48 });
    m.step(120);
    const st = m.snapshot(), X = st.arrays.X as Float32Array, Y = st.arrays.Y as Float32Array;
    const seen = new Set<number>();
    for (let i = 0; i < X.length; i++) {
      const c = (Math.floor(Y[i]) % m.h) * m.w + (Math.floor(X[i]) % m.w);
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
  });

  it('el pincel «Atraer» reúne agentes donde toca', () => {
    const near = (m: ReturnType<typeof create>) => {
      const st = m.snapshot(), X = st.arrays.X as Float32Array, Y = st.arrays.Y as Float32Array;
      let k = 0;
      for (let i = 0; i < X.length; i++) if (Math.hypot(X[i] - m.w * 0.75, Y[i] - m.h * 0.5) < m.h * 0.15) k++;
      return k;
    };
    const p = base({ layout: 'aleatorio', density: 10 });
    const a = create({ seed: 'b', params: p, res: 48 }), b = create({ seed: 'b', params: p, res: 48 });
    a.step(100); b.step(100);
    for (let i = 0; i < 20; i++) {
      b.stroke!({ brush: 'atraer', x0: 0.5, y0: 0, x1: 0.5, y1: 0, r: 0.1, strength: 1 });
      a.step(3); b.step(3);
    }
    expect(near(b)).toBeGreaterThan(near(a) * 1.3);
  });
});
