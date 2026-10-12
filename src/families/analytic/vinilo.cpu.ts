import type { AnalyticImpl } from '../types';
import { TAU, fract, gnoise, hash12, mod, sdSeg, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { VINILO_GLSL } from './vinilo';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const spec = (h: number, o: number) => Math.min(1, Math.max(0, Math.abs(fract(h + o) * 6 - 3) - 1));
const RATES = [8, 33.333, 45, 78];
const LABELS = [[0.85, 0.12, 0.1], [0.95, 0.78, 0.15], [0.15, 0.3, 0.85], [0.15, 0.6, 0.3], [0.92, 0.9, 0.85]];

/** The disc's geometry at layer time t (tests): its turn, radius, centre, tilt, the light's angle and the arm. */
export function viniloState(k: Float32Array, t: number) {
  const sp = Math.floor(k[0] + 0.5);
  const rate = RATES[Math.min(3, Math.max(0, sp))];
  const P = Math.max(k[12], 4), u = t / P;
  const rev = Math.max(Math.floor(rate / 60 * P + 0.5), 1);
  const Rd = 0.3 + (0.46 - 0.3) * k[1];
  const pvx = Rd, pvy = Rd * 0.62, La2 = 1.1 * Rd, D = Math.hypot(pvx, pvy);
  const fu = fract(u);
  const pr = fu < 0.9 ? fu / 0.9 : 1 - (fu - 0.9) / 0.1;
  const rho = (0.94 + (0.36 - 0.94) * pr) * Rd;
  const aa = Math.atan2(-pvy, -pvx) + Math.acos(Math.min(1, Math.max(-1, (D * D + La2 * La2 - rho * rho) / (2 * D * La2))));
  return {
    rot: TAU * u * rev, rev, P, Rd, cx: -0.1 * Rd / 0.46, ct: Math.cos(k[2] * 1.05),
    light: k[8] * TAU + TAU * Math.floor(k[9] + 0.5) * u,
    pvx, pvy, ex: pvx + La2 * Math.cos(aa), ey: pvy + La2 * Math.sin(aa), rho, aa,
  };
}

let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const sp = Math.floor(k[0] + 0.5);
  const rate = sp < 0.5 ? 8 : sp < 1.5 ? 33.333 : sp < 2.5 ? 45 : 78;
  const P = Math.max(k[12], 4), u = t / P;
  const rev = Math.max(Math.floor(rate / 60 * P + 0.5), 1);
  const rot = TAU * u * rev;
  const Rd = 0.3 + (0.46 - 0.3) * k[1], ct = Math.cos(k[2] * 1.05);
  const ng = 12 + (60 - 12) * k[3], sig = k[4], ntr = Math.min(8, Math.max(1, Math.floor(k[5] + 0.5)));
  const shine = k[6], iris = k[7], La = k[8] * TAU + TAU * Math.floor(k[9] + 0.5) * u;
  const armOn = k[10], lab = Math.floor(k[11] + 0.5);
  const cx = -0.1 * Rd / 0.46;
  const qx = px - cx, qy = py / ct;
  const r = Math.hypot(qx, qy), ph = Math.atan2(qy, qx);
  const th = mod(ph - rot, TAU);
  let v = 0, cr = 0.6, cg = 0.62, cb = 0.68;
  const rl = 0.3 * Rd, rg0 = 0.34 * Rd, rg1 = 0.97 * Rd;
  if (r < Rd) {
    if (r > rl) {
      const s = (r - rg0) / (rg1 - rg0);
      const loud = smoothstep(0.25, 0.75, gnoise(s * 9, 3.7));
      const wob = sig * (0.25 + 0.75 * loud) * 0.35 * Math.sin(th * 7 + s * 40) * Math.sin(th * 3 - s * 17);
      const gp = (r - rg0) * ng / Rd + wob;
      const tri = Math.abs(fract(gp) - 0.5) * 2;
      const tk = s * ntr;
      const gd = Math.abs(tk - Math.floor(tk + 0.5)) / ntr * (rg1 - rg0);
      const gap = s > 0 && s < 1 ? (1 - smoothstep(0.5 * PX, 1.3 * PX, gd)) * step(0.5, tk) * step(tk, ntr - 0.5) : 0;
      const rim = s >= 1 ? 1 : 0;
      const da = ph - La;
      const wedge = Math.pow(Math.abs(Math.cos(da)), 26) + 0.45 * Math.pow(Math.abs(Math.sin(da)), 40);
      const refl = shine * wedge * (0.35 + 0.65 * (tri + (1 - tri) * gap)) * (1 + 0.8 * gap);
      const base = 0.1 + 0.16 * tri * (1 - gap) + 0.05 * loud * (1 - gap) + 0.25 * rim;
      v = base + refl;
      const h = fract(Math.abs(Math.sin(da)) * 2.2 + s * 1.3 + 0.1);
      const rr = 1 + (spec(h, 0) - 1) * iris, rg = 1 + (spec(h, 2 / 3) - 1) * iris, rb = 1 + (spec(h, 1 / 3) - 1) * iris;
      const m = Math.min(1, Math.max(0, refl / Math.max(v, 1e-3)));
      cr = 0.55 + (rr - 0.55) * m; cg = 0.57 + (rg - 0.57) * m; cb = 0.63 + (rb - 0.63) * m;
    } else {
      const lr = r / rl;
      let mark = 0;
      for (let i = 0; i < 2; i++) {
        const rr = 0.55 + 0.22 * i;
        const n = 26 + 10 * i;
        const cell = Math.floor(th / TAU * n);
        const on = step(0.35, hash12(cell, i + 4)) * step(Math.abs(lr - rr), 0.045) * step(0.15, fract(th / TAU * n));
        mark = Math.max(mark, on);
      }
      const hole = smoothstep(0.06, 0.1, lr);
      const L = LABELS[lab < 0.5 ? 0 : lab < 1.5 ? 1 : lab < 2.5 ? 2 : lab < 3.5 ? 3 : 4];
      const lr0 = L[0], lg0 = L[1], lb0 = L[2];
      v = (0.85 - 0.45 * mark) * hole * (0.6 + 0.6 * (lr0 * 0.299 + lg0 * 0.587 + lb0 * 0.114));
      cr = lr0 + (0.15 - lr0) * 0.5 * mark; cg = lg0 + (0.15 - lg0) * 0.5 * mark; cb = lb0 + (0.15 - lb0) * 0.5 * mark;
      v *= 1 - 0.6 * step(Math.abs(lr - 0.93), 0.02);
    }
  } else if (r < Rd * 1.07) {
    v = 0.16 + 0.12 * Math.pow(Math.abs(Math.cos(ph - La)), 8);
    cr = 0.75; cg = 0.76; cb = 0.8;
  }
  if (armOn > 0) {
    const pvx = Rd, pvy = Rd * 0.62;
    const La2 = 1.1 * Rd, D = Math.hypot(pvx, pvy);
    const fu = fract(u);
    const pr = fu < 0.9 ? fu / 0.9 : 1 - (fu - 0.9) / 0.1;
    const rho = (0.94 + (0.36 - 0.94) * pr) * Rd;
    const aa = Math.atan2(-pvy, -pvx) + Math.acos(Math.min(1, Math.max(-1, (D * D + La2 * La2 - rho * rho) / (2 * D * La2))));
    const ca = Math.cos(aa), sa = Math.sin(aa);
    const ex = pvx + La2 * ca, ey = pvy + La2 * sa;
    const hx = ex + 0.07 * Math.cos(aa + 0.55), hy = ey + 0.07 * Math.sin(aa + 0.55);
    const w = PX * 0.45;
    let da = Math.min(sdSeg(qx, qy, pvx, pvy, ex, ey), sdSeg(qx, qy, ex, ey, hx, hy) - 0.3 * PX);
    da = Math.min(da, sdSeg(qx, qy, pvx, pvy, pvx - 0.09 * ca, pvy - 0.09 * sa) - 0.8 * PX);
    da = Math.min(da, Math.abs(Math.hypot(qx - pvx, qy - pvy) - 0.045));
    const arm = armOn * (1 - smoothstep(w, w + PX, da));
    const sh = armOn * 0.55 * (1 - smoothstep(w, w + 2.5 * PX, sdSeg(qx, qy, pvx + 0.012, pvy - 0.015, ex + 0.012, ey - 0.015)));
    v = v * (1 - 0.6 * sh);
    v = v + (0.85 - v) * arm;
    cr += (0.85 - cr) * arm; cg += (0.88 - cg) * arm; cb += (0.93 - cb) * arm;
  }
  C[0] = cr; C[1] = cg; C[2] = cb;
  const Y = (cr * 0.299 + cg * 0.587 + cb * 0.114) / Math.max(cr, cg, cb, 1e-3);
  C[3] = Math.min(1, Math.max(0, v * (0.7 + 0.3 * Y)));
}

/** CPU twin of FC_vinilo, line by line. */
export const impl: AnalyticImpl = {
  glsl: VINILO_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
