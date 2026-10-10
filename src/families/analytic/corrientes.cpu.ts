import type { AnalyticImpl, Palette } from '../types';
import { V2, gnoise, hash22, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/patterns';
import { CORRIENTES_GLSL } from './corrientes';

/** CPU twin of FC_corrientes, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 3, rgb: new Float32Array([0.05, 0.09, 0.2, 0.9, 0.3, 0.6, 0.35, 0.9, 0.95, 0, 0, 0, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;
let lo = 0, hi = 1;

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const n = Math.min(8, Math.max(2, Math.floor(k[0] + 0.5))), sw = k[1], wa = k[2], T = t * k[3];
  let ux = x / k[4], uy = y / k[4];
  // grain is per cell: the cell size the engine draws this layer at (the shader's PX)
  const px = Math.max(currentPX(), 1e-4);
  hash22(Math.floor(x / px) + 17, Math.floor(y / px) + 17);
  ux += k[6] * 0.045 * (V2[0] - 0.5); uy += k[6] * 0.045 * (V2[1] - 0.5);
  const fall = 1 / (1 + 1.5 * (ux * ux + uy * uy));
  ux += wa * 0.16 * fall * Math.sin(uy * 3.1 + T * 1.17);
  uy += wa * 0.13 * fall * Math.sin(ux * 2.6 - T * 0.93);
  ux += wa * 0.07 * fall * Math.sin(uy * 5.3 - T * 0.71 + 1.9);
  uy += wa * 0.06 * fall * Math.sin(ux * 4.7 + T * 0.53 + 4.1);
  const ang = sw * 2.6 * Math.hypot(ux, uy) * Math.cos(T * 0.19 + 0.7), ca = Math.cos(ang), sa = Math.sin(ang);
  // GLSL rot2 = mat2(c, -s, s, c) * p (column-major): (c·x + s·y, −s·x + c·y)
  const rx = ca * ux + sa * uy, ry = -sa * ux + ca * uy;
  const pw = 2 + (6.5 - 2) * k[5];
  let ar = 0, ag = 0, ab = 0, ws = 0, wmax = 0;
  for (let i = 0; i < n; i++) {
    const a = (i * 0.6180339) % 1, b = (i * 0.4142136 + 0.31) % 1;
    let cx = 0.82 * Math.sin(T * (0.23 + 0.19 * a) + i * 2.39), cy = 0.4 * Math.sin(T * (0.17 + 0.15 * b) + i * 1.31 + 1.1);
    cx += 0.12 * Math.sin(T * (0.61 + 0.2 * b) + i); cy += 0.12 * Math.cos(T * (0.53 + 0.2 * a) + i * 2);
    const d = Math.hypot(rx - cx, ry - cy);
    const w = 1 / (Math.pow(d, pw) + 1e-3);
    const j = (i % Math.max(pal.n, 1)) * 3;
    ar += w * pal.rgb[j]; ag += w * pal.rgb[j + 1]; ab += w * pal.rgb[j + 2];
    ws += w; if (w > wmax) wmax = w;
  }
  C[0] = ar / ws; C[1] = ag / ws; C[2] = ab / ws;
  const lum = Math.min(1, Math.max(0, (C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114 - lo) / Math.max(hi - lo, 0.08)));
  const edge = 1 - smoothstep(0.42, 0.94, wmax / ws);
  let g = k[7] < 0.5 ? lum : k[7] < 1.5 ? edge : Math.max(lum * 0.85, edge);
  g += k[6] * 0.5 * (gnoise(rx * 9 + T * 0.7, ry * 9 - T * 0.5) - 0.5) * (0.35 + 0.65 * g);
  C[3] = Math.min(1, Math.max(0, g));
}

export const impl: AnalyticImpl = {
  glsl: CORRIENTES_GLSL,
  prep: (_t, _k, p) => {
    pal = p && p.n ? p : DEFAULT;
    lo = 1; hi = 0;
    for (let i = 0; i < pal.n; i++) { const l = pal.rgb[i * 3] * 0.299 + pal.rgb[i * 3 + 1] * 0.587 + pal.rgb[i * 3 + 2] * 0.114; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    lx = NaN;
  },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
