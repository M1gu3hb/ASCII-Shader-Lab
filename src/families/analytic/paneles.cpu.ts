import type { AnalyticImpl, Palette } from '../types';
import { TAU, mod, sat, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { PANELES_GLSL } from './paneles';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of FC_paneles, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 3, rgb: new Float32Array([0.05, 0.09, 0.2, 0.9, 0.3, 0.6, 0.35, 0.9, 0.95, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

const MAX = 20, F = 1.7, Z0 = 3.4;
const ZS = new Float64Array(MAX), CR = new Float64Array(MAX), CG = new Float64Array(MAX), CB = new Float64Array(MAX);
const AS = new Float64Array(MAX), GS = new Float64Array(MAX);
/** The layers `hits` found (depth, colour, alpha, ink), as tests read them. */
export const HITS = { ZS, CR, CG, CB, AS, GS };

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

/** Layers the ray through (x, y) crosses (written to ZS…GS, unsorted); returns how many. */
export function hits(x: number, y: number, t: number, k: Float32Array): number {
  const N = Math.min(10, Math.max(2, Math.floor(k[0] + 0.5))), turns = Math.floor(k[1] + 0.5), op = k[2], len = k[3];
  const sets = k[4] < 0.5 ? 1 : 2, wid = k[7];
  const nP = Math.max(pal.n, 1), P = pal.rgb;
  const ph = (TAU * t) / 60;
  const an = k[5] * 1.5708, c = Math.cos(an), s0 = Math.sin(an);
  // GLSL rot2 = mat2(c, -s, s, c) * p (column-major): (c·x + s·y, −s·x + c·y)
  const qx = c * x + s0 * y, qy = -s0 * x + c * y;
  const yw = 0.55 + 0.12 * Math.sin(ph), pt = 0.28;
  const cy = Math.cos(yw), sy = Math.sin(yw), cp = Math.cos(pt), sp = Math.sin(pt);
  const d0x = cy * qx - sy * F, d0z = sy * qx + cy * F;
  const dx = d0x, dy = cp * qy - sp * d0z, dz = sp * qy + cp * d0z;
  const o0x = -sy * -Z0, o0z = cy * -Z0;
  const ox = o0x, oy = -sp * o0z, oz = cp * o0z;
  const PX = pxNow();
  let nh = 0;
  for (let s = 0; s < 2; s++) {
    if (s >= sets) break;
    const dir = s === 0 ? 1 : -1;
    for (let i = 0; i < 10; i++) {
      if (i >= N) break;
      const a = dir * turns * ph + (TAU * (i + 0.5 * s)) / N + 0.3 * s;
      const sa = Math.sin(a), ca = Math.cos(a);
      const den = dy * ca - dz * sa;
      if (Math.abs(den) < 1e-4) continue;
      const lam = -(oy * ca - oz * sa) / den;
      const Px = ox + lam * dx, Py = oy + lam * dy, Pz = oz + lam * dz;
      const r = Py * sa + Pz * ca;
      if (lam <= 0 || r < 0) continue;
      const z = lam * F, sx = Px;
      const cw = (PX * z) / F;
      const wsx = 1 - smoothstep(wid, wid + cw, Math.abs(sx));
      const wr = 1 - smoothstep(len, len + cw, r);
      if (wsx * wr <= 0) continue;
      const fade = smoothstep(0, 0.25, r) * smoothstep(0.55, 1.1, z);
      const rim = k[6] * Math.max(1 - smoothstep(cw * 0.5, cw * 1.3, Math.abs(len - r)), 1 - smoothstep(cw * 0.5, cw * 1.3, Math.abs(wid - Math.abs(sx))));
      const m1 = Math.max(nP - 1, 1), off = nP > 1.5 ? 1 : 0;
      const j = mod(i + s * 2, m1) + off, j1 = mod(j, m1) + off;
      const g = smoothstep(0.1, 1, r / len) * 0.4;
      const dim = 1 + (0.4 - 1) * smoothstep(Z0 - 1.2, Z0 + 1.2, z);
      let cr = P[j * 3] + (P[j1 * 3] - P[j * 3]) * g, cg = P[j * 3 + 1] + (P[j1 * 3 + 1] - P[j * 3 + 1]) * g, cb = P[j * 3 + 2] + (P[j1 * 3 + 2] - P[j * 3 + 2]) * g;
      const rk = rim * 0.6;
      cr = cr * dim + (1 - cr * dim) * rk; cg = cg * dim + (1 - cg * dim) * rk; cb = cb * dim + (1 - cb * dim) * rk;
      ZS[nh] = z; CR[nh] = cr; CG[nh] = cg; CB[nh] = cb;
      AS[nh] = sat(fade * wsx * wr * (op + rim * (1 - op)));
      const rib = 0.5 + 0.5 * Math.cos((r / len) * TAU * 5);
      GS[nh] = sat((0.45 + (0.45 * r) / len) * (0.4 + 0.6 * dim) * (1 - 0.35 * k[6] * rib) + rim);
      nh++;
    }
  }
  return nh;
}

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const nh = hits(x, y, t, k);
  // far to near (insertion sort), then «over»
  for (let i = 1; i < nh; i++) {
    const z = ZS[i], r = CR[i], g = CG[i], b = CB[i], a = AS[i], gg = GS[i];
    let j = i - 1;
    while (j >= 0 && ZS[j] < z) {
      ZS[j + 1] = ZS[j]; CR[j + 1] = CR[j]; CG[j + 1] = CG[j]; CB[j + 1] = CB[j]; AS[j + 1] = AS[j]; GS[j + 1] = GS[j];
      j--;
    }
    ZS[j + 1] = z; CR[j + 1] = r; CG[j + 1] = g; CB[j + 1] = b; AS[j + 1] = a; GS[j + 1] = gg;
  }
  let r = pal.rgb[0], g = pal.rgb[1], b = pal.rgb[2], ink = 0;
  for (let i = 0; i < nh; i++) {
    const a = AS[i];
    r += (CR[i] - r) * a; g += (CG[i] - g) * a; b += (CB[i] - b) * a;
    ink += (GS[i] - ink) * a;
  }
  C[0] = r; C[1] = g; C[2] = b; C[3] = sat(ink);
}

export const impl: AnalyticImpl = {
  glsl: PANELES_GLSL,
  prep: (_t, _k, p, px) => {
    PXc = px ?? null; pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
