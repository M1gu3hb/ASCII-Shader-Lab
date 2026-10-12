import type { AnalyticImpl } from '../types';
import { TAU, fbm, fbm3, gnoise, hash11, hash12, mod, sdSeg, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { CALOR_GLSL } from './calor';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const MAPS = [
  [[0.3, 0.02, 0.02], [0.85, 0.1, 0.02], [1, 0.45, 0.04], [1, 0.82, 0.32], [1, 1, 0.92]],
  [[0.02, 0.02, 0.25], [0.3, 0.02, 0.65], [0.85, 0.05, 0.5], [1, 0.45, 0.02], [1, 0.95, 0.55]],
  [[0.18, 0.01, 0.01], [0.55, 0.03, 0.02], [0.9, 0.2, 0.03], [1, 0.5, 0.08], [1, 0.78, 0.4]],
];
/** The thermal map: temperature 0..1 to rgb, into out (0 black body, 1 thermal camera, 2 ember). */
export function calorMap(T: number, m: number, out: Float64Array) {
  T = Math.min(1, Math.max(0, T));
  const M = MAPS[m < 0.5 ? 0 : m < 1.5 ? 1 : 2];
  const w1 = smoothstep(0, 0.25, T), w2 = smoothstep(0.25, 0.5, T), w3 = smoothstep(0.5, 0.78, T), w4 = smoothstep(0.78, 1, T);
  for (let i = 0; i < 3; i++) {
    let c = M[0][i] + (M[1][i] - M[0][i]) * w1;
    c += (M[2][i] - c) * w2;
    c += (M[3][i] - c) * w3;
    out[i] = c + (M[4][i] - c) * w4;
  }
  return out;
}

/** Where hot centre i of n is at layer time t (tests). */
export function calorSource(i: number, n: number, t: number): [number, number] {
  let cx: number, cy: number;
  if (n < 1.5) { cx = 0; cy = 0; }
  else if (n < 2.5) { cx = i < 0.5 ? -0.38 : 0.38; cy = -0.02; }
  else if (i < 0.5) { cx = -0.45; cy = -0.12; }
  else if (i < 1.5) { cx = 0.45; cy = -0.12; }
  else { cx = 0; cy = 0.2; }
  return [cx + 0.03 * Math.sin(t * 0.21 + i * 2.1), cy + 0.03 * Math.cos(t * 0.17 + i * 1.3)];
}

/** What the last cell computed was made of (tests): the field's temperature and the brightest ember. */
export const CALOR = { T: 0, ember: 0 };

let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const ns = Math.min(3, Math.max(1, Math.floor(k[0] + 0.5))), heat = k[1], R = 0.08 + (0.3 - 0.08) * k[2], turb = k[3];
  const shim = k[4], flow = k[5], fli = k[6], rise = k[7];
  const ne = Math.min(32, Math.max(0, Math.floor(k[8] + 0.5))), es = k[9], life = k[10], map = Math.floor(k[11] + 0.5), amb = k[12];
  const e = 0.02;
  const bx = px * 2.2, by = py * 2.2 - t * 0.25 * (0.3 + flow);
  const n0 = fbm(bx + e, by), n1 = fbm(bx - e, by), n2 = fbm(bx, by + e), n3 = fbm(bx, by - e);
  const qx = px + shim * 0.03 * (n2 - n3) / (2 * e), qy = py + shim * 0.03 * (n1 - n0) / (2 * e);
  const [c0x, c0y] = calorSource(0, ns, t);
  const d0x = qx - c0x, d0y = qy - c0y;
  const r0 = Math.hypot(d0x, d0y), ir0 = 1 / Math.max(r0, 1e-4);
  const tg = fbm3(d0x * ir0 * 2.4, d0y * ir0 * 2.4, Math.log(r0 + 0.02) * 1.8 - t * (0.2 + 1.3 * flow));
  const reach = R * Math.max(1 + turb * 3 * (tg - 0.45), 0.25);
  let T = 0;
  for (let i = 0; i < ns; i++) {
    const [cx, cy] = calorSource(i, ns, t);
    const dx = qx - cx;
    let dy = qy - cy;
    dy *= dy > 0 ? 1 - 0.55 * rise : 1 + 0.25 * rise;
    const fl = 1 + fli * 0.35 * (gnoise(t * 3.1, i * 7.7) - 0.5);
    T += Math.exp(-Math.pow(Math.hypot(dx, dy) / Math.max(reach, 0.02), 1.3)) * fl;
  }
  T = heat * T + amb * 0.22 * (0.55 + 0.9 * fbm(qx * 1.6 + t * 0.04, qy * 1.6 - t * 0.06));
  let eb = 0, eT = 0;
  for (let kk = 0; kk < ne; kk++) {
    const L = (1.6 + (4.2 - 1.6) * hash11(kk * 3.31 + 9.2)) * (0.4 + 1.2 * life);
    const tt = t + hash11(kk * 7.13 + 1.7) * L;
    const cy = Math.floor(tt / L), a = tt - cy * L;
    const an = TAU * hash12(kk, cy);
    const sp = (0.06 + 0.2 * hash12(cy, kk + 3.1)) * (0.4 + 1.2 * es);
    const dx = Math.cos(an), dy = Math.sin(an);
    const [sx, sy] = calorSource(mod(kk, ns), ns, t);
    const vx = dx * sp, vy = dy * sp + rise * 0.16 * a;
    const ex = sx + dx * (0.02 + sp * a) + 0.012 * Math.sin(a * 5 + kk);
    const ey = sy + dy * (0.02 + sp * a) + rise * 0.08 * a * a + 0.012 * Math.cos(a * 4.3 + kk);
    const dd = sdSeg(px, py, ex - vx * 0.14, ey - vy * 0.14, ex, ey);
    const lf = 1 - a / L;
    const bv = Math.exp(-dd * dd / (PX * PX * 0.7)) * (0.35 + 0.65 * lf);
    if (bv > eb) { eb = bv; eT = 0.35 + 0.65 * lf; }
  }
  const tv = Math.min(1, Math.max(0, T));
  CALOR.T = tv; CALOR.ember = eb;
  calorMap(eb > tv ? eT : tv, map, C);
  const v = Math.max(tv, eb);
  const Y = (C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114) / Math.max(C[0], C[1], C[2], 1e-3);
  C[3] = Math.min(1, Math.max(0, v * (0.75 + 0.25 * Y)));
}

/** CPU twin of FC_calor_radiante, line by line. */
export const impl: AnalyticImpl = {
  glsl: CALOR_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
