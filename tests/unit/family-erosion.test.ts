import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/erosion';
import { META } from '../../src/families/meta/erosion';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, Params } from '../../src/families/types';

/** Mechanism checks of the droplet and thermal erosion of the height map. */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
const state = (m: FieldModel) => { const s = m.snapshot(); return { b: s.arrays.b as Float32Array, flow: s.arrays.flow as Float32Array, lost: s.scalars.lost }; };
const sum = (a: Float32Array) => { let s = 0; for (const v of a) s += v; return s; };
const maxSlope = (b: Float32Array) => {
  const N = Math.round(Math.sqrt(b.length));
  let m = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) m = Math.max(m, Math.abs(b[y * N + x + 1] - b[y * N + x]), y < N - 1 ? Math.abs(b[(y + 1) * N + x] - b[y * N + x]) : 0);
  return m;
};

describe('erosion: mecanismo', () => {
  it('la roca no se crea ni se pierde: terreno + lo que sale por los bordes se conserva', () => {
    for (const shape of ['cordillera', 'ladera']) {
      const m = create({ seed: 'masa', params: base({ shape, rain: 1, erode: 1, evap: 0.5, talus: 25 }), res: 64 });
      const total0 = sum(state(m).b);
      m.step(400);
      const s = state(m);
      expect(s.lost).toBeGreaterThan(0);
      expect(Math.abs(sum(s.b) + s.lost - total0) / total0, shape).toBeLessThan(1e-4);
    }
  });

  it('el agua rebaja las cumbres y ahonda los cauces por donde corre más que sus orillas', () => {
    const m = create({ seed: 'cauces', params: base({ shape: 'cordillera', rain: 0.8, erode: 0.9, capacity: 0.8, talus: 75 }), res: 64 });
    const b0 = state(m).b.slice();
    m.step(600);
    const { b, flow } = state(m), N = Math.round(Math.sqrt(b.length));
    const max = (a: Float32Array) => a.reduce((x, y) => Math.max(x, y), -Infinity);
    expect(max(b)).toBeLessThan(max(b0) - 0.3);
    // change of each cell relative to the mean change within 3 cells: < 0 where it was carved below its banks
    const rel = (k: number) => {
      const x = k % N, y = (k - x) / N;
      let s = 0, c = 0;
      for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
        const xx = x + i, yy = y + j;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N) { s += b[yy * N + xx] - b0[yy * N + xx]; c++; }
      }
      return b[k] - b0[k] - s / c;
    };
    const land = Array.from(flow.keys()).filter(k => b0[k] > 0.5).sort((i, j) => flow[j] - flow[i]);
    const avg = (ks: number[]) => ks.reduce((s, k) => s + rel(k), 0) / ks.length;
    const channels = avg(land.slice(0, Math.round(land.length * 0.05))), banks = avg(land.slice(-Math.round(land.length * 0.3)));
    expect(channels).toBeLessThan(-0.02);
    expect(channels).toBeLessThan(banks - 0.03);
  });

  it('sin lluvia, las laderas más empinadas que el talud se desmoronan hasta él', () => {
    const run = (talus: number) => {
      const m = create({ seed: 'talud', params: base({ shape: 'meseta', height: 1, rain: 0, talus }), res: 64 });
      const before = maxSlope(state(m).b);
      m.step(400);
      return { before, after: maxSlope(state(m).b) };
    };
    const steep = run(60), gentle = run(20);
    expect(gentle.after).toBeLessThan(steep.after);
    expect(gentle.after).toBeLessThan(Math.tan((20 * Math.PI) / 180) * 1.3);
    expect(gentle.after).toBeLessThan(gentle.before);
  });
});
