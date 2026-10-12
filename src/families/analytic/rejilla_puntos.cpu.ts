import type { AnalyticImpl } from '../types';
import { TAU, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { REJILLA_PUNTOS_GLSL } from './rejilla_puntos';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** The height of lattice point (wx, wz) at time t (rp_h). */
export function heightAt(wx: number, wz: number, t: number, k: Float32Array, zw: number): number {
  const kk = TAU / (0.5 + 2.5 * k[2]);
  const sp = 0.4 + 2.2 * k[3];
  let h = Math.sin(wx * kk + t * sp) * Math.cos(wz * kk * 0.8 - t * sp * 0.7) + 0.5 * Math.sin((wx + wz) * kk * 1.7 + t * sp * 1.3);
  const r = Math.hypot(wx, wz - (zw + 4));
  h += (k[8] * 1.4 * Math.sin(r * kk * 1.3 - t * sp * 1.6)) / (1 + 0.35 * r);
  return 0.12 * k[1] * h;
}

/**
 * Where lattice point (i, j) is on the screen at time t: out = [x, y, camera depth, height]; false when it is
 * behind the camera.
 */
export function project(i: number, j: number, t: number, k: Float32Array, out: Float64Array): boolean {
  const s = k[0], f = 1.1;
  const al = ((10 + (42 - 10) * k[5]) * Math.PI) / 180, ca = Math.cos(al), sa = Math.sin(al);
  const zw = k[4] * t * 0.5, cx = k[9] * 0.7 * Math.sin(t * 0.21);
  const Z = j * s - zw;
  const h = heightAt(i * s, j * s, t, k, zw);
  const yc = (h - 1) * ca + Z * sa, zc = -(h - 1) * sa + Z * ca;
  if (zc < 0.1) return false;
  out[0] = ((i * s - cx) * f) / zc; out[1] = (yc * f) / zc; out[2] = zc; out[3] = h;
  return true;
}

export const impl: AnalyticImpl = {
  glsl: REJILLA_PUNTOS_GLSL,
  prep: (_t, _k, _p, px) => { PXc = px ?? null; },
  cpu(x, y, t, k) {
    const PX = pxNow();
    const s = k[0], f = 1.1;
    const al = ((10 + (42 - 10) * k[5]) * Math.PI) / 180, ca = Math.cos(al), sa = Math.sin(al);
    const den = f * sa - y * ca;
    if (den <= 0.02) return 0;
    const zw = k[4] * t * 0.5;
    const cx = k[9] * 0.7 * Math.sin(t * 0.21);
    const lam = 1 / den;
    const Z0 = lam * (y * sa + f * ca);
    const j0 = Math.floor((Z0 + zw) / s + 0.5);
    let best = 0;
    const A = 0.12 * k[1] + 1e-3;
    for (let m = -4; m <= 4; m++) {
      const j = j0 + m;
      const Z = j * s - zw;
      if (Z < 0.05) continue;
      const zc0 = sa + Z * ca;
      const i = Math.floor(((x * zc0) / f + cx) / s + 0.5);
      const wx = i * s, wz = j * s;
      const h = heightAt(wx, wz, t, k, zw);
      const yc = (h - 1) * ca + Z * sa, zc = -(h - 1) * sa + Z * ca;
      if (zc < 0.1) continue;
      const qx = ((wx - cx) * f) / zc, qy = (yc * f) / zc;
      const rd = Math.max((k[6] * s * 0.36 * f) / zc, 0.75 * PX);
      const fade = smoothstep(0.15 * PX, 0.9 * PX, (f * s) / (zc * zc)) * Math.exp(-zc * k[7] * 0.3);
      const v = (1 - smoothstep(0.5 * rd, rd, Math.hypot(x - qx, y - qy))) * fade * (0.5 + 0.5 * Math.min(1, Math.max(0, 0.5 + (0.5 * h) / A)));
      if (v > best) best = v;
    }
    return Math.min(1, Math.max(0, best));
  },
};
