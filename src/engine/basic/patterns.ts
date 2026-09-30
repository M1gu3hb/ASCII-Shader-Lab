/**
 * CPU ports of the pattern chunks in ../glsl/patterns.ts, one function per pattern:
 *   f(x, y, t, a, b) → luminance 0..1
 * (x, y): centred coordinates in screen heights, y up; t: layer time in seconds; a/b: shape parameters.
 * Each is a line-by-line translation of its GLSL twin (same constants, same GLSL semantics for
 * mod/step/smoothstep/atan/pow). `setPX` plays the role of the GLSL global PX (one cell in p units).
 * `prep(t, a, b)` hoists per-frame work that does not depend on the pixel (rotation matrices, curve
 * points, blob centres); the field pass calls it once per layer before the cell loop.
 */
import {
  PI, TAU, V2, clamp, fbm, fbm3, fract, gnoise, gpow, hard, hash11, hash12, hash13, hash22, mix, mod, rotXY, sat, smoothstep, step, vnoise,
  voro,
} from './core';
import { EXTRA_BASIC, setExtraPX } from './patterns-extra';
import { NEXT_BASIC, setNextPX } from './patterns-next';

export type PatternFn = (x: number, y: number, t: number, a: number, b: number) => number;
export interface BasicPattern {
  f: PatternFn;
  prep?: (t: number, a: number, b: number) => void;
}

let PX = 0.02;
/** Size of one cell in pattern units for the layer being evaluated (GLSL: PX = uCellP * scale). */
export function setPX(v: number) { PX = Math.fround(v); setExtraPX(v); setNextPX(v); }

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const f32 = Math.fround;
/** floor of a float32 value: the GPU rounds p·k to float32 before flooring, which decides exact-boundary cells. */
const ffloor = (v: number) => Math.floor(f32(v));

/* ------------------------------------------------------------------ */
/* Organic                                                            */
/* ------------------------------------------------------------------ */

const nube: PatternFn = (x, y, t, a, b) => {
  const dx = Math.cos(b * TAU) * t * 0.06, dy = Math.sin(b * TAU) * t * 0.06;
  const s = 1.3 + a * 2.6;
  const v = fbm3(x * s + dx, y * s + dy, t * 0.11);
  return smoothstep(0.3 - a * 0.08, 0.72, v);
};

const marmol: PatternFn = (x, y, t, a, b) => {
  const s = 1.2 + b * 2;
  const qx = x * s, qy = y * s;
  const w1x = fbm(qx, qy + t * 0.08), w1y = fbm(qx + 5.2 - t * 0.07, qy + 1.3 - t * 0.07);
  const bx = qx + 3.5 * w1x, by = qy + 3.5 * w1y;
  const w2x = fbm(bx + 1.7 + t * 0.05, by + 9.2 + t * 0.05), w2y = fbm(bx + 8.3, by + 2.8);
  const k = 2 + a * 4;
  return smoothstep(0.2, 0.8, fbm(qx + k * w2x, qy + k * w2y));
};

const crestas: PatternFn = (x, y, t, a, b) => {
  const s = 1.2 + b * 2.5;
  const qx = x * s + t * 0.03, qy = y * s + t * 0.07;
  let sum = 0, amp = 0.6, f = 1, w = 1;
  const e = 1.5 + a * 5;
  for (let i = 0; i < 5; i++) {
    let n = 1 - Math.abs(gnoise(qx * f + i * 7.13, qy * f + i * 7.13) * 2 - 1);
    n = gpow(n, e);
    sum += n * amp * w; w = clamp(n * 1.6, 0, 1); amp *= 0.5; f *= 2.05;
  }
  return sat(sum * 1.15);
};

const fuego: PatternFn = (x, y, t, a, b) => {
  const qx = x * 2.4, qy = y * 1.7 - t * (1.1 + b * 0.8);
  const n = fbm(qx, qy + fbm(qx * 1.6 + 3.1, qy * 1.6 - t * 0.5) * (0.6 + b * 0.9));
  const base = y + 0.56 - a * 0.3;
  return sat(n * 1.75 - base * 1.25);
};

const aurora: PatternFn = (x, y, t, a, b) => {
  let v = 0;
  for (let i = 0; i < 3; i++) {
    const fi = i;
    const y0 = 0.12 * Math.sin(x * (1.3 + fi * 0.6) + t * (0.25 + fi * 0.1) + fi * 2.1)
      + 0.18 * (fbm(x * 1.4 + fi * 4.3, t * 0.08) - 0.5) + (fi - 1) * (0.06 + a * 0.14);
    const d = y - y0;
    const band = Math.exp(-d * d * (30 + b * 140));
    const rays = 0.55 + 0.45 * gnoise(x * (14 + fi * 3), fi * 9 + t * 0.3);
    const up = smoothstep(-0.02, 0.25, d) * Math.exp(-Math.max(d, 0) * 6);
    v += (band * 0.85 + up * 0.35 * rays) * (1 - fi * 0.18);
  }
  return sat(v);
};

const causticas: PatternFn = (x, y, t, a, b) => {
  const s = TAU * (0.6 + a * 1.2);
  const qx = x * s - 250, qy = y * s - 250;
  let ix = qx, iy = qy, c = 1;
  for (let n = 0; n < 4; n++) {
    const tt = t * 0.45 * (1 - 3.5 / (n + 1));
    const nx = qx + Math.cos(tt - ix) + Math.sin(tt + iy);
    const ny = qy + Math.sin(tt - iy) + Math.cos(tt + ix);
    ix = nx; iy = ny;
    c += 1 / len(qx / (Math.sin(ix + tt) / 0.005), qy / (Math.cos(iy + tt) / 0.005));
  }
  c /= 4;
  c = 1.17 - gpow(c, 1.4);
  return sat(Math.pow(Math.abs(c), 2.2 + b * 4) * 1.25);
};

const LAVA = new Float64Array(14);
const lava: BasicPattern = {
  prep(t) {
    for (let i = 0; i < 7; i++) {
      LAVA[i * 2] = 0.78 * Math.sin(t * (0.23 + i * 0.061) + i * 1.93);
      LAVA[i * 2 + 1] = 0.4 * Math.cos(t * (0.19 + i * 0.083) + i * 2.71);
    }
  },
  f(x, y, _t, a, b) {
    let s = 0;
    const k = 0.01 + a * 0.022;
    for (let i = 0; i < 7; i++) {
      const dx = x - LAVA[i * 2], dy = y - LAVA[i * 2 + 1];
      s += k / (dx * dx + dy * dy + 0.0004);
    }
    return smoothstep(0.55, 1.2 + b * 2.6, s);
  },
};

const celulas: PatternFn = (x, y, t, a, b) => {
  const k = 2 + a * 6;
  voro(x * k, y * k, t * 0.7);
  const f1 = V2[0], f2 = V2[1];
  const core = gpow(sat(1 - f1 * 1.15), 1 + b * 3);
  const rim = smoothstep(0.02, 0.18, f2 - f1);
  return sat(core * mix(1, rim, 0.6));
};

const grietas: PatternFn = (x, y, t, a, b) => {
  const k = 2 + a * 6;
  voro(x * k, y * k, t * 0.45);
  const w = PX * k * (1 + b * 3);
  return 1 - smoothstep(w * 0.3, w, V2[1] - V2[0]);
};

/* ------------------------------------------------------------------ */
/* Geometric                                                          */
/* ------------------------------------------------------------------ */

const anillos: PatternFn = (x, y, t, a, b) => hard(0.5 + 0.5 * Math.sin(len(x, y) * (8 + a * 44) - t * 3), b);

const cuadros: PatternFn = (x, y, t, a, b) =>
  hard(0.5 + 0.5 * Math.sin(Math.max(Math.abs(x), Math.abs(y)) * (8 + a * 40) - t * 3), b);

const rayos: PatternFn = (x, y, t, a, b) => {
  const an = Math.atan2(y, x), r = len(x, y);
  const v = 0.5 + 0.5 * Math.sin(an * Math.floor(3 + a * 20) + t * 1.2 + r * (b - 0.5) * 24);
  return v * sat(1.2 - r * 0.7);
};

const tablero: PatternFn = (x, y, t, a, b) => {
  const s = 3 + a * 12;
  let qx = f32(x * s), qy = f32(y * s);
  const ox = b * 0.9 * Math.sin(qy * 0.8 + t), oy = b * 0.9 * Math.cos(qx * 0.8 - t * 0.8);
  qx += ox; qy += oy;
  return mod(ffloor(qx) + ffloor(qy), 2);
};

const truchet: PatternFn = (x, y, t, a, b) => {
  const k = 3 + a * 9;
  const qx = f32(x * k), qy = f32(y * k);
  const idx = Math.floor(qx), idy = Math.floor(qy);
  let fx = qx - idx - 0.5;
  const fy = qy - idy - 0.5;
  const sh = Math.floor(t * 0.35 + hash12(idx * 1.7, idy * 1.7) * 3) * 0.37;
  const flip = step(0.5, hash12(idx + sh, idy + sh));
  if (flip > 0.5) fx = -fx;
  const d = Math.min(Math.abs(len(fx - 0.5, fy - 0.5) - 0.5), Math.abs(len(fx + 0.5, fy + 0.5) - 0.5));
  const w = 0.04 + b * 0.16 + PX * k * 0.4;
  return 1 - smoothstep(w, w + PX * k * 0.9, d);
};

const hex: PatternFn = (x, y, t, a, b) => {
  const s = 3 + a * 12;
  const px = f32(x * s), py = f32(y * s);
  // hexCell(p)
  const SY = 1.7320508;
  const hcx = Math.floor(px) + 0.5, hcy = ffloor(py / SY) + 0.5;
  const hcz = ffloor(px - 0.5) + 0.5, hcw = ffloor(f32(py - 1) / SY) + 0.5;
  const h1x = px - hcx, h1y = py - hcy * SY;
  const h2x = px - (hcz + 0.5), h2y = py - (hcw + 0.5) * SY;
  let hx: number, hy: number, idx: number, idy: number;
  if (h1x * h1x + h1y * h1y < h2x * h2x + h2y * h2y) { hx = h1x; hy = h1y; idx = hcx; idy = hcy; }
  else { hx = h2x; hy = h2y; idx = hcz + 0.5; idy = hcw + 0.5; }
  const qx = Math.abs(hx), qy = Math.abs(hy);
  const d = Math.max(qx * 0.5 + qy * 0.8660254, qx);
  const ph = hash12(idx, idy);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.8 + ph * TAU + len(idx, idy) * 0.35);
  const edge = smoothstep(0.5, 0.5 - 0.04 - b * 0.3, d);
  return edge * mix(0.25, 1, pulse);
};

const R45 = 0.7854, C45 = Math.cos(R45), S45 = Math.sin(R45);
const trama: PatternFn = (x, y, t, a, b) => {
  const sc = 4 + a * 10;
  // q = rot2(p, .7854) * sc
  const qx = (C45 * x + S45 * y) * sc, qy = (-S45 * x + C45 * y) * sc;
  const idx = Math.floor(qx) + 0.5, idy = Math.floor(qy) + 0.5;
  // c = rot2(id / sc, -.7854)
  const ux = idx / sc, uy = idy / sc;
  const cx = C45 * ux - S45 * uy, cy = S45 * ux + C45 * uy;
  let tone = 0.5 + 0.5 * Math.sin(cx * 2.6 + t * 0.9) * Math.cos(cy * 3.1 - t * 0.6);
  if (b !== 0) tone = mix(tone, smoothstep(0.25, 0.75, fbm(cx * 1.6 + t * 0.05, cy * 1.6 - t * 0.03)), b);
  const r = Math.sqrt(tone) * 0.64;
  return 1 - smoothstep(r - 0.1, r + 0.1, len(qx - idx, qy - idy));
};

const moire: PatternFn = (x, y, t, a, b) => {
  const f = 18 + a * 50;
  const l1 = 0.5 + 0.5 * Math.sin(x * f);
  const an = 0.03 + 0.25 * b * Math.sin(t * 0.15) + 0.015 * Math.sin(t * 0.5);
  const c = Math.cos(an), s = Math.sin(an);
  const qx = (c * x + s * y) * (1 + 0.03 * Math.sin(t * 0.23));
  return l1 * (0.5 + 0.5 * Math.sin(qx * f));
};

const rombos: PatternFn = (x, y, t, a, b) => {
  const s = 1.5 + a * 6;
  const qx = f32(x * s), qy = f32(y * s);
  const fx = fract(qx) - 0.5, fy = fract(qy) - 0.5;
  const z = Math.abs(fx) + Math.abs(fy);
  return 0.5 + 0.5 * Math.sin(z * TAU * (1 + b * 2) - t * 2.2 + len(Math.floor(qx), Math.floor(qy)) * 0.6);
};

const franjas: PatternFn = (x, y, t, a, b) => {
  const k = 6 + a * 34;
  const v = 0.5 + 0.5 * Math.sin((x + y * (b * 2 - 1)) * k - t * 2.5 + Math.sin(y * 2.4 + t * 0.7) * 0.8);
  return hard(v, 0.55);
};

const caleido: PatternFn = (x, y, t, a, b) => {
  const n = Math.floor(3 + a * 9);
  let an = Math.atan2(y, x) + t * 0.05;
  const r = len(x, y);
  const seg = TAU / n;
  an = mod(an, seg); an = Math.abs(an - seg * 0.5);
  const s = 2.5 + b * 5;
  return smoothstep(0.3, 0.72, fbm(Math.cos(an) * r * s + t * 0.12, Math.sin(an) * r * s - t * 0.09));
};

/* ------------------------------------------------------------------ */
/* Waves                                                              */
/* ------------------------------------------------------------------ */

const ondas: PatternFn = (x, y, t, a, b) =>
  0.5 + 0.5 * Math.sin(x * (4 + a * 10) + Math.sin(y * 3.2 + t * 0.9) * (0.5 + b * 2.2) + t * 1.4);

const interferencia: PatternFn = (x, y, t, a, b) => {
  const ox = (0.2 + b * 0.5) * Math.sin(t * 0.5), oy = 0.2 * Math.cos(t * 0.4);
  const f = 14 + a * 40;
  return 0.5 + 0.25 * (Math.sin(len(x - ox, y - oy) * f - t * 2) + Math.sin(len(x + ox, y + oy) * f - t * 2));
};

const plasma: PatternFn = (x, y, t, a, b) => {
  const s = 2 + a * 5;
  const an = b * len(x, y) * 3, c = Math.cos(an), sn = Math.sin(an);
  const px = x * s, py = y * s;
  const qx = c * px + sn * py, qy = -sn * px + c * py;
  const v = Math.sin(qx + t) + Math.sin(qy * 1.1 + t * 1.3) + Math.sin((qx + qy) * 0.75 + t * 0.7)
    + Math.sin(len(qx + Math.sin(t * 0.3) * 2, qy + Math.cos(t * 0.4) * 2) - t * 1.2);
  return sat(0.5 + 0.19 * v);
};

// 72 segments of the curve; the endpoints only depend on time, so they are computed once per layer.
const LIS_AX = new Float64Array(72), LIS_AY = new Float64Array(72), LIS_BX = new Float64Array(72), LIS_BY = new Float64Array(72), LIS_K = new Float64Array(72);
const lissajous: BasicPattern = {
  prep(t, a, b) {
    const fa = Math.floor(1 + a * 5), fb = Math.floor(2 + b * 5), ph = t * 0.35;
    let px = 0.72 * Math.sin(ph), py = 0;
    for (let i = 1; i <= 72; i++) {
      const s = (i / 72) * TAU;
      const cx = 0.72 * Math.sin(fa * s + ph), cy = 0.4 * Math.sin(fb * s);
      const k = i - 1, bx = cx - px, by = cy - py;
      LIS_AX[k] = px; LIS_AY[k] = py; LIS_BX[k] = bx; LIS_BY[k] = by; LIS_K[k] = 1 / (bx * bx + by * by);
      px = cx; py = cy;
    }
  },
  f(x, y) {
    let d2 = 1e6;
    for (let k = 0; k < 72; k++) {
      const pax = x - LIS_AX[k], pay = y - LIS_AY[k], bx = LIS_BX[k], by = LIS_BY[k];
      const h = clamp((pax * bx + pay * by) * LIS_K[k], 0, 1);
      const dx = pax - bx * h, dy = pay - by * h, e = dx * dx + dy * dy;
      if (e < d2) d2 = e;
    }
    const d = Math.min(1e3, Math.sqrt(d2));
    return sat(1 - smoothstep(PX * 0.4, PX * 1.3, d) + 0.5 * Math.exp(-d * 18));
  },
};

const ecualizador: PatternFn = (x, y, t, a, b) => {
  const n = Math.floor(10 + a * 44);
  const xx = f32(f32(f32(x + 0.95) / 1.9) * n);
  const id = Math.floor(xx), f = xx - id;
  const h = 0.08 + 0.82 * gpow(gnoise(id * 0.43, t * 1.7), 1.6) * (0.75 + 0.25 * Math.sin(t * 3 + id));
  const yy = y + 0.5;
  const gap = 0.1 + b * 0.35;
  const col = step(gap, f) * step(f, 1 - gap * 0.5);
  const bar = step(yy, h) * col * step(0.28, fract(yy * 22));
  const peak = step(Math.abs(yy - h - 0.025), 0.012) * col;
  return sat(bar * (0.45 + (0.55 * yy) / Math.max(h, 0.01)) + peak);
};

// The ridge heights only depend on x (and time), so consecutive cells of a column share them.
const HOR = new Float64Array(40);
let horKey = NaN, horT = NaN, horA = NaN, horB = NaN;
const horizonte: BasicPattern = {
  prep() { horKey = NaN; },
  f(x, y, t, a, b) {
    const L = 8 + Math.floor(a * 16);
    if (x !== horKey || t !== horT || a !== horA || b !== horB) {
      horKey = x; horT = t; horA = a; horB = b;
      const env = Math.exp(-x * x * (5 + b * 16));
      for (let k = 0; k < L; k++) {
        const yk = -0.4 + (k / L) * 0.78;
        const n = gnoise(x * 7 + k * 3.17, t * 0.3 + k * 0.71);
        const n2 = gnoise(x * 17 + k * 1.3, k);
        HOR[k] = yk + env * (0.02 + 0.48 * gpow(n, 3) + 0.02 * n2);
      }
    }
    let v = 0;
    const w = PX * 0.5;
    for (let k = L - 1; k >= 0; k--) {
      const c = HOR[k];
      if (y < c - w) v = 0;
      if (Math.abs(y - c) < w) v = 1;
    }
    return v;
  },
};

const radar: PatternFn = (x, y, t, a, b) => {
  const r = len(x, y), an = Math.atan2(y, x);
  const sw = fract((t * 1.4 - an) / TAU);
  const trail = Math.pow(1 - sw, 1.5 + a * 10);
  const k = 3 + b * 6;
  const rd = Math.abs(fract(r * k + 0.5) - 0.5) / k;
  const rings = 1 - smoothstep(0, PX * 1.2, rd);
  const axes = 1 - smoothstep(0, PX, Math.min(Math.abs(x), Math.abs(y)));
  const gx = f32(x * 9), gy = f32(y * 9), bx = Math.floor(gx), by = Math.floor(gy);
  let blip = step(0.93, hash12(bx, by));
  if (blip > 0) {
    blip *= smoothstep(0.2, 0, len(gx - bx - 0.5, gy - by - 0.5))
      * Math.pow(1 - fract((t * 1.4 - Math.atan2(by + 0.5, bx + 0.5)) / TAU), 2);
  }
  return sat((trail * 0.85 + rings * 0.3 + axes * 0.2 + blip) * step(r, 0.47));
};

/* ------------------------------------------------------------------ */
/* Space                                                              */
/* ------------------------------------------------------------------ */

const tunel: PatternFn = (x, y, t, a, b) => {
  const r = Math.max(len(x, y), 0.001), an = Math.atan2(y, x) / TAU;
  const z = 0.35 / r + t * (0.4 + b * 1.2);
  const v = 0.5 + 0.5 * Math.sin(an * TAU * Math.floor(3 + a * 9)) * Math.sin(z * TAU);
  return v * smoothstep(0, 0.45, r);
};

const espiral: PatternFn = (x, y, t, a, b) =>
  0.5 + 0.5 * Math.sin(Math.atan2(y, x) * Math.floor(1 + a * 6) + len(x, y) * (6 + b * 24) - t * 2.5);

const estrellas: PatternFn = (x, y, t, a, b) => {
  let v = 0;
  const th = 0.82 - b * 0.1;
  for (let k = 0; k < 3; k++) {
    const s = 10 + k * 9 + a * 14;
    const gx = f32(f32(x * s) + f32(t * (0.05 + k * 0.04))), gy = f32(y * s);
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const h = hash12(ix + k * 31, iy + k * 31);
    if (h < th) continue; // step(.82 - b * .1, h) == 0
    hash22(ix + 3.1, iy + 3.1);
    const fx = gx - ix - 0.5 - (V2[0] - 0.5) * 0.6, fy = gy - iy - 0.5 - (V2[1] - 0.5) * 0.6;
    const tw = 0.55 + 0.45 * Math.sin(t * (2 + h * 4) + h * 60);
    v += smoothstep(0.22 + b * 0.2, 0, len(fx, fy)) * tw;
  }
  return sat(v);
};

const hiper: PatternFn = (x, y, t, a, b) => {
  const an = Math.atan2(y, x), r = len(x, y);
  const n = Math.floor(60 + a * 120);
  const xx = (an / TAU + 0.5) * n;
  const id = Math.floor(xx), fa = xx - id;
  const h = hash11(id);
  const z = fract(h * 7.31 + t * (0.18 + h * 0.5) * (0.5 + b * 1.6));
  const rr = z * z * 1.3;
  const ln = 0.015 + z * z * 0.35;
  const thin = smoothstep(0.5, 0.15, Math.abs(fa - 0.5));
  const s = step(rr - ln, r) * step(r, rr) * thin * (0.3 + 0.7 * z);
  return sat(s * 1.8 + Math.exp(-r * r * 60) * 0.3);
};

const galaxia: PatternFn = (x, y, t, a, b) => {
  const r = len(x, y) + 0.001, an = Math.atan2(y, x);
  const arms = 2 + Math.floor(a * 3);
  const ph = an * arms + Math.log(r) * (3 + b * 6) * arms * 0.5 - t * 0.35;
  let v = Math.pow(0.5 + 0.5 * Math.cos(ph), 3) * Math.exp(-r * 2.4) * 1.6;
  v *= 0.55 + 0.45 * fbm(x * 7 + t * 0.03, y * 7);
  v += Math.exp(-r * r * 55) * 1.1;
  const st = step(0.985, hash12(ffloor(x * 70), ffloor(y * 70))) * 0.8;
  return sat(v + st * (0.4 + 0.6 * Math.exp(-r * 2)));
};

const rejilla: PatternFn = (x, y, t, a, b) => {
  const hz = 0.02 + (a - 0.5) * 0.3;
  let v = 0;
  if (y < hz) {
    const dy = hz - y;
    const z = 0.35 / dy;
    const gx = x * z, gy = z + t * (0.6 + b * 2.4);
    const wx = PX * z * 1.1, wy = ((PX * 0.35) / (dy * dy)) * 1.1;
    const ddx = Math.abs(fract(gx) - 0.5), ddy = Math.abs(fract(gy) - 0.5);
    const lx = 1 - smoothstep(0, wx, 0.5 - ddx);
    const ly = 1 - smoothstep(0, wy, 0.5 - ddy);
    const fade = Math.exp(-z * 0.08);
    v = wy > 0.45 ? 0.45 * fade : Math.max(lx, ly) * fade;
  } else {
    const cy = hz + 0.2;
    const sun = step(len(x, y - cy), 0.19);
    const k = sat((cy - y) / 0.19);
    const slit = step(k * 0.55, fract((y - hz) * 26));
    v = sun * mix(1, slit, step(y, cy));
    v = Math.max(v, step(0.992, hash12(ffloor(x * 80), ffloor(y * 80))) * 0.6);
  }
  return v;
};

/* ------------------------------------------------------------------ */
/* Solids (ray marched)                                               */
/* ------------------------------------------------------------------ */

const M = new Float64Array(9);
// dona: R, R·ro, light and the torus radii are per-frame constants
let doRox = 0, doRoy = 0, doRoz = 0, doLx = 0, doLy = 0, doLz = 0, doTx = 0.72, doTy = 0.32;
const sdTorus = (px: number, py: number, pz: number) => {
  const qx = Math.sqrt(px * px + pz * pz) - doTx;
  return Math.sqrt(qx * qx + py * py) - doTy;
};
const dona: BasicPattern = {
  prep(t, a, b) {
    rotXY(t * 0.8, t * (0.35 + b * 0.6), M);
    // ro = (0, 0, -2.8)
    doRox = M[2] * -2.8; doRoy = M[5] * -2.8; doRoz = M[8] * -2.8;
    const lx = -0.4, ly = 0.7, lz = -0.6;
    let Lx = M[0] * lx + M[1] * ly + M[2] * lz, Ly = M[3] * lx + M[4] * ly + M[5] * lz, Lz = M[6] * lx + M[7] * ly + M[8] * lz;
    const ll = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz); Lx /= ll; Ly /= ll; Lz /= ll;
    doLx = Lx; doLy = Ly; doLz = Lz;
    doTx = 0.72; doTy = 0.18 + a * 0.28;
  },
  f(x, y) {
    const rl = Math.sqrt(x * x + y * y + 1.55 * 1.55);
    const rx = x / rl, ry = y / rl, rz = 1.55 / rl;
    // R * rd
    const dx = M[0] * rx + M[1] * ry + M[2] * rz, dy = M[3] * rx + M[4] * ry + M[5] * rz, dz = M[6] * rx + M[7] * ry + M[8] * rz;
    let d = 0, hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 64; i++) {
      px = doRox + dx * d; py = doRoy + dy * d; pz = doRoz + dz * d;
      const s = sdTorus(px, py, pz);
      if (s < 0.002) { hit = true; break; }
      d += s; if (d > 6) break;
    }
    if (!hit) return 0;
    const e = 0.002;
    let nx = sdTorus(px + e, py, pz) - sdTorus(px - e, py, pz);
    let ny = sdTorus(px, py + e, pz) - sdTorus(px, py - e, pz);
    let nz = sdTorus(px, py, pz + e) - sdTorus(px, py, pz - e);
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
    // V = normalize(R * -rd)
    const vx = -dx, vy = -dy, vz = -dz; // R is orthonormal and rd is unit length
    const dif = Math.max(nx * doLx + ny * doLy + nz * doLz, 0);
    // reflect(-L, n) = -L - 2 dot(n, -L) n
    const ndl = -(nx * doLx + ny * doLy + nz * doLz);
    const rfx = -doLx - 2 * ndl * nx, rfy = -doLy - 2 * ndl * ny, rfz = -doLz - 2 * ndl * nz;
    const spec = Math.pow(Math.max(rfx * vx + rfy * vy + rfz * vz, 0), 24);
    return sat(0.08 + 0.82 * dif + 0.35 * spec);
  },
};

const ME = new Float64Array(9);
const ESL = (() => { const l = Math.sqrt(0.25 + 0.3025 + 0.49); return [-0.5 / l, 0.55 / l, 0.7 / l]; })();
const esfera: BasicPattern = {
  prep(t) { rotXY(0.35, t * 0.4, ME); },
  f(x, y, _t, a, b) {
    const R = 0.38, r2 = x * x + y * y;
    if (r2 > R * R) return Math.exp(-(Math.sqrt(r2) - R) * 18) * 0.12;
    const nx = x / R, ny = y / R, nz = Math.sqrt(R * R - r2) / R;
    const mx = ME[0] * nx + ME[1] * ny + ME[2] * nz, my = ME[3] * nx + ME[4] * ny + ME[5] * nz, mz = ME[6] * nx + ME[7] * ny + ME[8] * nz;
    const stripes = 0.5 + 0.5 * Math.sin(my * 22);
    let tex = b === 1 ? stripes : mix(fbm3(mx * 2.6 + 3, my * 2.6 + 3, mz * 2.6 + 3), stripes, b);
    tex = mix(0.5, tex, 0.4 + a * 0.6);
    const dif = Math.max(nx * ESL[0] + ny * ESL[1] + nz * ESL[2], 0);
    const rim = Math.pow(1 - nz, 3) * 0.3;
    return sat(0.06 + dif * (0.35 + 0.75 * tex) + rim);
  },
};

const MC = new Float64Array(9);
let cuRox = 0, cuRoy = 0, cuRoz = 0, cuLx = 0, cuLy = 0, cuLz = 0, cuR = 0.1;
const sdRBox = (px: number, py: number, pz: number) => {
  const bb = 0.55 - cuR;
  const qx = Math.abs(px) - bb, qy = Math.abs(py) - bb, qz = Math.abs(pz) - bb;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - cuR;
};
const cubo: BasicPattern = {
  prep(t, a) {
    rotXY(t * 0.55, t * 0.7, MC);
    cuRox = MC[2] * -3; cuRoy = MC[5] * -3; cuRoz = MC[8] * -3;
    const lx = -0.5, ly = 0.7, lz = -0.5;
    let Lx = MC[0] * lx + MC[1] * ly + MC[2] * lz, Ly = MC[3] * lx + MC[4] * ly + MC[5] * lz, Lz = MC[6] * lx + MC[7] * ly + MC[8] * lz;
    const ll = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz); Lx /= ll; Ly /= ll; Lz /= ll;
    cuLx = Lx; cuLy = Ly; cuLz = Lz;
    cuR = 0.02 + a * 0.2;
  },
  f(x, y, _t, _a, b) {
    const rl = Math.sqrt(x * x + y * y + 1.6 * 1.6);
    const rx = x / rl, ry = y / rl, rz = 1.6 / rl;
    const dx = MC[0] * rx + MC[1] * ry + MC[2] * rz, dy = MC[3] * rx + MC[4] * ry + MC[5] * rz, dz = MC[6] * rx + MC[7] * ry + MC[8] * rz;
    let d = 0, hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 56; i++) {
      px = cuRox + dx * d; py = cuRoy + dy * d; pz = cuRoz + dz * d;
      const s = sdRBox(px, py, pz);
      if (s < 0.002) { hit = true; break; }
      d += s; if (d > 7) break;
    }
    if (!hit) return 0;
    const e = 0.002;
    let nx = sdRBox(px + e, py, pz) - sdRBox(px - e, py, pz);
    let ny = sdRBox(px, py + e, pz) - sdRBox(px, py - e, pz);
    let nz = sdRBox(px, py, pz + e) - sdRBox(px, py, pz - e);
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
    const dif = Math.max(nx * cuLx + ny * cuLy + nz * cuLz, 0);
    const qx = Math.abs(px), qy = Math.abs(py), qz = Math.abs(pz);
    const mid = qx + qy + qz - Math.max(qx, Math.max(qy, qz)) - Math.min(qx, Math.min(qy, qz));
    const edge = smoothstep(0.43, 0.53, mid);
    return sat(mix(0.1 + 0.85 * dif, Math.max(edge, 0.08 + 0.2 * dif), b));
  },
};

/*
 * More solids (same camera: eye R·(0, 0, -3), ray R·normalize(p, f); the light is fixed to the camera).
 * Shared scratch: RAY holds the object-space eye and direction of the current cell, N3 the last normal.
 */
const RAY = new Float64Array(6);
const N3 = new Float64Array(3);
const LGT = new Float64Array(3);
/** Object-space ray for screen point (x, y): RAY = (R·eye, R·normalize(x, y, f)). */
function camRay(M: Float64Array, x: number, y: number, f: number) {
  const l = Math.sqrt(x * x + y * y + f * f), cx = x / l, cy = y / l, cz = f / l;
  RAY[0] = M[2] * -3; RAY[1] = M[5] * -3; RAY[2] = M[8] * -3;
  RAY[3] = M[0] * cx + M[1] * cy + M[2] * cz; RAY[4] = M[3] * cx + M[4] * cy + M[5] * cz; RAY[5] = M[6] * cx + M[7] * cy + M[8] * cz;
}
/** LGT = normalize(R·v): a light fixed to the camera, in object space. */
function camLight(M: Float64Array, vx: number, vy: number, vz: number) {
  const x = M[0] * vx + M[1] * vy + M[2] * vz, y = M[3] * vx + M[4] * vy + M[5] * vz, z = M[6] * vx + M[7] * vy + M[8] * vz;
  const l = Math.sqrt(x * x + y * y + z * z);
  LGT[0] = x / l; LGT[1] = y / l; LGT[2] = z / l;
}
/** GLSL: normalize(k.xyy·f(p + k.xyy·e) + k.yyx·f(p + k.yyx·e) + k.yxy·f(p + k.yxy·e) + k.xxx·f(p + k.xxx·e)), k = (1, -1). */
function tetraNormal(sd: (x: number, y: number, z: number) => number, px: number, py: number, pz: number, e: number) {
  const a = sd(px + e, py - e, pz - e), b = sd(px - e, py - e, pz + e), c = sd(px - e, py + e, pz - e), d = sd(px + e, py + e, pz + e);
  const nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  N3[0] = nx / l; N3[1] = ny / l; N3[2] = nz / l;
}
/** pow(max(dot(reflect(-L, n), -rd), 0), k) for the current RAY, LGT and N3. */
function specular(k: number): number {
  const ndl = N3[0] * LGT[0] + N3[1] * LGT[1] + N3[2] * LGT[2];
  const rx = -LGT[0] + 2 * ndl * N3[0], ry = -LGT[1] + 2 * ndl * N3[1], rz = -LGT[2] + 2 * ndl * N3[2];
  return Math.pow(Math.max(-(rx * RAY[3] + ry * RAY[4] + rz * RAY[5]), 0), k);
}
const diffuse = () => Math.max(N3[0] * LGT[0] + N3[1] * LGT[1] + N3[2] * LGT[2], 0);
/** max(dot(n, -rd), 0): a light at the eye, so what faces the viewer reads bright and the silhouette dark. */
const headlight = () => Math.max(-(N3[0] * RAY[3] + N3[1] * RAY[4] + N3[2] * RAY[5]), 0);
/** Entry and exit distances of RAY through a sphere of radius² r2 at the origin; false when it misses. */
const SPAN = new Float64Array(2);
function sphereSpan(r2: number): boolean {
  const bb = RAY[0] * RAY[3] + RAY[1] * RAY[4] + RAY[2] * RAY[5];
  let h = bb * bb - (RAY[0] * RAY[0] + RAY[1] * RAY[1] + RAY[2] * RAY[2]) + r2;
  if (h < 0) return false;
  h = Math.sqrt(h);
  SPAN[0] = -bb - h; SPAN[1] = -bb + h;
  return true;
}

// nudo: a (P, Q) torus knot; in the torus' cross-section plane the tube leans, so its offset along the lean shrinks
const MNU = new Float64Array(9);
let nuP = 2, nuQ = 3, nuTh = 0.1, nuT = 0;
function nuSd(px: number, py: number, pz: number): number {
  const an = Math.atan2(pz, px);
  const cx = Math.sqrt(px * px + pz * pz) - 0.46;
  let d = 1e3;
  for (let k = 0; k < nuP; k++) {
    const s = (an + TAU * k) / nuP;
    const c0 = Math.cos(nuQ * s), c1 = Math.sin(nuQ * s);
    const vx = cx - 0.22 * c0, vy = py - 0.22 * c1;
    const sp = nuP * (0.46 + 0.22 * c0), sq = nuQ * 0.22;
    const dn = vx * c0 + vy * c1, dt = (vx * -c1 + vy * c0) * sp / Math.sqrt(sp * sp + sq * sq);
    d = Math.min(d, Math.sqrt(dn * dn + dt * dt));
  }
  return d - nuTh;
}
const nudo: BasicPattern = {
  prep(t, a, b) {
    rotXY(0.7 + 0.25 * Math.sin(t * 0.21), t * 0.32, MNU);
    const k = Math.floor(b * 5.999);
    if (k < 1) { nuP = 2; nuQ = 3; } else if (k < 2) { nuP = 3; nuQ = 2; } else if (k < 3) { nuP = 2; nuQ = 5; }
    else if (k < 4) { nuP = 3; nuQ = 4; } else if (k < 5) { nuP = 5; nuQ = 2; } else { nuP = 3; nuQ = 5; }
    nuTh = 0.06 + a * 0.07;
    nuT = t;
  },
  f(x, y) {
    camRay(MNU, x, y, 1.6);
    if (!sphereSpan(0.81)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 80; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = nuSd(px, py, pz);
      if (s < 0.002) { hit = true; break; }
      d += s * 0.85; if (d > dmax) break;
    }
    if (!hit) return 0;
    tetraNormal(nuSd, px, py, pz, 0.002);
    const an = Math.atan2(pz, px), cx = Math.sqrt(px * px + pz * pz) - 0.46;
    let best = 1e3, ss = 0, psi = 0;
    for (let j = 0; j < nuP; j++) {
      const s = (an + TAU * j) / nuP;
      const dx = cx - 0.22 * Math.cos(nuQ * s), dy = py - 0.22 * Math.sin(nuQ * s);
      const dl = Math.sqrt(dx * dx + dy * dy);
      if (dl < best) { best = dl; ss = s; psi = Math.atan2(dy, dx); }
    }
    const stripe = smoothstep(-0.35, 0.35, Math.sin(psi * 2 - ss * nuQ * 3 + nuT * 2.5));
    camLight(MNU, -0.5, 0.65, -0.55);
    const dif = diffuse(), hl = headlight(), spec = specular(28);
    return sat(0.04 + (0.5 * dif + 0.42 * hl) * mix(0.4, 1, stripe) + 0.4 * spec);
  },
};

// poliedro: convex polyhedra as the max of plane pairs (octahedron … truncated icosahedron)
const PO_N = new Float64Array([
  0.57735027, 0.57735027, 0.57735027, -0.57735027, 0.57735027, 0.57735027, 0.57735027, -0.57735027, 0.57735027, 0.57735027, 0.57735027, -0.57735027,
  0, 0.35682209, 0.93417236, 0, -0.35682209, 0.93417236, 0.93417236, 0, 0.35682209, -0.93417236, 0, 0.35682209, 0.35682209, 0.93417236, 0, -0.35682209, 0.93417236, 0,
  0, 0.85065081, 0.52573111, 0, -0.85065081, 0.52573111, 0.52573111, 0, 0.85065081, -0.52573111, 0, 0.85065081, 0.85065081, 0.52573111, 0, -0.85065081, 0.52573111, 0,
  0.70710678, 0.70710678, 0, 0.70710678, -0.70710678, 0, 0.70710678, 0, 0.70710678, 0.70710678, 0, -0.70710678, 0, 0.70710678, 0.70710678, 0, 0.70710678, -0.70710678,
].map(Math.fround));
const MPO = new Float64Array(9);
let poKind = 0, poI0 = 0, poI1 = 4, poR = 0.44, poGap = 0, poNx = 0, poNy = 0, poNz = 0;
function poSd(px: number, py: number, pz: number): number {
  let m1 = -1e3, m2 = -1e3;
  for (let i = poI0; i < poI1; i++) {
    const nx = PO_N[i * 3], ny = PO_N[i * 3 + 1], nz = PO_N[i * 3 + 2];
    const dp = px * nx + py * ny + pz * nz;
    const v = Math.abs(dp) - (poKind > 3.5 && i >= 10 ? poR * 1.0266 : poR);
    if (v > m1) { m2 = m1; m1 = v; const sg = Math.sign(dp); poNx = nx * sg; poNy = ny * sg; poNz = nz * sg; } else if (v > m2) m2 = v;
  }
  poGap = m1 - m2;
  return m1;
}
const poliedro: BasicPattern = {
  prep(t, a) {
    rotXY(t * 0.31 + 0.5, t * 0.47, MPO);
    const k = Math.floor(a * 4.999);
    poKind = k;
    poI0 = k < 1 ? 0 : k < 2 ? 16 : k < 3 ? 10 : 0;
    poI1 = k < 1 ? 4 : k < 2 ? 22 : k < 3 ? 16 : k < 4 ? 10 : 16;
    poR = k < 1 ? 0.44 : k < 2 ? 0.53 : k < 4 ? 0.6 : 0.68;
  },
  f(x, y, _t, _a, b) {
    camRay(MPO, x, y, 1.6);
    if (!sphereSpan(0.64)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false;
    for (let i = 0; i < 48; i++) {
      const s = poSd(RAY[0] + RAY[3] * d, RAY[1] + RAY[4] * d, RAY[2] + RAY[5] * d);
      if (s < 0.001) { hit = true; break; }
      d += s; if (d > dmax) break;
    }
    if (!hit) return 0;
    N3[0] = poNx; N3[1] = poNy; N3[2] = poNz;
    camLight(MPO, -0.45, 0.7, -0.55);
    const dif = diffuse(), spec = specular(20);
    const face = 0.08 + 0.62 * dif + 0.22 * hash13(Math.floor(poNx * 7 + 7.5), Math.floor(poNy * 7 + 7.5), Math.floor(poNz * 7 + 7.5))
      + 0.18 * headlight() + 0.3 * spec;
    const edge = 1 - smoothstep(PX * 0.3, PX * 1.1, poGap);
    return sat(mix(face * (1 - 0.6 * edge), Math.max(edge * (0.55 + 0.45 * dif), 0.05 + 0.12 * dif), b));
  },
};

// giroide: the solid side of a gyroid, carved out of a ball; its tunnels let the background through
const MGY = new Float64Array(9);
let gyK = 10, gyC = 0, gyPh = 0;
function gySd(px: number, py: number, pz: number): number {
  const qx = px * gyK, qy = py * gyK, qz = pz * gyK + gyPh;
  const g = (Math.sin(qx) * Math.cos(qy) + Math.sin(qy) * Math.cos(qz) + Math.sin(qz) * Math.cos(qx) - gyC) / gyK * 0.55;
  return Math.max(g, Math.sqrt(px * px + py * py + pz * pz) - 0.66);
}
const giroide: BasicPattern = {
  prep(t, a, b) {
    rotXY(t * 0.17 + 0.4, t * 0.23, MGY);
    gyK = 5 + a * 7; gyC = -0.7 + b * 1.4; gyPh = t * 0.5;
  },
  f(x, y) {
    camRay(MGY, x, y, 1.6);
    if (!sphereSpan(0.4356)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0, it = 0;
    for (let i = 0; i < 72; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = gySd(px, py, pz);
      if (s < 0.0015) { hit = true; break; }
      d += s; it += 1; if (d > dmax) break;
    }
    if (!hit) return 0;
    tetraNormal(gySd, px, py, pz, 0.0015);
    camLight(MGY, -0.4, 0.75, -0.5);
    const dif = diffuse(), hl = headlight(), spec = specular(16);
    const depth = smoothstep(0.2, 0.66, Math.sqrt(px * px + py * py + pz * pz));
    return sat((0.05 + 0.55 * dif + 0.4 * hl + 0.25 * spec) * mix(0.2, 1, depth) * (1 - 0.4 * it / 72));
  },
};

// moebius: a thin band whose cross-section turns half a turn (or 3, 5) per lap
const MMO = new Float64Array(9);
let moW = 0.2, moTw = 1, moT = 0;
function moSd(px: number, py: number, pz: number): number {
  const an = Math.atan2(pz, px);
  const lx = Math.sqrt(px * px + pz * pz) - 0.5, ang = an * moTw * 0.5, c = Math.cos(ang), s = Math.sin(ang);
  const dx = Math.abs(c * lx + s * py) - moW, dy = Math.abs(-s * lx + c * py) - 0.045;
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
}
const moebius: BasicPattern = {
  prep(t, a, b) {
    rotXY(0.8 + 0.2 * Math.sin(t * 0.23), t * 0.3, MMO);
    moW = 0.12 + a * 0.2; moTw = 1 + 2 * Math.floor(b * 2.999); moT = t;
  },
  f(x, y) {
    camRay(MMO, x, y, 1.6);
    const rb = 0.55 + moW;
    if (!sphereSpan(rb * rb)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 90; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = moSd(px, py, pz);
      if (s < 0.0015) { hit = true; break; }
      d += s * 0.6; if (d > dmax) break;
    }
    if (!hit) return 0;
    tetraNormal(moSd, px, py, pz, 0.0015);
    if (N3[0] * RAY[3] + N3[1] * RAY[4] + N3[2] * RAY[5] > 0) { N3[0] = -N3[0]; N3[1] = -N3[1]; N3[2] = -N3[2]; }
    const an = Math.atan2(pz, px);
    const lx = Math.sqrt(px * px + pz * pz) - 0.5, ang = an * moTw * 0.5;
    const u = (Math.cos(ang) * lx + Math.sin(ang) * py) / moW;
    const line = 1 - smoothstep(0.1, 0.22, Math.abs(u));
    const bars = smoothstep(0.35, 0.5, Math.abs(fract(an * 12 / TAU - moT * 0.6) - 0.5)) * step(0.4, Math.abs(u));
    camLight(MMO, -0.5, 0.7, -0.5);
    const dif = diffuse(), hl = headlight(), spec = specular(24);
    return sat(0.06 + (0.55 * dif + 0.4 * hl) * (1 - 0.55 * Math.max(line, bars)) + 0.35 * spec);
  },
};

// adn: a double helix with its rungs, leaning across the frame
const MDN = new Float64Array(9);
rotXY(0.35, 0, MDN);
const DN_C = Math.cos(0.5), DN_S = Math.sin(0.5);
let dnK = 7, dnKK = 0.5, dnSp = 0.1, dnPh = 0, dnM = 0;
function dnSd(px: number, py: number, pz: number): number {
  const a1 = py * dnK + dnPh, a2 = a1 + 2.3;
  const c1x = Math.cos(a1), c1y = Math.sin(a1), c2x = Math.cos(a2), c2y = Math.sin(a2);
  const v1x = px - 0.3 * c1x, v1y = pz - 0.3 * c1y, v2x = px - 0.3 * c2x, v2y = pz - 0.3 * c2y;
  const r1 = v1x * c1x + v1y * c1y, t1 = (v1x * -c1y + v1y * c1x) * dnKK;
  const r2 = v2x * c2x + v2y * c2y, t2 = (v2x * -c2y + v2y * c2x) * dnKK;
  const s1 = Math.sqrt(r1 * r1 + t1 * t1) - 0.065, s2 = Math.sqrt(r2 * r2 + t2 * t2) - 0.065;
  const yi = (Math.floor(py / dnSp) + 0.5) * dnSp;
  const b1 = yi * dnK + dnPh, b2 = b1 + 2.3;
  const ax = 0.3 * Math.cos(b1), az = 0.3 * Math.sin(b1), bx = 0.3 * Math.cos(b2), bz = 0.3 * Math.sin(b2);
  const pax = px - ax, pay = py - yi, paz = pz - az, bax = bx - ax, baz = bz - az;
  const hh = clamp((pax * bax + paz * baz) / (bax * bax + baz * baz), 0, 1);
  const ex = pax - bax * hh, ez = paz - baz * hh;
  const rg = Math.sqrt(ex * ex + pay * pay + ez * ez) - 0.03;
  const s = Math.min(s1, s2);
  dnM = rg < s ? (hh < 0.5 ? 1 : 2) : 0;
  return Math.min(s, rg);
}
const adn: BasicPattern = {
  prep(t, a, b) {
    dnK = 3.5 + a * 5; dnKK = 1 / Math.sqrt(1 + 0.09 * dnK * dnK); dnSp = 0.2 - b * 0.12; dnPh = t * 1.1;
  },
  f(x, y) {
    camRay(MDN, DN_C * x + DN_S * y, -DN_S * x + DN_C * y, 1.6);
    const ox = RAY[0], oz = RAY[2], vx = RAY[3], vz = RAY[5];
    const A2 = vx * vx + vz * vz, B2 = ox * vx + oz * vz;
    let h = B2 * B2 - A2 * (ox * ox + oz * oz - 0.1521);
    if (h < 0) return 0;
    h = Math.sqrt(h);
    let d = (-B2 - h) / A2;
    const dmax = (-B2 + h) / A2;
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 80; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = dnSd(px, py, pz);
      if (s < 0.002) { hit = true; break; }
      d += s * 0.8; if (d > dmax) break;
    }
    if (!hit) return 0;
    const m = dnM;
    tetraNormal(dnSd, px, py, pz, 0.002);
    camLight(MDN, -0.5, 0.6, -0.6);
    const dif = diffuse(), hl = headlight(), spec = specular(30);
    const tone = m < 0.5 ? 1 : m < 1.5 ? 0.75 : 0.45;
    return sat(0.04 + (0.55 * dif + 0.42 * hl) * tone + 0.4 * spec * step(m, 0.5));
  },
};

// planeta: a banded planet with rings, both analytic (no marching), with the shadows they cast on each other
const MPL = new Float64Array(9);
let plA = 0.5, plT = 0;
function plRing(rr: number, an: number): number {
  const r0 = 0.56, r1 = 0.66 + plA * 0.36;
  const x = (rr - r0) / (r1 - r0);
  const band = smoothstep(0, 0.04, x) * smoothstep(1, 0.94, x);
  let dens = 0.35 + 0.65 * vnoise(x * 36, 3.7);
  dens *= 1 - 0.9 * Math.exp(-(x - 0.62) * (x - 0.62) * 480);
  dens *= 0.82 + 0.18 * vnoise(an * 5 - plT * 0.15, x * 6);
  return band * dens;
}
const planeta: BasicPattern = {
  prep(t, a, b) {
    rotXY(0.12 + b * 0.75 + 0.04 * Math.sin(t * 0.17), -0.5 + t * 0.03, MPL);
    plA = a; plT = t;
  },
  f(x, y, t) {
    camRay(MPL, x, y, 1.7);
    camLight(MPL, -0.75, 0.35, -0.45);
    const ox = RAY[0], oy = RAY[1], oz = RAY[2], dx = RAY[3], dy = RAY[4], dz = RAY[5];
    const Lx = LGT[0], Ly = LGT[1], Lz = LGT[2];
    const bb = ox * dx + oy * dy + oz * dz, h = bb * bb - (ox * ox + oy * oy + oz * oz) + 0.1521;
    const ts = h > 0 ? -bb - Math.sqrt(h) : 1e3;
    let col = 0;
    if (ts < 1e3) {
      const sx = ox + dx * ts, sy = oy + dy * ts, sz = oz + dz * ts;
      const nx = sx / 0.39, ny = sy / 0.39, nz = sz / 0.39;
      const lon = Math.atan2(nz, nx) + t * 0.12;
      const tex = 0.5 + 0.5 * Math.sin(ny * 15 + 2.6 * fbm(lon * 1.3, ny * 4));
      let dif = Math.max(nx * Lx + ny * Ly + nz * Lz, 0);
      const sr = -sy / Ly;
      if (sr > 0) { const qx = sx + Lx * sr, qz = sz + Lz * sr; dif *= 1 - 0.75 * plRing(Math.sqrt(qx * qx + qz * qz), Math.atan2(qz, qx)); }
      col = 0.03 + dif * (0.45 + 0.55 * tex) + 0.2 * Math.pow(1 - Math.max(-(nx * dx + ny * dy + nz * dz), 0), 2) * dif;
    } else {
      const ex = ox - dx * bb, ey = oy - dy * bb, ez = oz - dz * bb;
      col = 0.12 * Math.exp(-(Math.sqrt(ex * ex + ey * ey + ez * ez) - 0.39) * 22);
    }
    const tr = -oy / dy;
    if (tr > 0 && tr < ts) {
      const qx = ox + dx * tr, qy = oy + dy * tr, qz = oz + dz * tr;
      const den = plRing(Math.sqrt(qx * qx + qz * qz), Math.atan2(qz, qx));
      if (den > 0) {
        const b2 = qx * Lx + qy * Ly + qz * Lz, h2 = b2 * b2 - (qx * qx + qy * qy + qz * qz) + 0.1521;
        const lit = h2 > 0 && -b2 - Math.sqrt(h2) > 0 ? 0.15 : 1;
        col = mix(col, (0.35 + 0.6 * den) * lit, Math.min(den * 1.3, 0.95));
      }
    }
    return sat(col);
  },
};

// voxeles: a flight over columns of blocks, traced cell by cell (2D DDA over a height map)
const VX_CP = 0.9004471, VX_SP = 0.4349655;
let vxLv = 5, vxB = 0.5, vxT = 0, vxCy = 1, vxSy = 0;
function vxH(cx: number, cz: number): number {
  const k = 0.05 + vxB * 0.12, qx = cx * k, qz = cz * k;
  const v = vnoise(qx, qz) * 0.7 + vnoise(qx * 2.7 + 5.3, qz * 2.7 + 5.3) * 0.3;
  return Math.floor(v * v * vxLv * 1.6) + step(0.985, hash12(cx, cz)) * (2 + Math.floor(hash12(cx + 7, cz + 7) * 3));
}
/*
 * Neighbouring rays cross the same columns: their heights are kept in a direct-mapped table for the frame
 * (keyed by the exact column and the prep call), so a hit returns exactly what vxH would.
 */
const VX_BITS = 12, VX_N = 1 << VX_BITS;
const VX_KX = new Float64Array(VX_N), VX_KZ = new Float64Array(VX_N), VX_V = new Float64Array(VX_N), VX_ST = new Uint32Array(VX_N);
let vxStamp = 0;
function vxHc(cx: number, cz: number): number {
  const s = (Math.imul(cx | 0, 0x9e3779b1) ^ Math.imul(cz | 0, 0x85ebca77)) >>> (32 - VX_BITS);
  if (VX_ST[s] === vxStamp && VX_KX[s] === cx && VX_KZ[s] === cz) return VX_V[s];
  const v = vxH(cx, cz);
  VX_ST[s] = vxStamp; VX_KX[s] = cx; VX_KZ[s] = cz; VX_V[s] = v;
  return v;
}
const voxeles: BasicPattern = {
  prep(t, a, b) {
    vxStamp = (vxStamp + 1) >>> 0 || 1;
    vxLv = 2 + Math.floor(a * 7); vxB = b; vxT = t;
    const yw = 0.3 * Math.sin(t * 0.11);
    vxCy = Math.cos(yw); vxSy = Math.sin(yw);
  },
  f(x, y) {
    const lv = vxLv, rox = vxT * 0.35, roy = lv + 1.5, roz = vxT * 1.4;
    const l = Math.sqrt(x * x + y * y + 1.21);
    let rx = x / l, ry = y / l, rz = 1.1 / l;
    const ty = ry * VX_CP - rz * VX_SP, tz = ry * VX_SP + rz * VX_CP;
    ry = ty; rz = tz;
    const nx = rx * vxCy + rz * vxSy, nz = rz * vxCy - rx * vxSy;
    rx = nx; rz = nz;
    let cx = Math.floor(rox), cz = Math.floor(roz);
    const sx = Math.sign(rx), sz = Math.sign(rz), dlx = Math.abs(1 / rx), dlz = Math.abs(1 / rz);
    let tmx = (sx * (cx - rox) + sx * 0.5 + 0.5) * dlx, tmz = (sz * (cz - roz) + sz * 0.5 + 0.5) * dlz;
    let tc = 0, face = 0, hh = -1;
    for (let i = 0; i < 72; i++) {
      const hc = vxHc(cx, cz);
      const tn = Math.min(tmx, tmz);
      if (roy + ry * tc < hc) { hh = hc; break; }
      if (roy + ry * tn < hc) { tc = (hc - roy) / ry; face = 0; hh = hc; break; }
      if (tmx < tmz) { tc = tmx; tmx += dlx; cx += sx; face = 1; } else { tc = tmz; tmz += dlz; cz += sz; face = 2; }
      if (tc > 60) break;
    }
    if (hh < 0) return 0.05 * Math.exp(-Math.max(ry, 0) * 10);
    const fade = Math.exp(-tc * 0.07);
    let lum: number;
    if (face < 0.5) {
      const fx = fract(rox + rx * tc), fz = fract(roz + rz * tc);
      const e = Math.min(Math.min(fx, 1 - fx), Math.min(fz, 1 - fz));
      lum = 0.95 - 0.45 * fade * (1 - smoothstep(0.05, 0.12, e));
    } else {
      lum = face < 1.5 ? (sx > 0 ? 0.62 : 0.4) : 0.28;
    }
    lum *= 0.6 + 0.4 * sat(hh / (lv * 1.2));
    return sat(lum * Math.exp(-tc * 0.018));
  },
};

// metabolas: five drops of liquid metal that merge (smooth union) and mirror a studio
const MB_C = new Float64Array(15), MB_F = new Float64Array(5);
for (let i = 0; i < 5; i++) MB_F[i] = 0.8 + 0.25 * Math.sin(i * 1.7);
let mbR = 0.2, mbK = 0.2;
function mbSd(px: number, py: number, pz: number): number {
  let d = 1e3;
  for (let i = 0; i < 5; i++) {
    const dx = px - MB_C[i * 3], dy = py - MB_C[i * 3 + 1], dz = pz - MB_C[i * 3 + 2];
    const s = Math.sqrt(dx * dx + dy * dy + dz * dz) - mbR * MB_F[i];
    const hh = Math.max(mbK - Math.abs(d - s), 0) / mbK;
    d = Math.min(d, s) - hh * hh * mbK * 0.25;
  }
  return d;
}
const MB_ID = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
/** The studio's softbox (GLSL: vec3(-.49, .64, -.59), used as is). */
const MB_BOX = [-0.49, 0.64, -0.59];
const metabolas: BasicPattern = {
  prep(t, a, b) {
    for (let i = 0; i < 5; i++) {
      MB_C[i * 3] = 0.42 * Math.sin(t * (0.41 + i * 0.11) + i * 2.1);
      MB_C[i * 3 + 1] = 0.24 * Math.cos(t * (0.37 + i * 0.09) + i * 1.3);
      MB_C[i * 3 + 2] = 0.28 * Math.sin(t * (0.29 + i * 0.07) + i * 0.7);
    }
    mbR = 0.2 + a * 0.14; mbK = 0.12 + b * 0.36;
  },
  f(x, y) {
    camRay(MB_ID, x, y, 1.6);
    if (!sphereSpan(1)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 64; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = mbSd(px, py, pz);
      if (s < 0.002) { hit = true; break; }
      d += s; if (d > dmax) break;
    }
    if (!hit) return 0;
    tetraNormal(mbSd, px, py, pz, 0.002);
    const nx = N3[0], ny = N3[1], nz = N3[2], dx = RAY[3], dy = RAY[4], dz = RAY[5];
    const ndi = nx * dx + ny * dy + nz * dz;
    const fx = dx - 2 * ndi * nx, fy = dy - 2 * ndi * ny, fz = dz - 2 * ndi * nz;
    const env = mix(0.3, 0.55 + 0.35 * fy, smoothstep(-0.2, 0.2, fy)) + 0.55 * Math.exp(-Math.abs(fy + 0.05) * 12) + 0.35 * Math.exp(-Math.abs(fy - 0.5) * 18);
    const box = smoothstep(0.72, 0.9, fx * MB_BOX[0] + fy * MB_BOX[1] + fz * MB_BOX[2]);
    const fres = 0.5 + 0.5 * Math.pow(1 - Math.max(-ndi, 0), 3);
    const dif = Math.max(nx * MB_BOX[0] + ny * MB_BOX[1] + nz * MB_BOX[2], 0);
    return sat(0.06 + 0.35 * dif + 0.7 * env * fres + 0.55 * box);
  },
};

// engranajes: two meshed gears, extruded, seen at an angle
const MGE = new Float64Array(9);
let geNA = 15, geNB = 8, geRA = 0.55, geRB = 0.3, geS = 4, geAngA = 0, geAngB = 0, geAx = 0, geBx = 0;
function geGear(px: number, py: number, pz: number, cx: number, R: number, N: number, ang: number): number {
  const qx = px - cx, qy = py;
  const r = Math.sqrt(qx * qx + qy * qy), an = Math.atan2(qy, qx) - ang;
  const hg = 2.3 * R / N;
  const tooth = clamp(Math.cos(an * N) * 2.2, -1, 1) * 0.5 + 0.5;
  let d = (r - (R - hg * 0.5 + hg * tooth)) * 0.7;
  d = Math.max(d, 0.05 - r);
  const sec = TAU / geS;
  const ar = mod(an, sec) - sec * 0.5;
  const wx = r * Math.cos(ar) - R * 0.55, wy = r * Math.sin(ar);
  const win = Math.sqrt(wx * wx + wy * wy) - R * (0.13 + 0.48 / geS);
  d = Math.max(d, -win);
  const w2 = Math.abs(pz) - 0.09;
  const o1 = Math.max(d, 0), o2 = Math.max(w2, 0);
  return Math.min(Math.max(d, w2), 0) + Math.sqrt(o1 * o1 + o2 * o2);
}
const geA = (px: number, py: number, pz: number) => geGear(px, py, pz, geAx, geRA, geNA, geAngA);
const geB = (px: number, py: number, pz: number) => geGear(px, py, pz, geBx, geRB, geNB, geAngB);
const geSd = (px: number, py: number, pz: number) => Math.min(geA(px, py, pz), geB(px, py, pz));
const engranajes: BasicPattern = {
  prep(t, a, b) {
    geNA = 10 + Math.floor(a * 10); geNB = Math.max(6, Math.floor(geNA * 0.55));
    geRA = 0.55; geRB = geRA * geNB / geNA; geS = 3 + Math.floor(b * 3.999);
    const D = geRA + geRB, sh = (geRA - geRB) * 0.5;
    geAx = -D * 0.5 + sh; geBx = D * 0.5 + sh;
    geAngA = t * 0.4; geAngB = -geAngA * geNA / geNB + PI - PI / geNB;
    rotXY(0.38 + 0.08 * Math.sin(t * 0.2), -0.25 + 0.1 * Math.sin(t * 0.13), MGE);
  },
  f(x, y) {
    camRay(MGE, x, y, 1.6);
    if (!sphereSpan(1)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 80; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d; pz = RAY[2] + RAY[5] * d;
      const s = geSd(px, py, pz);
      if (s < 0.0015) { hit = true; break; }
      d += s * 0.8; if (d > dmax) break;
    }
    if (!hit) return 0;
    tetraNormal(geSd, px, py, pz, 0.0015);
    const onA = step(geA(px, py, pz), geB(px, py, pz));
    const cx = mix(geBx, geAx, onA);
    const rr = Math.sqrt((px - cx) * (px - cx) + py * py);
    const front = smoothstep(0.6, 0.9, Math.abs(N3[2]));
    const tex = mix(0.45, 0.9 + 0.1 * Math.sin(rr * 90), front);
    camLight(MGE, -0.5, 0.65, -0.6);
    const dif = diffuse(), hl = headlight(), spec = specular(18);
    return sat(0.04 + (0.58 * dif + 0.5 * hl) * tex + 0.3 * spec);
  },
};

// cristales: hexagonal prisms with six-sided points, rooted around a rock
const CR_D = [0.059964, 0.998201, 0, 0.619408, 0.751806, 0.226102, -0.541688, 0.710914, 0.448527, -0.25202, 0.777573, -0.576079, 0.193155, 0.471328, 0.860547, -0.811904, 0.523366, -0.25865, 0.550397, 0.380925, -0.74294, 0.378189, 0.913089, -0.152452, 0.928233, 0.286715, 0.237017];
const CR_U = [0.996404, -0.059856, -0.059964, 0.687084, -0.379801, -0.619408, 0.797432, 0.265852, 0.541688, 0.959701, 0.124336, -0.25202, 0.979947, -0.048931, -0.193155, 0.476274, 0.337602, -0.811904, 0.826192, -0.120291, 0.550397, 0.875893, -0.29964, 0.378189, 0.303472, -0.215146, -0.928233];
const CR_V = [-0.059856, 0.003596, -0.998201, -0.379801, 0.539017, -0.751806, 0.265852, 0.651095, -0.710914, -0.124336, -0.616377, -0.777573, -0.048931, 0.880599, -0.471328, -0.337602, -0.782376, -0.523366, 0.120291, -0.916748, -0.380925, 0.29964, -0.276559, -0.913089, -0.215146, 0.933545, -0.286715];
const CR_L = [1, 0.78, 0.72, 0.76, 0.55, 0.53, 0.47, 0.66, 0.42];
const CR_R = [0.13, 0.11, 0.105, 0.11, 0.09, 0.095, 0.085, 0.09, 0.08];
const MCR = new Float64Array(9);
let crN = 6, crLk = 0.9, crId = -1;
function crSd(px: number, py: number, pz: number): number {
  const qx = px, qy = py + 0.5, qz = pz;
  const ry = qy * 1.6;
  let d = (Math.sqrt(qx * qx + ry * ry + qz * qz) - 0.22) * 0.62;
  crId = -1;
  for (let i = 0; i < crN; i++) {
    const k = i * 3;
    const ix = qx - CR_D[k] * 0.14, iz = qz - CR_D[k + 2] * 0.14;
    const y = ix * CR_D[k] + qy * CR_D[k + 1] + iz * CR_D[k + 2];
    const wx = Math.abs(ix * CR_U[k] + qy * CR_U[k + 1] + iz * CR_U[k + 2]), wy = Math.abs(ix * CR_V[k] + qy * CR_V[k + 1] + iz * CR_V[k + 2]);
    const r = CR_R[i];
    const hx = Math.max(wx * 0.866025 + wy * 0.5, wy) - r;
    const tip = (y - CR_L[i] * crLk + (hx + r) * 1.4) * 0.58;
    const c = Math.max(Math.max(hx, tip), -y);
    if (c < d) { d = c; crId = i; }
  }
  return d;
}
const cristales: BasicPattern = {
  prep(t, a, b) {
    rotXY(-0.18 + 0.05 * Math.sin(t * 0.21), t * 0.22, MCR);
    crN = 4 + Math.floor(a * 5.999); crLk = 0.65 + b * 0.5;
  },
  f(x, y) {
    camRay(MCR, x, y + 0.05, 1.9);
    RAY[1] -= 0.05;
    if (!sphereSpan(0.9025)) return 0;
    let d = SPAN[0];
    const dmax = SPAN[1];
    let hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 72; i++) {
      px = RAY[0] + RAY[3] * d; py = RAY[1] + RAY[4] * d + 0.05; pz = RAY[2] + RAY[5] * d;
      const s = crSd(px, py, pz);
      if (s < 0.0015) { hit = true; break; }
      d += s * 0.8; if (d > dmax) break;
    }
    if (!hit) return 0;
    const id = crId;
    tetraNormal(crSd, px, py, pz, 0.0015);
    camLight(MCR, -0.45, 0.7, -0.55);
    const dif = diffuse(), hl = headlight(), spec = specular(40);
    const fres = Math.pow(1 - hl, 2);
    const tone = id < 0 ? 0.4 : 0.7 + 0.3 * fract(id * 0.618);
    return sat(0.04 + (0.5 * dif + 0.35 * hl) * tone + 0.45 * spec + 0.3 * fres * step(0, id));
  },
};

/* ------------------------------------------------------------------ */
/* Mathematical                                                       */
/* ------------------------------------------------------------------ */

let juCx = 0, juCy = 0;
const julia: BasicPattern = {
  prep(t, _a, b) {
    const cx = -0.745 + 0.06 * Math.cos(t * 0.21), cy = 0.186 + 0.06 * Math.sin(t * 0.17);
    juCx = f32(mix(cx, 0.7885 * Math.cos(t * 0.12 + 2), b));
    juCy = f32(mix(cy, 0.7885 * Math.sin(t * 0.12 + 2), b));
  },
  f(x, y, _t, a) {
    // float32 arithmetic: the escape count of chaotic orbits depends on it
    const k = f32(2.6 - a * 1.8);
    let zx = f32(x * k), zy = f32(y * k), i = 0, m = 0;
    for (let n = 0; n < 72; n++) {
      const nx = f32(f32(f32(zx * zx) - f32(zy * zy)) + juCx);
      zy = f32(f32(2 * f32(zx * zy)) + juCy);
      zx = nx;
      m = f32(f32(zx * zx) + f32(zy * zy));
      if (m > 64) break;
      i += 1;
    }
    if (i >= 71) return 0;
    const sm = i + 1 - Math.log2(Math.log2(m));
    return sat(gpow(sm / 40, 0.6));
  },
};

const rosa: PatternFn = (x, y, t, a, b) => {
  const k = Math.floor(2 + a * 7);
  const an = Math.atan2(y, x), r = len(x, y);
  const R = 0.42 * Math.abs(Math.cos(k * an + t * 0.6));
  const w = PX * (1.2 + b * 4);
  const line = 1 - smoothstep(w * 0.4, w, Math.abs(r - R));
  const fill = step(r, R) * (0.25 + 0.2 * Math.sin(r * 40 - t * 3));
  return sat(line + fill * b);
};

const degradado: PatternFn = (x, y, t, a, b) => {
  const dx = Math.cos(a * TAU), dy = Math.sin(a * TAU);
  return sat(0.5 + (x * dx + y * dy) * 0.55 + b * 0.12 * Math.sin((x * -dy + y * dx) * 6 + t));
};

/* ------------------------------------------------------------------ */
/* Shapes                                                             */
/* ------------------------------------------------------------------ */

const forma: PatternFn = (x, y, t, a, b) => {
  const n = Math.floor(3 + a * 6);
  const c = Math.cos(t * 0.25), s = Math.sin(t * 0.25);
  const qx = c * x + s * y, qy = -s * x + c * y;
  const an = Math.atan2(qy, qx), r = len(qx, qy);
  const seg = TAU / n;
  const d = Math.cos(Math.floor(0.5 + an / seg) * seg - an) * r;
  const R = 0.3 * (1 + 0.05 * Math.sin(t * 2));
  const fill = 1 - smoothstep(R - PX, R + PX, d);
  const ring = 1 - smoothstep(PX * 0.5, PX * 1.5, Math.abs(d - R));
  const echo = (0.5 + 0.5 * Math.sin((d - R) * 50 - t * 4)) * Math.exp(-Math.max(d - R, 0) * 5) * step(R, d);
  return sat(mix(fill, Math.max(ring, echo * 0.6), b));
};

const estrella: PatternFn = (x, y, t, a, b) => {
  const n = Math.floor(4 + a * 6);
  const c = Math.cos(-t * 0.3), s = Math.sin(-t * 0.3);
  const qx = c * x + s * y, qy = -s * x + c * y;
  const an = Math.atan2(qy, qx), r = len(qx, qy);
  const R = 0.34 * (1 + 0.06 * Math.sin(t * 2.5));
  const rs = R * (0.45 + 0.55 * Math.pow(Math.abs(Math.cos(an * n * 0.5)), 3));
  const d = r - rs;
  const fill = 1 - smoothstep(-PX, PX, d);
  const ring = 1 - smoothstep(PX * 0.5, PX * 1.6, Math.abs(d));
  return sat(mix(fill, ring + 0.25 * fill, b));
};

function sdHeart(px: number, py: number): number {
  px = Math.abs(px);
  if (py + px > 1) return len(px - 0.25, py - 0.75) - 0.35355339;
  const qx = px, qy = py - 1;
  const m = 0.5 * Math.max(px + py, 0);
  const wx = px - m, wy = py - m;
  return Math.sqrt(Math.min(qx * qx + qy * qy, wx * wx + wy * wy)) * Math.sign(px - py);
}
const latido: PatternFn = (x, y, t, a, b) => {
  const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 4.2), 6) * 0.12 + Math.pow(0.5 + 0.5 * Math.sin(t * 4.2 - 0.6), 8) * 0.06;
  const s = (0.55 + a * 0.5) * (1 + beat);
  const d = sdHeart(x / s, y / s + 0.5) * s;
  const fill = 1 - smoothstep(-PX, PX, d);
  const ring = 1 - smoothstep(PX * 0.5, PX * 1.6, Math.abs(d));
  const echo = (0.5 + 0.5 * Math.sin(d * 60 - t * 5)) * Math.exp(-Math.max(d, 0) * 6) * step(0, d);
  return sat(mix(fill, Math.max(ring, echo * 0.5), b));
};

/* ------------------------------------------------------------------ */
/* Signal                                                             */
/* ------------------------------------------------------------------ */

const lluvia: PatternFn = (x, y, t, a, b) => {
  const c = ffloor(x * f32(14 + a * 30));
  const sp = (0.35 + hash11(c) * 1.1) * (0.5 + b * 1.5);
  const yy = y * 0.9 + t * sp + hash11(c + 7) * 13;
  return Math.pow(1 - fract(yy), 5) * step(0.12, hash11(c + 3.1));
};

const F021 = f32(0.21), F017 = f32(0.17), F173 = f32(17.3), F317 = f32(31.7);
const glitch: PatternFn = (x, y, t, a, b) => {
  const tt = Math.floor(t * (3 + b * 14));
  const rows = 6 + a * 30;
  const row = ffloor(f32(y + 0.5) * f32(rows));
  const r = hash12(row, tt);
  const shift = r > 0.62 ? (hash12(row + 3, tt) - 0.5) * 0.8 : 0;
  const qx = f32(x + shift), qy = y;
  const base = smoothstep(0.35, 0.65, fbm(qx * 1.4, f32(f32(qy * 5) + f32(tt * F021))));
  // float32 sums, as on the GPU: the hash amplifies any difference in the last bits
  const o = f32(tt * F017);
  const blocks = step(0.88, hash12(f32(ffloor(qx * 5) + o), f32(ffloor(qy * 12) + o)));
  return sat(base + blocks * 0.9 - step(0.95, r) * 0.7);
};

const ruido: PatternFn = (x, y, t, a, b) => {
  const f = Math.floor(t * (6 + b * 24));
  const v = hash12(f32(ffloor(x / PX) + f32(f * F173)), f32(ffloor(y / PX) + f32(f * F317)));
  const roll = 0.5 + 0.5 * Math.sin(y * 3 - t * 2);
  return Math.pow(v, 0.6 + a * 2.5) * (0.7 + 0.3 * roll);
};

const P = (f: PatternFn): BasicPattern => ({ f });

/** Every pattern of the GLSL library, ported. Keys match PATTERN_GLSL / PATTERNS ids. */
export const BASIC_PATTERNS: Record<string, BasicPattern> = {
  nube: P(nube), marmol: P(marmol), crestas: P(crestas), fuego: P(fuego), aurora: P(aurora), causticas: P(causticas),
  lava, celulas: P(celulas), grietas: P(grietas),
  anillos: P(anillos), cuadros: P(cuadros), rayos: P(rayos), tablero: P(tablero), truchet: P(truchet), hex: P(hex),
  trama: P(trama), moire: P(moire), rombos: P(rombos), franjas: P(franjas), caleido: P(caleido),
  ondas: P(ondas), interferencia: P(interferencia), plasma: P(plasma), lissajous, ecualizador: P(ecualizador),
  horizonte, radar: P(radar),
  tunel: P(tunel), espiral: P(espiral), estrellas: P(estrellas), hiper: P(hiper), galaxia: P(galaxia), rejilla: P(rejilla),
  dona, esfera, cubo, nudo, poliedro, giroide, moebius, adn, planeta, voxeles, metabolas, engranajes, cristales,
  julia, rosa: P(rosa), degradado: P(degradado),
  forma: P(forma), estrella: P(estrella), latido: P(latido),
  lluvia: P(lluvia), glitch: P(glitch), ruido: P(ruido),
};
Object.assign(BASIC_PATTERNS, EXTRA_BASIC);
Object.assign(BASIC_PATTERNS, NEXT_BASIC);

/**
 * Patterns the basic engine draws with a stand-in instead of a faithful port (id → stand-in id).
 * Empty: every pattern is ported. Kept so callers can report approximations if one is ever added
 * to the GLSL library before it gets a CPU twin (unknown ids fall back to 'nube', see basicPattern()).
 */
export const BASIC_APPROX: ReadonlyMap<string, string> = new Map();

/** The CPU pattern for an id; unknown ids fall back like the GPU field program would not (it would fail to compile). */
export function basicPattern(id: string): BasicPattern {
  return BASIC_PATTERNS[id] ?? BASIC_PATTERNS[BASIC_APPROX.get(id) ?? 'nube'];
}

/** Pure evaluation helper (tests, tools): runs prep and f for one point. */
export function evalPattern(id: string, x: number, y: number, t: number, a: number, b: number, px = 0.02): number {
  const p = basicPattern(id);
  setPX(px);
  p.prep?.(t, a, b);
  return p.f(x, y, t, a, b);
}
