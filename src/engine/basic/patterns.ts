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
  TAU, V2, clamp, fbm, fbm3, fract, gnoise, gpow, hard, hash11, hash12, hash22, mix, mod, rotXY, sat, smoothstep, step, voro,
} from './core';

export type PatternFn = (x: number, y: number, t: number, a: number, b: number) => number;
export interface BasicPattern {
  f: PatternFn;
  prep?: (t: number, a: number, b: number) => void;
}

let PX = 0.02;
/** Size of one cell in pattern units for the layer being evaluated (GLSL: PX = uCellP * scale). */
export function setPX(v: number) { PX = Math.fround(v); }

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
  dona, esfera, cubo,
  julia, rosa: P(rosa), degradado: P(degradado),
  forma: P(forma), estrella: P(estrella), latido: P(latido),
  lluvia: P(lluvia), glitch: P(glitch), ruido: P(ruido),
};

/**
 * Patterns the basic engine draws with a stand-in instead of a faithful port (id → stand-in id).
 * Empty: all 45 patterns are ported. Kept so callers can report approximations if one is ever added
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
