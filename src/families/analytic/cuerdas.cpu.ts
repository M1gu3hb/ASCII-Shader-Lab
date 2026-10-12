import type { AnalyticImpl } from '../types';
import { PI, TAU, V2, hash22, mod, sat, sdSeg, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { CUERDAS_GLSL } from './cuerdas';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;

/** aₙ: the amplitude of mode n in a string plucked at the fraction pk of its length (the triangle's sine series). */
export const pluckAmp = (n: number, pk: number) => (2 * Math.sin(n * PI * pk)) / (n * n * PI * PI * pk * (1 - pk));

/**
 * One string's displacement at the fraction s of its length, τ seconds after its pluck (units of the amplitude):
 * the sum of its first `modes` modes, drawn back into the pluck's shape over the end of the cycle.
 * Writes [u, du/ds, envelope] into SU (exported for the tests).
 */
export const SU = new Float64Array(3);
export function stringAt(s: number, tau: number, P: number, modes: number, pk: number, fs: number, dec: number, B: number): Float64Array {
  const gam = 0.12 + 1.2 * dec;
  let u = 0, du = 0, env = 0, S = 0, dS = 0;
  for (let n = 1; n <= 4; n++) {
    if (n > modes) break;
    const an = pluckAmp(n, pk);
    const sn = Math.sin(n * PI * s), cn = Math.cos(n * PI * s);
    const g = Math.exp(-gam * (1 + 0.7 * (n - 1)) * tau);
    const c = Math.cos(TAU * fs * n * Math.sqrt(1 + B * n * n) * tau) * g;
    u += an * sn * c; du += an * n * PI * cn * c;
    env += Math.abs(an * sn) * g;
    S += an * sn; dS += an * n * PI * cn;
  }
  const pull = smoothstep(P - Math.min(0.35, P * 0.08), P, tau);
  SU[0] = u + (S - u) * pull; SU[1] = du + (dS - du) * pull; SU[2] = env + (Math.abs(S) - env) * pull;
  return SU;
}

/** CPU twin of F_cuerdas, line by line. */
export function cuerdas(px: number, py: number, t: number, k: Float32Array): number {
  const PX = PXc ?? currentPX();
  const N = Math.floor(k[0] + 0.5), M = Math.floor(k[1] + 0.5), pk = k[2], A = k[3];
  const P = k[4], f1 = k[5], dec = k[6], pat = Math.floor(k[7] + 0.5);
  const ex = k[8], rosin = k[9], wd = k[10], B = k[11] * 0.03;
  const L0 = k[12], Wsp = k[13], tune = k[14];
  const w = PX * (0.05 + 0.75 * wd), yb = -L0 * 0.5;
  let v = 0;
  const last = Math.max(N - 1, 1);
  const reach = A * 1.4 + (rosin > 0 ? 0.3 : PX * 3);
  const gam = 0.12 + 1.2 * dec;
  for (let i = 0; i < 12; i++) {
    if (i >= N) break;
    const xi = N < 1.5 ? 0 : Wsp * (i / last - 0.5);
    const L = L0 * (1 - (tune * 0.45 * i) / last);
    const dx0 = px - xi;
    if (Math.abs(dx0) > reach) continue;
    const ti = pat < 0.5 ? (P * i) / N : pat < 1.5 ? P * 0.02 * i : mod(i, 2) < 0.5 ? 0 : P * 0.5;
    const tau = mod(t - ti, P);
    const s = (py - yb) / L;
    const fs = f1 * (1 + (tune * 1.2 * i) / last);
    stringAt(s, tau, P, M, pk, fs, dec, B);
    const pull = smoothstep(P - Math.min(0.35, P * 0.08), P, tau);
    const u = A * SU[0], du = (A / L) * SU[1], env = A * SU[2];
    const inside = s < 0 || s > 1 ? 0 : 1;
    const d = Math.abs(dx0 - u) / Math.sqrt(1 + du * du);
    const energy = Math.max(Math.exp(-gam * tau), pull);
    v = Math.max(v, (1 - smoothstep(w, w + PX * 0.9, d)) * inside * (0.6 + 0.4 * energy));
    if (env > PX * 0.8) {
      const r = dx0 / env;
      v = Math.max(v, ex * 0.42 * inside * (1 - smoothstep(0.9, 1.05, Math.abs(r))) * (0.3 + 0.7 * r * r) * Math.min(env / (PX * 4), 1));
    }
    const pg = Math.min(Math.hypot(dx0, py - yb), Math.hypot(dx0, py - yb - L));
    v = Math.max(v, 0.9 * (1 - smoothstep(PX * 0.8, PX * 1.8, pg)));
    if (rosin > 0) for (let j = 0; j < 8; j++) {
      hash22(i * 7.1 + j, j * 3.3 + 1.7);
      const hx = V2[0], hy = V2[1];
      const an = TAU * hx, sp = 0.05 + 0.14 * hy;
      const q = (sp * (1 - Math.exp(-1.6 * tau))) / 1.6;
      const ox = xi + A * 0.8 + Math.cos(an) * q + 0.012 * Math.sin(tau * 2 + j);
      const oy = yb + pk * L + Math.sin(an) * q - 0.025 * tau * tau + 0.012 * Math.cos(tau * 1.7 + j * 2);
      const fade = Math.exp(-tau / (0.6 + 0.7 * hx)) * smoothstep(0, 0.04, tau);
      v = Math.max(v, rosin * fade * (1 - smoothstep(PX * 0.35, PX * 1.3, Math.hypot(px - ox, py - oy))));
    }
  }
  const x0 = N < 1.5 ? -0.04 : -Wsp * 0.5 - 0.03, x1 = N < 1.5 ? 0.04 : Wsp * 0.5 + 0.03;
  const fr = Math.min(sdSeg(px, py, x0, yb, x1, yb), sdSeg(px, py, x0, yb + L0, x1, yb + L0 * (1 - tune * 0.45)));
  v = Math.max(v, 0.42 * (1 - smoothstep(PX * 0.4, PX * 1.4, fr)));
  return sat(v);
}

export const impl: AnalyticImpl = {
  glsl: CUERDAS_GLSL,
  prep: (_t, _k, _p, px) => { PXc = px ?? null; },
  cpu: cuerdas,
};
