import type { AnalyticImpl, Palette } from '../types';
import { TAU, fbm3, fract, smoothstep } from '../../engine/basic/core';
import { ANILLO_HUMO_GLSL } from './anillo_humo';

/** CPU twin of FC_anillo_humo, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.05, 0.05, 0.08, 0.35, 0.3, 0.5, 0.8, 0.6, 0.7, 0.95, 0.92, 0.9, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;
// the palette's brightest luminance (prep)
let hi = 1;

/** The palette as a gradient (ah_grad), into out[0..2]. */
export function grad(g: number, out: Float64Array) {
  const N = Math.max(pal.n, 1);
  const x = Math.min(1, Math.max(0, g)) * (N - 1);
  const i = Math.floor(x), f = x - i, j = Math.min(i + 1, N - 1);
  for (let c = 0; c < 3; c++) out[c] = pal.rgb[i * 3 + c] + (pal.rgb[j * 3 + c] - pal.rgb[i * 3 + c]) * f;
}

/** The flow noise at direction (dx, dy) and radius r, phase ph of the cycle (ah_flow). */
export function flow(dx: number, dy: number, r: number, ph: number, det: number, L: number, o: number, rf = 3): number {
  const p1 = fract(ph), p2 = fract(ph + 0.5);
  const a = fbm3(dx * det + o, dy * det, rf * (r - p1 * L));
  const b = fbm3(dx * det + o + 5.3, dy * det, rf * (r - p2 * L));
  const wa = 1 - Math.abs(2 * p1 - 1);
  return b + (a - b) * wa;
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const P = k[5], ph = fract(t / P);
  const r = Math.hypot(x, y);
  const a = TAU * k[8] * ph, ca = Math.cos(a), sa = Math.sin(a);
  let dx = 1, dy = 0;
  // rot2(p / r, a) = (c·x + s·y, −s·x + c·y)
  if (r > 1e-5) { const ux = x / r, uy = y / r; dx = ca * ux + sa * uy; dy = -sa * ux + ca * uy; }
  const L = 0.15 + 0.5 * k[9];
  const n = flow(dx, dy, r, ph, 1.3 * k[3], L, 0, 3);
  const n2 = flow(dx, dy, r, ph, 3.1 * k[3], L, 11, 7);
  const R0 = k[0], w = k[1];
  const dr = r - R0 - k[2] * 0.16 * (n - 0.5) * 2;
  const we = w * (0.55 + 0.9 * n2);
  const ring = Math.exp((-dr * dr) / (we * we)) * (0.55 + 0.6 * n2);
  const wisp = k[4] * smoothstep(0, 0.03, dr) * Math.exp(-dr / (0.05 + 0.15 * k[4])) * smoothstep(0.45, 0.75, n2);
  const core = k[6] * 0.35 * Math.exp(-r / (0.35 * R0)) * (0.6 + 0.4 * n);
  const dens = smoothstep(0.05, 1, ring + wisp + core);
  grad(0.5 + (r - R0) / (0.05 + 0.5 * k[7]), C);
  const gl = C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114;
  const s = 0.35 + 0.65 * smoothstep(0, 0.6, dens);
  C[0] *= s; C[1] *= s; C[2] *= s;
  C[3] = dens * (0.72 + (0.28 * gl) / Math.max(hi, 0.05));
}

export const impl: AnalyticImpl = {
  glsl: ANILLO_HUMO_GLSL,
  prep: (_t, _k, p) => {
    pal = p && p.n ? p : DEFAULT; lx = NaN;
    hi = 0;
    for (let i = 0; i < pal.n; i++) hi = Math.max(hi, pal.rgb[i * 3] * 0.299 + pal.rgb[i * 3 + 1] * 0.587 + pal.rgb[i * 3 + 2] * 0.114);
  },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
