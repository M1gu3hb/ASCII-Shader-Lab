import type { AnalyticImpl } from '../types';
import { TAU, V2, fbm, fract, gnoise, hash11, hash22, mod, sdSeg, smoothstep } from '../../engine/basic/core';
import { DESCARGAS_GLSL } from './descargas';

/**
 * CPU twin of F_descargas, line by line. What does not depend on the cell (conductors, each arc's ends, life
 * and seed, its branches' roots and directions) is worked out once per frame in prep, with the same math the
 * shader repeats per cell.
 */
const core = (d: number, w: number) => 1 / (1 + (d * d) / (w * w));

export function descOff(s: number, L: number, sd: number, T: number): number {
  return (gnoise(s * 3.5 * L + sd, T + sd) - 0.5) * 0.8 + (gnoise(s * 10 * L + sd, T * 1.7 + 3) - 0.5) * 0.5
    + (gnoise(s * 28 * L, T * 3.1 + sd) - 0.5) * 0.28;
}

/** desc_cond into out[o], out[o + 1]. */
export function descCond(i: number, n: number, lay: number, M: number, out: Float64Array, o = 0) {
  if (lay > 0.5 && i < 0.5) { out[o] = 0.04 * Math.sin(M * 0.7); out[o + 1] = 0.03 * Math.cos(M * 0.53); return; }
  const m = lay > 0.5 ? n - 1 : n, j = lay > 0.5 ? i - 1 : i;
  const a = (TAU * j) / m + 0.35 * Math.sin(M * 0.21 + i * 1.7) + M * 0.07;
  const cx = lay > 0.5 ? 0.42 * Math.cos(a) : 0.62 * Math.cos(a), cy = lay > 0.5 ? 0.34 * Math.sin(a) : 0.3 * Math.sin(a);
  out[o] = cx + 0.07 * Math.sin(M * (0.37 + 0.05 * i) + i * 2.3);
  out[o + 1] = cy + 0.05 * Math.cos(M * (0.29 + 0.04 * i) + i);
}

interface Branch { on: boolean; eb: number; ox: number; oy: number; bx: number; by: number; lb: number; sb: number; fj: number }
interface Arc {
  ax: number; ay: number; bx: number; by: number; L: number; dx: number; dy: number; nx: number; ny: number;
  sd: number; e: number; amp: number; prog: number; br: [Branch, Branch];
}
const newBranch = (): Branch => ({ on: false, eb: 0, ox: 0, oy: 0, bx: 0, by: 0, lb: 0, sb: 0, fj: 0 });
const ARCS: Arc[] = Array.from({ length: 7 }, () => ({ ax: 0, ay: 0, bx: 0, by: 0, L: 1, dx: 1, dy: 0, nx: 0, ny: 1, sd: 0, e: 0, amp: 0, prog: 2, br: [newBranch(), newBranch()] }));
let nArcs = 0;
const COND = new Float64Array(12);
const P = new Float64Array(4);
let nCond = 0, lay = 0, jag = 0, brK = 0, T = 0, hal = 0, fl = 1, cl0 = 0, M = 0;
// storm: per bolt flash weight and its top point
const FLASH = new Float64Array(18);
let nFlash = 0;

/** Sets arc slot k for a→b (life e, whole-number id of its life), with its branches (bt < 0: they live as long as the arc). */
function setArc(k: number, ax: number, ay: number, bx: number, by: number, id: number, e: number, bt: number, Tn: number, jg: number, prog: number) {
  const A = ARCS[k];
  const sd = hash11(id * 3 + 1) * 50;
  const abx = bx - ax, aby = by - ay;
  const L = Math.max(Math.hypot(abx, aby), 1e-3);
  A.ax = ax; A.ay = ay; A.bx = bx; A.by = by; A.L = L;
  A.dx = abx / L; A.dy = aby / L; A.nx = -A.dy; A.ny = A.dx;
  A.sd = sd; A.e = e; A.amp = jg * 0.4 * L; A.prog = prog;
  for (let j = 0; j < 2; j++) {
    const B = A.br[j];
    B.on = false;
    if (brK <= 0) continue;
    const g = bt < 0 ? 0 : bt * (0.4 + 0.1 * j) + fract(sd * 0.37 + j * 0.5);
    const x = fract(g);
    const eb = bt < 0 ? 1 : smoothstep(0, 0.15, x) * (1 - smoothstep(0.55, 0.85, x));
    if (eb <= 0) continue;
    hash22(id * 5 + j * 3 + 1, Math.floor(g) * 7 + j);
    const hx = V2[0], hy = V2[1];
    const sb = 0.2 + 0.6 * hx;
    const off = descOff(sb, L, sd, Tn) * jg * 1.1 * L * Math.sqrt(sb * (1 - sb));
    B.ox = ax + abx * sb + A.nx * off; B.oy = ay + aby * sb + A.ny * off;
    const an = (hy < 0.5 ? 1 : -1) * (0.45 + 0.6 * fract(hy * 7.3)), c = Math.cos(an), s = Math.sin(an);
    // GLSL rot2 = mat2(c, -s, s, c) * p (column-major): (c·x + s·y, −s·x + c·y)
    B.bx = c * A.dx + s * A.dy; B.by = -s * A.dx + c * A.dy;
    B.lb = brK * (0.22 + 0.3 * fract(hx * 13.1)) * L;
    B.eb = eb; B.sb = sb; B.fj = j; B.on = true;
  }
}

function arcAt(A: Arc, x: number, y: number, Tn: number, jg: number): number {
  const px = x - A.ax, py = y - A.ay;
  const s = Math.min(1, Math.max(0, (px * A.dx + py * A.dy) / A.L));
  const vis = 1 - smoothstep(A.prog - 0.12, A.prog, s);
  const d0 = sdSeg(x, y, A.ax, A.ay, A.bx, A.by);
  const far = (0.16 * hal * 0.015 / (d0 + 0.015) + 0.08 * hal * Math.exp(-d0 / 0.07)) * vis;
  const w = smoothstep(A.amp + 0.1, A.amp + 0.16, d0);
  let v = far;
  if (w < 1) {
    const off = descOff(s, A.L, A.sd, Tn) * jg * 1.1 * A.L * Math.sqrt(s * (1 - s));
    const cx = A.ax + (A.bx - A.ax) * s + A.nx * off, cy = A.ay + (A.by - A.ay) * s + A.ny * off;
    const d = Math.hypot(x - cx, y - cy);
    const near = (core(d, 0.009) + 0.16 * hal * 0.015 / (d + 0.015) + 0.08 * hal * Math.exp(-d / 0.07)) * vis;
    v = near * (1 - w) + far * w;
  }
  for (let j = 0; j < 2; j++) {
    const B = A.br[j];
    if (!B.on) continue;
    const ex = B.ox + B.bx * B.lb, ey = B.oy + B.by * B.lb;
    const wb = 1 - smoothstep(0.06, 0.1, sdSeg(x, y, B.ox, B.oy, ex, ey) - 0.25 * jg * B.lb);
    if (wb <= 0) continue;
    const q = Math.min(1, Math.max(0, ((x - B.ox) * B.bx + (y - B.oy) * B.by) / B.lb));
    const o = (gnoise(q * 6 * B.lb + A.sd + B.fj, Tn * 1.3) - 0.5) * 0.5 * jg * B.lb * q;
    const cx = B.ox + B.bx * B.lb * q - B.by * o, cy = B.oy + B.by * B.lb * q + B.bx * o;
    const d = Math.hypot(x - cx, y - cy);
    const f = 1 - q;
    v += wb * B.eb * f * f * (core(d, 0.008) + 0.12 * hal * 0.015 / (d + 0.015)) * (1 - smoothstep(A.prog - 0.12, A.prog, B.sb));
  }
  return A.e * v;
}

export const impl: AnalyticImpl = {
  glsl: DESCARGAS_GLSL,
  prep(t, k) {
    lay = Math.floor(k[0] + 0.5);
    const n = Math.min(6, Math.max(2, Math.floor(k[1] + 0.5)));
    jag = k[2]; brK = k[3];
    T = t * (0.5 + 6 * k[4]); hal = 0.25 + k[5]; M = t * (0.15 + 1.2 * k[7]);
    fl = 1 - k[6] * 0.3 * (0.5 + 0.5 * Math.sin(t * 13)) * (0.5 + 0.5 * Math.sin(t * 2.3 + 1));
    nArcs = 0; nCond = 0; nFlash = 0; cl0 = k[6];
    if (lay < 1.5) {
      for (let i = 0; i < n; i++) descCond(i, n, lay, M, COND, i * 2);
      nCond = n;
      const arcs = lay > 0.5 ? n - 1 : n < 2.5 ? 1 : n;
      for (let i = 0; i < arcs; i++) {
        const ia = lay > 0.5 ? 0 : i, ib = lay > 0.5 ? i + 1 : mod(i + 1, n);
        const g = t * (0.11 + 0.04 * hash11(i * 31 + 10)) + hash11(i * 77 + 5);
        const x = fract(g);
        const e = smoothstep(0, 0.12, x) * (1 - smoothstep(0.72, 0.92, x));
        if (e > 0) setArc(nArcs++, COND[ia * 2], COND[ia * 2 + 1], COND[ib * 2], COND[ib * 2 + 1], Math.floor(g) * 8 + i, e, t, T, jag, 2);
      }
      if (lay < 0.5 && n > 3.5) {
        const g = t * 0.19 + 0.3, x = fract(g);
        const e = 0.85 * smoothstep(0, 0.1, x) * (1 - smoothstep(0.35, 0.55, x));
        if (e > 0) {
          descCond(0, n, lay, M, P, 0); descCond(Math.floor(n * 0.5), n, lay, M, P, 2);
          setArc(nArcs++, P[0], P[1], P[2], P[3], Math.floor(g) * 8 + 7, e, t, T, jag, 2);
        }
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      const g = t * (0.14 + 0.04 * i) * (0.6 + 0.8 * k[7]) + hash11(i * 37 + 3) * 10;
      const x = fract(g), li = Math.floor(g);
      const re = hash11(li * 3 + i * 17 + 5) < 0.5 ? 0 : 1;
      const env = (smoothstep(0, 0.012, x) * Math.exp(-Math.max(x - 0.03, 0) * 4) + 0.4 * re * smoothstep(0.1, 0.115, x) * Math.exp(-Math.max(x - 0.115, 0) * 12)) * (1 - smoothstep(0.8, 1, x));
      if (env < 0.002) continue;
      hash22(li * 7 + i * 13 + 1, i * 3 + 2);
      const hx = V2[0], hy = V2[1];
      const ax = (hx - 0.5) * 1.5, ay = 0.43, bx = ax + (hy - 0.5) * 0.7, by = -0.52;
      setArc(nArcs++, ax, ay, bx, by, li * 8 + i, env, -1, T * 0.25, 0.45 + 0.55 * jag, smoothstep(0, 0.03, x) * 1.13);
      FLASH[nFlash * 3] = env; FLASH[nFlash * 3 + 1] = ax; FLASH[nFlash * 3 + 2] = ay; nFlash++;
    }
  },
  cpu(x, y) {
    let v = 0;
    if (lay < 1.5) {
      for (let i = 0; i < nArcs; i++) v += arcAt(ARCS[i], x, y, T, jag);
      for (let i = 0; i < nCond; i++) {
        const r = Math.hypot(x - COND[i * 2], y - COND[i * 2 + 1]);
        v += 0.55 * Math.exp(-r / 0.015) + 0.2 * hal * Math.exp(-r / 0.05);
      }
      return Math.min(1, Math.max(0, v * fl));
    }
    const cl = smoothstep(-0.02, 0.36, y) * smoothstep(0.25, 0.8, fbm(x * 1.5 + M * 0.1, y * 3.2 - M * 0.05));
    let flash = 0;
    for (let i = 0; i < nArcs; i++) {
      v += arcAt(ARCS[i], x, y, T * 0.25, 0.45 + 0.55 * jag);
      flash += FLASH[i * 3] * Math.exp(-Math.hypot(x - FLASH[i * 3 + 1], y - FLASH[i * 3 + 2]) / 0.5);
    }
    return Math.min(1, Math.max(0, (v + (0.6 + 0.35 * cl0 * flash) * cl) * fl));
  },
};
