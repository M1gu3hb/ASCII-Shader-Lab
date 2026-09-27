/**
 * CPU ports of the GLSL helpers in ../glsl/core.ts: same math, same constants, same conventions.
 * Hashes emulate float32 arithmetic (Math.fround) so thresholded hashes land where the GPU puts them.
 * Functions that return a vec2 in GLSL write it to the shared scratch `V2` instead of allocating.
 */

const fr = Math.fround;
export const PI = 3.14159265359;
export const TAU = 6.28318530718;

/** Scratch output of vec2-valued helpers (hash22, voro). Read it right after the call. */
export const V2 = new Float64Array(2);

export const fract = (x: number) => x - Math.floor(x);
/** GLSL mod: x - y * floor(x / y) (sign follows y). */
export const mod = (x: number, y: number) => x - y * Math.floor(x / y);
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** clamp(x, 0, 1); NaN (undefined GPU results such as pow of a negative base) becomes 0. */
export const sat = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);
export const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
/** GLSL step(edge, x). */
export const step = (edge: number, x: number) => (x < edge ? 0 : 1);
export function smoothstep(e0: number, e1: number, x: number): number {
  let t = (x - e0) / (e1 - e0);
  t = t > 0 ? (t < 1 ? t : 1) : 0;
  return t * t * (3 - 2 * t);
}
/**
 * pow for bases the GLSL spec leaves undefined (x < 0). GPUs build pow from exp2(y · log2(x)), and the
 * log2 of the reference renderer (SwiftShader) reads exponent and mantissa bits only, so the sign is
 * dropped: pow(-x, y) = pow(x, y). Matching that keeps the ridges of 'crestas' where the GPU draws them.
 */
export const gpow = (x: number, y: number) => Math.pow(Math.abs(x), y);

const K1 = fr(0.1031), K2 = fr(0.103), K3 = fr(0.0973), A33 = fr(33.33), A31 = fr(31.32);

export function hash11(p: number): number {
  p = fract(fr(fr(p) * K1));
  p = fr(p * fr(p + A33));
  p = fr(p * fr(p + p));
  return fract(p);
}

export function hash12(x: number, y: number): number {
  const a = fract(fr(fr(x) * K1)), b = fract(fr(fr(y) * K1));
  // p3 = (a, b, a); p3 += dot(p3, p3.yzx + 33.33)
  const d = fr(fr(fr(a * fr(b + A33)) + fr(b * fr(a + A33))) + fr(a * fr(a + A33)));
  const px = fr(a + d), py = fr(b + d);
  return fract(fr(fr(px + py) * px));
}

/** Writes hash22(x, y) to V2. */
export function hash22(x: number, y: number): void {
  const fx = fr(x), fy = fr(y);
  const a = fract(fr(fx * K1)), b = fract(fr(fy * K2)), c = fract(fr(fx * K3));
  const d = fr(fr(fr(a * fr(b + A33)) + fr(b * fr(c + A33))) + fr(c * fr(a + A33)));
  const px = fr(a + d), py = fr(b + d), pz = fr(c + d);
  V2[0] = fract(fr(fr(px + py) * pz));
  V2[1] = fract(fr(fr(px + pz) * py));
}

export function hash13(x: number, y: number, z: number): number {
  const a = fract(fr(fr(x) * K1)), b = fract(fr(fr(y) * K1)), c = fract(fr(fr(z) * K1));
  // p3 += dot(p3, p3.zyx + 31.32)
  const d = fr(fr(fr(a * fr(c + A31)) + fr(b * fr(b + A31))) + fr(c * fr(a + A31)));
  const px = fr(a + d), py = fr(b + d), pz = fr(c + d);
  return fract(fr(fr(px + py) * pz));
}

/** hard(v, k): a soft threshold at 0.5 whose width shrinks as k grows. */
export function hard(v: number, k: number): number {
  const w = 0.5 * (1 - k) + 0.004;
  return smoothstep(0.5 - w, 0.5 + w, v);
}

export function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash12(ix, iy), b = hash12(ix + 1, iy), c = hash12(ix, iy + 1), d = hash12(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

/*
 * Lattice caches. Neighbouring cells fall in the same noise lattice square most of the time, so the corner
 * hashes of gnoise / noise3 are kept in small direct-mapped tables keyed by the exact lattice coordinates.
 * A hit returns exactly what the hashes would: results never depend on the cache state.
 */
const CACHE_BITS = 11, CACHE_SIZE = 1 << CACHE_BITS;
const slot2 = (x: number, y: number) => (Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77)) >>> (32 - CACHE_BITS);
const slot3 = (x: number, y: number, z: number) =>
  (Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ Math.imul(z | 0, 0xc2b2ae3d)) >>> (32 - CACHE_BITS);
const G_KEY = new Float64Array(CACHE_SIZE * 2).fill(NaN), G_VAL = new Float64Array(CACHE_SIZE * 8);
const N_KEY = new Float64Array(CACHE_SIZE * 3).fill(NaN), N_VAL = new Float64Array(CACHE_SIZE * 8);

/** Gradient noise, roughly 0..1 (it can overshoot a little, like the GLSL version). */
export function gnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const s = slot2(ix, iy), k = s * 8;
  if (G_KEY[s * 2] !== ix || G_KEY[s * 2 + 1] !== iy) {
    G_KEY[s * 2] = ix; G_KEY[s * 2 + 1] = iy;
    hash22(ix, iy); G_VAL[k] = V2[0] * 2 - 1; G_VAL[k + 1] = V2[1] * 2 - 1;
    hash22(ix + 1, iy); G_VAL[k + 2] = V2[0] * 2 - 1; G_VAL[k + 3] = V2[1] * 2 - 1;
    hash22(ix, iy + 1); G_VAL[k + 4] = V2[0] * 2 - 1; G_VAL[k + 5] = V2[1] * 2 - 1;
    hash22(ix + 1, iy + 1); G_VAL[k + 6] = V2[0] * 2 - 1; G_VAL[k + 7] = V2[1] * 2 - 1;
  }
  const va = G_VAL[k] * fx + G_VAL[k + 1] * fy;
  const vb = G_VAL[k + 2] * (fx - 1) + G_VAL[k + 3] * fy;
  const vc = G_VAL[k + 4] * fx + G_VAL[k + 5] * (fy - 1);
  const vd = G_VAL[k + 6] * (fx - 1) + G_VAL[k + 7] * (fy - 1);
  return 0.5 + 0.9 * mix(mix(va, vb, ux), mix(vc, vd, ux), uy);
}

export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const s = slot3(ix, iy, iz), k = s * 8;
  if (N_KEY[s * 3] !== ix || N_KEY[s * 3 + 1] !== iy || N_KEY[s * 3 + 2] !== iz) {
    N_KEY[s * 3] = ix; N_KEY[s * 3 + 1] = iy; N_KEY[s * 3 + 2] = iz;
    N_VAL[k] = hash13(ix, iy, iz); N_VAL[k + 1] = hash13(ix + 1, iy, iz);
    N_VAL[k + 2] = hash13(ix, iy + 1, iz); N_VAL[k + 3] = hash13(ix + 1, iy + 1, iz);
    N_VAL[k + 4] = hash13(ix, iy, iz + 1); N_VAL[k + 5] = hash13(ix + 1, iy, iz + 1);
    N_VAL[k + 6] = hash13(ix, iy + 1, iz + 1); N_VAL[k + 7] = hash13(ix + 1, iy + 1, iz + 1);
  }
  return mix(mix(mix(N_VAL[k], N_VAL[k + 1], ux), mix(N_VAL[k + 2], N_VAL[k + 3], ux), uy),
    mix(mix(N_VAL[k + 4], N_VAL[k + 5], ux), mix(N_VAL[k + 6], N_VAL[k + 7], ux), uy), uz);
}

/** 5 octaves of gnoise; the domain rotates with mat2(1.6, 1.2, -1.2, 1.6) (column-major) and shifts by 17.1. */
export function fbm(x: number, y: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) {
    v += a * gnoise(x, y);
    const nx = 1.6 * x - 1.2 * y + 17.1;
    y = 1.2 * x + 1.6 * y + 17.1;
    x = nx;
    a *= 0.5;
  }
  return v / 0.96875;
}

export function fbm3(x: number, y: number, z: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * noise3(x, y, z);
    x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.3;
    a *= 0.5;
  }
  return v / 0.9375;
}

export function sdSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * rot2(p, a) = mat2(c, -s, s, c) * p. GLSL matrices are column-major, so this is
 * (c·x + s·y, −s·x + c·y): a clockwise turn by a.
 */
export function rot2x(x: number, y: number, c: number, s: number) { return c * x + s * y; }
export function rot2y(x: number, y: number, c: number, s: number) { return -s * x + c * y; }

/**
 * rotXY(x, y) = Rx(x) * Ry(y) as built in GLSL (column-major constructors), written row-major into `out`
 * so that (out · v)[r] = out[3r] v.x + out[3r+1] v.y + out[3r+2] v.z.
 */
export function rotXY(x: number, y: number, out: Float64Array): Float64Array {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y);
  // Rx rows: (1,0,0) (0,cx,-sx) (0,sx,cx); Ry rows: (cy,0,sy) (0,1,0) (-sy,0,cy)
  out[0] = cy; out[1] = 0; out[2] = sy;
  out[3] = -sx * -sy; out[4] = cx; out[5] = -sx * cy;
  out[6] = cx * -sy; out[7] = sx; out[8] = cx * cy;
  return out;
}

/** Voronoi F1/F2 with animated feature points; writes (f1, f2) to V2. */
export function voro(x: number, y: number, t: number): void {
  const nx = Math.floor(x), ny = Math.floor(y), fx = x - nx, fy = y - ny;
  let f1 = 8, f2 = 8;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      hash22(nx + i, ny + j);
      const ox = 0.5 + 0.42 * Math.sin(t + TAU * V2[0]), oy = 0.5 + 0.42 * Math.sin(t + TAU * V2[1]);
      const dx = i + ox - fx, dy = j + oy - fy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
  }
  V2[0] = f1; V2[1] = f2;
}

/** Blend operators; index order matches BLENDS in recipe.ts and GLSL_BLEND. */
export function blendf(a: number, b: number, m: number, k: number): number {
  let r = b;
  switch (m) {
    case 1: r = a + b; break;
    case 2: r = a * b; break;
    case 3: r = 1 - (1 - a) * (1 - b); break;
    case 4: r = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b); break;
    case 5: r = Math.abs(a - b); break;
    case 6: r = Math.max(a, b); break;
    case 7: r = Math.min(a, b); break;
    case 8: r = a * smoothstep(0.42, 0.58, b); break;
    case 9: r = a * (1 - smoothstep(0.42, 0.58, b)); break;
    case 10: r = a - b; break;
  }
  return clamp(mix(a, r, k), 0, 1);
}
