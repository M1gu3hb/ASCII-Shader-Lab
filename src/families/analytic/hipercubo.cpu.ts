import type { AnalyticImpl } from '../types';
import { TAU, clamp, sat, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/patterns';
import { HC_E, HC_POLY, HC_V, HIPERCUBO_GLSL } from './hipercubo';

/**
 * CPU twin of F_hipercubo, line by line. The figure (each vertex projected, for the figure now and its trail)
 * only depends on time, so prep computes it once per frame; each cell then measures its distance to the edges
 * (skipping those whose box is farther than the line can reach).
 */
const COPIES = 4;
const PXs = new Float64Array(COPIES * 24), PYs = new Float64Array(COPIES * 24), PW = new Float64Array(COPIES * 24), PZ = new Float64Array(COPIES * 24);
const WT = new Float64Array(COPIES), BOX = new Float64Array(COPIES * 4);
let nCopies = 1, poly = HC_POLY[0], wdK = 1;

/** Projects the figure at time t into copy slot j (the shader's hc_project). */
export function project(t: number, k: ArrayLike<number>, j: number, out?: { x: Float64Array; y: Float64Array; w: Float64Array; z: Float64Array }) {
  const X = out?.x ?? PXs, Y = out?.y ?? PYs, Wv = out?.w ?? PW, Z = out?.z ?? PZ;
  const pl = Math.floor(k[0] + 0.5);
  const P = HC_POLY[pl < 0.5 ? 0 : pl < 1.5 ? 1 : 2];
  const ph = (TAU * t) / k[4];
  const a = Math.floor(k[1] + 0.5) * ph, b = Math.floor(k[2] + 0.5) * ph, c = Math.floor(k[3] + 0.5) * ph;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const D4 = k[5], Rm = D4 / (D4 - 1), D3 = 3.2 * Rm, Fk = (0.72 * D3) / Rm;
  const cy = Math.cos(ph + 0.6), sy = Math.sin(ph + 0.6), cp = Math.cos(0.42), sp = Math.sin(0.42);
  for (let i = 0; i < P.nv; i++) {
    let [x, y, z, w] = HC_V[P.v0 + i];
    let z1 = cc * z - sc * w, w1 = sc * z + cc * w; z = z1; w = w1;
    const y1 = cb * y - sb * w; w1 = sb * y + cb * w; y = y1; w = w1;
    const x1 = ca * x - sa * w; w1 = sa * x + ca * w; x = x1; w = w1;
    const k4 = D4 / (D4 - w);
    let qx = x * k4, qy = y * k4, qz = z * k4;
    const qx1 = cy * qx + sy * qz; z1 = -sy * qx + cy * qz; qx = qx1; qz = z1;
    const qy1 = cp * qy - sp * qz; z1 = sp * qy + cp * qz; qy = qy1; qz = z1;
    const kk = Fk / (D3 - qz);
    X[j * 24 + i] = qx * kk; Y[j * 24 + i] = qy * kk; Wv[j * 24 + i] = w; Z[j * 24 + i] = qz / Rm;
  }
  return P;
}

export const impl: AnalyticImpl = {
  glsl: HIPERCUBO_GLSL,
  prep(t, k) {
    nCopies = 0;
    for (let j = 0; j < COPIES; j++) {
      const wt = j === 0 ? 1 : k[7] * Math.pow(0.62, j);
      if (wt < 0.02) break;
      WT[j] = wt;
      poly = project(t - j * k[4] * 0.006, k, j);
      // the copy's box on screen: cells farther than a line can reach skip it
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < poly.nv; i++) { const x = PXs[j * 24 + i], y = PYs[j * 24 + i]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      BOX[j * 4] = x0; BOX[j * 4 + 1] = x1; BOX[j * 4 + 2] = y0; BOX[j * 4 + 3] = y1;
      nCopies++;
    }
    wdK = k[6];
  },
  cpu(px, py) {
    const PX = currentPX();
    const wd = wdK * PX * 0.5;
    const reach = wd * 2.2 + PX * 3;
    let v = 0;
    for (let j = 0; j < nCopies; j++) {
      // (a copy can only raise v up to its weight; outside its box nothing reaches the cell)
      if (v >= WT[j] || px < BOX[j * 4] - reach || px > BOX[j * 4 + 1] + reach || py < BOX[j * 4 + 2] - reach || py > BOX[j * 4 + 3] + reach) continue;
      let best = 0;
      const o = j * 24;
      for (let i = 0; i < poly.ne; i++) {
        const [ea, eb] = HC_E[poly.e0 + i];
        const ax = PXs[o + ea], ay = PYs[o + ea], bx = PXs[o + eb], by = PYs[o + eb];
        // (the box test only skips edges the distance test below would skip too)
        if (px < Math.min(ax, bx) - reach || px > Math.max(ax, bx) + reach || py < Math.min(ay, by) - reach || py > Math.max(ay, by) + reach) continue;
        const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
        const h = clamp((pax * bax + pay * bay) / Math.max(bax * bax + bay * bay, 1e-8), 0, 1);
        const d = Math.hypot(pax - bax * h, pay - bay * h);
        if (d > reach) continue;
        const w = PW[o + ea] + (PW[o + eb] - PW[o + ea]) * h, z = PZ[o + ea] + (PZ[o + eb] - PZ[o + ea]) * h;
        const n = 0.5 + 0.5 * w;
        const hw = wd * (0.55 + 0.9 * n);
        const br = (0.32 + 0.68 * n) * (0.62 + 0.38 * sat(0.5 + 0.5 * z));
        const line = 1 - smoothstep(hw - PX * 0.35, hw + PX * 0.35, d);
        const halo = 0.22 * (1 - smoothstep(hw, hw + PX * 2.5, d));
        best = Math.max(best, br * Math.max(line, halo));
      }
      for (let i = 0; i < poly.nv; i++) {
        const n = 0.5 + 0.5 * PW[o + i];
        const r = wd * (1.2 + 1.2 * n) + PX * 0.4;
        best = Math.max(best, (0.5 + 0.5 * n) * (1 - smoothstep(r - PX * 0.4, r + PX * 0.4, Math.hypot(px - PXs[o + i], py - PYs[o + i]))));
      }
      v = Math.max(v, best * WT[j]);
    }
    return sat(v);
  },
};
