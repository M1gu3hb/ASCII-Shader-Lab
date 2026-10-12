import type { AnalyticImpl } from '../types';
import { TAU, fbm, fract, hash12, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/patterns';
import { MAR_GLSL } from './mar';

/** CPU twin of F_mar, line by line. The eight waves' constants are worked out once per frame (prep). */
const N = 8;
const WK = new Float64Array(N), WDX = new Float64Array(N), WDY = new Float64Array(N), WA = new Float64Array(N), WW = new Float64Array(N), WP = new Float64Array(N);
let wav = 0, hz = 0, on = 0, mr = 0, mpx = 0, mpy = 0, pl = 0, amp = 0;
let lnx = 0, lny = 0, lnz = 1;
const f = 1.3;

function sky(sx: number, sy: number, rad: number, m: number, st: number, t: number): number {
  const y = Math.max(sy, 0);
  let v = 0.025 + 0.11 * Math.exp(-y / 0.07) + 0.04 * Math.exp(-y / 0.4);
  const d = Math.hypot(sx - mpx, sy - mpy);
  const disc = smoothstep(rad + 0.005, rad - 0.005, d);
  v += on * (m * disc + m * 0.3 * Math.exp(-Math.max(d - rad, 0) / 0.06) + 0.08 * Math.exp(-d / 0.35));
  if (st > 0) {
    const h = hash12(Math.floor(sx * 64) + 11, Math.floor(sy * 64) + 11);
    v += st * smoothstep(0.04, 0.12, sy) * (h < 0.985 ? 0 : 1) * (0.35 + 0.3 * Math.sin(t * (0.8 + h * 2) + h * 60));
  }
  return v;
}

export const impl: AnalyticImpl = {
  glsl: MAR_GLSL,
  prep(t, k) {
    wav = k[0]; hz = -0.25 + (0.35 + 0.25) * k[3];
    on = smoothstep(0, 0.08, k[4]); mr = 0.015 + 0.06 * k[4];
    mpx = k[6] * 0.6; mpy = 0.04 + 0.3 * k[5]; pl = k[7];
    const kb = TAU / (2 + 10 * k[1]);
    amp = 0;
    for (let i = 0; i < N; i++) {
      const kk = kb * Math.pow(1.45, i);
      const a = k[2] * 1.4 + (fract(i * 0.618) - 0.5) * 1.4;
      WK[i] = kk; WDX[i] = Math.sin(a); WDY[i] = Math.cos(a);
      WA[i] = (wav * 0.08 * Math.pow(0.85, i)) / kk;
      WW[i] = Math.sqrt(2.5 * kk) * t; WP[i] = i * 2.1;
      amp += WA[i];
    }
    const ll = Math.hypot(mpx, 0.5, 1);
    lnx = mpx / ll; lny = 0.5 / ll; lnz = 1 / ll;
  },
  cpu(x, y, t) {
    const PX = currentPX();
    if (y > hz) {
      const sx = x, sy = y - hz;
      let v = sky(sx, sy, mr, 1, 1 - 0.6 * on, t);
      if (on > 0 && Math.hypot(sx - mpx, sy - mpy) < mr) v -= 0.28 * on * smoothstep(0.45, 0.7, fbm(((sx - mpx) / mr) * 1.6 + 4, ((sy - mpy) / mr) * 1.6 + 4));
      return Math.min(1, Math.max(0, v));
    }
    const l = 1 / Math.max(hz - y, 1e-4);
    const Xx = x * l, Xz = f * l;
    const fp = PX * Math.max(f * l * l, l);
    let rx = x, ry = y - hz, rz = f;
    const rl = Math.hypot(rx, ry, rz);
    rx /= rl; ry /= rl; rz /= rl;
    let gx = 0, gz = 0, h = 0;
    for (let i = 0; i < N; i++) {
      const kk = WK[i], A = WA[i];
      const w = smoothstep(2, 4, TAU / (kk * fp));
      const th = kk * (WDX[i] * Xx + WDY[i] * Xz) - WW[i] + WP[i];
      const c = w * A * kk * Math.cos(th);
      gx += c * WDX[i]; gz += c * WDY[i];
      h += w * A * Math.sin(th);
    }
    let nx = -gx, ny = 1, nz = -gz;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl; ny /= nl; nz /= nl;
    const dd = rx * nx + ry * ny + rz * nz;
    const qx = rx - 2 * dd * nx, qy = ry - 2 * dd * ny, qz = rz - 2 * dd * nz;
    const cs = Math.max(-dd, 0);
    const F = 0.02 + 0.98 * Math.pow(1 - cs, 5);
    const zz = Math.max(qz, 0.05);
    let v = F * sky((qx / zz) * f, (Math.max(qy, 0) / zz) * f, mr * 1.7 + 0.006, 12, 0, t);
    const hn = h / Math.max(amp, 1e-4);
    v += (1 - F) * (0.035 + 0.05 * Math.min(1, Math.max(0, nx * lnx + ny * lny + nz * lnz - 0.85)) * 6 + 0.03 * hn);
    const crest = smoothstep(0.3, 0.8, hn);
    const hs = hash12(Math.floor(x / Math.max(PX, 1e-4)) + 5, Math.floor(y / Math.max(PX, 1e-4)) + 5);
    const tw = 0.5 + 0.5 * Math.sin(t * (0.9 + 1.6 * hs) + hs * 40);
    const fade = Math.exp(-l * 0.05);
    v += wav * 0.1 * smoothstep(0.55, 0.95, hn) * fade;
    v += pl * fade * (crest * (0.3 + 0.7 * tw * (hs < 0.35 ? 0 : 1)) + 0.05);
    return Math.min(1, Math.max(0, v));
  },
};
