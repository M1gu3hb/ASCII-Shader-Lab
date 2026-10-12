import type { AnalyticImpl, Palette } from '../types';
import { gnoise, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { METAL_FUNDIDO_GLSL } from './metal_fundido';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;

/** CPU twin of FC_metal_fundido, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.04, 0.03, 0.02, 0.4, 0.28, 0.12, 0.85, 0.66, 0.32, 1, 0.95, 0.82, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

function ramp(x: number, ch: number): number {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), w = f - i;
  return pal.rgb[i * 3 + ch] * (1 - w) + pal.rgb[j * 3 + ch] * w;
}

/** mf_fbm: three octaves of gnoise, the domain turned by mat2(1.6, 1.2, -1.2, 1.6) and shifted by 17.1. */
export function mfFbm(x: number, y: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 3; i++) {
    v += a * gnoise(x, y);
    const nx = 1.6 * x - 1.2 * y + 17.1;
    y = 1.2 * x + 1.6 * y + 17.1;
    x = nx;
    a *= 0.5;
  }
  return v / 0.875;
}

/** mf_h: the height at (x, y): three nested warps and the metaball drops. */
export function metalHeight(x: number, y: number, T: number, sc: number, wa: number, bl: number): number {
  const qx = x * sc, qy = y * sc, W = 2.8 * wa;
  const ax = mfFbm(qx, qy + T * 0.11) - 0.5, ay = mfFbm(qx + 5.2 - T * 0.09, qy + 1.3) - 0.5;
  const ux = qx + W * ax, uy = qy + W * ay;
  const bx = mfFbm(ux + 1.7 + T * 0.06, uy + 9.2) - 0.5, by = mfFbm(ux + 8.3, uy + 2.8 - T * 0.05) - 0.5;
  const vx = qx + W * bx, vy = qy + W * by;
  const cx = mfFbm(vx + 4.1, vy + 3.3) - 0.5, cy = mfFbm(vx + 2.9, vy + 7.7 + T * 0.04) - 0.5;
  const h = mfFbm(qx + 1.3 * W * cx + T * 0.03, qy + 1.3 * W * cy - T * 0.02);
  let m = 0;
  for (let i = 0; i < 5; i++) {
    const ccx = 0.78 * Math.sin(T * (0.29 + 0.06 * i) + i * 2.3), ccy = 0.34 * Math.sin(T * (0.21 + 0.05 * i) + i * 1.7 + 0.5);
    const r = (0.085 + 0.025 * Math.sin(i * 3.1 + T * 0.45)) * (0.7 + 0.7 * bl);
    const dx = x - ccx, dy = y - ccy;
    m += (r * r) / (dx * dx + dy * dy + 0.0015);
  }
  const xx = Math.max(1 - 1 / Math.max(m, 1e-3), 0);
  return h + bl * 0.5 * xx * (2 - xx);
}

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const metal = Math.floor(k[0] + 0.5), sc = k[1], wa = k[2], bl = k[3];
  const T = t * k[4], rel = k[5], sh = k[6], la = (k[7] * Math.PI) / 180;
  const e = Math.max(0.004, (PXc ?? currentPX()) * 0.9);
  const h0 = metalHeight(x, y, T, sc, wa, bl);
  const gx = (metalHeight(x + e, y, T, sc, wa, bl) - h0) / e, gy = (metalHeight(x, y + e, T, sc, wa, bl) - h0) / e;
  const s = 0.1 + 0.5 * rel;
  let nx = -gx * s, ny = -gy * s, nz = 1;
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl; ny /= nl; nz /= nl;
  const rx = 2 * nz * nx, ry = 2 * nz * ny;
  const c = Math.cos(la), sn = Math.sin(la);
  const rrx = c * rx + sn * ry, rry = -sn * rx + c * ry;
  const env = 0.12 + 0.62 * smoothstep(0.04, 0.7, rry)
    + 0.75 * Math.exp(-((rry + 0.38) * (rry + 0.38)) / 0.012)
    + 0.9 * smoothstep(0.55, 0.85, rry) * (1 - smoothstep(0.2, 0.55, Math.abs(rrx)));
  let Lx = 0.55 * Math.sin(la) - 0.35, Ly = 0.55 * Math.cos(la) + 0.2, Lz = 0.75;
  const ll = Math.hypot(Lx, Ly, Lz);
  Lx /= ll; Ly /= ll; Lz /= ll;
  let Hx = Lx, Hy = Ly, Hz = Lz + 1;
  const hl = Math.hypot(Hx, Hy, Hz);
  Hx /= hl; Hy /= hl; Hz /= hl;
  const spec = Math.pow(Math.max(nx * Hx + ny * Hy + nz * Hz, 0), 24 + 200 * sh) * (0.3 + 1.7 * sh);
  const fr = Math.pow(1 - nz, 5);
  const E = env + spec;
  let r: number, g: number, b: number;
  if (metal < 2.5) {
    const F0 = metal < 0.5 ? [1, 0.74, 0.3] : metal < 1.5 ? [0.93, 0.93, 0.91] : [0.96, 0.52, 0.34];
    r = (F0[0] + (1 - F0[0]) * fr) * E + F0[0] * F0[0] * 0.05;
    g = (F0[1] + (1 - F0[1]) * fr) * E + F0[1] * F0[1] * 0.05;
    b = (F0[2] + (1 - F0[2]) * fr) * E + F0[2] * F0[2] * 0.05;
  } else {
    const xx = Math.min(1, Math.max(0, 0.08 + 0.8 * E + 0.4 * fr)), m = 0.55 + 0.45 * Math.min(E + fr, 1.6);
    r = ramp(xx, 0) * m; g = ramp(xx, 1) * m; b = ramp(xx, 2) * m;
  }
  r = r / (1 + 0.35 * r); g = g / (1 + 0.35 * g); b = b / (1 + 0.35 * b);
  C[0] = Math.min(1, Math.max(0, r)); C[1] = Math.min(1, Math.max(0, g)); C[2] = Math.min(1, Math.max(0, b));
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  C[3] = Math.min(1, Math.max(0, (lum - 0.1) * 1.7));
}

export const impl: AnalyticImpl = {
  glsl: METAL_FUNDIDO_GLSL,
  prep: (_t, _k, p, px) => { pal = p && p.n ? p : DEFAULT; PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
