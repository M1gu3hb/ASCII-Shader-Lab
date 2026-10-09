import type { AnalyticImpl } from '../types';
import { PI, TAU, sat, smoothstep } from '../../engine/basic/core';
import { ORBITALES_GLSL } from './orbitales';

/** CPU twin of F_orbitales, line by line (same steps, bisections and normal). */
const STEPS = 64;

/** The states of the «Estado» choices, in order: [n, l, harmonic]. */
export const STATES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [2, 0, 0], [2, 1, 1], [2, 1, 2], [3, 0, 0], [3, 1, 1], [3, 2, 3], [3, 2, 4], [3, 2, 5],
  [4, 0, 0], [4, 1, 1], [4, 2, 3], [4, 3, 6], [4, 3, 7], [4, 3, 8],
];

const fact = (n: number) => { let f = 1; for (let i = 2; i <= 7; i++) { if (i > n) break; f *= i; } return f; };
/** Normalisation of R_nl: sqrt((2/n)³ (n−l−1)! / (2n (n+l)!)). */
export const radialNorm = (n: number, l: number) => Math.sqrt(8 / (n * n * n) * fact(n - l - 1) / (2 * n * fact(n + l)));

/** R_nl(r), r in Bohr radii, from the associated Laguerre polynomial L^(2l+1)_(n−l−1)(2r/n). */
export function radial(n: number, l: number, r: number, N = radialNorm(n, l)): number {
  const rho = 2 * r / n, a = 2 * l + 1, k = n - l - 1;
  let L0 = 1, L1 = 1 + a - rho;
  for (let j = 1; j < 3; j++) {
    if (j >= k) break;
    const L2 = ((2 * j + 1 + a - rho) * L1 - (j + a) * L0) / (j + 1);
    L0 = L1; L1 = L2;
  }
  const Lk = k < 0.5 ? 1 : L1;
  let pw = 1;
  for (let j = 0; j < 3; j++) if (j < l) pw *= rho;
  return N * pw * Math.exp(-0.5 * rho) * Lk;
}

/** Real spherical harmonic number h (see STATES) at the unit vector (x, y, z). */
export function harmonic(h: number, x: number, y: number, z: number): number {
  if (h < 0.5) return 0.28209479;
  if (h < 1.5) return 0.48860251 * z;
  if (h < 2.5) return 0.48860251 * x;
  if (h < 3.5) return 0.31539157 * (3 * z * z - 1);
  if (h < 4.5) return 1.09254843 * x * y;
  if (h < 5.5) return 1.09254843 * x * z;
  if (h < 6.5) return 0.37317633 * z * (5 * z * z - 3);
  if (h < 7.5) return 2.89061144 * x * y * z;
  return 0.59004359 * x * (x * x - 3 * y * y);
}

function psi(x: number, y: number, z: number, s: readonly [number, number, number], N: number): number {
  const r = Math.sqrt(x * x + y * y + z * z);
  let ux = 0, uy = 0, uz = 1;
  if (r > 1e-6) { ux = x / r; uy = y / r; uz = z / r; }
  return radial(s[0], s[1], r, N) * harmonic(s[2], ux, uy, uz);
}

// per frame (prep)
let K: Float32Array = new Float32Array(8);
let sA = STATES[2], sB = STATES[6], NA = 1, NB = 1, cA = 1, cB = 0, S = 10, cph = 1, lev = 0.3;
let ro = [0, 0, 3], fw = [0, 0, -1], rt = [1, 0, 0], up = [0, 1, 0], ld = [0, 0, 1];
let RE = 0;

/** Density per unit of the drawing's volume at (x, y, z) (view units); Re Ψ goes to RE. */
function rho(x: number, y: number, z: number): number {
  const a = psi(x * S, y * S, z * S, sA, NA), b = psi(x * S, y * S, z * S, sB, NB);
  RE = cA * a + cB * b * cph;
  return S * S * S * (cA * cA * a * a + cB * cB * b * b + 2 * cA * cB * a * b * cph);
}

const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export const impl: AnalyticImpl = {
  glsl: ORBITALES_GLSL,
  prep(t, k) {
    K = k;
    sA = STATES[Math.max(0, Math.min(14, Math.floor(k[0] + 0.5)))];
    sB = STATES[Math.max(0, Math.min(14, Math.floor(k[1] + 0.5)))];
    NA = radialNorm(sA[0], sA[1]); NB = radialNorm(sB[0], sB[1]);
    const al = k[2] * PI * 0.5, nm = Math.max(sA[0], sB[0]);
    const ph = (0.5 / (sA[0] * sA[0]) - 0.5 / (sB[0] * sB[0])) * t * k[3] * 4;
    cA = Math.cos(al); cB = Math.sin(al); S = 2 * nm * nm + 2; cph = Math.cos(ph);
    const a = t * k[6] * TAU / 60, e = 0.35;
    ro = [2.8 * Math.cos(a) * Math.cos(e), 2.8 * Math.sin(a) * Math.cos(e), 2.8 * Math.sin(e)];
    fw = [-ro[0] / 2.8, -ro[1] / 2.8, -ro[2] / 2.8];
    // rt = normalize(cross(fw, z)), up = cross(rt, fw)
    rt = norm([fw[1], -fw[0], 0]);
    up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    ld = norm([-fw[0] + 0.6 * up[0] - 0.5 * rt[0], -fw[1] + 0.6 * up[1] - 0.5 * rt[1], -fw[2] + 0.6 * up[2] - 0.5 * rt[2]]);
    lev = 0.02 * Math.pow(200, k[5]);
  },
  cpu(px, py) {
    let dx = px * rt[0] + py * up[0] + 1.25 * fw[0], dy = px * rt[1] + py * up[1] + 1.25 * fw[1], dz = px * rt[2] + py * up[2] + 1.25 * fw[2];
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const b = ro[0] * dx + ro[1] * dy + ro[2] * dz, disc = b * b - (ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2]) + 1;
    if (disc <= 0) return 0;
    const sq = Math.sqrt(disc), t0 = -b - sq, t1 = -b + sq, dt = (t1 - t0) / STEPS;
    if (K[4] < 0.5) {
      let I = 0;
      for (let i = 0; i < STEPS; i++) {
        const s = t0 + dt * (i + 0.5);
        const d = rho(ro[0] + dx * s, ro[1] + dy * s, ro[2] + dz * s);
        I += d * smoothstep(lev * 0.05, lev * 0.5, d) * dt;
      }
      return sat(1 - Math.exp(-I * K[7] * 0.8));
    }
    let tp = t0, tt = -1;
    for (let i = 0; i < STEPS; i++) {
      const ti = t0 + dt * (i + 0.5);
      if (rho(ro[0] + dx * ti, ro[1] + dy * ti, ro[2] + dz * ti) > lev) { tt = ti; break; }
      tp = ti;
    }
    if (tt < 0) return 0;
    for (let j = 0; j < 5; j++) {
      const tm = 0.5 * (tp + tt);
      if (rho(ro[0] + dx * tm, ro[1] + dy * tm, ro[2] + dz * tm) > lev) tt = tm; else tp = tm;
    }
    const x = ro[0] + dx * tt, y = ro[1] + dy * tt, z = ro[2] + dz * tt, h = 0.01;
    const gx = rho(x + h, y, z) - rho(x - h, y, z), gy = rho(x, y + h, z) - rho(x, y - h, z), gz = rho(x, y, z + h) - rho(x, y, z - h);
    const gl = Math.max(Math.hypot(gx, gy, gz), 1e-9);
    const dif = Math.max(-(gx * ld[0] + gy * ld[1] + gz * ld[2]) / gl, 0);
    let sh = 0.18 + 0.82 * dif;
    if (K[4] > 1.5) { rho(x, y, z); if (RE < 0) sh *= 0.42; }
    return sat(sh * (0.45 + 0.55 * K[7]));
  },
};
