import type { AnalyticImpl, Palette } from '../types';
import { V2, fbm, fract, gnoise, hash12, hash22, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/patterns';
import { DESGARRO_GLSL } from './desgarro';

/** CPU twin of FC_desgarro, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = {
  n: 5,
  rgb: new Float32Array([0.03, 0.03, 0.04, 0.16, 0.14, 0.18, 0.36, 0.17, 0.53, 0.88, 0.27, 0.48, 1, 0.95, 0.84, 0, 0, 0]),
};
let pal: Palette = DEFAULT;
const RGB = new Float64Array(3);

/** desg_ramp: the palette read as a gradient (x 0..1) into `o` at offset j. */
function ramp(x: number, o: Float64Array, j = 0) {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), k = Math.min(i + 1, n - 1), w = f - i;
  for (let c = 0; c < 3; c++) o[j + c] = pal.rgb[i * 3 + c] * (1 - w) + pal.rgb[k * 3 + c] * w;
}

/** What one tear draws at a point (desgarro: the line; quemado: the burn), at layer time t. */
export interface TearState { open: number; seam: number; cx: number; cy: number; c: number }
/** The cycle state of tear i of n (for tests): how open it is and where it struck. */
export function tearAt(t: number, i: number, n: number, cyc: number, calm: number): TearState {
  const q = calm * 0.45;
  const tau = t / cyc + i / n;
  const c = Math.floor(tau), u = tau - c;
  const a = Math.min(1, Math.max(0, (u - q) / (1 - q)));
  const open = smoothstep(0, 0.28, a) * (1 - smoothstep(0.55, 0.97, a));
  const seam = smoothstep(Math.max(q - 0.12, 0), q + 0.02, u) * (1 - smoothstep(0.55, 0.97, a));
  hash22(c * 7 + i * 131 + 3, i * 17 + 5);
  return { open, seam, cx: (V2[0] - 0.5) * 1.1, cy: (V2[1] - 0.5) * 0.5, c };
}

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);
const S = new Float64Array(3), B = new Float64Array(3), H = new Float64Array(3);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const PX = currentPX();
  const kind = Math.floor(k[0] + 0.5), beh = Math.floor(k[1] + 0.5), n = Math.min(3, Math.max(1, Math.floor(k[2] + 0.5))), cyc = k[3];
  const q = k[4] * 0.45, W = k[5], glow = k[6], fib = k[7];
  let hole = 0, rim = 0, spill = 0, lip = 0, crack = 0, chr = 0, shx = 0, shy = 0;
  for (let i = 0; i < n; i++) {
    const tau = t / cyc + i / n;
    const c = Math.floor(tau), u = tau - c;
    const a = Math.min(1, Math.max(0, (u - q) / (1 - q)));
    const open = smoothstep(0, 0.28, a) * (1 - smoothstep(0.55, 0.97, a));
    if (open <= 0 && u < q - 0.13) continue;
    const seam = smoothstep(Math.max(q - 0.12, 0), q + 0.02, u) * (1 - smoothstep(0.55, 0.97, a));
    hash22(c * 7 + i * 131 + 3, i * 17 + 5);
    const hx = V2[0], hy = V2[1];
    hash22(c * 13 + i * 57 + 1, c * 5 + i * 3 + 29);
    const h2x = V2[0], h2y = V2[1];
    const cx = (hx - 0.5) * 1.1, cy = (hy - 0.5) * 0.5;
    const so = h2y * 40;
    if (kind < 0.5) {
      const th = (h2x - 0.5) * 2.8;
      const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
      const px = x - cx, py = y - cy;
      const s = px * dx + py * dy, dn = px * nx + py * ny;
      const off = 0.05 * (gnoise(s * 3.2 + so, so) - 0.5) + 0.02 * (gnoise(s * 9.1 + so, 1.3 + so) - 0.5);
      const side = dn - off, ad = Math.abs(side);
      const R = 1.9 * smoothstep(0, 0.35, a) + 0.02;
      const hw = W * 0.09 * open * Math.sqrt(Math.max(0, 1 - (s * s) / (R * R)));
      let fr = 0;
      if (ad - hw < 0.09 && open > 0) fr = fib * 0.04 * open * (2 * fbm(s * 26 + so, dn * 3) - 1) * (1 - smoothstep(0.04, 0.09, ad - hw));
      const ed = ad - hw - fr;
      hole = Math.max(hole, smoothstep(0, PX, -ed) * smoothstep(0, PX * 0.5, hw));
      rim = Math.max(rim, open * Math.exp(-Math.abs(ed) / 0.012));
      spill = Math.max(spill, open * Math.exp(-Math.max(ed, 0) / 0.06));
      lip += Math.sign(side) * open * Math.exp(-Math.max(ed, 0) / 0.025) * smoothstep(0, PX, ed);
      crack = Math.max(crack, seam * Math.exp(-ad / 0.01) * (1 - smoothstep(R + 0.1, R + 0.45, Math.abs(s))));
      const m = Math.sign(side) * hw * Math.exp(-ad / 0.45);
      shx += nx * m; shy += ny * m;
    } else {
      const A = 0.25 + 0.25 * fib;
      const r = Math.hypot(x - cx, y - cy);
      let b = r * 1.6 + A + 0.02 - open * (0.4 + 1.1 * W);
      if (b < 2 * A + 0.2) b += A * (2 * fbm(x * 2.3 + so, y * 2.3 + so) - 1) * (1 - smoothstep(2 * A, 2 * A + 0.2, b));
      const ed = b * 0.4;
      hole = Math.max(hole, smoothstep(0, PX, -ed) * (open >= 1e-6 ? 1 : 0));
      rim = Math.max(rim, open * Math.exp(-Math.abs(ed) / 0.012));
      spill = Math.max(spill, open * Math.exp(-Math.max(ed, 0) / 0.05));
      chr = Math.max(chr, open * Math.exp(-Math.max(ed, 0) / 0.03));
      crack = Math.max(crack, seam * (1 - open) * Math.exp(-r / 0.03));
    }
  }
  const psx = x - shx, psy = y - shy;
  const tex = gnoise(psx * 5 + 3.1, psy * 9 + 3.1) * 0.55 + gnoise(psx * 42 + 7.7, psy * 7 + 7.7) * 0.45;
  let surf = 0.03 + 0.24 * smoothstep(0.42, 0.8, tex) + 0.3 * Math.min(1, Math.max(-1, lip)) * glow;
  surf *= 1 - 0.92 * chr;
  ramp(0.08 + 0.22 * tex, S);
  for (let j = 0; j < 3; j++) S[j] *= 1 - 0.8 * chr;
  let bl = 0;
  B[0] = B[1] = B[2] = 0;
  if (hole > 0 || spill > 0.02) {
    if (beh < 0.5) {
      const wx = x * 1.6 + t * 0.03, wy = y * 1.6 - t * 0.02;
      const n1 = fbm(wx + 1.4 * gnoise(wx * 1.1 + t * 0.05, wy * 1.1 + t * 0.05), wy + 1.4 * gnoise(wx * 1.1 + 4.3 - t * 0.04, wy * 1.1 + 4.3 - t * 0.04));
      let v = 1 - Math.abs(2 * gnoise(x * 4.5 + n1 * 1.5, y * 4.5 + n1 * 1.5) - 1);
      v = v * v; v = v * v;
      const hs = hash12(Math.floor(x * 26) + 3, Math.floor(y * 26) + 3);
      const sp = smoothstep(0.95, 1, hs) * (0.5 + 0.5 * Math.sin(t * (1.5 + 2 * hs) + hs * 50));
      bl = 0.06 + 0.62 * n1 * n1 + 0.45 * v + 0.6 * sp;
      ramp(0.42 + 0.45 * n1 + 0.25 * v + 0.3 * sp, B);
    } else if (beh < 1.5) {
      const v = fbm(x * 1.3 + t * 0.025, y * 1.3 + t * 0.02);
      const l1 = Math.abs(fract((x * 0.8 + y * 0.6) * 15 + t * 0.08) - 0.5) * 2;
      const l2 = Math.abs(fract((-x * 0.6 + y * 0.8) * 15 - t * 0.06) - 0.5) * 2;
      const hatch = Math.max(smoothstep(0.9 * v + 0.12, 0.9 * v - 0.12, l1), smoothstep(0.5 * v + 0.1, 0.5 * v - 0.14, l2) * (v < 0.55 ? 0 : 1));
      bl = 0.22 + 0.7 * hatch;
      ramp(0.45 + 0.5 * v, B);
    } else {
      let ws = 0;
      for (let j = 0; j < 3; j++) {
        const cjx = 0.75 * Math.sin(t * (0.11 + 0.04 * j) + j * 2.4), cjy = 0.35 * Math.sin(t * (0.09 + 0.03 * j) + j * 1.7 + 0.5);
        const w = 1 / (Math.pow(Math.hypot(x - cjx, y - cjy), 3) + 1e-3);
        ramp(0.5 + 0.25 * j, RGB);
        B[0] += w * RGB[0]; B[1] += w * RGB[1]; B[2] += w * RGB[2]; ws += w;
      }
      B[0] /= ws; B[1] /= ws; B[2] /= ws;
      bl = 0.45 + 0.35 * (gnoise(x * 5 + t * 0.1, y * 5 + t * 0.1) - 0.5) + 0.4 * (B[0] * 0.299 + B[1] * 0.587 + B[2] * 0.114);
    }
  }
  const hot = Math.min(1, Math.max(0, rim * glow * 1.1 + crack * 0.45));
  const lum = surf * (1 - hole) + bl * hole + hot + spill * glow * 0.35 * (1 - hole);
  ramp(0.92, H);
  const wHot = Math.min(1, Math.max(0, hot + spill * glow * 0.5 * (1 - hole)));
  for (let j = 0; j < 3; j++) { const v = S[j] * (1 - hole) + B[j] * hole; C[j] = v * (1 - wHot) + H[j] * wHot; }
  C[3] = Math.min(1, Math.max(0, lum));
}

export const impl: AnalyticImpl = {
  glsl: DESGARRO_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
