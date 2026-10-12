import type { AnalyticImpl, Palette } from '../types';
import { PI, TAU, V2, fbm, fract, hash12, hash22, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { GRIETAS_ORO_GLSL } from './grietas_oro';

/** CPU twin of FC_grietas_oro, line by line. The palette arrives with prep (the shader's uPal / uPalN). */
const DEFAULT: Palette = { n: 4, rgb: new Float32Array([0.03, 0.03, 0.04, 0.16, 0.15, 0.16, 0.45, 0.43, 0.42, 0.9, 0.88, 0.85, 0, 0, 0, 0, 0, 0]) };
let pal: Palette = DEFAULT;

function ramp(x: number, ch: number): number {
  const n = Math.max(pal.n, 1);
  const f = Math.min(1, Math.max(0, x)) * (n - 1);
  const i = Math.floor(f), j = Math.min(i + 1, n - 1), w = f - i;
  return pal.rgb[i * 3 + ch] * (1 - w) + pal.rgb[j * 3 + ch] * w;
}

const METALS = [
  [[0.32, 0.1, 0], [0.85, 0.48, 0.07], [1, 0.8, 0.32], [1, 0.97, 0.85]],
  [[0.28, 0.05, 0.02], [0.8, 0.3, 0.1], [1, 0.62, 0.42], [1, 0.92, 0.85]],
  [[0.18, 0.2, 0.24], [0.55, 0.6, 0.68], [0.88, 0.92, 0.97], [1, 1, 1]],
  [[0.3, 0, 0], [0.9, 0.14, 0.02], [1, 0.55, 0.08], [1, 0.92, 0.55]],
];
/** go_metal: the molten metal by temperature (0 cold … 1 white hot), channel ch. */
export function grietasMetal(m: number, x: number, ch: number): number {
  const s = METALS[m > 0.5 && m < 1.5 ? 1 : m > 1.5 && m < 2.5 ? 2 : m > 2.5 ? 3 : 0];
  x = Math.min(1, Math.max(0, x)) * 3;
  return x < 1 ? s[0][ch] + (s[1][ch] - s[0][ch]) * x : x < 2 ? s[1][ch] + (s[2][ch] - s[1][ch]) * (x - 1) : s[2][ch] + (s[3][ch] - s[2][ch]) * (x - 2);
}

/** go_voro: F1, F2 and the lattice cells of the two nearest points, into VO = [f1, f2, i1x, i1y, i2x, i2y]. */
export const VO = new Float64Array(6);
export function grietasVoro(x: number, y: number): Float64Array {
  const nx = Math.floor(x), ny = Math.floor(y), fx = x - nx, fy = y - ny;
  let f1 = 8, f2 = 8, i1x = nx, i1y = ny, i2x = nx, i2y = ny;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    hash22(nx + i, ny + j);
    const ox = 0.15 + 0.7 * V2[0], oy = 0.15 + 0.7 * V2[1];
    const dx = i + ox - fx, dy = j + oy - fy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; i2x = i1x; i2y = i1y; f1 = d; i1x = nx + i; i1y = ny + j; } else if (d < f2) { f2 = d; i2x = nx + i; i2y = ny + j; }
  }
  VO[0] = f1; VO[1] = f2; VO[2] = i1x; VO[3] = i1y; VO[4] = i2x; VO[5] = i2y;
  return VO;
}

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;

let lx = NaN, ly = NaN, lt = NaN;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt) return;
  lx = px; ly = py; lt = t;
  const PX = PXc ?? currentPX();
  const metal = Math.floor(k[0] + 0.5), sc = k[1], wa = k[2], wd = k[3];
  const P = k[4], org = Math.floor(k[5] + 0.5), bleed = k[6], dust = k[7];
  const fine = k[8], jit = k[9], renew = k[10], heat = k[11];
  const cyc = Math.floor(t / P), ph = t / P - cyc;
  let shx = 0, shy = 0;
  if (renew > 0.5) { hash22(cyc + 1, 3.7); shx = 40 * V2[0]; shy = 40 * V2[1]; }
  let ox: number, oy: number;
  if (org < 0.5) { ox = 0; oy = 0; } else if (org < 1.5) { ox = -0.85; oy = -0.05; } else if (org < 2.5) { ox = 0.1; oy = -0.48; }
  else { hash22((renew > 0.5 ? cyc : 0) + 2, 9.1); ox = (V2[0] - 0.5) * 1.5; oy = (V2[1] - 0.5) * 0.8; }
  const dmax = Math.hypot(0.9 + Math.abs(ox), 0.5 + Math.abs(oy));
  const wx = fbm(px * 1.7 + shx, py * 1.7 + shy) - 0.5, wy = fbm(px * 1.7 + shx + 5.2, py * 1.7 + shy + 1.3) - 0.5;
  const pwx = px + wa * 0.35 * wx, pwy = py + wa * 0.35 * wy;
  grietasVoro(pwx * sc + shx, pwy * sc + shy);
  const f1a = VO[0], f2a = VO[1], i1x = VO[2], i1y = VO[3], j1x = VO[4], j1y = VO[5];
  const k2 = sc * 2.3;
  grietasVoro(pwx * k2 + shx + 11.7, pwy * k2 + shy + 11.7);
  const f1b = VO[0], f2b = VO[1], i2x = VO[2], i2y = VO[3], j2x = VO[4], j2y = VO[5];
  const e1 = (f2a - f1a) / sc, e2 = (f2b - f1b) / k2;
  const dist = Math.hypot(px - ox, py - oy);
  const r1 = 0.55 * Math.pow((dist + jit * 0.4 * hash12(i1x + j1x + 3.1, i1y + j1y + 3.1)) / (dmax + 0.4 * jit), 1.6);
  const r2 = r1 + 0.1 + 0.12 * jit * hash12(i2x + j2x + 7.3, i2y + j2y + 7.3);
  const a1 = ph - r1, a2 = ph - r2;
  const close = smoothstep(0.8, 1, ph);
  const W = PX * 0.6 + wd * 0.016;
  const o1 = smoothstep(0, 0.04, a1) * (1 - close), o2 = smoothstep(0, 0.04, a2) * (1 - close) * fine;
  const c1 = o1 * (1 - smoothstep(W * (0.55 + 0.45 * smoothstep(0, 0.3, a1)), W + PX, e1));
  const c2 = o2 * (1 - smoothstep(W * 0.45, W * 0.55 + PX, e2));
  const fill = Math.max(c1, c2);
  const cool = 0.08 + 0.3 * heat;
  let temp = Math.max(Math.exp(-Math.max(a1, 0) / cool) * (a1 < 0 ? 0 : 1), 0.8 * Math.exp(-Math.max(a2, 0) / cool) * (a2 < 0 ? 0 : 1));
  temp = Math.max(temp, 0.35 * heat);
  const sw = 0.85 + 0.15 * Math.sin(dist * 55 - ph * TAU * Math.floor(P * 0.6 + 1) + hash12(i1x, i1y) * 6.283);
  const reach = PX * 0.5 + bleed * 0.035 * (0.3 + 0.7 * smoothstep(0, 0.45, a1));
  let glow = o1 * Math.exp(-Math.max(e1 - W, 0) / reach) + 0.6 * o2 * Math.exp(-Math.max(e2 - W * 0.5, 0) / (reach * 0.6));
  glow = Math.min(glow, 1) * (0.5 + 0.5 * temp);
  const imp = (ph < 0.5 ? Math.exp(-ph * 25) : smoothstep(0.9, 1, ph)) * Math.exp(-(dist * dist) / 0.006);
  glow = Math.max(glow, imp);
  let sl = 0.04 + 0.11 * hash12(i1x + 0.5, i1y + 0.5) + 0.08 * (fbm(px * 5 + shx, py * 5 + shy) - 0.5);
  sl *= 0.88 + 0.12 * smoothstep(0, 0.03, e1);
  const dqx = px * 22, dqy = py * 22 - ph * Math.floor(P * 1.1 + 1);
  const dcx = Math.floor(dqx), dcy = Math.floor(dqy);
  hash22(dcx + shx + 1.3, dcy + shy + 1.3);
  const dpx = dcx + 0.2 + 0.6 * V2[0], dpy = dcy + 0.2 + 0.6 * V2[1];
  const life = fract(hash12(dcx + 4.1, dcy + 4.1) + ph * Math.floor(P * 0.3 + 1));
  let spark = (1 - smoothstep(0.12, 0.35, Math.hypot(dqx - dpx, dqy - dpy))) * Math.sin(PI * life) * dust * (1 - close);
  spark *= smoothstep(0.05, 0.5, glow + fill);
  const tm = 0.3 + 0.7 * temp, tg = 0.2 + 0.4 * temp;
  let ml = 0;
  for (let c = 0; c < 3; c++) {
    const stone = ramp(sl * 2.2, c) + grietasMetal(metal, tg, c) * glow * 0.7;
    const mc = grietasMetal(metal, tm, c) * sw;
    ml += [0.299, 0.587, 0.114][c] * mc;
    C[c] = Math.min(1, Math.max(0, stone * (1 - fill) + mc * fill + grietasMetal(metal, 0.85, c) * spark));
  }
  const lum = (sl + glow * 0.5) * (1 - fill) + (0.55 + 0.5 * ml) * sw * fill + spark * 0.8;
  C[3] = Math.min(1, Math.max(0, lum));
}

export const impl: AnalyticImpl = {
  glsl: GRIETAS_ORO_GLSL,
  prep: (_t, _k, p, px) => { pal = p && p.n ? p : DEFAULT; PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
