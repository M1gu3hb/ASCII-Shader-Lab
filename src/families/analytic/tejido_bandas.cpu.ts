import type { AnalyticImpl, Palette } from '../types';
import { PI, fract, gnoise, hash12, mod, smoothstep, step } from '../../engine/basic/core';
import { TEJIDO_BANDAS_GLSL } from './tejido_bandas';

/** CPU twin of FC_tejido_bandas, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.06, 0.05, 0.04, 0.85, 0.62, 0.12, 0.1, 0.45, 0.22, 0.7, 0.12, 0.1, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

const palR = (i: number, out: Float64Array, o: number) => {
  const j = Math.floor(mod(i, Math.max(pal.n, 1))) * 3;
  out[o] = pal.rgb[j]; out[o + 1] = pal.rgb[j + 1]; out[o + 2] = pal.rgb[j + 2];
};

/** Which thread is on top at crossing (i, j) before any flip: 1 the warp, 0 the weft. */
export function base(i: number, j: number, wv: number, bw: number): number {
  if (wv < 0.5) return 1 - mod(i + j, 2);
  if (wv < 1.5) return step(mod(i + j, 4), 1.5);
  const B = 2 * bw;
  const warpFaced = 1 - mod(Math.floor(i / B) + Math.floor(j / B), 2);
  const odd = 1 - step(0.5, mod(i + j, 4));
  return warpFaced > 0.5 ? 1 - odd : odd;
}

/** The warp's signed height at crossing (i, j) at time t: +1 on top, −1 under. */
export function heightAt(i: number, j: number, t: number, k: Float32Array): number {
  const a = (k[5] * PI) / 180;
  const ph = k[4] * (t * 0.35 - (i * Math.cos(a) + j * Math.sin(a)) * 0.09);
  return Math.cos(PI * (base(i, j, k[3], k[2]) + Math.floor(ph) + smoothstep(0.75, 1, fract(ph))));
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4), CW = new Float64Array(3), CF = new Float64Array(3);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const n = k[0], tw = k[1], bw = k[2];
  const ux = x * n + k[7] * t * 0.6, uy = y * n + k[7] * t * 0.22;
  const i = Math.floor(ux), j = Math.floor(uy);
  const fx = ux - i - 0.5, fy = uy - j - 0.5;
  const N = Math.max(pal.n - 1, 1), o = pal.n > 1.5 ? 1 : 0;
  palR(o + Math.floor(hash12(Math.floor(i / bw), 5) * N), CW, 0);
  palR(o + Math.floor(hash12(Math.floor(j / (bw + 1)), 9) * N), CF, 0);
  const hw = heightAt(i, j, t, k);
  const hf = 0.5 * tw;
  const inW = step(Math.abs(fx), hf), inF = step(Math.abs(fy), hf);
  if (inW + inF < 0.5) { C[0] = pal.rgb[0] * 0.35; C[1] = pal.rgb[1] * 0.35; C[2] = pal.rgb[2] * 0.35; C[3] = 0; return; }
  const warp = inW * inF > 0.5 ? step(0, hw) : inW;
  let off: number, h: number, along: number;
  if (warp > 0.5) {
    const hn = heightAt(i, j + Math.sign(fy), t, k);
    h = hw + (hn - hw) * smoothstep(0, 1, Math.abs(fy));
    off = fx; along = uy;
  } else {
    const hn = -heightAt(i + Math.sign(fx), j, t, k);
    h = -hw + (hn + hw) * smoothstep(0, 1, Math.abs(fx));
    off = fy; along = ux;
  }
  const prof = Math.sqrt(Math.max(1 - (off / hf) * (off / hf), 0));
  let shade = prof * (0.42 + 0.58 * (0.5 + 0.5 * h));
  shade *= 1 - 0.22 * gnoise(along * 7, off * 9 + (warp > 0.5 ? i : j) * 3.1);
  const sheen = k[6] * Math.pow(prof, 6) * (0.5 + 0.5 * h);
  const col = warp > 0.5 ? CW : CF;
  const lc = col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114;
  for (let c = 0; c < 3; c++) C[c] = Math.min(1, Math.max(0, col[c] * (0.3 + 0.7 * shade) + sheen * 0.35));
  C[3] = Math.min(1, Math.max(0, shade * (0.55 + 0.45 * lc) + sheen * 0.5));
}

export const impl: AnalyticImpl = {
  glsl: TEJIDO_BANDAS_GLSL,
  prep: (_t, _k, p) => { pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
