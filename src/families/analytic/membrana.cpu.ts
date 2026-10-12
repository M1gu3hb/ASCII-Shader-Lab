import type { AnalyticImpl, Palette } from '../types';
import { PI, TAU, fbm, fbm3, sat, smoothstep } from '../../engine/basic/core';
import { MEMBRANA_GLSL, MEM_DL, MEM_LAMBDA, MEM_N, MEM_W } from './membrana';

/** CPU twin of FC_membrana, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 3, rgb: new Float32Array([0.05, 0.09, 0.2, 0.9, 0.3, 0.6, 0.35, 0.9, 0.95, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

/** One band's two-beam response averaged over its width (mem_band). */
export function band(opd: number, l: number): number {
  const x = (PI * opd * MEM_DL) / (l * l);
  const env = x < 1e-3 ? 1 : Math.sin(x) / x;
  return 1 - Math.cos((TAU * opd) / l) * env;
}

/** Linear sRGB of a soap film's reflection for an optical path difference (nm), as the shader's spectral sum. */
export function filmRGB(opd: number, out: Float64Array) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < MEM_N; i++) {
    const I = band(opd, MEM_LAMBDA[i]);
    r += MEM_W[i * 3] * I; g += MEM_W[i * 3 + 1] * I; b += MEM_W[i * 3 + 2] * I;
  }
  out[0] = r * 0.5; out[1] = g * 0.5; out[2] = b * 0.5;
  return out;
}

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);
const F = new Float64Array(3);
// light direction normalize(-.45, .55, 1) and the half vector normalize(L + (0, 0, 1))
const LL = Math.hypot(-0.45, 0.55, 1), Lx = -0.45 / LL, Ly = 0.55 / LL, Lz = 1 / LL;
const HL = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / HL, Hy = Ly / HL, Hz = (Lz + 1) / HL;

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const form = Math.floor(k[0] + 0.5), fl = k[2], wv = k[3], T = t * k[4], sh = k[5];
  const D = 260 + (1500 - 260) * k[1];
  const ux = x / k[6], uy = y / k[6];
  const A = wv * 0.05;
  const a1 = (ux * 0.83 + uy * 0.55) * 7.3 + T * 1.31, a2 = (ux * -0.42 + uy * 0.91) * 11.1 - T * 0.97, a3 = (ux * 0.97 + uy * -0.26) * 4.9 + T * 0.61;
  const c1 = Math.cos(a1), c2 = Math.cos(a2), c3 = Math.cos(a3);
  const grx = A * (0.83 * 7.3 * c1 + 0.55 * -0.42 * 11.1 * c2 + 0.8 * 0.97 * 4.9 * c3);
  const gry = A * (0.55 * 7.3 * c1 + 0.55 * 0.91 * 11.1 * c2 + 0.8 * -0.26 * 4.9 * c3);
  let nl = Math.hypot(grx, gry, 1);
  let nx = -grx / nl, ny = -gry / nl, nz = 1 / nl;
  let thick: number, cosi: number, rim = 0, cover = 1, ground = 0;
  if (form < 0.5) {
    const wx = fbm(ux * 1.5, uy * 1.5 - T * 0.3) - 0.5, wy = fbm(ux * 1.5 + 5.2, uy * 1.5 + 1.3 - T * 0.22) - 0.5;
    const qx = ux + fl * 0.5 * wx, qy = uy + fl * 0.5 * wy;
    const w2x = fbm(qx * 2.2 + 1.7, qy * 2.2 + 9.2 + T * 0.12) - 0.5, w2y = fbm(qx * 2.2 + 8.3, qy * 2.2 + 2.8 - T * 0.15) - 0.5;
    const sw = fbm(qx * 2.4 + w2x * 3 * fl + T * 0.11, qy * 2.4 + w2y * 3 * fl - T * 0.36) - 0.5;
    const gv = 0.5 - qy + 0.06 * Math.sin(qx * 3.1 + T * 0.23);
    thick = D * (0.01 + 0.99 * sat(-0.12 + 0.95 * gv + fl * 0.55 * sw));
    cosi = nz;
  } else if (form < 1.5) {
    const an = Math.atan2(uy, ux);
    const R = 0.4 * (1 + 0.022 * Math.sin(an * 3 + T * 0.7) + 0.016 * Math.sin(an * 2 - T * 0.53));
    let rho = Math.hypot(ux, uy) / R;
    if (rho > 1.02) { C[0] = C[1] = C[2] = C[3] = 0; return; }
    cover = 1 - smoothstep(0.985, 1.015, rho);
    rho = Math.min(rho, 0.999);
    const sz = Math.sqrt(1 - rho * rho);
    const spx = ux / R, spy = uy / R;
    const ca = Math.cos(T * 0.13), sa = Math.sin(T * 0.13);
    const srx = ca * spx + sa * sz, sry = spy, srz = -sa * spx + ca * sz;
    const sw = fbm3(srx * 2.3, sry * 2.3 - T * 0.21, srz * 2.3 + T * 0.07) - 0.5;
    thick = D * (0.01 + 0.99 * sat(-0.1 + 0.48 * (1 - spy) + fl * 0.7 * sw));
    const bx = spx + grx * 0.6, by = spy + gry * 0.6;
    nl = Math.hypot(bx, by, sz);
    nx = bx / nl; ny = by / nl; nz = sz / nl;
    cosi = nz;
    rim = Math.pow(1 - sz, 3);
  } else {
    const wx = fbm(ux * 1.3 + T * 0.05, uy * 1.3) - 0.5, wy = fbm(ux * 1.3 + 5.2, uy * 1.3 + 1.3 - T * 0.04) - 0.5;
    const qx = ux + fl * 0.45 * wx, qy = uy + fl * 0.45 * wy;
    const m = fbm(qx * 1.9 + T * 0.03, qy * 1.9 + T * 0.02);
    cover = smoothstep(0.38, 0.46, m);
    thick = D * (0.04 + 0.96 * smoothstep(0.38, 0.85, m + fl * 0.12 * (fbm(qx * 5 - T * 0.1, qy * 5 - T * 0.1) - 0.5)));
    cosi = nz;
    ground = 0.03 + (0.04 * (grx - gry)) / Math.max(A * 20, 1e-3);
  }
  const nf = form > 1.5 ? 1.45 : 1.33;
  const st = Math.sqrt(Math.max(0, 1 - cosi * cosi)) / nf;
  const opd = 2 * nf * thick * Math.sqrt(1 - st * st);
  let r = 0, g = 0, b = 0, Y0: number;
  if (k[7] < 0.5) {
    filmRGB(opd, F);
    r = Math.max(F[0], 0); g = Math.max(F[1], 0); b = Math.max(F[2], 0);
    Y0 = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 0.65 + 0.45 * band(opd, 555) * 0.35;
  } else {
    const s = opd / 560, nP = Math.max(pal.n, 1);
    const I = 0.5 * (1 - Math.cos(TAU * s) * Math.exp((-s * s) / 14));
    const j = nP < 1.5 ? 0 : (s - Math.floor(s / (nP - 1)) * (nP - 1) | 0) + 1;
    const m = sat(I * 1.6), P = pal.rgb;
    r = P[0] + (P[j * 3] - P[0]) * m; g = P[1] + (P[j * 3 + 1] - P[1]) * m; b = P[2] + (P[j * 3 + 2] - P[2]) * m;
    Y0 = I * 0.9;
  }
  const dif = Math.max(nx * Lx + ny * Ly + nz * Lz, 0);
  let spec = Math.pow(Math.max(nx * Hx + ny * Hy + nz * Hz, 0), 70);
  const fres = Math.pow(1 - cosi, 2);
  let lit = 0.55 + 0.45 * dif + 0.6 * fres + 0.8 * rim;
  if (form > 0.5 && form < 1.5) {
    lit = 0.2 + 0.3 * dif + 2.2 * rim + 0.6 * fres;
    const wqx = nx + 0.38, wqy = (ny - 0.42) * 1.6;
    spec += 0.8 * (1 - smoothstep(0.09, 0.16, Math.hypot(wqx, wqy)));
  } else if (form > 1.5) lit *= 1.3;
  const cr = r, cg = g, cb = b;
  r *= lit; g *= lit; b *= lit;
  const Y = Y0 * lit;
  const s = sh * spec * (0.15 + 2 * Y0);
  r += s * (cr + 0.1); g += s * (cg + 0.1); b += s * (cb + 0.1);
  r = ground * 0.6 + (r - ground * 0.6) * cover;
  g = ground * 0.8 + (g - ground * 0.8) * cover;
  b = ground + (b - ground) * cover;
  const lum = ground + (Math.pow(sat(Y * 1.15), 0.8) + s - ground) * cover;
  const ig = 1 / 2.2;
  C[0] = Math.pow(sat(r), ig); C[1] = Math.pow(sat(g), ig); C[2] = Math.pow(sat(b), ig);
  C[3] = sat(lum);
}

export const impl: AnalyticImpl = {
  glsl: MEMBRANA_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
