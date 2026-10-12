import type { AnalyticImpl } from '../types';
import { TAU, gnoise, hash11, hash12, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { BURBUJAS_GLSL } from './burbujas';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

/** Where the nucleation points of a layer are (x of each, for tests): n points, layout `lay`. */
export function burbujasSites(n: number, lay: number): number[] {
  const W = 1.62, out: number[] = [];
  for (let i = 0; i < n; i++) out.push((-0.5 + (i + 0.5) / n) * W + (hash11(i * 7.31 + lay * 13.7 + 1.3) - 0.5) * W / n * 0.6);
  return out;
}

/** CPU twin of F_burbujas, line by line. */
export const impl: AnalyticImpl = {
  glsl: BURBUJAS_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; },
  cpu(px, py, t, k) {
    const PX = pxNow();
    const n = Math.min(8, Math.max(5, Math.floor(k[0] + 0.5)));
    const wob = k[3], Rm = 0.01 + (0.045 - 0.01) * k[4], spread = k[5], trail = k[6];
    const ys = 0.18 + (0.47 - 0.18) * k[7], y0 = -0.47, Dy = ys - y0;
    const bu = k[8], foam = k[9], liq = k[10], lay = Math.floor(k[11] + 0.5);
    const vb = 0.1 + (0.34 - 0.1) * k[2], D = 0.3 + 0.3 * bu;
    const vmin = vb * 0.7 * 0.55;
    const aMax = (Math.sqrt(1 + 2.4 * Dy / vmin) - 1) / 1.2 + 0.6;
    let v = 0;
    if (py < ys) v = liq * (0.1 + 0.14 * smoothstep(-0.5, ys, py) + 0.14 * gnoise(px * 3, py * 6 - t * 0.15));
    const fz = py - ys, fw = 0.004 + 0.075 * foam * foam;
    if (fz > -0.3 * fw - PX && fz < fw + PX) {
      const line = Math.exp(-fz * fz / (PX * PX * 0.45));
      const band = smoothstep(-0.3 * fw - PX * 0.5, -0.3 * fw + PX * 0.5, fz) * (1 - smoothstep(fw - PX * 0.5, fw + PX * 0.5, fz));
      const dots = smoothstep(0.5, 0.72, gnoise(px * 52 + t * 0.12, py * 70 + 3.1 * Math.sin(px * 9 + t * 0.4)));
      v = Math.max(v, (0.15 + 0.85 * foam) * Math.max(line * 0.5, band * (0.18 + 0.62 * dots)));
    }
    const W = 1.62;
    for (let i = 0; i < n; i++) {
      const xi = (-0.5 + (i + 0.5) / n) * W + (hash11(i * 7.31 + lay * 13.7 + 1.3) - 0.5) * W / n * 0.6;
      const dxs = px - xi;
      if (Math.abs(dxs) > 0.1) continue;
      v = Math.max(v, 0.5 * Math.exp(-(dxs * dxs + (py - y0) * (py - y0)) / (PX * PX * 0.5)));
      if (py > y0 && py < ys) {
        const th = Math.exp(-dxs * dxs / (PX * PX * 0.3)) * smoothstep(0.45, 0.75, gnoise(i * 7.7 + dxs * 9, py * 38 - t * 5));
        v = Math.max(v, liq * 0.7 * th);
      }
      let ri = k[1] * (0.65 + 0.7 * hash11(i * 3.17 + lay * 5.1 + 7.7));
      ri = Math.min(ri, 23 / aMax);
      const ph = hash11(i * 1.91 + lay * 2.3 + 3.3);
      const jn = Math.floor(t * ri + ph);
      for (let kk = 0; kk < 24; kk++) {
        const jj = jn - kk;
        const a = t - (jj - ph) / ri;
        if (a > aMax) break;
        const h1 = hash12(jj, i + lay * 9), h2 = hash12(jj + 31.7, i * 1.7 + 3), h3 = hash12(i + 11.1, jj * 0.37 + 5);
        const sz = 0.75 + (h1 - 0.75) * spread;
        const r0 = Rm * (0.35 + 0.65 * sz);
        const vy = vb * (0.7 + 0.6 * h2) * (0.55 + 0.45 * sz), acc = 1.2 * vy;
        const ts = (Math.sqrt(vy * vy + 2 * acc * Dy) - vy) / acc;
        if (a > ts + D) continue;
        const ac = Math.min(a, ts);
        const y = y0 + vy * ac + 0.5 * acc * ac * ac;
        const r = r0 * (1 + 0.9 * (y - y0) / Dy);
        const om = 5 + 4 * h3, amp = wob * (0.004 + 0.6 * r);
        const x = xi + amp * Math.sin(ac * om + h3 * TAU) * smoothstep(0, 0.4, ac);
        const dx = px - x, dy = py - y;
        const dl = Math.sqrt(dx * dx + dy * dy);
        if (a < ts) {
          const re = Math.max(r, 0.55 * PX);
          const I = Math.min(1, Math.max(0, 0.42 + 0.58 * r / (Rm * 1.6)));
          const body = 1 - smoothstep(re - 0.3 * PX, re + 0.5 * PX, dl);
          const rw = (dl - re) / (0.45 * PX + 0.15 * re);
          const ring = Math.exp(-rw * rw);
          const hollow = smoothstep(1.1 * PX, 2.2 * PX, re);
          let b = I * Math.max(body * (1 - 0.65 * hollow), ring * hollow);
          const hx = dx + 0.4 * re, hy = dy - 0.4 * re;
          b = Math.max(b, hollow * 0.9 * Math.exp(-(hx * hx + hy * hy) / (PX * PX * 0.3)));
          const sp = vy + acc * ac, L = trail * Math.min(0.14, 0.5 * sp);
          const u = (y - re - py) / Math.max(L, 1e-4);
          if (L > 0 && u > 0 && u < 1 && dl > re) {
            const tau = (u * L + re) / sp;
            const xt = xi + amp * Math.sin((ac - tau) * om + h3 * TAU) * smoothstep(0, 0.4, ac - tau);
            const tx = (px - xt) / (0.45 * PX);
            b = Math.max(b, trail * 0.55 * I * (1 - u) * (1 - u) * Math.exp(-tx * tx));
          }
          v = Math.max(v, b);
        } else {
          const bb = (a - ts) / D;
          const ex = px - x, ey = py - ys;
          const fR = r + 1.5 * PX, fq = Math.max(0, 1 - (ex * ex + ey * ey) / (fR * fR));
          const fl = (1 - smoothstep(0, 0.25, bb)) * fq * fq;
          const rx = Math.abs(ex) - (r + bb * (0.015 + 0.06 * bu));
          const rip = (1 - bb) * (0.35 + 0.65 * bu) * Math.exp(-(rx * rx + ey * ey * 2) / (PX * PX * 0.4));
          let dr = 0;
          for (let m = 0; m < 3; m++) {
            const th = (m - 1) * (0.45 + 0.35 * hash12(jj, m + i * 3)) + (h2 - 0.5) * 0.3;
            const s = 0.1 + 0.22 * bu * (0.6 + 0.4 * hash12(m + 7, jj + i));
            const tt = bb * D;
            const qx = x + Math.sin(th) * s * tt, qy = ys + Math.cos(th) * s * tt - 0.9 * tt * tt;
            const gx = px - qx, gy = py - qy;
            dr = Math.max(dr, Math.exp(-(gx * gx + gy * gy) / (PX * PX * 0.35)) * smoothstep(-0.01, 0.005, qy - ys));
          }
          v = Math.max(v, Math.max(fl * (0.35 + 0.6 * bu), Math.max(rip, dr * bu * (1 - bb) * 0.9)));
        }
      }
    }
    return Math.min(1, Math.max(0, v));
  },
};
