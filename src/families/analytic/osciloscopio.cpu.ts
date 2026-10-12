import type { AnalyticImpl } from '../types';
import { TAU, fract, gnoise, hash11, mod, sdSeg, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/patterns';
import { OSCILOSCOPIO_GLSL } from './osciloscopio';

/**
 * CPU twin of F_osciloscopio, line by line. The trace depends on x and t only, so the samples of a column
 * (three per trace, four traces with the phosphor copies) are kept while the engine walks down it.
 */
const mix = (a: number, b: number, w: number) => a * (1 - w) + b * w;
const oscA = (n: number, c: number) => (n < 1.5 ? 1 : (0.35 + 0.65 * hash11(c * 7 + n * 13 + 1)) / n);

/** osc_y: the trace's height at x (screen units) at time t. */
export function oscY(x: number, t: number, k: Float32Array): number {
  const H = Math.min(6, Math.max(1, Math.floor(k[0] + 0.5))), cyc = k[2], f = k[7];
  const u = fract(t / cyc), c = Math.floor(t / cyc);
  const E = 0.55 + 0.6 * smoothstep(0.35, 0.62, u) * (1 - smoothstep(0.78, 0.86, u)) - 0.5 * smoothstep(0.8, 0.87, u) * (1 - smoothstep(0.9, 0.99, u));
  const D = k[1] * smoothstep(0.35, 0.72, u) * (1 - smoothstep(0.86, 0.98, u));
  const wf = 0.3 + 0.7 * hash11(c * 11 + 2), wc = 0.3 + 0.7 * hash11(c * 17 + 3), wq = 0.3 + 0.7 * hash11(c * 23 + 4), wn = 0.3 + 0.7 * hash11(c * 29 + 5);
  const dq = D * wq;
  let xs = x;
  if (dq > 0.05) { const dl = mix(0.004, 0.07, dq); xs = (Math.floor(x / dl) + 0.5) * dl; }
  const pm = 2.5 * D * wf * Math.sin(TAU * f * (1.5 + 2 * hash11(c * 31 + 6)) * xs + t * 3.1);
  const mw = smoothstep(0.86, 0.98, u);
  let y = 0, sa = 0;
  for (let n = 1; n <= H; n++) {
    const a = mix(oscA(n, c), oscA(n, c + 1), mw);
    y += a * Math.sin(TAU * n * f * xs + t * (0.7 + 0.23 * n) + n * 1.7 + n * pm);
    sa += a;
  }
  y = (E * k[6] * y) / sa;
  const dc = D * wc;
  y = mix(y, (1.6 * y) / (1 + Math.abs(y) + 0.28 * y * y), dc);
  const L = mix(1.4, 0.45, dc);
  y = Math.min(L, Math.max(-L, y));
  const Q = Math.pow(2, 8 - 7 * dq) * 0.5;
  y = mix(y, Math.floor(y * Q + 0.5) / Q, smoothstep(0.05, 0.2, dq));
  const dn = D * wn + k[3] * 0.12;
  y += dn * 0.5 * (0.6 * (gnoise(xs * 55, t * 7) - 0.5) + 0.4 * (gnoise(xs * 140, mod(Math.floor(t * 24), 997) * 7) - 0.5));
  return y * 0.3;
}

// the column being drawn: x, t and its samples (trace j: ya, yb, yc)
let cx = NaN, ct = NaN;
const Y = new Float64Array(12);
let nTr = 1;
const dts = [0, 0, 0, 0];
const wts = [1, 0, 0, 0];

function trace(px: number, py: number, h: number, j: number): number {
  const ya = Y[j * 3], yb = Y[j * 3 + 1], yc = Y[j * 3 + 2];
  const d = Math.min(sdSeg(px, py, px - h, ya, px, yb), sdSeg(px, py, px, yb, px + h, yc));
  const sl = Math.abs(yc - ya) / (2 * h);
  return (1 / (1 + (d * d) / 7.2e-5) + 0.16 * Math.exp(-d / 0.02)) * (0.55 + 0.45 / (1 + sl * 0.15));
}

export const impl: AnalyticImpl = {
  glsl: OSCILOSCOPIO_GLSL,
  prep(_t, k) {
    cx = NaN;
    const per = k[5];
    nTr = 1; dts[0] = 0; wts[0] = 1;
    let w = 0.6 * per;
    for (let j = 1; j < 4; j++) {
      if (per <= 0) break;
      dts[j] = j * (0.035 + 0.05 * per); wts[j] = w; nTr = j + 1;
      w *= 0.55 * per + 0.1;
    }
  },
  cpu(x, y, t, k) {
    const PX = currentPX();
    const h = PX * 0.72;
    if (x !== cx || t !== ct) {
      cx = x; ct = t;
      for (let j = 0; j < nTr; j++) {
        const tj = t - dts[j];
        Y[j * 3] = oscY(x - h, tj, k); Y[j * 3 + 1] = oscY(x, tj, k); Y[j * 3 + 2] = oscY(x + h, tj, k);
      }
    }
    let v = trace(x, y, h, 0);
    for (let j = 1; j < nTr; j++) v += wts[j] * trace(x, y, h, j);
    const gr = Math.floor(k[4] + 0.5);
    if (gr > 0.5) {
      const dv = 0.125, mn = dv / 5;
      const gx = Math.abs(fract(x / dv + 0.5) - 0.5) * dv, gy = Math.abs(fract(y / dv + 0.5) - 0.5) * dv;
      const tx = Math.abs(fract(x / mn + 0.5) - 0.5) * mn, ty = Math.abs(fract(y / mn + 0.5) - 0.5) * mn;
      const on = PX * 0.55;
      const st = (e: number, v: number) => (v < e ? 0 : 1);
      let g = 0;
      if (gr < 1.5) {
        g = 0.1 * st(Math.min(gx, gy), on);
        g = Math.max(g, 0.3 * st(gx, on) * st(ty, on));
        g = Math.max(g, 0.3 * st(gy, on) * st(tx, on));
      }
      const ax = st(Math.abs(x), on), ay = st(Math.abs(y), on);
      g = Math.max(g, 0.18 * Math.max(ax, ay));
      g = Math.max(g, 0.42 * Math.max(ay * st(tx, on), ax * st(ty, on)));
      v += g;
    }
    return Math.min(1, Math.max(0, v));
  },
};
