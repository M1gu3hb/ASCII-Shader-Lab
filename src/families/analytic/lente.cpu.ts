import type { AnalyticImpl } from '../types';
import { PI, TAU, fract, hash13, noise3, sat, smoothstep } from '../../engine/basic/core';
import { LENTE_GLSL } from './lente';

/** CPU twin of F_lente_gravitacional, line by line (same steps, same crossings). */
const STEPS = 96;

/** The step in φ the integration takes at u = 1/r (smaller near the photon sphere, u = 2/3). */
export const stepAt = (u: number) => 0.02 + 0.16 * sat(1 - 1.4 * u);

/** One RK4 step of u'' = −u + 3/2 u² (r_s = 1); writes the new (u, w) to RK. */
export const RK = new Float64Array(2);
export function rk4(u: number, w: number, h: number) {
  const f = (a: number) => -a + 1.5 * a * a;
  const a1u = w, a1w = f(u);
  const a2u = w + 0.5 * h * a1w, a2w = f(u + 0.5 * h * a1u);
  const a3u = w + 0.5 * h * a2w, a3w = f(u + 0.5 * h * a2u);
  const a4u = w + h * a3w, a4w = f(u + h * a3u);
  RK[0] = u + (h / 6) * (a1u + 2 * a2u + 2 * a3u + a4u);
  RK[1] = w + (h / 6) * (a1w + 2 * a2w + 2 * a3w + a4w);
}

/**
 * A light ray from (u0, w0 = du/dφ) at φ = 0, integrated as the shader does: 'capture' (r ≤ r_s),
 * 'escape' with the asymptotic angle φ, or 'open' when the steps run out.
 */
export function trace(u0: number, w0: number, steps = STEPS): { fate: 'capture' | 'escape' | 'open'; phi: number } {
  let u = u0, w = w0, phi = 0;
  for (let i = 0; i < steps; i++) {
    const h = stepAt(u);
    rk4(u, w, h);
    phi += h;
    if (RK[0] >= 1) return { fate: 'capture', phi };
    if (RK[0] <= 0) return { fate: 'escape', phi: phi - h + (h * u) / (u - RK[0]) };
    u = RK[0]; w = RK[1];
  }
  return { fate: 'open', phi };
}

function background(dx: number, dy: number, dz: number, mode: number): number {
  let v = 0;
  if (mode < 0.5 || mode > 1.5) {
    const qx = dx * 34, qy = dy * 34, qz = dz * 34, cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz);
    const h = hash13(cx, cy, cz);
    const ox = hash13(cx + 17.31, cy + 17.31, cz + 17.31) * 0.6 + 0.2, oy = hash13(cx + 41.7, cy + 41.7, cz + 41.7) * 0.6 + 0.2, oz = hash13(cx + 73.1, cy + 73.1, cz + 73.1) * 0.6 + 0.2;
    const l = Math.hypot(qx - cx - ox, qy - cy - oy, qz - cz - oz);
    v = smoothstep(0.45, 0, l) * (h < 0.9 ? 0 : 1) * (0.45 + 5.5 * (h - 0.9)) + 0.015 + 0.04 * noise3(dx * 3, dy * 3, dz * 3);
  }
  if (mode > 0.5) {
    const lon = Math.atan2(dz, dx), lat = Math.asin(Math.max(-1, Math.min(1, dy))), st = PI / 12;
    const gl = Math.abs(fract(lon / st + 0.5) - 0.5) * st * Math.cos(lat), gb = Math.abs(fract(lat / st + 0.5) - 0.5) * st;
    v = Math.max(v, 0.75 * (1 - smoothstep(0.006, 0.014, Math.min(gl, gb))));
  }
  return v;
}

// per frame (prep)
let K: Float32Array = new Float32Array(8);
let D = 14, rout = 12, T0 = 0;
let C = [0, 0, 14], fw = [0, 0, -1], rt = [1, 0, 0], up = [0, 1, 0];
const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export const impl: AnalyticImpl = {
  glsl: LENTE_GLSL,
  prep(t, k) {
    K = k; T0 = t;
    D = k[0]; rout = k[3];
    const inc = k[1] * PI / 180, az = t * k[2] * TAU / 60;
    C = [D * Math.cos(inc) * Math.sin(az), D * Math.sin(inc), D * Math.cos(inc) * Math.cos(az)];
    fw = [-C[0] / D, -C[1] / D, -C[2] / D];
    // rt = normalize(cross(fw, y)), up = cross(rt, fw)
    rt = norm([-fw[2], 0, fw[0]]);
    up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  },
  cpu(px, py) {
    let dx = px * rt[0] + py * up[0] + 1.1 * fw[0], dy = px * rt[1] + py * up[1] + 1.1 * fw[1], dz = px * rt[2] + py * up[2] + 1.1 * fw[2];
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const e1x = C[0] / D, e1y = C[1] / D, e1z = C[2] / D;
    const cp = dx * e1x + dy * e1y + dz * e1z;
    let e2x = dx - cp * e1x, e2y = dy - cp * e1y, e2z = dz - cp * e1z;
    let sp = Math.hypot(e2x, e2y, e2z);
    if (sp > 1e-6) { e2x /= sp; e2y /= sp; e2z /= sp; } else { e2x = up[0]; e2y = up[1]; e2z = up[2]; }
    sp = Math.max(sp, 1e-4);
    let u = 1 / D, w = -u * Math.sqrt(1 - u) * cp / sp;
    let pc = Math.atan2(-e1y, e2y);
    if (pc <= 0) pc += PI;
    let phi = 0, T = 1, col = 0, fate = 0, phiE = 0;
    for (let i = 0; i < STEPS; i++) {
      const h = stepAt(u);
      rk4(u, w, h);
      const nu = RK[0], nw = RK[1];
      if (pc <= phi + h) {
        const x = (pc - phi) / h, x2 = x * x, x3 = x2 * x;
        const uc = (2 * x3 - 3 * x2 + 1) * u + (x3 - 2 * x2 + x) * h * w + (3 * x2 - 2 * x3) * nu + (x3 - x2) * h * nw;
        const wc = w * (1 - x) + nw * x;
        const r = uc > 1e-6 ? 1 / uc : 1e6;
        if (r > 3 && r < rout && K[4] > 0 && T > 0.01) {
          const c = Math.cos(pc), s = Math.sin(pc);
          const erx = c * e1x + s * e2x, ery = c * e1y + s * e2y, erz = c * e1z + s * e2z;
          const th = Math.atan2(r * erz, r * erx), om = Math.sqrt(0.5 / (r * r * r));
          const tha = th - K[7] * T0 * 5.8 * om;
          const q = 3 / r, I = 14 * q * q * q * (1 - Math.sqrt(q));
          const tex = 0.4 + 0.6 * noise3(Math.cos(tha) * 2.2, Math.sin(tha) * 2.2, Math.log(r) * 7);
          const v = Math.sqrt(0.5 / (r - 1));
          const dr = -wc / (uc * uc);
          const tx = dr * erx + r * (-s * e1x + c * e2x), ty = dr * ery + r * (-s * e1y + c * e2y), tz = dr * erz + r * (-s * e1z + c * e2z);
          const tl = Math.hypot(tx, ty, tz);
          const cosa = (Math.sin(th) * tx - Math.cos(th) * tz) / tl;
          const g = Math.sqrt(1 - v * v) / (1 - v * cosa);
          const al = sat(K[4] * 1.5);
          col += T * al * K[4] * I * tex * Math.min(g * g, 5);
          T *= 1 - al;
        }
        pc += PI;
      }
      phi += h;
      const pu = u;
      u = nu; w = nw;
      if (u >= 1) { fate = 2; break; }
      if (u <= 0) { phiE = phi - h + (h * pu) / (pu - u); fate = 1; break; }
    }
    let bg = 0;
    if (fate > 0.5 && fate < 1.5) {
      const c = Math.cos(phiE), s = Math.sin(phiE);
      bg = background(c * e1x + s * e2x, c * e1y + s * e2y, c * e1z + s * e2z, K[5]);
    }
    return sat(1 - Math.exp(-(col + T * bg) * K[6] * 1.6));
  },
};
