import { describe, expect, it } from 'vitest';
import { create } from '../../src/families/sims/niebla';
import { META } from '../../src/families/meta/niebla';
import { defaultParams } from '../../src/families/params';
import type { FieldModel, ModelState, Params } from '../../src/families/types';

/** Mechanism checks of the cloud chamber: one particle placed by hand in the pool (index 0). */

const base = (p: Params = {}): Params => ({ ...defaultParams(META), ...p });
// no new events, no mist: only what is placed by hand
const quiet: Params = { rate: 0.5, mist: 0, pairs: 0, alphas: 0, muons: 0 };

function place(m: FieldModel, kind: number, x: number, y: number, vx: number, vy: number, q: number): ModelState {
  const s = m.snapshot();
  const A = s.arrays;
  (A.kind as Uint8Array).fill(0);
  (A.kind as Uint8Array)[0] = kind; (A.q as Float32Array)[0] = q;
  (A.px as Float32Array)[0] = x; (A.py as Float32Array)[0] = y; (A.vx as Float32Array)[0] = vx; (A.vy as Float32Array)[0] = vy;
  (A.arc as Float32Array)[0] = 0; (A.age as Float32Array)[0] = 0; (A.conv as Float32Array)[0] = 0.3;
  m.restore(s);
  return s;
}
const read = (m: FieldModel) => {
  const A = m.snapshot().arrays;
  return { kind: A.kind as Uint8Array, q: A.q as Float32Array, x: (A.px as Float32Array)[0], y: (A.py as Float32Array)[0], vx: (A.vx as Float32Array)[0], vy: (A.vy as Float32Array)[0] };
};

describe('niebla: mecanismo', () => {
  it('sin frenado, el campo sólo gira la velocidad: el electrón describe un círculo de radio v/ω', () => {
    const m = create({ seed: 'circ', params: base({ ...quiet, field: 0.5, drag: 0 }), res: 48 });
    // (drag 0 still leaves the floor of the loss law: a very slow decay)
    place(m, 1, 0, 0, 0.6, 0, -1);
    const B = 0.5 + 9 * 0.5, period = (2 * Math.PI) / B, R = 0.6 / B;
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k < Math.round(period * 30); k++) { m.step(1); const p = read(m); xs.push(p.x); ys.push(p.y); }
    // one turn: the points go round a centre at distance R from the start, at radius R
    const cx = xs.reduce((a, b) => a + b) / xs.length, cy = ys.reduce((a, b) => a + b) / ys.length;
    expect(Math.abs(Math.hypot(cx, cy) - R) / R).toBeLessThan(0.15);
    for (let k = 0; k < xs.length; k++) expect(Math.abs(Math.hypot(xs[k] - cx, ys[k] - cy) - R) / R).toBeLessThan(0.2);
    // and it closes: back near where it started
    expect(Math.hypot(xs[xs.length - 1], ys[ys.length - 1]) / R).toBeLessThan(0.35);
    const p = read(m);
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(0.6 * 0.7);
  });

  it('con frenado el radio se cierra: la traza acaba en espiral y la partícula se detiene', () => {
    const m = create({ seed: 'esp', params: base({ ...quiet, field: 0.6, drag: 0.8 }), res: 48 });
    place(m, 1, 0, 0, 0.9, 0, -1);
    let prev = 0.9, alive = true;
    for (let k = 0; k < 300 && alive; k++) {
      m.step(1);
      const p = read(m);
      alive = p.kind[0] === 1;
      if (!alive) break;
      const v = Math.hypot(p.vx, p.vy);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
    expect(alive).toBe(false);
  });

  it('un fotón se convierte en un par de cargas opuestas que se abren en V', () => {
    const m = create({ seed: 'par', params: base({ ...quiet, field: 0.5 }), res: 48 });
    place(m, 4, -0.5, 0, 1.2, 0, 0);
    let pair: number[] = [];
    for (let k = 0; k < 30 && pair.length < 2; k++) {
      m.step(1);
      const A = m.snapshot().arrays, kind = A.kind as Uint8Array;
      pair = [];
      for (let i = 0; i < kind.length; i++) if (kind[i] === 1) pair.push(i);
    }
    expect(pair.length).toBe(2);
    const A = m.snapshot().arrays, q = A.q as Float32Array, vx = A.vx as Float32Array, vy = A.vy as Float32Array;
    expect(q[pair[0]] * q[pair[1]]).toBe(-1);
    // both go on roughly forwards, at an angle to each other
    const a0 = Math.atan2(vy[pair[0]], vx[pair[0]]), a1 = Math.atan2(vy[pair[1]], vx[pair[1]]);
    expect(Math.abs(a0)).toBeLessThan(1);
    expect(Math.abs(a1)).toBeLessThan(1);
    expect(Math.abs(a0 - a1)).toBeGreaterThan(0.05);
  });
});
