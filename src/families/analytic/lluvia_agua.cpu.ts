import type { AnalyticImpl } from '../types';
import { TAU, hash12, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { LLUVIA_AGUA_GLSL } from './lluvia_agua';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of F_lluvia_agua, line by line. */
const C3 = new Float64Array(3);
function cfg(ci: number, sp: number) {
  C3[0] = 1 + 2.6 * hash12(ci, 3.1); C3[1] = hash12(ci, 7.7); C3[2] = sp * (0.6 + 0.8 * hash12(ci, 1.3));
}
const on = (ci: number, j: number, dens: number) => step(hash12(ci + 0.5, j), dens);

function rain(px: number, py: number, t: number, colW: number, co: number, sp: number, dens: number, trail: number, yw: number, flick: number, PX: number): number {
  const ci = Math.floor(px / colW + co);
  cfg(ci, sp);
  const P = C3[0], ph = C3[1], v0 = C3[2];
  const tau = t + (py - yw) / v0;
  const j0 = Math.floor(tau / P - ph);
  const row = Math.floor(py / PX + 0.125);
  const rate = 1.5 + 9 * flick;
  const fl = hash12(row + 157 * ci, Math.floor(t * rate + hash12(ci, row)));
  let b = 0;
  for (let m = 0; m < 3; m++) {
    const j = j0 - m;
    if (on(ci, j, dens) < 0.5) continue;
    const d = Math.max(v0 * (tau - (j + ph) * P), 0);
    const L = trail * (0.5 + hash12(ci + 0.25, j));
    if (d > 4 * L + PX) continue;
    const v = d < PX ? 1 : (0.16 + 0.66 * Math.exp(-d / L)) * (1 - 0.5 * flick * fl);
    if (v > b) b = v;
  }
  return b;
}

/** The water's height and slope at x (written into W2), as la_wave. */
const W2 = new Float64Array(2);
export function wave(x: number, t: number, colW: number, co: number, sp: number, dens: number, amp: number, tau: number, cv: number, kw: number) {
  const ci = Math.floor(x / colW + co);
  const R = Math.min(0.45, 24.5 * colW);
  let h = 0, g = 0;
  for (let n = -24; n <= 24; n++) {
    const cj = ci + n;
    const dx = x - (cj + 0.5 - co) * colW, ax = Math.abs(dx);
    const wn = smoothstep(R, 0.6 * R, ax);
    if (wn <= 0) continue;
    cfg(cj, sp);
    const P = C3[0], ph = C3[1];
    const j0 = Math.floor(t / P - ph);
    for (let m = 0; m < 3; m++) {
      const j = j0 - m;
      if (on(cj, j, dens) < 0.5) continue;
      const a = t - (j + ph) * P;
      const s = cv * a - ax;
      if (s <= 0) continue;
      const A = amp * (0.6 + 0.8 * hash12(cj + 0.25, j)) * wn * Math.exp(-a / tau - 2 * ax - (s * kw) / 9) * smoothstep(0, 0.012, s);
      h += A * -Math.sin(kw * s);
      g += A * kw * Math.cos(kw * s) * Math.sign(dx);
    }
  }
  W2[0] = h; W2[1] = g;
  return W2;
}

function splash(px: number, py: number, t: number, colW: number, co: number, sp: number, dens: number, yw: number, PX: number): number {
  const ci = Math.floor(px / colW + co);
  let s = 0;
  for (let n = -1; n <= 1; n++) {
    const cj = ci + n;
    cfg(cj, sp);
    const P = C3[0], ph = C3[1];
    const j = Math.floor(t / P - ph);
    if (on(cj, j, dens) < 0.5) continue;
    const a = t - (j + ph) * P;
    if (a > 0.7) continue;
    for (let q = 0; q < 4; q++) {
      const vx = (hash12(cj + 0.125, j + 64 * q) - 0.5) * 0.5;
      const vy = 0.22 + 0.3 * hash12(cj + 0.375, j + 64 * q);
      const dx = (cj + 0.5 - co) * colW + vx * a, dy = yw + vy * a - 1.4 * a * a;
      if (dy < yw) continue;
      const v = (1 - smoothstep(0.45 * PX, 1.05 * PX, Math.hypot(px - dx, py - dy))) * (1 - a / 0.7);
      if (v > s) s = v;
    }
  }
  return s;
}

// the engine walks the grid column by column: the water at the last x is kept
let lx = NaN, lt = NaN, lh = 0, lg = 0;

export const impl: AnalyticImpl = {
  glsl: LLUVIA_AGUA_GLSL,
  prep: (_t, _k, _p, px) => { PXc = px ?? null; lx = NaN; },
  cpu(x, y, t, k) {
    const PX = pxNow();
    const colW = (k[0] * PX) / 1.4, co = 0.25 / k[0], dens = k[1], sp = k[2], trail = k[3];
    const yw = -0.5 + k[4];
    const amp = 0.035 * k[5], tau = 0.35 + 1.6 * (1 - k[6]), cv = 0.1 + 0.5 * k[7];
    const kw = TAU / (0.06 + 0.24 * k[11]);
    let h = 0, g = 0;
    if (y < yw + 0.14) {
      if (x !== lx || t !== lt) { wave(x, t, colW, co, sp, dens, amp, tau, cv, kw); lx = x; lt = t; lh = W2[0]; lg = W2[1]; }
      h = lh; g = lg;
    }
    const ys = yw + h;
    let v: number;
    if (y > ys) {
      v = rain(x, y, t, colW, co, sp, dens, trail, yw, k[9], PX);
      v = Math.max(v, k[10] * splash(x, y, t, colW, co, sp, dens, yw, PX));
    } else {
      const dep = ys - y;
      const mx = x + g * dep * 3, my = ys + dep;
      v = 0.03 + 0.06 * Math.exp(-dep * 5);
      v += k[8] * 0.85 * Math.exp(-dep * 1.8) * rain(mx, my, t, colW, co, sp, dens, trail, yw, k[9], PX);
      v += 0.2 * Math.min(1, Math.max(0, Math.abs(g) * 3)) * Math.exp(-dep / PX);
    }
    const ln = 1 - smoothstep(0.3 * PX, 0.85 * PX, Math.abs(y - ys));
    v = Math.max(v, ln * (0.55 + 0.45 * Math.min(1, Math.max(0, Math.abs(g) * 5))));
    return Math.min(1, Math.max(0, v));
  },
};
