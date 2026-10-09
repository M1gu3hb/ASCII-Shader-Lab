import type { AnalyticImpl } from '../types';
import { PI, TAU, mod, sat, smoothstep } from '../../engine/basic/core';
import { HIPERBOLICO_GLSL } from './hiperbolico';

/** CPU twin of F_hiperbolico, line by line (same folds, same bound). */
const IT = 40;
const R = 0.48;

/** {p,q} as drawn: q rises to the first value with (p − 2)(q − 2) > 4. */
export function hyperbolicPQ(p: number, q: number): [number, number] {
  const P = Math.floor(p + 0.5);
  return [P, Math.max(Math.floor(q + 0.5), Math.floor(2 + 4 / (P - 2)) + 1)];
}

/** The fundamental triangle of {p,q} in the Poincaré disk: edge mirror (centre cx on the real axis, radius cr), edge midpoint m, vertex radius vr, inradius b. */
export function hyperbolicTriangle(P: number, Q: number) {
  const an = PI / P;
  const ch = Math.cos(PI / Q) / Math.sin(an), sh = Math.sqrt(ch * ch - 1);
  const m = sh / (ch + 1);
  const cx = (1 + m * m) / (2 * m), cr = (1 - m * m) / (2 * m);
  const vb = cx * Math.cos(an), vr = vb - Math.sqrt(Math.max(vb * vb - 1, 0));
  return { an, m, cx, cr, vr, vx: vr * Math.cos(an), vy: vr * Math.sin(an), b: Math.log(ch + sh) };
}

/** Result of a fold: the point in the fundamental triangle, the reflection parity and |dw/dz|. */
export const FOLD = { x: 0, y: 0, par: 0, D: 1, n: 0 };

/** Folds (x, y) into the fundamental triangle of the given mirrors (FOLD holds the result). */
export function fold(x: number, y: number, an: number, cx: number, cr: number, D = 1) {
  let par = 0, n = 0;
  if (x * x + y * y < 1e-12) { x = 1e-6; y = 0; }
  for (let i = 0; i < IT; i++) {
    let w = mod(Math.atan2(y, x), 2 * an);
    if (w > an) { w = 2 * an - w; par = 1 - par; }
    const l = Math.sqrt(x * x + y * y);
    x = l * Math.cos(w); y = l * Math.sin(w);
    const dx = x - cx, dy = y, d2 = dx * dx + dy * dy;
    if (d2 >= cr * cr) break;
    const k = (cr * cr) / d2;
    x = cx + dx * k; y = dy * k;
    D *= k;
    par = 1 - par;
    n++;
  }
  FOLD.x = x; FOLD.y = y; FOLD.par = par; FOLD.D = D; FOLD.n = n;
}

// per frame (prep)
let K: Float32Array = new Float32Array(8);
let T = hyperbolicTriangle(7, 3);
let a = 0, ru = 0, cg = 1, sg = 0, cu = 1, su = 0, nvx = 0, nvy = 1, sx = 0;

export const impl: AnalyticImpl = {
  glsl: HIPERBOLICO_GLSL,
  prep(t, k) {
    K = k;
    const [P, Q] = hyperbolicPQ(k[0], k[1]);
    T = hyperbolicTriangle(P, Q);
    const u = k[4] * t / 8 - Math.floor(k[4] * t / 8);
    const rho = PI - 2 * T.an * Math.floor(P * 0.5);
    const e = Math.exp(2 * T.b * u);
    a = (e - 1) / (e + 1);
    ru = rho * u;
    const g = mod(k[5] * t * TAU / 60, TAU);
    cg = Math.cos(g); sg = Math.sin(g); cu = Math.cos(ru); su = Math.sin(ru);
    sx = T.m * 0.5;
    const lx = T.vy, ly = sx - T.vx, l = Math.hypot(lx, ly);
    nvx = lx / l; nvy = ly / l;
  },
  cpu(px, py) {
    // rot2(p / R, g), then the reflection of the outside in the rim
    let x = (cg * px + sg * py) / R, y = (-sg * px + cg * py) / R;
    let D = 1 / R, outside = 0;
    const r2 = x * x + y * y;
    if (r2 > 1) { x /= r2; y /= r2; D /= r2; outside = 1; }
    const rr = Math.sqrt(x * x + y * y);
    const x1 = cu * x + su * y, y1 = -su * x + cu * y;
    const ddx = 1 + a * x1, ddy = a * y1, dl = ddx * ddx + ddy * ddy;
    x = ((x1 + a) * ddx + y1 * ddy) / dl; y = (y1 * ddx - (x1 + a) * ddy) / dl;
    D *= (1 - a * a) / dl;
    fold(x, y, T.an, T.cx, T.cr, D);
    x = FOLD.x; y = FOLD.y; D = FOLD.D;
    const par = FOLD.par;
    const tile = T.m / D;
    const de = (Math.hypot(x - T.cx, y) - T.cr) / D;
    const hw = K[3] * (0.07 * tile + 0.004 * smoothstep(0.02, 0.06, tile));
    const edge = 1 - smoothstep(hw, hw + 0.004, de);
    let v: number, avg: number;
    if (K[2] < 0.5) {
      const g = Math.sqrt(x * x + y * y) / T.vr;
      v = Math.max(0.05 + 0.22 * g * g, edge);
      avg = 0.32;
    } else if (K[2] < 1.5) {
      v = (par > 0.5 ? 0.84 : 0.26) * (1 - edge) + 0.03 * edge;
      avg = 0.5;
    } else {
      const sd = ((x - sx) * nvx + y * nvy) / D;
      const s = 1 - smoothstep(-0.003, 0.003, sd);
      v = (0.1 + 0.14 * par) * (1 - s) + 0.94 * s;
      v = v * (1 - edge) + 0.45 * edge;
      avg = 0.42;
    }
    const f = smoothstep(0.008, 0.024, tile);
    v = avg * (1 - f) + v * f;
    v *= 1 - K[6] * smoothstep(0.3, 1, rr);
    if (outside > 0.5) v *= K[7];
    const rim = Math.abs(Math.sqrt(px * px + py * py) - R);
    return sat(Math.max(v, 0.4 * (1 - smoothstep(0.003, 0.007, rim))));
  },
};
