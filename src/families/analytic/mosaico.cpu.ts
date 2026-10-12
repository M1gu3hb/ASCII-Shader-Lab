import type { AnalyticImpl } from '../types';
import { PI, TAU, V2, clamp, fbm, hash12, hash13, hash22, mod, sat, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { MOSAICO_GLSL } from './mosaico';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of F_mosaico, line by line (uniforms are float32 on the GPU: hashed inputs are rounded alike). */
const fr = Math.fround;

/** Share of the interval [a − h, a + h] that [−e, e] covers. */
export const cov = (a: number, h: number, e: number) => clamp((Math.min(a + h, e) - Math.max(a - h, -e)) / (2 * h), 0, 1);

/** Columns of a tile n rows tall: odd, about square at the default cell aspect. */
export const tileCols = (n: number) => 2 * Math.floor(0.7 * n + 0.5) + 1;

/** Where a tile is in its passes: the pass number, the flip progress (0..1) and the face it shows. */
export const PASS = { nf: 0, f: 0, e: 0, vert: 1 };
export function pass(cx: number, cy: number, idx: number, idy: number, t: number, k: Float32Array) {
  const dir = Math.floor(k[1] + 0.5);
  const lam = 0.3 + (1.6 - 0.3) * k[3];
  let s: number;
  if (dir < 0.5) s = cx;
  else if (dir < 1.5) s = -cy;
  else if (dir < 2.5) s = (cx - cy) * 0.7071;
  else if (dir < 3.5) s = Math.hypot(cx, cy);
  else s = (Math.atan2(cy, cx) / TAU + 0.5) * lam;
  let vert: number;
  if (dir < 0.5) vert = 1;
  else if (dir < 1.5) vert = 0;
  else if (dir < 2.5) vert = mod(idx + idy, 2);
  else if (dir < 3.5) vert = Math.abs(cx) > Math.abs(cy) ? 1 : 0;
  else vert = Math.abs(cx) > Math.abs(cy) ? 0 : 1;
  const ph = (k[2] * t - s) / lam + k[5] * 0.8 * (hash12(idx + 7.31, idy + 7.31) - 0.5);
  const nf = Math.floor(ph), f = smoothstep(0, k[4], ph - nf);
  PASS.nf = nf; PASS.f = f; PASS.e = nf + (f < 0.5 ? 0 : 1); PASS.vert = vert;
}

export const impl: AnalyticImpl = {
  prep: (_t, _k, _p, px) => { PXc = px ?? null; },
  glsl: MOSAICO_GLSL,
  cpu(x, y, t, k) {
    const PX = pxNow();
    const n = clamp(Math.floor(k[0] + 0.5), 2, 6);
    const m = tileCols(n);
    const tw = fr(fr(m * PX) / 1.4), th = fr(n * PX);
    const gx = (x + fr(0.001 * fr(PX / 1.4))) / tw, gy = (y + fr(0.001 * PX)) / th;
    const idx = Math.floor(gx), idy = Math.floor(gy);
    const u = (gx - idx) * 2 - 1, v = (gy - idy) * 2 - 1;
    const cx = (idx + 0.5) * tw, cy = (idy + 0.5) * th;
    pass(cx, cy, idx, idy, t, k);
    const { f, e, vert } = PASS;
    const thf = PI * f;
    const pic0 = hash13(idx, idy, e), pic1 = smoothstep(0.36, 0.64, fbm(cx * 1.4 + e * 0.37, cy * 1.4 + e * -0.61));
    const pic = pic0 + (pic1 - pic0) * k[6];
    hash22(idx + e * 13, idy + e * 29);
    const jx = (V2[0] - 0.5) * 0.7, jy = (V2[1] - 0.5) * 0.7;
    const jl = Math.hypot(jx, jy, 1);
    let nx = jx / jl, ny = jy / jl, nz = 1 / jl;
    const ct = Math.cos(thf), st = Math.sin(thf);
    const tn = f < 0.5 ? thf : thf - PI, cn = Math.cos(tn), sn = Math.sin(tn);
    if (vert > 0.5) { const ax = nx * cn + nz * sn; nz = -nx * sn + nz * cn; nx = ax; }
    else { const ay = ny * cn + nz * sn; nz = -ny * sn + nz * cn; ny = ay; }
    let Lx = 0.75 * Math.cos(t * 0.17), Ly = 0.6 * Math.sin(t * 0.13) + 0.2, Lz = 1;
    const ll = Math.hypot(Lx, Ly, Lz); Lx /= ll; Ly /= ll; Lz /= ll;
    const dif = Math.max(nx * Lx + ny * Ly + nz * Lz, 0);
    const hl = Math.hypot(Lx, Ly, Lz + 1);
    const gl = Math.pow(Math.max((nx * Lx + ny * Ly + nz * (Lz + 1)) / hl, 0), 28);
    const tone = 0.1 + 0.9 * pic;
    let face = tone * (0.3 + 0.7 * dif) + k[7] * gl * (0.4 + 0.6 * tone);
    const hu = 1 / m, hv = 1 / n;
    const bev = (v > 1 - 2 * hv ? 0.12 : v < -1 + 2 * hv ? -0.22 : 0) + (u < -1 + 2 * hu ? 0.06 : u > 1 - 2 * hu ? -0.12 : 0);
    face *= 1 + bev * (1 - f * (1 - f) * 4);
    const a = vert > 0.5 ? u : v, ha = vert > 0.5 ? hu : hv;
    const hf = Math.abs(ct), he = Math.max(hf, 1.2 * ha * st);
    const cf = cov(a, ha, hf), ce = cov(a, ha, he) - cf;
    const edge = 0.55 + 0.45 * st;
    return sat(cf * face + ce * edge);
  },
};
