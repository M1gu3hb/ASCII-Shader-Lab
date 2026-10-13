import type { AnalyticImpl } from '../types';
import { PI, TAU, clamp, hash11, mod, sat, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { LACERIA_GLSL } from './laceria';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/**
 * CPU twin of F_laceria, line by line. The per-frame work (each configuration's layers: star depth, turn,
 * radius and chord normals) is done once in prep for the two configurations a frame can show.
 */
const P = 32, H = P / 2;

/** The two nearest strands (distance, signed distance, normal) and which star / chord they are. */
const B1 = new Float64Array(4), B2 = new Float64Array(4), B3 = new Float64Array(4), I1 = new Float64Array(3), I2 = new Float64Array(3), I3 = new Float64Array(3);
let par = 0, k1 = 1e3, k2 = 1e3, k3 = 1e3;
/** The last cell's two strands and parity, as the shader resolves them (tests read it). */
export const LAST = { B1, B2, I1, I2, par: 0, over: 0 };

// per frame: for each of the two configurations (previous, current) and each layer, k, radius and chords
const CK = new Float64Array(6), CR = new Float64Array(6), CD0 = new Float64Array(6), CHL = new Float64Array(6);
// chord normals per configuration slot, layer and sense of turn (index ((slot·3 + layer)·2 + sense)·12 + j)
const CNX = new Float64Array(12 * 12), CNY = new Float64Array(12 * 12);
let N = 8, L = 1, grid = 0, rv = 0, u = 0, loopMode = 1, cNow = 0, Rb = 0.25, S = 0.42, kw = 1;

/** Adds one star polygon (configuration slot s, layer l) centred at the origin of z to the nearest strands and the parity. */
function star(zx: number, zy: number, sl: number, sense: number, pid: number) {
  const R = CR[sl], k = CK[sl], d0 = CD0[sl], hl = CHL[sl], o = (sl * 2 + sense) * 12;
  let m = 0;
  for (let j = 0; j < N; j++) {
    const nx = CNX[o + j], ny = CNY[o + j];
    const s = zx * nx + zy * ny - d0, al0 = -zx * ny + zy * nx, al = Math.abs(al0);
    if (s > 0) m++;
    let d = Math.abs(s), ss = s, gx = nx, gy = ny;
    if (al > hl) {
      // past the chord's end: the strand's corner at the star's tip (radial side and direction)
      const sg = Math.sign(al0), ex = d0 * nx - sg * hl * ny, ey = d0 * ny + sg * hl * nx;
      gx = ex / R; gy = ey / R;
      d = Math.hypot(zx - ex, zy - ey);
      ss = (zx - ex) * gx + (zy - ey) * gy;
    }
    const fk = pid * 0.6180339 + j * 0.1271;
    const key = d + 2e-4 * Math.abs(ss) + 1e-5 * (fk - Math.floor(fk));
    if (key < k1) {
      B3.set(B2); I3.set(I2); B2.set(B1); I2.set(I1); k3 = k2; k2 = k1; k1 = key;
      B1[0] = d; B1[1] = ss; B1[2] = gx; B1[3] = gy; I1[0] = pid; I1[1] = j; I1[2] = k;
    } else if (key < k2) {
      B3.set(B2); I3.set(I2); k3 = k2; k2 = key;
      B2[0] = d; B2[1] = ss; B2[2] = gx; B2[3] = gy; I2[0] = pid; I2[1] = j; I2[2] = k;
    } else if (key < k3) {
      k3 = key;
      B3[0] = d; B3[1] = ss; B3[2] = gx; B3[3] = gy; I3[0] = pid; I3[1] = j; I3[2] = k;
    }
  }
  if (zx * zx + zy * zy < R * R) par += mod(k - m + 24, 2);
}

export const impl: AnalyticImpl = {
  glsl: LACERIA_GLSL,
  prep(t, k, _p, px) {
    PXc = px ?? null;
    N = 6 + 2 * clamp(Math.floor(k[0] + 0.5), 0, 3);
    grid = Math.floor(k[1] + 0.5);
    const kmax = N * 0.5 - 1;
    L = clamp(Math.floor(k[3] + 0.5), 1, 3);
    loopMode = k[7] < 0.5 ? 1 : 0;
    rv = k[6]; kw = k[4];
    cNow = Math.floor(t / H); u = t / H - cNow;
    const kb = clamp(Math.floor(k[2] + 0.5), 2, kmax);
    const q = Math.floor(k[5] * 3 + 0.5);
    S = grid < 0.5 ? 0.8 : 0.86;
    Rb = grid > 1.5 ? 0.47 : 0.45 * S;
    for (let slot = 0; slot < 2; slot++) {
      const cfg = rv < 0.001 ? 0 : slot === 1 ? cNow : cNow - 1;
      const cb = loopMode > 0.5 ? mod(cfg, 2) : cfg;
      const jump = loopMode > 0.5 ? cb : Math.floor(hash11(cb + 101) * 5);
      let Rp = Rb;
      for (let l = 0; l < 3; l++) {
        const sl = slot * 3 + l;
        const kl = l === 0 ? 2 + mod(kb - 2 + jump, Math.max(kmax - 1, 1)) : 2;
        const sg = mod(l, 2) < 0.5 ? 1 : -1;
        const spin = loopMode > 0.5 ? (sg * q * (TAU / N) * (l + 1) * t) / P : sg * k[5] * 0.25 * t * (1 + 0.618 * l);
        const off = loopMode > 0.5 ? (mod(cb * (l + 1), 2) * PI) / N : (hash11(cb * 4 + l + 7) * TAU) / N;
        const R = Rp;
        Rp *= Math.cos((PI * kl) / N) * 0.92;
        CK[sl] = kl; CR[sl] = R; CD0[sl] = R * Math.cos((PI * kl) / N); CHL[sl] = R * Math.sin((PI * kl) / N);
        // both senses of turn (lattice neighbours turn the other way)
        for (let sense = 0; sense < 2; sense++) {
          const rot = (sense ? -spin : spin) + off, o = (sl * 2 + sense) * 12;
          for (let j = 0; j < N; j++) {
            const b = rot + ((2 * j + kl) * PI) / N;
            CNX[o + j] = Math.cos(b); CNY[o + j] = Math.sin(b);
          }
        }
      }
    }
  },
  cpu(x, y) {
    const PX = pxNow();
    const sF = grid > 1.5 ? Math.hypot(x, y) / 1.05
      : Math.min(Math.min(Math.hypot(x + 0.9, y + 0.5), Math.hypot(x - 0.9, y + 0.5)), Math.min(Math.hypot(x + 0.9, y - 0.5), Math.hypot(x - 0.9, y - 0.5))) / 1.03;
    const Rf = smoothstep(0, Math.max(rv, 1e-3), u) * 1.08;
    const slot = rv < 0.001 ? 1 : sF < Rf ? 1 : 0;
    const fresh = rv < 0.001 || sF >= Rf ? 0 : 1 - smoothstep(0, 0.08, Rf - sF);
    const w = 0.55 * PX * kw, o = 0.8 * PX, gp = 0.6 * PX;
    B1[0] = 1e3; B1[1] = 0; B1[2] = 1; B1[3] = 0; B2.set(B1); B3.set(B1);
    I1[0] = I1[1] = I1[2] = -1; I2[0] = I2[1] = I2[2] = -2; I3[0] = I3[1] = I3[2] = -3; par = 0; k1 = k2 = k3 = 1e3;
    const reach = Rb + w + o + gp;
    if (grid > 1.5) {
      for (let l = 0; l < L; l++) star(x, y, slot * 3 + l, 0, l);
    } else if (grid < 0.5) {
      const ix = Math.floor(x / S), iy = Math.floor(y / S);
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const idx = ix + dx, idy = iy + dy;
        const zx = x - idx * S, zy = y - idy * S;
        if (Math.hypot(zx, zy) > reach) continue;
        const pid = (idx * 7 + idy * 131) * 4;
        const sense = mod(idx + idy, 2) < 0.5 ? 0 : 1;
        for (let l = 0; l < L; l++) star(zx, zy, slot * 3 + l, sense, pid + l);
      }
    } else {
      const hj = y / (S * 0.8660254), hi = x / S - hj * 0.5;
      const ix = Math.floor(hi), iy = Math.floor(hj);
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const idx = ix + dx, idy = iy + dy;
        const zx = x - (idx + idy * 0.5) * S, zy = y - idy * S * 0.8660254;
        if (Math.hypot(zx, zy) > reach) continue;
        const pid = (idx * 7 + idy * 131) * 4;
        const sense = mod(idx + idy, 2) < 0.5 ? 0 : 1;
        for (let l = 0; l < L; l++) star(zx, zy, slot * 3 + l, sense, pid + l);
      }
    }
    const bg = 0.08 + (0.24 - 0.08) * mod(par, 2);
    let dj = mod(I1[1] - I2[1] + N, N);
    if (I1[0] === I2[0] && (Math.abs(dj - I1[2]) < 0.5 || Math.abs(dj - (N - I1[2])) < 0.5)) { B2.set(B3); I2.set(I3); }
    dj = mod(I1[1] - I2[1] + N, N);
    const tip = I1[0] === I2[0] && (Math.abs(dj - I1[2]) < 0.5 || Math.abs(dj - (N - I1[2])) < 0.5);
    const cross = B2[0] < w + o + gp && !tip && Math.abs(B1[2] * B2[3] - B1[3] * B2[2]) > 0.2;
    let dO = B1[0], dU = 1e3;
    LAST.par = par; LAST.over = 0;
    if (cross) {
      const nAx = B1[2], nAy = B1[3], nBx = B2[2], nBy = B2[3];
      const dAx = -nAy, dAy = nAx;
      let dBx = -nBy, dBy = nBx;
      if (dAx * dBy - dAy * dBx < 0) { dBx = -dBx; dBy = -dBy; }
      const qp = mod(par + (B1[1] > 0 ? 1 : 0) + (dBx * nAx + dBy * nAy > 0 ? 1 : 0) + (B2[1] > 0 ? 1 : 0) + (dAx * nBx + dAy * nBy > 0 ? 1 : 0), 2);
      if (qp > 0.5) { dO = B1[0]; dU = B2[0]; } else { dO = B2[0]; dU = B1[0]; }
      LAST.over = qp > 0.5 ? 1 : 2;
    }
    let v = bg;
    const core = w + o;
    if (dO < core) v = dO < w ? 0.92 - 0.12 * (dO / w) * (dO / w) : 0;
    else if (cross && dO < core + gp) v = dU < core ? 0 : bg;
    else if (dU < core) v = dU < w ? 0.92 - 0.12 * (dU / w) * (dU / w) : 0;
    if (v > 0.5) v = v + (1 - v) * fresh;
    if (rv > 0.001 && u < rv) v = Math.max(v, 0.55 * (1 - smoothstep(PX * 0.4, PX * 1.1, Math.abs(sF - Rf))));
    return sat(v);
  },
};
