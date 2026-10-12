import type { AnalyticImpl, Palette } from '../types';
import { PI, fbm, fract, mod, smoothstep } from '../../engine/basic/core';
import { MARCO_GLSL } from './marco';

/** CPU twin of FC_marco, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.02, 0.04, 0.03, 0.1, 0.35, 0.2, 0.3, 0.95, 0.55, 0.85, 1, 0.9, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;
const CB = new Float64Array(3);

function ramp(x: number, o: Float64Array) {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), k = Math.min(i + 1, n - 1), w = f - i;
  for (let c = 0; c < 3; c++) o[c] = pal.rgb[i * 3 + c] * (1 - w) + pal.rgb[k * 3 + c] * w;
}

/** marc_rr: signed distance to a rounded rectangle (half size bx × by, corner r) and the arc length there. */
export const RR = { sd: 0, s: 0 };
export function marcoRR(px: number, py: number, bx: number, by: number, r: number) {
  const ibx = bx - r, iby = by - r;
  const ax = Math.abs(px), ay = Math.abs(py), qx = ax - ibx, qy = ay - iby;
  RR.sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  const Lc = r * PI * 0.5, P = 4 * (ibx + iby + Lc);
  let s: number;
  if (qx > 0 && qy > 0) s = ibx + r * (PI * 0.5 - Math.atan2(qy, qx));
  else if (qy > qx) s = Math.min(ax, ibx);
  else s = ibx + Lc + iby - Math.min(ay, iby);
  if (py < 0) s = P * 0.5 - s;
  if (px < 0) s = P - s;
  RR.s = s;
}

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const K = Math.floor(k[0] + 0.5), sp = 0.1 + 1.4 * k[1], m = k[3];
  const bx = Math.max(k[7] * 0.5 - m, 0.05), by = Math.max(0.5 - m, 0.05);
  const r = k[4] * Math.min(bx, by);
  marcoRR(x, y, bx, by, r);
  const sd = RR.sd, ad = Math.abs(sd), P = 4 * (bx + by - 2 * r + r * PI * 0.5);
  const u = RR.s / P;
  const bt = fract(t / 1.15);
  const d1 = fract(bt - 0.08 + 0.5) - 0.5, d2 = fract(bt - 0.3 + 0.5) - 0.5;
  const beat = k[5] * (Math.exp((-d1 * d1) / 0.0025) + 0.65 * Math.exp((-d2 * d2) / 0.0036));
  const w = (0.006 + 0.012 * k[2]) * (1 + 1.2 * beat);
  const core = 1 / (1 + (sd * sd) / (w * w));
  const n = Math.max(pal.n, 1);
  const base = 0.38;
  ramp(0.55, CB);
  let ar = CB[0] * base, ag = CB[1] * base, ab = CB[2] * base, cs = 0, ws = base;
  const tau = (0.28 * P) / Math.max(K, 1);
  for (let i = 0; i < K; i++) {
    const uk = fract(i / K + (t * sp * (1 + 0.07 * i)) / P);
    const bh = fract(uk - u) * P, ah = P - bh;
    const c = Math.max(Math.exp(-bh / tau) + 0.6 * Math.exp(-bh / 0.04), Math.exp(-ah / 0.02));
    const j = Math.floor(n - 1 - mod(i, Math.max(n - 2, 1))) * 3;
    ar += pal.rgb[j] * c * 1.1; ag += pal.rgb[j + 1] * c * 1.1; ab += pal.rgb[j + 2] * c * 1.1;
    ws += c * 1.1; cs += c;
  }
  C[0] = ar / ws; C[1] = ag / ws; C[2] = ab / ws;
  let lum = core * (base + 1.1 * cs) * (1 + 0.9 * beat) + 0.3 * cs * Math.exp(-ad / 0.05) + 0.2 * beat * Math.exp(-ad / 0.06);
  if (k[6] > 0) {
    const f = fbm(x * 4.5 + ad * 3 + t * 0.06, y * 4.5 - ad * 5 - t * 0.25);
    lum += k[6] * smoothstep(0.5, 0.82, f) * Math.exp(-ad / 0.09) * (0.35 + 0.8 * cs + beat);
  }
  C[3] = Math.min(1, Math.max(0, lum));
}

export const impl: AnalyticImpl = {
  glsl: MARCO_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
