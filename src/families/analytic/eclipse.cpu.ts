import type { AnalyticImpl } from '../types';
import { PI, TAU, V2, fbm, fbm3, fract, gnoise, hash22, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { ECLIPSE_GLSL } from './eclipse';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** The geometry at layer time t (tests): moon radius, sun radius, the moon centre's offset and its direction. */
export function eclipseGeometry(k: Float32Array, t: number) {
  const Rm = 0.12 + (0.24 - 0.12) * k[0], Rs = Rm * 0.985;
  const thd = k[4] * PI + 2.2;
  const del = Rm * 0.065 * k[7] * (0.5 - 0.5 * Math.cos(TAU * t / 16));
  return { Rm, Rs, del, thd, mcx: -del * Math.cos(thd), mcy: -del * Math.sin(thd) };
}

let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const Rm = 0.12 + (0.24 - 0.12) * k[0], Rs = Rm * 0.985;
  const ext = 0.35 + (1.4 - 0.35) * k[1], nst = 2 + (9 - 2) * k[2], asym = k[3];
  const axis = k[4] * PI, wind = k[5], dia = k[6], con = k[7];
  const bead = k[8], prom = k[9], stars = k[10], tint = k[11];
  const thd = axis + 2.2;
  const ddx = Math.cos(thd), ddy = Math.sin(thd);
  const del = Rm * 0.065 * con * (0.5 - 0.5 * Math.cos(TAU * t / 16));
  const mcx = -del * ddx, mcy = -del * ddy;
  const r = Math.hypot(px, py), phi = Math.atan2(py, px);
  const ir = 1 / Math.max(r, 1e-5), dx = px * ir, dy = py * ir;
  const pmx = px - mcx, pmy = py - mcy;
  const rm = Math.hypot(pmx, pmy), irm = 1 / Math.max(rm, 1e-5);
  const limb = Rm * (1 - 0.045 * bead * smoothstep(0.4, 0.8, gnoise(pmx * irm * 11 + 3.1, pmy * irm * 11 + 3.1)));
  const outM = smoothstep(limb - 0.35 * PX, limb + 0.35 * PX, rm);
  const phot = outM * (1 - smoothstep(Rs - 0.3 * PX, Rs + 0.3 * PX, r));
  const ex = Math.min(1, Math.max(0, (del - (Rm - Rs)) / (Rm * 0.03)));
  const qx = px - Rs * ddx, qy = py - Rs * ddy;
  const dq = Math.hypot(qx, qy);
  const dg = dia * ex * (Math.exp(-dq * dq / 0.0006) + 0.45 * Math.exp(-dq / 0.05)
    + 0.55 * Math.exp(-dq * 5) * (Math.exp(-Math.abs(qy) / (0.4 * PX)) + Math.exp(-Math.abs(qx) / (0.4 * PX))));
  const rho = Math.max(r - Rs, 0) / Rs;
  const E = 1 + 0.8 * asym * Math.cos(2 * (phi - axis));
  const st = fbm3(dx * nst, dy * nst, Math.log(Math.max(r, 1e-3) / Rs) * 1.6 - t * wind * 0.6);
  const pl = gnoise(dx * nst * 5, dy * nst * 5 + t * 0.02);
  const streak = st + (pl - st) * 0.3;
  const I = 2 * Math.pow(1 + rho / (0.3 * ext * E), -2.2);
  const cor = outM * I * (0.15 + 1.7 * smoothstep(0.3, 0.75, streak)) * step(Rs, r);
  let H = 0;
  for (let j = 0; j < 4; j++) {
    const a = axis + j * 1.7 + 0.9 + 0.4 * Math.sin(j * 3.1);
    const da = Math.atan2(Math.sin(phi - a), Math.cos(phi - a));
    const wj = 0.1 + 0.09 * fract(j * 0.618);
    H = Math.max(H, Math.exp(-da * da / (wj * wj)) * (0.5 + 0.7 * fbm(dx * 7 + j * 3.3, dy * 7 + t * 0.12)));
  }
  const hp = prom * Rm * 0.45 * H;
  const pv = outM * step(Rs, r) * ((1 - smoothstep(hp * 0.5, hp + PX * 0.3, r - Rs)) * step(0.002, hp) + (0.25 + 0.6 * prom) * Math.exp(-(r - Rs) / 0.006));
  const g = 0.055;
  const gcx = Math.floor(px / g), gcy = Math.floor(py / g);
  hash22(gcx + 19, gcy + 19);
  const shx = V2[0], shy = V2[1];
  const spx = (gcx + 0.2 + 0.6 * shx) * g, spy = (gcy + 0.2 + 0.6 * shy) * g;
  const sd2 = (px - spx) * (px - spx) + (py - spy) * (py - spy);
  const sv = stars * step(0.78, shx) * Math.exp(-sd2 / (PX * PX * 0.2)) * (0.55 + 0.45 * Math.sin(t * (1 + 2 * shy) + shx * 40)) * (1 - smoothstep(0.02, 0.2, cor)) * outM;
  const lum = cor + pv + phot + dg + sv;
  const m = Math.min(0.6, Math.max(0, 0.6 - 1.2 * rho));
  const cr = 0.55 + (1 - 0.55) * tint, cg = 0.72 + (0.78 - 0.72) * tint, cb = 1 + (0.45 - 1) * tint;
  const ccr = cr + (1 - cr) * m, ccg = cg + (0.98 - cg) * m, ccb = cb + (0.94 - cb) * m;
  const pd = phot + dg, il = 1 / Math.max(lum, 1e-4);
  if (lum < 1e-4) { C[0] = 0.06; C[1] = 0.08; C[2] = 0.2; }
  else {
    C[0] = (cor * ccr + pv * 1 + pd * 1 + sv * 0.85) * il;
    C[1] = (cor * ccg + pv * 0.3 + pd * 0.97 + sv * 0.9) * il;
    C[2] = (cor * ccb + pv * 0.45 + pd * 0.9 + sv * 1) * il;
  }
  const Y = (C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114) / Math.max(C[0], C[1], C[2], 1e-3);
  C[3] = Math.min(1, Math.max(0, lum * (0.7 + 0.3 * Y)));
}

/** CPU twin of FC_eclipse_total, line by line. */
export const impl: AnalyticImpl = {
  glsl: ECLIPSE_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
