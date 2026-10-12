import type { AnalyticImpl } from '../types';
import { PI, TAU, fract, hash12, mod, sdSeg, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { NEON_GLSL } from './neon';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const hue = (h: number, c: number) => 0.5 + 0.5 * Math.cos(TAU * (h - c));

function arc(qx: number, qy: number, cx: number, cy: number, R: number, a0: number, a1: number) {
  const dx = qx - cx, dy = qy - cy;
  const a = Math.atan2(dy, dx);
  if (a >= a0 && a <= a1) return Math.abs(Math.hypot(dx, dy) - R);
  return Math.min(Math.hypot(dx - R * Math.cos(a0), dy - R * Math.sin(a0)), Math.hypot(dx - R * Math.cos(a1), dy - R * Math.sin(a1)));
}
function heart(qx: number, qy: number, cx: number, cy: number, s: number) {
  let d = 1e3;
  let ax = cx, ay = cy + s * (5 / 17);
  for (let i = 1; i <= 28; i++) {
    const u = (i / 28) * TAU;
    const su = Math.sin(u);
    const bx = cx + s * (16 * su * su * su) / 17;
    const by = cy + s * (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) / 17;
    d = Math.min(d, sdSeg(qx, qy, ax, ay, bx, by));
    ax = bx; ay = by;
  }
  return d;
}
function star(qx: number, qy: number, cx: number, cy: number, R: number) {
  let d = 1e3;
  let ax = cx, ay = cy + R;
  for (let i = 1; i <= 10; i++) {
    const an = PI * 0.5 + i * PI / 5;
    const rr = mod(i, 2) > 0.5 ? 0.45 * R : R;
    const bx = cx + rr * Math.cos(an), by = cy + rr * Math.sin(an);
    d = Math.min(d, sdSeg(qx, qy, ax, ay, bx, by));
    ax = bx; ay = by;
  }
  return d;
}

/** The nearest tube of the sign at q (sign units): its distance (the return) and its group (SIGN.g). */
export const SIGN = { g: 0 };
let best = 1e3;
const take = (d: number, g: number) => { if (d < best) { best = d; SIGN.g = g; } };
function word(qx: number, qy: number, ox: number, oy: number, h: number, g0: number) {
  const Lx = ox, Ly = oy, Ux = ox + 0.95 * h, Uy = oy, Zx = ox + 1.95 * h, Zy = oy;
  take(Math.min(sdSeg(qx, qy, Lx, Ly + h, Lx, Ly), sdSeg(qx, qy, Lx, Ly, Lx + 0.6 * h, Ly)), g0);
  take(Math.min(Math.min(sdSeg(qx, qy, Ux, Uy + h, Ux, Uy + 0.35 * h), sdSeg(qx, qy, Ux + 0.6 * h, Uy + 0.35 * h, Ux + 0.6 * h, Uy + h)),
    arc(qx, qy, Ux + 0.3 * h, Uy + 0.35 * h, 0.3 * h, -PI, 0)), g0 + 1);
  take(Math.min(Math.min(sdSeg(qx, qy, Zx, Zy + h, Zx + 0.62 * h, Zy + h), sdSeg(qx, qy, Zx + 0.62 * h, Zy + h, Zx, Zy)), sdSeg(qx, qy, Zx, Zy, Zx + 0.62 * h, Zy)), g0 + 2);
}
export function neonSign(qx: number, qy: number, shape: number): number {
  best = 1e3;
  SIGN.g = 0;
  if (shape < 0.5) take(heart(qx, qy, 0, 0.03, 0.3), 0);
  else if (shape < 1.5) take(star(qx, qy, 0, -0.01, 0.34), 0);
  else if (shape < 2.5) { for (let i = 0; i < 3; i++) take(arc(qx, qy, 0, -0.2, 0.2 + 0.1 * i, 0.12, PI - 0.12), i); }
  else if (shape < 3.5) word(qx, qy, -0.39, -0.15, 0.3, 0);
  else {
    word(qx, qy, -0.27, -0.2, 0.2, 0);
    take(arc(qx, qy, 0, -0.13, 0.4, 0.2, PI - 0.2), 3);
    take(arc(qx, qy, 0, -0.13, 0.47, 0.2, PI - 0.2), 4);
    take(heart(qx, qy, -0.5, -0.1, 0.1), 5);
    take(star(qx, qy, 0.5, -0.08, 0.1), 6);
  }
  return best;
}

/** The floor line under each shape (sign units): just under its lowest tube. */
export const neonBase = (shape: number) => shape < 0.5 ? -0.31 : shape < 1.5 ? -0.335 : shape < 2.5 ? -0.22 : shape < 3.5 ? -0.19 : -0.24;

/** How lit tube group g is at time τ of the cycle P (ignition with stutter, hum and dropouts, the faulty tube, the dark end). */
export function neonOn(g: number, tau: number, P: number, seq: number, fli: number, fault: number): number {
  const tg = P * (0.04 + seq * 0.07 * g);
  const x = tau - tg;
  if (x < 0 || tau > P * 0.88) return 0;
  let on = 1;
  if (x < 0.6) on = step(0.45, hash12(Math.floor(x * 18), g + 1)) * (0.6 + 0.4 * x / 0.6);
  const m = Math.floor(9 * P + 0.5);
  on *= 1 - fli * 0.12 * (0.5 + 0.5 * Math.sin(TAU * m * tau / P + g));
  on *= 1 - 0.75 * step(1 - fli * 0.06, hash12(Math.floor(tau * 15), g + 3));
  if (g > 0.5 && g < 1.5) on *= 1 - 0.9 * step(1 - fault * 0.45, hash12(Math.floor(tau * 11), 7));
  return on;
}

const DRIP = { g: 0 };
function drip(shape: number, j: number, out: Float64Array) {
  DRIP.g = 0;
  if (shape < 0.5) { out[0] = (j - 1) * 0.09; out[1] = -0.27 + 0.09 * Math.abs(j - 1); return; }
  if (shape < 1.5) { if (j < 0.5) { out[0] = -0.2; out[1] = -0.295; } else if (j < 1.5) { out[0] = 0.2; out[1] = -0.295; } else { out[0] = 0; out[1] = -0.163; } return; }
  if (shape < 2.5) { DRIP.g = j; const R = 0.2 + 0.1 * j; out[0] = 0.993 * R; out[1] = -0.2 + 0.1197 * R; return; }
  DRIP.g = j;
  if (shape < 3.5) { out[0] = j < 0.5 ? -0.21 : j < 1.5 ? -0.015 : 0.381; out[1] = -0.15; return; }
  out[0] = j < 0.5 ? -0.15 : j < 1.5 ? -0.02 : 0.244; out[1] = -0.2;
}
const SP = new Float64Array(2);

let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const shape = Math.floor(k[0] + 0.5), h1 = k[1], h2 = k[2];
  const S = 0.75 + (1.35 - 0.75) * k[12];
  const w = PX * (0.3 + 1.1 * k[3]) / S;
  const glo = k[4], fli = k[5], P = Math.max(k[6], 2), seq = k[7];
  const dripP = k[8], refl = k[9], wall = k[10], fault = k[11];
  const tau = mod(t, P);
  const d = neonSign(px / S, py / S, shape);
  const g = SIGN.g;
  const on = neonOn(g, tau, P, seq, fli, fault);
  const hh = mod(g, 2) < 0.5 ? h1 : h2;
  const hr = hue(hh, 0), hg = hue(hh, 0.333), hb = hue(hh, 0.667);
  const core = 1 - smoothstep(0.4 * w, w, d);
  const gw = (0.012 + 0.05 * glo) / S;
  const glow = Math.exp(-d / gw);
  let lum = on * (core + 0.7 * glow) + 0.14 * core * (1 - on);
  const off = 0.14 * core * (1 - on);
  let ar = on * (core * (hr + (1 - hr) * 0.55) + 0.7 * glow * hr) + off * 0.55;
  let ag = on * (core * (hg + (1 - hg) * 0.55) + 0.7 * glow * hg) + off * 0.6;
  let ab = on * (core * (hb + (1 - hb) * 0.55) + 0.7 * glow * hb) + off * 0.7;
  const spill = on * Math.exp(-d / ((0.045 + 0.07 * glo) / S));
  const row = Math.floor(py / 0.045);
  const fy = fract(py / 0.045), fx = fract(px / 0.09 + 0.5 * mod(row, 2));
  const brick = smoothstep(0.08, 0.22, Math.min(fy, 1 - fy)) * smoothstep(0.04, 0.11, Math.min(fx, 1 - fx));
  const wl = wall * 0.4 * spill * (0.1 + 0.9 * brick);
  ar += wl * hr * 0.8; ag += wl * hg * 0.8; ab += wl * hb * 0.8;
  lum += wl;
  const Pd = P / Math.max(Math.floor(P / 2.5), 1);
  for (let jj = 0; jj < 6; jj++) {
    const j = mod(jj, 3);
    drip(shape, j, SP);
    const gj = DRIP.g;
    const a = mod(tau + j * 0.37 * Pd + Math.floor(jj / 3) * 0.5 * Pd, Pd);
    const fall = 0.45 * a * a;
    const dx = SP[0] * S, dy = SP[1] * S - fall;
    const dd = sdSeg(px, py, dx, dy, dx, dy + 0.012 + Math.min(0.07, 0.12 * a));
    const dv = dripP * neonOn(gj, tau, P, seq, fli, fault) * (Math.exp(-dd * dd / (PX * PX * 0.5)) + 0.35 * Math.exp(-dd / 0.018)) * (1 - a / Pd);
    const hj = mod(gj, 2) < 0.5 ? h1 : h2;
    ar += dv * hue(hj, 0); ag += dv * hue(hj, 0.333); ab += dv * hue(hj, 0.667);
    lum += dv;
  }
  const yb = neonBase(shape) * S;
  if (py < yb && refl > 0) {
    const m2 = Math.floor(3 * P + 0.5);
    const prx = (px + 0.008 * Math.sin(py * 90 + TAU * m2 * tau / P)) / S, pry = (2 * yb - py) / S;
    const dr = neonSign(prx, pry, shape);
    const gr = SIGN.g;
    const onr = neonOn(gr, tau, P, seq, fli, fault);
    const rv = refl * 0.45 * onr * (1 - smoothstep(0.4 * w, w * 1.6, dr) + 0.5 * Math.exp(-dr / gw)) * Math.exp(-(yb - py) / 0.22);
    const hq = mod(gr, 2) < 0.5 ? h1 : h2;
    ar += rv * hue(hq, 0); ag += rv * hue(hq, 0.333); ab += rv * hue(hq, 0.667);
    lum += rv;
  }
  if (lum > 1e-4) { C[0] = ar / lum; C[1] = ag / lum; C[2] = ab / lum; } else { C[0] = C[1] = C[2] = 0.05; }
  const Y = (C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114) / Math.max(C[0], C[1], C[2], 1e-3);
  C[3] = Math.min(1, Math.max(0, lum * (0.65 + 0.35 * Y)));
}

/** CPU twin of FC_neon_tubos, line by line. */
export const impl: AnalyticImpl = {
  glsl: NEON_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
