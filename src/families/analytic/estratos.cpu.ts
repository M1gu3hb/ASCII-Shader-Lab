import type { AnalyticImpl, Palette } from '../types';
import { PI, TAU, fbm, gnoise, hash12, mod, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { ESTRATOS_GLSL } from './estratos';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of FC_estratos, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 5, rgb: new Float32Array([0.12, 0.07, 0.05, 0.55, 0.3, 0.15, 0.8, 0.6, 0.35, 0.45, 0.5, 0.4, 0.92, 0.85, 0.7, 0, 0, 0]) };
let pal: Palette = DEFAULT;

/** The depth whose level sets are the layers (st_z). */
export function depth(x: number, y: number, t: number, k: Float32Array): number {
  const tc = t * k[9];
  const kf = TAU / (0.45 + 1.3 * k[2]);
  let z = y;
  z += k[1] * 0.1 * Math.sin(x * kf + tc * 0.35) * (0.65 + 0.35 * Math.sin(y * 4.1 + 1.3)) * (1 + 0.45 * Math.sin(x * kf * 0.41 + 2));
  z += k[3] * 0.16 * (fbm(x * 1.9 + tc * 0.04, y * 1.9 + 3.1) - 0.5);
  for (let f = 0; f < 4; f++) {
    if (f >= k[4]) break;
    const cx = hash12(f, 11) * 1.4 - 0.7, cy = hash12(f, 13) * 0.5 - 0.25;
    const a = (hash12(f, 17) - 0.5) * 1.1 + PI * 0.5;
    const nx = Math.sin(a), ny = -Math.cos(a);
    const d = (x - cx) * nx + (y - cy) * ny;
    const D = k[5] * 0.1 * (0.55 + 0.45 * hash12(f, 19)) * (1 + 0.35 * Math.sin(tc * 0.3 + f * 2.1));
    z += D * smoothstep(-0.003, 0.003, d) + D * 0.45 * Math.sign(d) * Math.exp(-Math.abs(d) / 0.035);
  }
  return z + k[7] * t * 0.03;
}

/** The layer index at a point (s in FC_estratos). */
export function layerAt(x: number, y: number, t: number, k: Float32Array): number {
  const u = depth(x, y, t, k) * k[0];
  return Math.floor(u + 0.3 * Math.sin(u * 0.9) + 0.15 * Math.sin(u * 2.3 + 1));
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const u = depth(x, y, t, k) * k[0];
  const g = u + 0.3 * Math.sin(u * 0.9) + 0.15 * Math.sin(u * 2.3 + 1);
  const s = Math.floor(g), f = g - s;
  const N = Math.max(pal.n - 1, 1), o = pal.n > 1.5 ? 1 : 0;
  const idx = o + mod(s + Math.floor(hash12(Math.floor(s / N), 7) * N), N);
  const j = Math.floor(idx) * 3;
  C[0] = pal.rgb[j]; C[1] = pal.rgb[j + 1]; C[2] = pal.rgb[j + 2];
  const base = 0.45 + 0.55 * hash12(s, 23);
  const PX = pxNow();
  const grain = 1 - k[6] * (0.55 * fbm(x * 24 + s * 3.7, y * 24 + s * 3.7) + 0.35 * gnoise((x / PX) * 0.9 + 41, (y / PX) * 0.9 + 41) - 0.45);
  const edge = smoothstep(0, 0.1, f) * smoothstep(1, 0.9, f);
  C[3] = Math.min(1, Math.max(0, base * grain * (1 - k[8] * (1 - edge))));
}

export const impl: AnalyticImpl = {
  glsl: ESTRATOS_GLSL,
  prep: (_t, _k, p, px) => { PXc = px ?? null; pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
