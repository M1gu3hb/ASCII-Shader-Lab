import type { AnalyticImpl, Palette } from '../types';
import { fbm, fract, gnoise, sdSeg, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { CROMADO_GLSL } from './cromado';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of FC_cromado, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.02, 0.03, 0.05, 0.25, 0.29, 0.36, 0.7, 0.75, 0.82, 0.97, 0.98, 1, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

/** crom_ramp: the palette read as a gradient (x 0..1), one channel. */
function ramp(x: number, ch: number): number {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), w = f - i;
  return pal.rgb[i * 3 + ch] * (1 - w) + pal.rgb[j * 3 + ch] * w;
}

function smin(a: number, b: number, k: number) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

/** crom_sd: signed distance to the mask (negative inside). */
export function cromadoSD(px: number, py: number, m: number, R: number, T: number): number {
  if (m < 1.5) return Math.hypot(px, py) - R;
  if (m < 2.5) return Math.abs(Math.hypot(px, py) - 0.7 * R) - 0.3 * R;
  if (m < 3.5) {
    const a0 = 0.09 * Math.sin(T * 0.7), c = Math.cos(a0), s = Math.sin(a0);
    // GLSL rot2 = mat2(c, -s, s, c) * p (column-major): (c·x + s·y, −s·x + c·y)
    let qx = c * px + s * py;
    const qy = -s * px + c * py + 0.42 * R;
    qx = Math.abs(qx);
    const r1 = 0.78 * R, r2 = 0.05 * R, h = 1.75 * R;
    const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b);
    const k = -b * qx + a * qy;
    if (k < 0) return Math.hypot(qx, qy) - r1;
    if (k > a * h) return Math.hypot(qx, qy - h) - r2;
    return a * qx + b * qy - r1;
  }
  if (m < 4.5) {
    const qx = Math.abs(px), qy = Math.abs(py), ax = 0.78 * R, by = 1.1 * R;
    return sdSeg(qx, qy, ax, 0, 0, by) * Math.sign(qx / ax + qy / by - 1);
  }
  let d = 1e3;
  for (let i = 0; i < 4; i++) {
    const cx = 1.3 * R * Math.sin(T * (0.23 + 0.07 * i) + i * 2.1), cy = 0.62 * R * Math.sin(T * (0.31 - 0.05 * i) + i * 1.3 + 0.6);
    const r = R * (0.5 + 0.1 * Math.sin(i * 1.7 + T * 0.4));
    d = smin(d, Math.hypot(px - cx, py - cy) - r, 0.55 * R);
  }
  return d;
}

function line(x: number, c: number, h: number, fw: number) {
  const w = Math.max(h, fw * 0.5);
  return (h / w) * (1 - smoothstep(0, w, Math.abs(fract(x - c + 0.5) - 0.5)));
}

/** crom_prof: one band period (x 0..1), filtered by the phase step fw across one cell. */
export function cromadoProfile(x: number, fw: number): number {
  const e = Math.max(0.02, fw * 0.5);
  const ground = 0.03 + 0.1 * smoothstep(0.5, 1, x), sky = 0.32 + 0.68 * smoothstep(0, 0.5, x), w = 1 - smoothstep(0.5 - e, 0.5 + e, x);
  let v = ground * (1 - w) + sky * w;
  v = Math.max(v, 0.9 * line(x, 0.68, 0.045, fw));
  const k = smoothstep(0.35, 0.9, fw);
  return v * (1 - k) + 0.42 * k;
}

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const m = Math.floor(k[0] + 0.5), rep = k[1], dis = k[2], con = k[3];
  const ang = (k[4] * Math.PI) / 180, T = t * k[6], R = k[7];
  const PX = pxNow();
  let d = -1, E: number, dE: number, cov = 1;
  if (m < 0.5) {
    const n = fbm((x * 0.9) / R + T * 0.05, (y * 0.9) / R - T * 0.04);
    E = smoothstep(0.25, 0.75, n);
    dE = 2.5 / R;
  } else {
    d = cromadoSD(x, y, m, R, T);
    const D = 0.3 * R;
    const u = Math.min(1, Math.max(0, -d / D));
    E = (1 - u) * (1 - u);
    dE = (2 * (1 - u)) / D;
    cov = smoothstep(0.6 * PX, -0.6 * PX, d);
  }
  const nz = gnoise((x * 2.6) / R + T * 0.21, (y * 2.6) / R - T * 0.17) - 0.5;
  const ph = rep * (x * Math.cos(ang) + y * Math.sin(ang) + con * 0.5 * R * E + dis * 0.5 * R * nz) - T * 0.55;
  const fw = rep * (1 + con * 0.5 * R * dE + dis * 1.3) * PX;
  const dl = k[5] * 0.12 * (0.3 + 0.7 * E);
  const g = cromadoProfile(fract(ph), fw);
  const r = cromadoProfile(fract(ph + dl), fw);
  const b = cromadoProfile(fract(ph - dl), fw);
  const halo = m < 0.5 ? 0 : 0.2 * Math.exp(-Math.max(d, 0) / 0.016) * (0.55 + 0.45 * g) * (1 - cov);
  const rim = m < 0.5 ? 0 : 0.32 * E * E * E;
  const hx = 0.25 + 1.8 * halo;
  C[0] = ramp(hx, 0) * (1 - cov) + ramp(r, 0) * cov;
  C[1] = ramp(hx, 1) * (1 - cov) + ramp(g, 1) * cov;
  C[2] = ramp(hx, 2) * (1 - cov) + ramp(b, 2) * cov;
  const lb = 0.3 * r + 0.59 * g + 0.11 * b;
  C[3] = Math.min(1, Math.max(0, cov * (0.05 + 0.95 * lb + rim) + halo));
}

export const impl: AnalyticImpl = {
  glsl: CROMADO_GLSL,
  prep: (_t, _k, p, px) => {
    PXc = px ?? null; pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
