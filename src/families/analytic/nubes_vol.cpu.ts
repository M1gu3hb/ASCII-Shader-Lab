import type { AnalyticImpl } from '../types';
import { PI, fbm3, hash13, noise3, sat, smoothstep } from '../../engine/basic/core';
import { NUBES_VOL_GLSL } from './nubes_vol';

/**
 * CPU twin of F_nubes_vol for the basic engine, line by line except for its budget (BUDGET): at most 32
 * view steps (the shader takes up to 64) over the same stretch, 3 steps toward the sun (the shader 5, over
 * the same distance) and 10 haze samples. The family declares it as reduced; the studio says so in basic
 * mode.
 */
const STEPS = 64;
/** The basic engine's budget; { steps: 64, light: 5, haze: 32 } computes what the shader does (tests). */
export const BUDGET = { steps: 32, light: 3, haze: 10 };

let sc = 1.6, th = 0.5, ero = 0, gain = 12, ox = 0, oy = 0, oz = 0;
/** detail false: the light's coarse density (three octaves, no erosion); true: the view's. */
function dens(x: number, y: number, z: number, layer: boolean, detail: boolean): number {
  const sx = x * sc + ox, sy = y * sc + oy, sz = z * sc + oz;
  let d = 0;
  if (detail) d = fbm3(sx, sy, sz);
  else {
    let cx = sx, cy = sy, cz = sz, a = 0.5;
    for (let i = 0; i < 3; i++) { d += a * noise3(cx, cy, cz); cx = cx * 2.03 + 17.1; cy = cy * 2.03 + 3.7; cz = cz * 2.03 + 9.3; a *= 0.5; }
    d /= 0.875;
  }
  if (layer) { const h = 2 * y - 1; d = d * smoothstep(0, 0.12, y) - 0.3 * h * h; }
  d -= th;
  if (detail && d > -0.1) d -= ero * 0.2 * noise3(sx * 3.3, sy * 3.3, sz * 3.3);
  return Math.max(d, 0) * gain;
}
const hg = (c: number, g: number) => { const k = 1 + g * g - 2 * g * c; return (1 - g * g) / (k * Math.sqrt(k)); };

/**
 * «Nebulosa»: glowing gas (fbm3 over the coverage, carved into filaments by «Erosión») that a star lights more
 * the closer it is, crossed by dark dust lanes (a second fbm3 that only absorbs, «Absorción»), in front of a
 * star field. Emission and absorption along the view ray: no march toward a light, so it costs far less than
 * a sunlit cloud. Same samples as the shader (STEPS) unless the basic engine's budget says fewer.
 */
function nebula(px: number, py: number): number {
  let dx = px, dy = py * upy + 1.1 * fwy, dz = py * upz + 1.1 * fwz;
  const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
  const n = Math.min(N, BUDGET.steps), dt = 3.9 / n;
  let T = 1, acc = 0;
  for (let i = 0; i < n; i++) {
    if (T < 0.02) break;
    const s = 0.05 + dt * (i + 0.5);
    const qx = dx * s, qy = 0.5 + dy * s, qz = dz * s;
    const sx = qx * sc + ox, sy = qy * sc + oy, sz = qz * sc + oz;
    let e = Math.max(fbm3(sx, sy, sz) - th, 0) * gain;
    if (e > 0) e *= 1 - ero * 0.85 * smoothstep(0.3, 0.7, noise3(sx * 3.3, sy * 3.3, sz * 3.3));
    const du = Math.max(fbm3(sx * 1.7 + 7.1, sy * 1.7 + 3.3, sz * 1.7 + 5.9) - 0.5, 0);
    const gx = qx - Sx, gy = qy - Sy, gz = qz - Sz;
    const glow = 0.3 + 2.4 / (1 + 5 * (gx * gx + gy * gy + gz * gz));
    acc += T * e * (0.4 + 0.6 * e) * glow * dt * 0.7;
    T *= Math.exp(-(du * 12 * sig + e * 0.1) * dt);
  }
  // behind: stars, and the star itself with a halo
  const qx = dx * 34, qy = dy * 34, qz = dz * 34, cx = Math.floor(qx), cy = Math.floor(qy), cz = Math.floor(qz);
  const h = hash13(cx, cy, cz);
  const jx = hash13(cx + 17.31, cy + 17.31, cz + 17.31) * 0.6 + 0.2, jy = hash13(cx + 41.7, cy + 41.7, cz + 41.7) * 0.6 + 0.2, jz = hash13(cx + 73.1, cy + 73.1, cz + 73.1) * 0.6 + 0.2;
  const star = smoothstep(0.45, 0, Math.hypot(qx - cx - jx, qy - cy - jy, qz - cz - jz)) * (h < 0.88 ? 0 : 1) * (0.4 + 5 * (h - 0.88));
  const c = Math.max(dx * Ux + dy * Uy + dz * Uz, 0);
  const sun = Math.pow(c, 900) * 3 + Math.pow(c, 40) * 0.25;
  const v = acc + T * (star + sun);
  // (a black point: the faintest gas stays black, so the voids read as space and not as grain)
  return sat(1 - Math.exp(-2 * Math.max(v - 0.05, 0)));
}

// per frame (prep)
let Sx = 0, Sy = 0, Sz = 2, Ux = 0, Uy = 0, Uz = 1;
let cam = 0, layer = false, sig = 1, N = 32;
let roy = 0.5, fwy = 0, fwz = 1, upy = 1, upz = 0, Lx = 0, Ly = 1, Lz = 0;
// the light march: steps growing as the shader's (0.07, 0.14, … 0.35), over the same 1.05
let LS = 0.35;

export const impl: AnalyticImpl = {
  glsl: NUBES_VOL_GLSL,
  prep(t, k) {
    cam = k[7]; layer = cam > 0.5;
    th = 0.66 * (1 - k[0]) + 0.36 * k[0]; sc = 1.6 / k[1]; ero = k[2]; sig = k[5]; gain = 12 * smoothstep(0, 0.12, k[0]);
    const w = k[3] * t;
    if (cam < 0.5) { ox = w * 0.06; oy = w * 0.012; oz = w * 0.32; } else { ox = w * 0.18; oy = w * 0.012; oz = w * 0.1; }
    roy = cam < 0.5 ? 0.5 : cam < 1.5 ? 1.45 : -1.5;
    const pitch = cam < 0.5 ? 0.05 : cam < 1.5 ? -0.1 : 0.22;
    const el = cam < 0.5 ? 0.5 : cam < 1.5 ? 0.3 : 0.95;
    fwy = Math.sin(pitch); fwz = Math.cos(pitch); upy = Math.cos(pitch); upz = -Math.sin(pitch);
    const az = k[4] * PI;
    Lx = Math.sin(az) * 0.9 + 0.2; Ly = el; Lz = -Math.cos(az);
    const l = Math.hypot(Lx, Ly, Lz); Lx /= l; Ly /= l; Lz /= l;
    N = Math.max(8, Math.min(STEPS, Math.floor(k[6] + 0.5)));
    LS = 2.1 / (BUDGET.light * (BUDGET.light + 1));
    if (cam > 2.5) {
      // the nebula: a slow flight forward through the gas, a star whose position «Luz» sets
      ox = w * 0.04; oy = w * 0.015; oz = w * 0.16;
      fwy = Math.sin(0.04); fwz = Math.cos(0.04); upy = Math.cos(0.04); upz = -Math.sin(0.04);
      Sx = 1.4 * k[4] - 0.7; Sy = 0.62; Sz = 1.9;
      const sl = Math.hypot(Sx, Sy - 0.5, Sz);
      Ux = Sx / sl; Uy = (Sy - 0.5) / sl; Uz = Sz / sl;
    }
  },
  cpu(px, py) {
    if (cam > 2.5) return nebula(px, py);
    let dx = px, dy = py * upy + 1.1 * fwy, dz = py * upz + 1.1 * fwz;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const mu = dx * Lx + dy * Ly + dz * Lz;
    const ph = 0.7 * hg(mu, 0.55) + 0.3 * hg(mu, -0.25);
    let bg = cam < 0.5 ? 0.02 + 0.3 * Math.pow(Math.max(mu, 0), 6)
      : 0.03 + 0.13 * (1 - sat(dy * 2.5)) + 0.4 * Math.pow(Math.max(mu, 0), 24);
    const hz = 0.16 + 0.12 * Math.pow(Math.max(mu, 0), 4);
    if (cam > 1.5 && dy < 0) bg = bg * (1 - sat(-dy * 6)) + 0.03 * sat(-dy * 6);
    if (cam > 0.5 && cam < 1.5 && dy < 0) bg = 0.03;
    let t0 = 0.02, t1 = 3.5, fog = 1;
    if (cam > 0.5) {
      const ry = Math.abs(dy) > 1e-4 ? dy : -1e-4;
      const ta = (0 - roy) / ry, tb = (1 - roy) / ry;
      t0 = Math.max(0, Math.min(ta, tb)); t1 = Math.min(t0 + 3, Math.max(ta, tb));
      if (t0 > 25) t1 = -1;
      if (cam < 1.5) fog = Math.exp(-t0 * 0.09);
    }
    let T = 1, acc = 0;
    if (cam > 1.5) {
      const th1 = dy > 1e-4 ? Math.min(t0, 6) : 6;
      const nh = Math.min(Math.floor(N * 0.5), BUDGET.haze), dh = th1 / nh, sh0 = 1 / Ly, ph2 = hg(mu, 0.35);
      for (let i = 0; i < nh; i++) {
        const s = dh * (i + 0.5);
        const qx = dx * s, qy = roy + dy * s, qz = dz * s;
        const s0 = -qy / Ly;
        let tau = 0;
        for (let j = 0; j < 3; j++) {
          const u = s0 + (sh0 * (j + 0.5)) / 3;
          tau += dens(qx + Lx * u, qy + Ly * u, qz + Lz * u, true, false);
        }
        const lit = Math.exp(-tau * sh0 / 3 * sig);
        const dt = 0.3 * dh;
        acc += T * (1 - Math.exp(-dt)) * (lit * ph2 * 0.4 + 0.004);
        T *= Math.exp(-dt);
      }
    }
    if (t1 > t0) {
      const n = Math.min(N, BUDGET.steps), dt = (t1 - t0) / n;
      for (let i = 0; i < n; i++) {
        if (T < 0.02) break;
        const s = t0 + dt * (i + 0.5);
        const qx = dx * s, qy = roy + dy * s, qz = dz * s;
        const d = dens(qx, qy, qz, layer, true);
        if (d > 0.001) {
          let tau = 0, u = 0;
          for (let j = 0; j < BUDGET.light; j++) {
            const ls = LS * (j + 1);
            u += ls;
            const v = u - ls * 0.5;
            tau += dens(qx + Lx * v, qy + Ly * v, qz + Lz * v, layer, false) * ls;
          }
          const amb = layer ? 0.1 + 0.4 * sat(qy) : 0.18;
          const light = Math.exp(-tau * sig) * ph * 2 + amb;
          const a = 1 - Math.exp(-d * sig * dt);
          acc += T * a * light;
          T *= 1 - a;
        }
      }
    }
    const v = hz * (1 - fog) + (acc + T * bg) * fog;
    return sat(1 - Math.exp(-1.5 * v));
  },
};
