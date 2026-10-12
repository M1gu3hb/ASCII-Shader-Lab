import type { AnalyticImpl } from '../types';
import { TAU, fract, hash12, mod, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { ARCOS_PARCIALES_GLSL } from './arcos_parciales';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/**
 * Ring i at time t: out = [radius, thickness, sense (±1), turns per cycle, arc start (rad), arc length (rad),
 * arcs around]; its arcs cover the angles start + j·2π/arcs + [0, length) of the plane.
 */
export function ringOf(i: number, t: number, k: Float32Array, out: Float64Array, PX = pxNow()) {
  const ph = fract(t / k[6]);
  const tl = (k[5] * Math.PI) / 180 + k[9] * 0.18 * Math.sin(TAU * ph);
  const ct = Math.max(Math.cos(tl), 0.08);
  const Ro = k[11], Ri = Ro * (1 - 0.85 * k[1]);
  const n = k[0], m = k[10];
  const R = Ri + (Ro - Ri) * ((i + 0.5) / n);
  let w = ((k[2] * 0.6 * (Ro - Ri + 0.05)) / n) * (1 - 0.8 * k[3] * hash12(i, 3));
  w = Math.max(w, (0.6 * PX) / ct);
  const dir = hash12(i, 7) < 0.5 ? -1 : 1;
  const turns = dir * Math.floor(1 + hash12(i, 5) * k[7]);
  const seg = TAU / m;
  out[0] = R; out[1] = w; out[2] = dir; out[3] = turns;
  out[4] = TAU * (hash12(i, 9) + turns * ph);
  out[5] = seg * Math.min(0.94, Math.max(0.06, k[4] * (0.45 + 0.9 * hash12(i, 11))));
  out[6] = m;
  return out;
}

const RG = new Float64Array(7);

export const impl: AnalyticImpl = {
  glsl: ARCOS_PARCIALES_GLSL,
  prep: (_t, _k, _p, px) => { PXc = px ?? null; },
  cpu(x, y, t, k) {
    const PX = pxNow();
    const ph = fract(t / k[6]);
    const tl = (k[5] * Math.PI) / 180 + k[9] * 0.18 * Math.sin(TAU * ph);
    const ct = Math.max(Math.cos(tl), 0.08);
    const qx = x, qy = y / ct;
    const r = Math.hypot(qx, qy), a = Math.atan2(qy, qx + 1e-6);
    const n = k[0];
    const near = 0.86 + 0.14 * -Math.sin(a) * Math.sign(Math.sin(tl));
    let v = 0;
    for (let i = 0; i < 14; i++) {
      if (i >= n) break;
      ringOf(i, t, k, RG, PX);
      const R = RG[0], w = RG[1], dir = RG[2];
      const d = Math.abs(r - R);
      if (d > w + (0.8 * PX) / ct) continue;
      const seg = TAU / RG[6], span = RG[5];
      const u = mod(a - RG[4], seg);
      const soft = (1.2 * PX) / R;
      const ends = smoothstep(0, soft, u) * smoothstep(span, span - soft, u);
      const s = Math.min(1, Math.max(0, u / span));
      const head = dir > 0 ? s : 1 - s;
      const b = (0.72 + 0.28 * hash12(i, 13)) * (1 - 0.8 * k[8] + 0.8 * k[8] * head);
      const cov = 1 - smoothstep(w, w + (0.8 * PX) / ct, d);
      v = Math.max(v, b * ends * cov * near);
    }
    return Math.min(1, Math.max(0, v));
  },
};
