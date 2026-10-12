import type { AnalyticImpl, Palette } from '../types';
import { TAU, noise3 } from '../../engine/basic/core';
import { JADE_RUIDO_GLSL } from './jade_ruido';

/** CPU twin of FC_jade_ruido, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.02, 0.04, 0.03, 0.1, 0.35, 0.25, 0.4, 0.8, 0.6, 0.9, 1, 0.95, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

function ramp(x: number, ch: number): number {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), w = f - i;
  return pal.rgb[i * 3 + ch] * (1 - w) + pal.rgb[j * 3 + ch] * w;
}

const PALS = [
  { a: [0.22, 0.5, 0.38], b: [0.18, 0.32, 0.24], c: [1, 1, 1], d: [0, 0.1, 0.25] },
  { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] },
  { a: [0.55, 0.25, 0.12], b: [0.45, 0.3, 0.2], c: [1, 0.8, 0.6], d: [0, 0.1, 0.2] },
  { a: [0.2, 0.42, 0.6], b: [0.2, 0.3, 0.35], c: [1, 1, 0.8], d: [0.5, 0.35, 0.2] },
];
/** jr_pal: a cosine palette (or the piece's palette read back and forth) at x, channel ch. */
export function jadePal(m: number, x: number, ch: number): number {
  if (m > 3.5) return ramp(0.5 + 0.5 * Math.cos(TAU * x), ch);
  const P = PALS[m > 0.5 && m < 1.5 ? 1 : m > 1.5 && m < 2.5 ? 2 : m > 2.5 && m < 3.5 ? 3 : 0];
  return Math.min(1, Math.max(0, P.a[ch] + P.b[ch] * Math.cos(TAU * (P.c[ch] * x + P.d[ch]))));
}

/** jr_disp: the displacement at q, twisted about y, two noise octaves travelling round circles (periodic in θ). */
export function jadeDisp(qx: number, qy: number, qz: number, th: number, fq: number, tw: number, twf: number): number {
  const a = tw * Math.sin(qy * twf + th);
  const ca = Math.cos(a), sa = Math.sin(a);
  const x = ca * qx - sa * qz, z = sa * qx + ca * qz;
  const sx = x * fq, sy = qy * fq, sz = z * fq;
  const c2 = Math.cos(2 * th + 1), s2 = Math.sin(2 * th + 1);
  const n = noise3(sx + 1.6 * Math.cos(th), sy + 1.6 * Math.sin(th), sz) + 0.5 * noise3(sx * 2.1 + 7.7, sy * 2.1 + 1.3 * c2 + 7.7, sz * 2.1 + 1.3 * s2 + 7.7);
  return (n / 1.5 - 0.5) * 2.2;
}

interface J { cs: number; ss: number; R: number; amp: number; th: number; fq: number; tw: number; twf: number }
function sdf(x: number, y: number, z: number, j: J): number {
  const qx = j.cs * x + j.ss * z, qz = -j.ss * x + j.cs * z;
  return (Math.sqrt(qx * qx + y * y + qz * qz) - j.R - j.amp * jadeDisp(qx, y, qz, j.th, j.fq, j.tw, j.twf)) * 0.6;
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);
const J0: J = { cs: 1, ss: 0, R: 0.3, amp: 0, th: 0, fq: 1, tw: 0, twf: 0 };

/** Where the ray of (px, py) meets the figure (camera distance along it), or −1. Exported for the tests. */
export function jadeHit(px: number, py: number, t: number, k: Float32Array): number {
  const R0 = k[0], amp = k[1], fq = k[2], tw = k[3];
  const twf = k[4], br = k[5], P = k[6];
  const spin = Math.floor(k[10] + 0.5);
  const th = (TAU * t) / P;
  const R = R0 * (1 + br * Math.sin(2 * th));
  J0.cs = Math.cos(spin * th + 0.4); J0.ss = Math.sin(spin * th + 0.4); J0.R = R; J0.amp = amp; J0.th = th; J0.fq = fq; J0.tw = tw; J0.twf = twf;
  const rl = Math.hypot(px, py, 2.4), rdx = px / rl, rdy = py / rl, rdz = -2.4 / rl;
  const rb = R + amp * 1.15 + 0.02;
  const bq = 2.6 * rdz, disc = bq * bq - (2.6 * 2.6 - rb * rb);
  if (disc < 0) return -1;
  let tt = -bq - Math.sqrt(disc);
  const tf = -bq + Math.sqrt(disc);
  for (let i = 0; i < 44; i++) {
    const d = sdf(rdx * tt, rdy * tt, 2.6 + rdz * tt, J0);
    if (d < 0.0012) return tt;
    tt += d;
    if (tt > tf) break;
  }
  return -1;
}

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt) return;
  lx = px; ly = py; lt = t;
  C[0] = C[1] = C[2] = C[3] = 0;
  const tt = jadeHit(px, py, t, k);
  if (tt < 0) return;
  const pal4 = Math.floor(k[7] + 0.5), shf = k[8], hs = k[9], sh = k[11];
  const rl = Math.hypot(px, py, 2.4), rdx = px / rl, rdy = py / rl, rdz = -2.4 / rl;
  const x = rdx * tt, y = rdy * tt, z = 2.6 + rdz * tt;
  const e = 0.0025;
  const a = sdf(x + e, y - e, z - e, J0), b = sdf(x - e, y - e, z + e, J0), c = sdf(x - e, y + e, z - e, J0), d = sdf(x + e, y + e, z + e, J0);
  let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
  const nn = Math.hypot(nx, ny, nz);
  nx /= nn; ny /= nn; nz /= nn;
  const qx = J0.cs * x + J0.ss * z, qz = -J0.ss * x + J0.cs * z;
  const dsp = jadeDisp(qx, y, qz, J0.th, J0.fq, J0.tw, J0.twf);
  const ll = Math.hypot(-0.5, 0.62, 0.62), Lx = -0.5 / ll, Ly = 0.62 / ll, Lz = 0.62 / ll;
  const Vx = -rdx, Vy = -rdy, Vz = -rdz;
  const nl = nx * Lx + ny * Ly + nz * Lz, diff = Math.max((nl + 0.35) / 1.35, 0);
  const rx = 2 * nl * nx - Lx, ry = 2 * nl * ny - Ly, rz = 2 * nl * nz - Lz;
  const spec = sh * Math.pow(Math.max(rx * Vx + ry * Vy + rz * Vz, 0), 6 + 50 * sh);
  const fres = Math.pow(1 - Math.max(nx * Vx + ny * Vy + nz * Vz, 0), 3);
  const b0 = jadePal(pal4, shf + hs * dsp, 0), b1 = jadePal(pal4, shf + hs * dsp, 1), b2 = jadePal(pal4, shf + hs * dsp, 2);
  const k2 = 0.18 + 0.82 * diff;
  C[0] = Math.min(1, Math.max(0, b0 * k2 + spec + fres * (0.15 + 0.4 * sh) * jadePal(pal4, shf + 0.5, 0)));
  C[1] = Math.min(1, Math.max(0, b1 * k2 + spec + fres * (0.15 + 0.4 * sh) * jadePal(pal4, shf + 0.5, 1)));
  C[2] = Math.min(1, Math.max(0, b2 * k2 + spec + fres * (0.15 + 0.4 * sh) * jadePal(pal4, shf + 0.5, 2)));
  const lum = 0.1 + 0.62 * diff * (0.55 + 0.45 * (0.299 * b0 + 0.587 * b1 + 0.114 * b2)) + 0.55 * spec + (0.12 + 0.36 * sh) * fres;
  C[3] = Math.min(1, Math.max(0, lum));
}

export const impl: AnalyticImpl = {
  glsl: JADE_RUIDO_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
