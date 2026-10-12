import type { AnalyticImpl } from '../types';
import { PI, TAU, fbm, fract, gnoise, hash12, mod, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { ANILLOS_TRONCO_GLSL } from './anillos_tronco';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** The polar noise of a ring (at_n). */
const noise = (dx: number, dy: number, tau: number, det: number) => fbm(dx * det * 1.6 + tau * 0.07, dy * det * 1.6 + 3.7);

/** When the wood at (x, y) was formed (τ in F_anillos_tronco), in seconds of the layer's time. */
export function formedAt(x: number, y: number, t: number, k: Float32Array): number {
  const grow = k[0], c2 = (0.6 * k[2]) / k[1];
  const r = Math.hypot(x, y);
  const dx = r > 1e-5 ? x / r : 1, dy = r > 1e-5 ? y / r : 0;
  const ecc = 1 + 0.35 * k[8] * dx;
  const A = 0.12 * k[3];
  let re = r / ecc;
  const tau0 = grow > 0.5 ? (re * re) / c2 : t - (re * re) / c2;
  re = re / (1 + A * (2 * noise(dx, dy, tau0, k[4]) - 1));
  return grow > 0.5 ? (re * re) / c2 : t - (re * re) / c2;
}

export const impl: AnalyticImpl = {
  glsl: ANILLOS_TRONCO_GLSL,
  prep: (_t, _k, _p, px) => { PXc = px ?? null; },
  cpu(x, y, t, k) {
    const PX = pxNow();
    const grow = k[0], Y = k[1];
    const c2 = (0.6 * k[2]) / Y;
    const r = Math.hypot(x, y);
    const dx = r > 1e-5 ? x / r : 1, dy = r > 1e-5 ? y / r : 0;
    const ecc = 1 + 0.35 * k[8] * dx;
    const A = 0.12 * k[3];
    let re = r / ecc;
    const tau0 = grow > 0.5 ? (re * re) / c2 : t - (re * re) / c2;
    re = re / (1 + A * (2 * noise(dx, dy, tau0, k[4]) - 1));
    const tau = grow > 0.5 ? (re * re) / c2 : t - (re * re) / c2;
    const ph = fract(tau / Y);
    const dr = (0.3 * k[2]) / Math.max(re, 0.01);
    const sharp = smoothstep(0.7 * PX, 1.8 * PX, dr);
    const late = smoothstep(0.5, 0.96, ph) * (1 - smoothstep(0.985, 1, ph));
    const yearK = 0.7 + 0.3 * hash12(Math.floor(tau / Y), 7);
    let wood = 0.14 + k[5] * (0.32 + (late * yearK - 0.32) * sharp);
    const a = Math.atan2(dy, dx);
    wood += k[6] * 0.22 * smoothstep(0.62, 0.9, gnoise(dx * 22 + r * 2.5, dy * 22));
    wood *= 0.85 + 0.3 * gnoise(dx * 6, dy * 6 + r * 60);
    for (let i = 0; i < 5; i++) {
      if (i >= k[7]) break;
      const ca = TAU * hash12(i, 13);
      const dc = Math.abs(mod(a - ca + PI, TAU) - PI) * r;
      const len = 0.25 + 0.5 * hash12(i, 17);
      wood *= 1 - 0.85 * (1 - smoothstep(0.35 * PX, 1.1 * PX, dc - 0.006 * (r - len))) * smoothstep(len, len + 0.05, r);
    }
    wood = Math.max(wood, 0.9 * (1 - smoothstep(0.006, 0.016, r)));
    if (grow > 0.5) {
      const Rb = Math.sqrt(c2 * t) * ecc * (1 + A * (2 * noise(dx, dy, t, k[4]) - 1));
      const bark = smoothstep(Rb, Rb + PX, r);
      const rough = 0.35 + 0.4 * gnoise(dx * 32 + r * 30, dy * 32);
      wood = wood + (rough - wood) * bark;
      wood *= 1 - smoothstep(Rb + 0.03, Rb + 0.03 + PX, r);
    }
    return Math.min(1, Math.max(0, wood));
  },
};
