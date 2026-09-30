/**
 * CPU twins of ../glsl/patterns-extra.ts, line by line (same constants, GLSL semantics). Listed in the
 * BASIC_PATTERNS table of patterns.ts; `setExtraPX` is called by its setPX. Every export is pure, so the
 * exported code's pattern scripts (scripts/runtime-plugin.ts) carry only the one they use.
 */
import { TAU, clamp, fbm, fract, hard, hash12, mix, mod, sat, smoothstep, step } from './core';
import type { BasicPattern } from './patterns';
import { solidPattern } from './solid';

let PX = 0.02;
export function setExtraPX(v: number) { PX = Math.fround(v); }

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const sdSeg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return len(pax - bax * h, pay - bay * h);
};

const f32 = Math.fround;
export const mandelbrot: BasicPattern = {
  f(x, y, t, a, b) {
    // float32 arithmetic, as on the GPU: the escape count near the set's edge depends on it
    const k = f32(2.6 - 1.9 * a);
    const cx = f32(f32(f32(x + f32(0.16 + 0.07 * Math.sin(t * 0.08))) * k) - 0.63), cy = f32(f32(y + f32(0.02 * Math.cos(t * 0.09))) * k);
    let zx = 0, zy = 0, n = 0, m = 0;
    for (let i = 0; i < 64; i++) {
      const nx = f32(f32(f32(zx * zx) - f32(zy * zy)) + cx);
      zy = f32(f32(2 * f32(zx * zy)) + cy); zx = nx;
      m = f32(f32(zx * zx) + f32(zy * zy));
      if (m > 256) break;
      n++;
    }
    if (n >= 63.5) return 0.1 + 0.07 * Math.sin(Math.atan2(zy, zx) * 3 + t * 0.5);
    const sn = n + 1 - Math.log2(0.5 * Math.log2(m));
    const glow = Math.pow(clamp(sn / 24, 0, 1), 0.55);
    const bands = 0.5 + 0.5 * Math.cos(sn * (0.35 + b * 0.6) - t * 0.6);
    return sat(0.06 + glow * mix(1, 0.3 + 0.7 * bands, b));
  },
};

export const sierpinski: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 1 + a * 1.8;
    let qx = fract((x + 0.5) * k + t * 0.014), qy = fract((y + 0.5) * k), cut = 0;
    for (let i = 0; i < 4; i++) {
      if (Math.floor(qx * 3) === 1 && Math.floor(qy * 3) === 1) cut = 1;
      qx = fract(qx * 3); qy = fract(qy * 3);
    }
    const rim = Math.min(Math.min(qx, 1 - qx), Math.min(qy, 1 - qy));
    return (1 - cut) * mix(0.3 + 0.7 * smoothstep(0, 0.14, rim), 1, b);
  },
};

export const filotaxis: BasicPattern = {
  f(x, y, t, a, b) {
    const st = 0.027 + a * 0.008, r = len(x, y), n = (r / st) * (r / st);
    let v = 0;
    for (let j = -24; j <= 24; j++) {
      const k = Math.floor(n) + j;
      if (k < 0 || k > 340) continue;
      const an = k * 2.39996323 + t * 0.08, rad = st * Math.sqrt(k);
      const d = len(x - rad * Math.cos(an), y - rad * Math.sin(an));
      v = Math.max(v, (1 - smoothstep(0.006 + b * 0.002, 0.018 + b * 0.013, d)) * (0.45 + 0.55 * (k / 340)));
    }
    return v * (1 - smoothstep(0.51, 0.64, r));
  },
};

export const quasicristal: BasicPattern = {
  f(x, y, t, a, b) {
    let v = 0;
    const f = 10 + a * 17;
    for (let i = 0; i < 5; i++) {
      const an = TAU * i / 5;
      v += Math.cos((x * Math.cos(an) + y * Math.sin(an)) * f + t * (0.16 + i * 0.025));
    }
    v = 0.5 + v * 0.1;
    return mix(v, hard(v, 0.64), b);
  },
};

export const topografia: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 0.6 + a * 1, n = 5 + b * 9, e = 0.01, ox = t * 0.035, oy = -t * 0.02;
    const h = fbm(x * k + ox, y * k + oy) + 0.1 * Math.sin(x * 2 + y * 1.5);
    const hx = fbm((x + e) * k + ox, y * k + oy) + 0.1 * Math.sin((x + e) * 2 + y * 1.5);
    const hy = fbm(x * k + ox, (y + e) * k + oy) + 0.1 * Math.sin(x * 2 + (y + e) * 1.5);
    const g = Math.sqrt((hx - h) * (hx - h) + (hy - h) * (hy - h)) / e * n;
    const f = fract(h * n), d = Math.min(f, 1 - f) / Math.max(g, 0.5);
    const major = 1 - step(0.5, mod(Math.floor(h * n + 0.5), 5));
    return sat(0.06 + 0.22 * h + (1 - smoothstep(PX * 0.5, PX * 1.6, d)) * (0.55 + 0.35 * major));
  },
};

/** The curve's 161 points depend only on t, a and b: computed once per frame. */
const SPX = new Float64Array(161), SPY = new Float64Array(161);
export const espirografo: BasicPattern = {
  prep(t, a, b) {
    const q = Math.floor(3 + a * 7), arm = 0.44 * (0.18 + b * 0.3), r = 0.44 - arm;
    SPX[0] = r + arm * Math.cos(t * 0.22); SPY[0] = -arm * Math.sin(t * 0.22);
    for (let i = 1; i <= 160; i++) {
      const u = i / 160 * TAU;
      SPX[i] = r * Math.cos(u) + arm * Math.cos(q * u + t * 0.22);
      SPY[i] = r * Math.sin(u) - arm * Math.sin(q * u + t * 0.22);
    }
  },
  f(x, y) {
    let d = 8;
    for (let i = 1; i <= 160; i++) d = Math.min(d, sdSeg(x, y, SPX[i - 1], SPY[i - 1], SPX[i], SPY[i]));
    return sat(1 - smoothstep(PX * 0.35, PX * 1.5, d) + 0.25 * Math.exp(-d * 18));
  },
};

export const circuitos: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 8 + a * 13, gx = Math.fround(x * k), gy = Math.fround(y * k);
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, h = hash12(ix, iy);
    const hor = 1 - smoothstep(0.018, 0.04 + PX * k * 0.4, Math.abs(fy - 0.5));
    const ver = 1 - smoothstep(0.018, 0.04 + PX * k * 0.4, Math.abs(fx - 0.5));
    const run = h > 0.75 ? Math.max(hor, ver) : h < 0.5 ? hor : ver;
    const s = Math.sin((h < 0.5 ? gx : gy) * 1.3 - t * 2.5 + h * 20);
    let pulse = s * s * s * s;
    pulse *= pulse * pulse * pulse;
    const pad = 1 - smoothstep(0.12, 0.2, len(fx - 0.5, fy - 0.5));
    const blink = 0.5 + 0.5 * Math.sin(t * 1.4 + h * TAU);
    return sat(run * (0.3 + b * 0.4 + 0.6 * pulse) + step(0.77, h) * pad * (0.5 + 0.5 * blink));
  },
};

export const dunas: BasicPattern = {
  f(x, y, t, a, b) {
    const q = y * (13 + a * 24) + Math.sin(x * 4 + t * 0.18) * (1.2 + b * 3)
      + 1.3 * Math.sin(x * 9 - t * 0.12) + 0.8 * fbm(x * 3 + t * 0.02, y * 3);
    const f = fract(q / TAU);
    return sat(0.14 + 0.42 * Math.pow(f, 1.8) + 0.7 * Math.pow(1 - f, 7));
  },
};

export const entrelazado: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 7 + a * 12, gx = Math.fround(x * k), gy = Math.fround(y * k);
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const h = 1 - smoothstep(0.12, 0.22, Math.abs(fy - 0.5));
    const v = 1 - smoothstep(0.12, 0.22, Math.abs(fx - 0.5));
    const over = mod(ix + iy, 2) > 0.5;
    const warp = 0.5 + 0.5 * Math.cos((over ? fy : fx) * TAU + t * 0.05);
    return sat(Math.max(h * (over ? 0.4 : 1), v * (over ? 1 : 0.4)) * (0.55 + 0.45 * warp) * (0.6 + 0.4 * b));
  },
};

export const obelisco: BasicPattern = /* @__PURE__ */ solidPattern({
  rot: t => [0.22 + 0.12 * Math.sin(t * 0.21), 0.35 + t * 0.38], eye: 3, focal: 1.65, bound: 0.95, steps: 64, k: 0.7, light: [-0.6, 0.7, -0.5],
  sdf: (x, y, z, _t, a) => {
    const yy = clamp(y, -0.64, 0.64), s = 0.8 + a * 0.4;
    const w = (yy < 0.42 ? mix(0.3, 0.19, (yy + 0.64) / 1.06) : 0.19 * (1 - (yy - 0.42) / 0.22)) * s;
    return Math.max(Math.max(Math.abs(x), Math.abs(z)) - w, Math.abs(y) - 0.64) * 0.8;
  },
  shade: (_x, y, _z, _t, _a, b, dif, face, spec) =>
    0.1 + 0.72 * dif + 0.15 * face + 0.25 * spec + 0.2 * b * step(y, 0.42) * (1 - smoothstep(0.015, 0.05, Math.abs(fract((y + 0.64) * (6 + b * 14)) - 0.5))),
});

export const prisma: BasicPattern = /* @__PURE__ */ solidPattern({
  rot: t => [0.45 + 0.1 * Math.sin(t * 0.24), t * 0.42], eye: 3, focal: 1.65, bound: 0.9, steps: 64, k: 0.78, light: [-0.6, 0.65, -0.5],
  sdf: (x, y, z, _t, a) => {
    const zx = Math.abs(x), zy = Math.abs(z);
    return Math.max(Math.max(zx * 0.8660254 + zy * 0.5, zy) - (0.43 + a * 0.12), Math.abs(y) - 0.55);
  },
  shade: (_x, y, _z, t, _a, b, dif, face, spec) =>
    0.05 + dif * (0.5 + 0.42 * (0.5 + 0.5 * Math.cos(y * (14 + b * 28) + t * 0.5))) + 0.15 * face + 0.3 * spec,
});

export const reloj_arena: BasicPattern = /* @__PURE__ */ solidPattern({
  rot: t => [0.2 + 0.1 * Math.sin(t * 0.13), t * 0.38], eye: 3, focal: 1.65, bound: 0.9, steps: 72, k: 0.65, light: [-0.6, 0.7, -0.5],
  sdf: (x, y, z, _t, a) => {
    const r = 0.12 + (Math.abs(y) / 0.59) * (0.29 + a * 0.1), l = len(x, z);
    const body = Math.max(l - r, Math.abs(y) - 0.59);
    const rim = len(l - (0.43 + a * 0.1), Math.abs(y) - 0.59) - 0.034;
    return Math.min(body, rim);
  },
  shade: (_x, y, _z, t, _a, b, dif, face, spec) =>
    0.05 + 0.6 * dif + 0.2 * face + 0.3 * spec + b * 0.4 * smoothstep(-0.05, 0.04, -0.12 - 0.3 * (0.5 + 0.5 * Math.sin(t * 0.38)) - y) * step(y, 0),
});
