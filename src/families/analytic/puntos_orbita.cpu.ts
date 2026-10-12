import type { AnalyticImpl, Palette } from '../types';
import { TAU, V2, hash13, hash22, mod, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { PUNTOS_ORBITA_GLSL } from './puntos_orbita';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of FC_puntos_orbita, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.08, 0.1, 0.2, 0.2, 0.6, 0.9, 0.95, 0.5, 0.3, 0.95, 0.9, 0.7, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

/** The colour step of a site, as an index of the palette (po_step). */
export const levelOf = (ix: number, iy: number, steps: number) => Math.floor(hash13(ix, iy, 1) * steps) / Math.max(steps - 1, 1);
export function stepOf(ix: number, iy: number, steps: number): number {
  const N = Math.max(pal.n, 1);
  return Math.floor(levelOf(ix, iy, steps) * (N - 1) + 0.5);
}

/**
 * Where a site and its dot are at time t, in the units of the cells (the square (ix, iy) spans [ix, ix + 1)):
 * out = [site x, site y, dot x, dot y, orbit radius, dot size].
 */
export function orbitOf(ix: number, iy: number, t: number, k: Float32Array, out: Float64Array) {
  hash22(ix, iy);
  const sx = ix + 0.5 + (V2[0] - 0.5) * k[7], sy = iy + 0.5 + (V2[1] - 0.5) * k[7];
  const dir = hash13(ix, iy, 2) < 0.5 ? -1 : 1;
  const w = dir * k[2] * (0.5 + hash13(ix, iy, 3)) * 1.6;
  const a = w * t + TAU * hash13(ix, iy, 4);
  const R = k[1] * 0.42 * (0.55 + 0.45 * hash13(ix, iy, 5));
  out[0] = sx; out[1] = sy; out[2] = sx + R * Math.cos(a); out[3] = sy + R * Math.sin(a); out[4] = R;
  out[5] = k[3] * 0.34 * (1 - k[4] * 0.7 * hash13(ix, iy, 6)) * (0.88 + 0.12 * Math.sin(t * 1.9 + TAU * hash13(ix, iy, 7)));
  return out;
}

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4), O = new Float64Array(6);

function eval4(x: number, y: number, t: number, k: Float32Array) {
  if (x === lx && y === ly && t === lt) return;
  lx = x; ly = y; lt = t;
  const ux = x / k[0] + k[9] * t * 0.07, uy = y / k[0] + k[9] * t * 0.03;
  const nx = Math.floor(ux), ny = Math.floor(uy);
  const tw = Math.max(0.04, (0.6 * pxNow()) / k[0]);
  let d1 = 9, d2 = 9, dv = 0, tr = 0, c1x = nx, c1y = ny, cdx = nx, cdy = ny;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ix = nx + i, iy = ny + j;
    orbitOf(ix, iy, t, k, O);
    const rx = ux - O[0], ry = uy - O[1];
    const d = rx * rx + ry * ry;
    if (d < d1) { d2 = d1; d1 = d; c1x = ix; c1y = iy; } else if (d < d2) d2 = d;
    const sz = O[5];
    const v = 1 - smoothstep(sz * 0.5, sz, Math.hypot(ux - O[2], uy - O[3]));
    if (v > dv) { dv = v; cdx = ix; cdy = iy; }
    tr = Math.max(tr, 1 - smoothstep(0.5 * tw, tw, Math.abs(Math.sqrt(d) - O[4])));
  }
  const steps = k[5];
  const a = Math.floor(mod(stepOf(c1x, c1y, steps), Math.max(pal.n, 1))) * 3, b = Math.floor(mod(stepOf(cdx, cdy, steps), Math.max(pal.n, 1))) * 3;
  const e = 1 - smoothstep(0, 0.07, Math.sqrt(d2) - Math.sqrt(d1));
  const bgl = Math.max(k[6] * (0.22 + 0.3 * levelOf(c1x, c1y, steps)) + k[8] * 0.4 * e, k[10] * 0.38 * tr);
  for (let c = 0; c < 3; c++) { const cc = pal.rgb[a + c] * (0.35 + 0.65 * k[6]); C[c] = cc + (pal.rgb[b + c] - cc) * dv; }
  C[3] = Math.min(1, Math.max(0, Math.max(bgl, dv * (0.7 + 0.3 * hash13(cdx, cdy, 8)))));
}

export const impl: AnalyticImpl = {
  glsl: PUNTOS_ORBITA_GLSL,
  prep: (_t, _k, p, px) => { PXc = px ?? null; pal = p && p.n ? p : DEFAULT; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
