import type { AnalyticImpl, Palette } from '../types';
import { fract, gnoise, hash12, mod, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { ESTATICA_VHS_GLSL } from './estatica_vhs';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of FC_estatica_vhs, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 3, rgb: new Float32Array([0.05, 0.05, 0.1, 0.9, 0.2, 0.6, 0.2, 0.9, 0.9, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

const BARS = [[0.75, 0.75, 0.75], [0.75, 0.75, 0], [0, 0.75, 0.75], [0, 0.75, 0], [0.75, 0, 0.75], [0.75, 0, 0], [0, 0, 0.75]];
const BOTTOM = [[0, 0.13, 0.3], [0.95, 0.95, 0.95], [0.22, 0, 0.45], [0.03, 0.03, 0.03], [0.1, 0.1, 0.1], [0.03, 0.03, 0.03]];

/** One channel of a bar (es_bar). */
function bar(b: number, usePal: number, c: number): number {
  if (usePal > 0.5) return pal.rgb[Math.floor(mod(b, Math.max(pal.n, 1))) * 3 + c];
  return BARS[Math.min(6, Math.max(0, Math.floor(b + 0.5)))][c];
}

/** One channel of the card at (qx, qy) (es_card). */
export function card(qx: number, qy: number, usePal: number, c: number): number {
  const u = Math.min(0.9999, Math.max(0, (qx + 0.9) / 1.8));
  const b = Math.floor(u * 7);
  if (qy > -0.16) return bar(b, usePal, c);
  if (qy > -0.24) return mod(b, 2) < 0.5 ? bar(6 - b, usePal, c) : 0.05;
  return BOTTOM[Math.floor(u * 6)][c];
}

/** How far the content of column x has sunk at T (es_melt). */
export function melt(x: number, T: number, k: Float32Array): number {
  const w = k[2];
  const ci = Math.floor(x / w), fx = fract(x / w) - 0.5;
  const s = hash12(ci, 2) * 0.33 * k[0];
  const r = 0.25 + 0.75 * hash12(ci, 4);
  const a = Math.max(T - s, 0) / k[0];
  return k[1] * r * 0.62 * Math.pow(Math.min(1, Math.max(0, a / 0.8)), 1.7) * (1 - 1.2 * fx * fx);
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y0: number, t: number, k: Float32Array) {
  if (x === lx && y0 === ly && t === lt) return;
  lx = x; ly = y0; lt = t;
  const PX = pxNow();
  const P = k[0], T = mod(t, P), usePal = k[8];
  const row = Math.floor(y0 / PX + 0.125);
  const fr = Math.floor(T * 15);
  const cut = smoothstep(P - 0.8, P - 0.05, T) * k[7];
  const y = y0 + 1.3 * cut * cut + k[7] * 0.014 * (hash12(fr, 5) - 0.5);
  const tear = step(hash12(row, fr), k[3] * 0.06) * (hash12(row + 0.5, fr) - 0.5) * 0.4;
  const yb = 0.58 - fract((2 * T) / P) * 1.25;
  const band = Math.exp(-Math.pow((y0 - yb) / 0.04, 2)) * k[3];
  const xs = x + tear + band * (gnoise(y0 * 40, fr) - 0.5) * 0.3;
  const qy = y + melt(xs, T, k) * smoothstep(0.6, -0.4, y);
  const ch = 0.018 * k[6];
  C[0] = card(xs + ch, qy, usePal, 0); C[1] = card(xs, qy, usePal, 1); C[2] = card(xs - ch, qy, usePal, 2);
  const sn = gnoise((x / PX) * 1.4 + fr * 17.3, y0 / PX + fr * 7.1);
  const sa = Math.min(1, Math.max(0, k[5] * 0.3 + band * 0.9 + cut));
  const sc = 1 - k[4] * 0.32 * mod(row, 2);
  const glow = k[4] * 0.2 * Math.exp(-Math.pow((y0 - (0.62 - fract((3 * T) / P) * 1.25)) / 0.05, 2));
  for (let c = 0; c < 3; c++) C[c] = Math.min(1, Math.max(0, (C[c] + (sn * 0.9 - C[c]) * sa) * sc + glow));
  C[3] = Math.min(1, Math.max(0, Math.max((C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114) * 1.25, Math.max(C[0], C[1], C[2]) * 0.45)));
}

export const impl: AnalyticImpl = {
  glsl: ESTATICA_VHS_GLSL,
  prep: (_t, _k, p, px) => { PXc = px ?? null; pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
