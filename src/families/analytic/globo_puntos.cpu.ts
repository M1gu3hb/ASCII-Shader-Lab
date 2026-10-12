import type { AnalyticImpl } from '../types';
import { PI, TAU, fract, hash12, hash13, mod, sdSeg, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { GLOBO_PUNTOS_GLSL } from './globo_puntos';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** CPU twin of F_globo_puntos, line by line. The rotation and the arcs are worked out once per frame (prep). */
let cf = 1, sf = 0, ct = 1, st = 0;
const V3 = new Float64Array(3), N4 = new Float64Array(4);

/** Globe frame → view (gp_view), into V3. */
export function view(x: number, y: number, z: number, cs: [number, number, number, number] | null = null) {
  const [c1, s1, c2, s2] = cs ?? [cf, sf, ct, st];
  const ax = x * c1 + z * s1, ay = y, az = -x * s1 + z * c1;
  V3[0] = ax; V3[1] = ay * c2 - az * s2; V3[2] = ay * s2 + az * c2;
  return V3;
}
function globe(x: number, y: number, z: number) {
  const ax = x, ay = y * ct + z * st, az = -y * st + z * ct;
  V3[0] = ax * cf - az * sf; V3[1] = ay; V3[2] = ax * sf + az * cf;
  return V3;
}
/** Node (a, b) of the lattice (gp_node), into N4: direction and whether it lives. */
export function node(a: number, b: number, NL: number, jit: number) {
  const NO = 2 * NL, aw = mod(a, NO);
  const dl = PI / NL, dn = TAU / NO;
  const lat = -0.5 * PI + (b + 0.5 + (hash13(aw, b, 1) - 0.5) * jit) * dl;
  const lon = (aw + 0.5 + (hash13(aw, b, 2) - 0.5) * jit) * dn;
  N4[3] = step(hash13(aw, b, 3), 0.15 + Math.cos(-0.5 * PI + (b + 0.5) * dl)) * step(0, b) * step(b, NL - 1);
  N4[0] = Math.cos(lat) * Math.cos(lon); N4[1] = Math.sin(lat); N4[2] = Math.cos(lat) * Math.sin(lon);
  return N4;
}

function mesh(px: number, py: number, nx: number, ny: number, nz: number, side: number, R: number, k: Float32Array, PX: number): number {
  const g = globe(nx, ny, nz);
  const NL = k[1], NO = 2 * NL, jit = k[2];
  const lat = Math.asin(Math.min(1, Math.max(-1, g[1])));
  let lon = Math.atan2(g[2], g[0]);
  if (lon < 0) lon += TAU;
  const b0 = Math.floor((lat + 0.5 * PI) / (PI / NL)), a0 = Math.floor(lon / (TAU / NO));
  const rd = Math.max(k[4] * R * 0.075, 0.55 * PX);
  let v = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const a = a0 + i, b = b0 + j;
    node(a, b, NL, jit);
    if (N4[3] < 0.5) continue;
    view(N4[0], N4[1], N4[2]);
    const Pz = V3[2], spx = V3[0] * R, spy = V3[1] * R;
    const wd = smoothstep(-0.15, 0.25, Pz * side);
    v = Math.max(v, (1 - smoothstep(0.45 * rd, rd, Math.hypot(px - spx, py - spy))) * wd);
    const aw = mod(a, NO);
    node(a + 1, b, NL, jit);
    if (N4[3] > 0.5 && hash13(aw, b, 4) < k[3]) {
      view(N4[0], N4[1], N4[2]);
      v = Math.max(v, k[5] * (1 - smoothstep(0.35 * PX, 0.95 * PX, sdSeg(px, py, spx, spy, V3[0] * R, V3[1] * R))) * Math.min(wd, smoothstep(-0.15, 0.25, V3[2] * side)));
    }
    node(a, b + 1, NL, jit);
    if (N4[3] > 0.5 && hash13(aw, b, 5) < k[3]) {
      view(N4[0], N4[1], N4[2]);
      v = Math.max(v, k[5] * (1 - smoothstep(0.35 * PX, 0.95 * PX, sdSeg(px, py, spx, spy, V3[0] * R, V3[1] * R))) * Math.min(wd, smoothstep(-0.15, 0.25, V3[2] * side)));
    }
  }
  return v;
}

/** A unit direction from two hashes (gp_dir). */
function dir(k: number, o: number, out: Float64Array, at: number) {
  const z = hash12(k, o) * 2 - 1, a = TAU * hash12(k, o + 1);
  const r = Math.sqrt(Math.max(1 - z * z, 0));
  out[at] = r * Math.cos(a); out[at + 1] = z; out[at + 2] = r * Math.sin(a);
}

// the arcs of this frame: nine view-frame points each, and where the pulse is
const ARC = new Float64Array(6 * 9 * 3), SP = new Float64Array(6), D = new Float64Array(9);
let nArcs = 0;

export const impl: AnalyticImpl = {
  glsl: GLOBO_PUNTOS_GLSL,
  prep(t, k, _p, px) {
    PXc = px ?? null;
    const P = k[8], ph = fract(t / P);
    const fa = TAU * ph, ta = (k[9] * PI) / 180;
    cf = Math.cos(fa); sf = Math.sin(fa); ct = Math.cos(ta); st = Math.sin(ta);
    const lift = 0.15 + 0.9 * k[7];
    nArcs = 0;
    for (let a = 0; a < 6; a++) {
      if (a >= k[6]) break;
      nArcs++;
      dir(a, 31, D, 0); dir(a, 47, D, 3);
      let cx = D[0] + D[3] + 1e-3, cy = D[1] + D[4] + 1e-3, cz = D[2] + D[5] + 1e-3;
      const cl = Math.hypot(cx, cy, cz);
      cx = (cx / cl) * (1 + lift); cy = (cy / cl) * (1 + lift); cz = (cz / cl) * (1 + lift);
      SP[a] = fract(ph * k[11] + hash12(a, 59));
      for (let s = 0; s <= 8; s++) {
        const u = s / 8, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
        view(w0 * D[0] + w1 * cx + w2 * D[3], w0 * D[1] + w1 * cy + w2 * D[4], w0 * D[2] + w1 * cz + w2 * D[5]);
        const o = (a * 9 + s) * 3;
        ARC[o] = V3[0]; ARC[o + 1] = V3[1]; ARC[o + 2] = V3[2];
      }
    }
  },
  cpu(x, y, _t, k) {
    const PX = pxNow();
    const R = k[0];
    const r = Math.hypot(x, y);
    let v = 0;
    if (r < R) {
      const z = Math.sqrt(R * R - r * r) / R;
      v = mesh(x, y, x / R, y / R, z, 1, R, k, PX);
      v = Math.max(v, k[10] * mesh(x, y, x / R, y / R, -z, -1, R, k, PX));
    }
    v = Math.max(v, 0.38 * (1 - smoothstep(0.3 * PX, 1.1 * PX, Math.abs(r - R))));
    const lift = 0.15 + 0.9 * k[7];
    if (k[6] > 0.5 && r < R * (1.3 + lift)) {
      for (let a = 0; a < nArcs; a++) {
        for (let s = 1; s <= 8; s++) {
          const u = s / 8;
          const o0 = (a * 9 + s - 1) * 3, o1 = o0 + 3;
          const ax = ARC[o0] * R, ay = ARC[o0 + 1] * R, bx = ARC[o1] * R, by = ARC[o1 + 1] * R;
          const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
          const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8)));
          const d = Math.hypot(pax - bax * h, pay - bay * h);
          const uu = u - (1 - h) / 8;
          const qx = ARC[o0] + (ARC[o1] - ARC[o0]) * h, qy = ARC[o0 + 1] + (ARC[o1 + 1] - ARC[o0 + 1]) * h, qz = ARC[o0 + 2] + (ARC[o1 + 2] - ARC[o0 + 2]) * h;
          const hid = qz < 0 && Math.hypot(qx, qy) < 1 ? k[10] : 1;
          const glow = 0.3 + 0.7 * Math.exp(-Math.pow((uu - SP[a]) * 6, 2));
          v = Math.max(v, hid * glow * Math.max(k[5], 0.35) * (1 - smoothstep(0.35 * PX, 0.95 * PX, d)));
        }
      }
    }
    return Math.min(1, Math.max(0, v));
  },
};
