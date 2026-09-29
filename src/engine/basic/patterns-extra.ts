/** Canvas equivalents of patterns-extra.ts. The field renderer calls prep once per layer. */
import { TAU, clamp, fbm, hash12, mix, rotXY, sat, smoothstep } from './core';
import type { BasicPattern, PatternFn } from './patterns';

const P = (f: PatternFn): BasicPattern => ({ f });
const len = (x: number, y: number) => Math.hypot(x, y);
const fract = (x: number) => x - Math.floor(x);
const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay;
  const h = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return len(x - ax - vx * h, y - ay - vy * h);
};

const mandelbrot: PatternFn = (x, y, t, a, b) => {
  const k = 2.6 - 1.9 * a, cx = (x + 0.16 + 0.07 * Math.sin(t * 0.08)) * k - 0.63;
  const cy = (y + 0.02 * Math.cos(t * 0.09)) * k;
  let zx = 0, zy = 0, n = 0;
  for (let i = 0; i < 48; i++) {
    if (zx * zx + zy * zy > 64) break;
    const xx = zx * zx - zy * zy + cx;
    zy = 2 * zx * zy + cy; zx = xx; n++;
  }
  const v = n / 48;
  return sat(mix(Math.pow(v, 0.65), 0.5 + 0.5 * Math.sin(n * (0.22 + b * 0.7)), b * 0.65) * smoothstep(0.03, 0.15, v));
};
const sierpinski: PatternFn = (x, y, t, a, b) => {
  const k = 1 + a * 1.8;
  let qx = fract((x + 0.5) * k + t * 0.014), qy = fract((y + 0.5) * k), cut = 0;
  for (let i = 0; i < 6; i++) {
    if (Math.floor(qx * 3) === 1 && Math.floor(qy * 3) === 1) cut = 1;
    qx = fract(qx * 3); qy = fract(qy * 3);
  }
  const rim = Math.min(qx, 1 - qx, qy, 1 - qy);
  return (1 - cut) * mix(0.72 + 0.28 * smoothstep(0, 0.12, rim), 1, b);
};
const filotaxis: PatternFn = (x, y, t, a, b) => {
  const r = len(x, y), step = 0.027 + a * 0.008, n = (r / step) ** 2;
  let v = 0;
  for (let j = -24; j <= 24; j++) {
    const k = Math.floor(n) + j;
    if (k < 0 || k > 340) continue;
    const an = k * 2.39996323 + t * 0.08, rad = step * Math.sqrt(k);
    const d = len(x - rad * Math.cos(an), y - rad * Math.sin(an));
    v = Math.max(v, (1 - smoothstep(0.006 + b * 0.002, 0.018 + b * 0.013, d)) * (0.45 + 0.55 * k / 340));
  }
  return v * (1 - smoothstep(0.51, 0.64, r));
};
const quasicristal: PatternFn = (x, y, t, a, b) => {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const an = TAU * i / 5;
    v += Math.cos((x * Math.cos(an) + y * Math.sin(an)) * (10 + a * 17) + t * (0.16 + i * 0.025));
  }
  v = 0.5 + v * 0.1;
  const w = 0.5 * (1 - 0.64) + 0.004;
  return mix(v, smoothstep(0.5 - w, 0.5 + w, v), b);
};
const topografia: PatternFn = (x, y, t, a, b) => {
  const k = 1 + a * 1.3;
  const h = fbm(x * k + t * 0.035, y * k - t * 0.02) + 0.1 * Math.sin(x * 2 + y * 1.5);
  const f = fract(h * (4 + b * 8));
  const line = 1 - smoothstep(0, 0.09 + PX, Math.min(f, 1 - f));
  return sat(0.08 + 0.28 * h + 0.68 * line);
};
let PX = 0.02;
const espirografo: PatternFn = (x, y, t, a, b) => {
  const q = Math.floor(3 + a * 7), arm = 0.18 + b * 0.27;
  let d = 8, px = 0.44 + arm, py = 0;
  for (let i = 1; i <= 96; i++) {
    const u = i / 96 * TAU;
    const nx = 0.44 * Math.cos(u) + arm * Math.cos(q * u + t * 0.22);
    const ny = 0.44 * Math.sin(u) - arm * Math.sin(q * u + t * 0.22);
    d = Math.min(d, seg(x, y, px, py, nx, ny)); px = nx; py = ny;
  }
  return sat(1 - smoothstep(PX * 0.35, PX * 1.5, d) + 0.25 * Math.exp(-d * 18));
};
const circuitos: PatternFn = (x, y, t, a, b) => {
  const k = 8 + a * 13, gx = x * k, gy = y * k;
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = fract(gx), fy = fract(gy), h = hash12(ix, iy);
  const hor = 1 - smoothstep(0.018, 0.04 + PX * k * 0.4, Math.abs(fy - 0.5));
  const ver = 1 - smoothstep(0.018, 0.04 + PX * k * 0.4, Math.abs(fx - 0.5));
  const v = h > 0.75 ? Math.max(hor, ver) : h < 0.5 ? hor : ver;
  const pad = 1 - smoothstep(0.12, 0.2, len(fx - 0.5, fy - 0.5));
  const blink = 0.5 + 0.5 * Math.sin(t * 1.4 + h * TAU);
  return sat(v * (0.3 + b * 0.4) + (h >= 0.77 ? 1 : 0) * pad * (0.4 + 0.6 * blink));
};
const dunas: PatternFn = (x, y, t, a, b) => {
  const q = y * (13 + a * 24) + Math.sin(x * 4 + t * 0.18) * (1.2 + b * 3)
    + 1.3 * Math.sin(x * 9 - t * 0.12) + 0.8 * fbm(x * 3 + t * 0.02, y * 3);
  const f = fract(q / TAU);
  return sat(0.14 + 0.42 * Math.pow(f, 1.8) + 0.7 * Math.pow(1 - f, 7));
};
const entrelazado: PatternFn = (x, y, t, a, b) => {
  const k = 7 + a * 12, gx = x * k, gy = y * k, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = fract(gx), fy = fract(gy), h = 1 - smoothstep(0.12, 0.22, Math.abs(fy - 0.5));
  const v = 1 - smoothstep(0.12, 0.22, Math.abs(fx - 0.5)), over = ((ix + iy) % 2 + 2) % 2;
  const warp = 0.5 + 0.5 * Math.cos((over ? fy : fx) * TAU + t * 0.05);
  return sat(Math.max(h * (over ? 0.4 : 1), v * (over ? 1 : 0.4)) * (0.55 + 0.45 * warp) * (0.6 + 0.4 * b));
};

type Sdf = (x: number, y: number, z: number, a: number) => number;
const ob: Sdf = (x, y, z, a) => {
  const h = clamp(y, -0.64, 0.64), w = mix(0.34, 0.12, (h + 0.64) / 1.28) + a * 0.08;
  return Math.max(Math.max(Math.abs(x), Math.abs(z)) - w, Math.abs(y) - 0.64);
};
const pr: Sdf = (x, y, z, a) => {
  const qx = Math.abs(x), qz = Math.abs(z);
  return Math.max(Math.max(qx * 0.8660254 + qz * 0.5, qz) - (0.43 + a * 0.12), Math.abs(y) - 0.55);
};
const ra: Sdf = (x, y, z, a) => {
  const rad = 0.12 + Math.abs(y) / 0.59 * (0.29 + a * 0.1);
  const radius = len(x, z);
  const body = Math.max(radius - rad, Math.abs(y) - 0.59);
  const rim = len(radius - (0.43 + a * 0.1), Math.abs(y) - 0.59) - 0.034;
  return Math.min(body, rim);
};

/** A bounded ray marcher; the surface formula and light match the WebGL chunks. */
function solid(sdf: Sdf, tilt: number, spin: number, pace: number, step: number, max: number, shade: (x: number, y: number, z: number, t: number, a: number, b: number) => number): BasicPattern {
  const M = new Float64Array(9);
  let ox = 0, oy = 0, oz = 0, lx = 0, ly = 0, lz = 0;
  return {
    prep(t) {
      rotXY(tilt + t * pace, spin + t * 0.38, M);
      ox = -3 * M[2]; oy = -3 * M[5]; oz = -3 * M[8];
      const ex = -0.6, ey = 0.7, ez = -0.5;
      const vx = M[0] * ex + M[1] * ey + M[2] * ez;
      const vy = M[3] * ex + M[4] * ey + M[5] * ez;
      const vz = M[6] * ex + M[7] * ey + M[8] * ez;
      const l = Math.hypot(vx, vy, vz); lx = vx / l; ly = vy / l; lz = vz / l;
    },
    f(x, y, t, a, b) {
      const inv = 1 / Math.hypot(x, y, 1.65), vx = x * inv, vy = y * inv, vz = 1.65 * inv;
      const dx = M[0] * vx + M[1] * vy + M[2] * vz;
      const dy = M[3] * vx + M[4] * vy + M[5] * vz;
      const dz = M[6] * vx + M[7] * vy + M[8] * vz;
      let dist = 0, qx = 0, qy = 0, qz = 0, hit = false;
      for (let i = 0; i < max; i++) {
        qx = ox + dx * dist; qy = oy + dy * dist; qz = oz + dz * dist;
        const d = sdf(qx, qy, qz, a);
        if (d < 0.002) { hit = true; break; }
        dist += Math.max(d * step, 0.002); if (dist > 6) break;
      }
      if (!hit) return 0;
      const e = 0.003;
      let nx = sdf(qx + e, qy, qz, a) - sdf(qx - e, qy, qz, a);
      let ny = sdf(qx, qy + e, qz, a) - sdf(qx, qy - e, qz, a);
      let nz = sdf(qx, qy, qz + e, a) - sdf(qx, qy, qz - e, a);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(nx * lx + ny * ly + nz * lz, 0);
      const face = Math.max(-nx * dx - ny * dy - nz * dz, 0);
      return sat(shade(qx, qy, qz, t, a, b) + 0.55 * dif + 0.22 * face);
    },
  };
}

export const EXTRA_BASIC: Record<string, BasicPattern> = {
  mandelbrot: P(mandelbrot), sierpinski: P(sierpinski), filotaxis: P(filotaxis),
  quasicristal: P(quasicristal), topografia: P(topografia), espirografo: P(espirografo),
  circuitos: P(circuitos), dunas: P(dunas), entrelazado: P(entrelazado),
  obelisco: solid(ob, 0.22, 0.35, 0.16, 0.7, 64, (_x, y, _z, _t, _a, b) => 0.1 + b * 0.14 * (1 - smoothstep(0.015, 0.05, Math.abs(fract((y + 0.64) * (6 + b * 14)) - 0.5)))),
  prisma: solid(pr, 0.45, 0, 0.24, 0.78, 64, (_x, y, _z, t, _a, b) => 0.07 + 0.21 * (0.5 + 0.5 * Math.cos(y * (14 + b * 28) + t * 0.5))),
  reloj_arena: solid(ra, 0.2, 0, 0.13, 0.65, 72, (_x, y, _z, t, _a, b) => 0.08 + b * 0.2 * smoothstep(-0.05, 0.04, y + 0.29 * Math.sin(t * 0.38)) * (y <= 0 ? 1 : 0)),
};

/** Keep CPU line widths in sync with the caller's current cell size. */
export function setExtraPX(v: number) { PX = Math.fround(v); }
