import type { AnalyticImpl, Palette } from '../types';
import { gnoise, smoothstep } from '../../engine/basic/core';
import { SEDA_GLSL } from './seda';

/** CPU twin of FC_seda, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.05, 0.02, 0.04, 0.4, 0.08, 0.16, 0.85, 0.35, 0.45, 1, 0.9, 0.9, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

function ramp(x: number, ch: number): number {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), w = f - i;
  return pal.rgb[i * 3 + ch] * (1 - w) + pal.rgb[j * 3 + ch] * w;
}

function fbm3(x: number, y: number): number {
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

/** sd_h: the height at (x, y) (the cloth's coordinates, or the sea's plane), for layer j. */
export function sedaHeight(x: number, y: number, T: number, mode: number, sc: number, dx: number, dy: number, det: number, wa: number, j: number): number {
  const u = x * dx + y * dy, v = -x * dy + y * dx;
  if (mode > 1.5) {
    const sx = x * sc, sy = y * sc;
    return 0.9 * (gnoise(sx * 0.8, sy * 0.8 + T * 0.22) - 0.5) + 0.35 * Math.sin(u * sc * 3 - T * 1.1) + det * 0.6 * (fbm3(sx * 2.6 + T * 0.17, sy * 2.6 - T * 0.21) - 0.5);
  }
  const m = wa * 2.2 * (fbm3(u * sc * 0.7 + j * 7.3, v * sc * 0.35 + T * 0.05 + j * 3.1) - 0.5);
  const w = v * sc * 5 + m * 3;
  const a = u * sc;
  const h = Math.sin(w + T * 0.55 + 0.8 * Math.sin(a * 1.1 - T * 0.23 + j))
    + 0.5 * Math.sin(2.07 * w - T * 0.37 + 1.7 + 1.2 * Math.sin(a * 1.9 + T * 0.19 + 2 * j))
    + 0.22 * Math.sin(4.3 * w + T * 0.8 + 1.3 * a);
  return 0.4 * h + det * 0.5 * (fbm3(x * sc * 3 + T * 0.06 + j * 5.1, y * sc * 3 - T * 0.05 + j * 5.1) - 0.5);
}

const G = new Float64Array(2);
/** sd_grad: the slope at (x, y) into G: of the grid triangle that holds it (facets of size g), or by finite differences. */
export function sedaGrad(x: number, y: number, g: number, T: number, mode: number, sc: number, dx: number, dy: number, det: number, wa: number, j: number): Float64Array {
  const H = (a: number, b: number) => sedaHeight(a, b, T, mode, sc, dx, dy, det, wa, j);
  if (g > 0) {
    const cx = Math.floor(x / g), cy = Math.floor(y / g), fx = x / g - cx, fy = y / g - cy, ax = cx * g, ay = cy * g;
    const ha = H(ax, ay), hd = H(ax + g, ay + g);
    if (fx > fy) {
      const hb = H(ax + g, ay);
      G[0] = (hb - ha) / g; G[1] = (hd - hb) / g;
      return G;
    }
    const hc = H(ax, ay + g);
    G[0] = (hd - hc) / g; G[1] = (hc - ha) / g;
    return G;
  }
  const e = 0.004, h0 = H(x, y);
  G[0] = (H(x + e, y) - h0) / e; G[1] = (H(x, y + e) - h0) / e;
  return G;
}

const norm3 = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt) return;
  lx = px; ly = py; lt = t;
  const mode = Math.floor(k[0] + 0.5), sc = k[1], ang = (k[2] * Math.PI) / 180, rel = k[3];
  const T = t * k[4], det = k[5], sh = k[6], gl = 6 + 154 * k[7] * k[7];
  const la = (k[8] * Math.PI) / 180, nl = Math.floor(k[9] + 0.5), par = k[10], fac = k[11];
  const tilt = k[12], wa = k[13];
  const dx = Math.cos(ang), dy = Math.sin(ang), pdx = -dy, pdy = dx;
  if (mode > 1.5) {
    const pitch = 0.22 + 0.85 * tilt, cp = Math.cos(pitch), sp = Math.sin(pitch);
    const dir = norm3([px, py * cp - 1.7 * sp, -py * sp - 1.7 * cp]);
    const sk = 0.18 + 0.3 * (1 - smoothstep(-0.02, 0.45, dir[1]));
    const sky = [ramp(sk, 0), ramp(sk, 1), ramp(sk, 2)];
    const skyL = 0.1 + 0.25 * (1 - smoothstep(-0.02, 0.45, dir[1]));
    if (dir[1] > -0.015) { C[0] = sky[0]; C[1] = sky[1]; C[2] = sky[2]; C[3] = skyL; return; }
    const kk = rel * 0.35;
    let tt = 1 / -dir[1];
    let Wx = dir[0] * tt, Wz = dir[2] * tt;
    for (let i = 0; i < 3; i++) {
      tt = (1 - kk * sedaHeight(Wx, Wz, T, mode, sc, dx, dy, det, wa, 0)) / -dir[1];
      Wx = dir[0] * tt; Wz = dir[2] * tt;
    }
    const g = sedaGrad(Wx, Wz, fac < 0.01 ? 0 : 0.05 + 0.3 * fac, T, mode, sc, dx, dy, det, wa, 0);
    const n = norm3([-g[0] * kk * 1.7, 1, -g[1] * kk * 1.7]);
    const L = norm3([0.6 * Math.cos(la), 0.32, 0.6 * Math.sin(la) - 0.45]);
    const diff = Math.max(dot3(n, L), 0);
    // reflect(-L, n) = -L + 2 (n · L) n
    const nL = dot3(n, L);
    const R = [-L[0] + 2 * nL * n[0], -L[1] + 2 * nL * n[1], -L[2] + 2 * nL * n[2]];
    const hi = sh * 1.4 * Math.pow(Math.max(-dot3(R, dir), 0), gl);
    const fog = Math.exp(-Math.max(tt - 1.2, 0) * 0.16);
    const shade = 0.1 + 0.78 * diff;
    for (let c = 0; c < 3; c++) {
      const v = ramp(shade, c) + hi * (ramp(1, c) * 0.6 + 0.4);
      C[c] = Math.min(1, Math.max(0, sky[c] * (1 - fog) + v * fog));
    }
    const l = skyL * (1 - fog) + (shade * 0.9 + hi) * fog;
    C[3] = Math.min(1, Math.max(0, l));
    return;
  }
  const V = norm3([0, -0.8 * tilt, 1]), L = norm3([0.7 * Math.cos(la), 0.7 * Math.sin(la), 0.55]);
  const H = norm3([L[0] + V[0], L[1] + V[1], L[2] + V[2]]);
  const gs = fac < 0.01 ? 0 : 0.04 + 0.3 * fac, nlay = mode > 0.5 ? nl : 1;
  let cr = 0, cg = 0, cb = 0, lum = 0;
  for (let j = 0; j < 3; j++) {
    if (j >= nlay) break;
    const s = 1 + 0.35 * j * par;
    const drift = T * (0.04 + 0.12 * par * j);
    const xr = px / s + dx * drift, yr = py / s + dy * drift, x = xr + 3.7 * j, y = yr + 1.3 * j;
    const g = sedaGrad(x, y, gs, T, mode, sc, dx, dy, det, wa, j);
    const n = norm3([-g[0] * rel * 0.55, -g[1] * rel * 0.55, 1]);
    const diff = Math.max(dot3(n, L), 0), shade = 0.06 + 0.84 * diff * Math.sqrt(diff);
    let hi: number, hi2 = 0;
    if (mode < 0.5) {
      const nh = Math.max(dot3(n, H), 0);
      hi = sh * (1.1 * Math.pow(nh, gl) + 0.18 * Math.pow(nh, gl * 0.12));
    } else {
      const fib = gnoise((x * dx + y * dy) * 55 * sc, (x * pdx + y * pdy) * 1.5 * sc + j * 9.1) - 0.5;
      const T0 = [pdx, pdy, 0];
      const nT = dot3(n, T0), sh0 = fib * (0.06 + 0.3 * det);
      const Tn = norm3([T0[0] - n[0] * nT + n[0] * sh0, T0[1] - n[1] * nT + n[1] * sh0, T0[2] - n[2] * nT + n[2] * sh0]);
      const th = dot3(Tn, H);
      hi = sh * 0.8 * Math.pow(Math.sqrt(Math.max(1 - th * th, 0)), gl * 3);
      const T2 = norm3([Tn[0] - n[0] * 0.3, Tn[1] - n[1] * 0.3, Tn[2] - n[2] * 0.3]);
      const th2 = dot3(T2, H);
      hi2 = sh * 0.3 * Math.pow(Math.sqrt(Math.max(1 - th2 * th2, 0)), gl);
    }
    const l = shade * 0.8 + hi + 0.5 * hi2;
    let al = 1;
    if (j > 0.5) {
      const v = xr * pdx + yr * pdy, u = xr * dx + yr * dy;
      const cen = (j < 1.5 ? -0.2 : 0.24) + 0.1 * Math.sin(u * 1.2 + T * 0.2 * (1 + j) + j);
      const w = 0.14 + 0.05 * Math.sin(u * 0.8 - T * 0.15 + 2 * j);
      al = 0.62 * smoothstep(w + 0.025, w - 0.025, Math.abs(v - cen));
    }
    const c0 = ramp(shade * 0.85, 0) + hi * (ramp(1, 0) * 0.6 + 0.4) + hi2 * ramp(0.75, 0);
    const c1 = ramp(shade * 0.85, 1) + hi * (ramp(1, 1) * 0.6 + 0.4) + hi2 * ramp(0.75, 1);
    const c2 = ramp(shade * 0.85, 2) + hi * (ramp(1, 2) * 0.6 + 0.4) + hi2 * ramp(0.75, 2);
    cr = cr * (1 - al) + c0 * al; cg = cg * (1 - al) + c1 * al; cb = cb * (1 - al) + c2 * al;
    lum = lum * (1 - al) + l * al;
  }
  C[0] = Math.min(1, Math.max(0, cr)); C[1] = Math.min(1, Math.max(0, cg)); C[2] = Math.min(1, Math.max(0, cb));
  C[3] = Math.min(1, Math.max(0, lum));
}

export const impl: AnalyticImpl = {
  glsl: SEDA_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
