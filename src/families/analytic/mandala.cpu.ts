import type { AnalyticImpl } from '../types';
import { TAU, mod, smoothstep, step } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { MANDALA_GLSL } from './mandala';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const circ = (qx: number, qy: number, a: number, c: number, rr: number) => Math.abs(Math.hypot(qx - c * Math.cos(a), qy - c * Math.sin(a)) - rr);
const inn = (qx: number, qy: number, a: number, c: number, rr: number) => step(Math.hypot(qx - c * Math.cos(a), qy - c * Math.sin(a)), rr);

/** The angle each layer has turned at layer time t (tests: they turn in opposite senses and loop exactly). */
export function mandalaTurns(k: Float32Array, t: number): [number, number, number, number] {
  const n = Math.min(12, Math.max(5, Math.floor(k[0] + 0.5))), m = Math.min(8, Math.max(3, Math.floor(k[1] + 0.5)));
  const u = t / Math.max(k[3], 1), tu = Math.floor(k[4] + 0.5), cu = Math.floor(k[5] + 0.5);
  const kk = 2 * n, kt = 4 * n;
  return [TAU * u * tu / n, -TAU * u * cu / m, TAU * u * 3 * tu / kk, -TAU * u * 2 / kt];
}

/** CPU twin of F_mandala_capas, line by line. */
export const impl: AnalyticImpl = {
  glsl: MANDALA_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; },
  cpu(px, py, t, k) {
    const PX = pxNow();
    const ln = (d: number, w: number) => 1 - smoothstep(0.5 * w, w + 0.45 * PX, d);
    const n = Math.min(12, Math.max(5, Math.floor(k[0] + 0.5))), m = Math.min(8, Math.max(3, Math.floor(k[1] + 0.5))), nr = Math.min(5, Math.max(1, Math.floor(k[2] + 0.5)));
    const P = Math.max(k[3], 1), u = t / P;
    const tu = Math.floor(k[4] + 0.5), cu = Math.floor(k[5] + 0.5);
    const w = PX * (0.12 + 0.6 * k[6]), fil = k[7], glo = k[8], br = k[9];
    const wf = k[10], ws = k[11], wo = k[12], cen = k[13];
    const R0 = 0.46 * (1 + 0.035 * br * Math.sin(TAU * u));
    const r1 = 0.42 * R0, r2 = 0.74 * R0, h = R0 - r2;
    const r = Math.hypot(px, py), th = Math.atan2(py, px);
    const kk = 2 * n, kt = 4 * n;
    const rot1 = TAU * u * tu / n, rot2 = -TAU * u * cu / m, rot3 = TAU * u * 3 * tu / kk, rot4 = -TAU * u * 2 / kt;
    let v = 0, dmin = 1e3;
    if (r < r1 + 2 * w) {
      const s = TAU / n;
      const a = mod(th - rot1 + 0.5 * s, s) - 0.5 * s;
      const qx = r * Math.cos(a), qy = r * Math.sin(a);
      const rho = 0.5 * r1;
      let dd = Math.abs(r - rho);
      dd = Math.min(dd, circ(qx, qy, 0, rho, rho));
      dd = Math.min(dd, circ(qx, qy, s, rho, rho));
      dd = Math.min(dd, circ(qx, qy, -s, rho, rho));
      const cnt = step(r, rho) + inn(qx, qy, 0, rho, rho) + inn(qx, qy, s, rho, rho) + inn(qx, qy, -s, rho, rho);
      const ins = step(r, r1);
      v = Math.max(v, wf * ins * Math.max(ln(dd, w), fil * step(1.5, cnt) * (0.18 + 0.2 * mod(cnt, 2))));
      dmin = Math.min(dmin, step(0.01, wf) * ins > 0 ? dd : 1e3);
    }
    if (r > r1 - 2 * w && r < r2 + 2 * w) {
      const b = 0.30634896, kb = b / Math.sqrt(1 + b * b), lr = Math.log(Math.max(r, 1e-4)) / b, s = TAU / m;
      const pa = mod(th - lr - rot2 + 0.5 * s, s) - 0.5 * s;
      const pb = mod(th + lr - rot2 + 0.5 * s, s) - 0.5 * s;
      const ds = Math.min(Math.abs(pa), Math.abs(pb)) * r * kb;
      const band = step(r1, r) * step(r, r2);
      const cell = smoothstep(0.25, 0.95, Math.abs(pa) / (0.5 * s)) * smoothstep(0.25, 0.95, Math.abs(pb) / (0.5 * s));
      v = Math.max(v, ws * band * Math.max(ln(ds, w), fil * 0.22 * cell));
      dmin = Math.min(dmin, step(0.01, ws) * band > 0 ? ds : 1e3);
    }
    if (r > r2 - 2 * w && r < R0 + 3 * w) {
      const s = TAU / kk;
      const a = mod(th - rot3 + 0.5 * s, s) - 0.5 * s;
      const lob = r2 + h * (0.3 + 0.62 * Math.pow(Math.abs(Math.cos(0.5 * kk * a)), 0.7));
      const dl = Math.abs(r - lob) / Math.sqrt(1 + 0.5 * Math.pow(h * 0.22 * kk / Math.max(r, 0.05), 2));
      const bead = Math.hypot(r * a, r - (r2 + 0.7 * h)) - 1.3 * w;
      let dr = 1e3;
      for (let i = 0; i < nr; i++) dr = Math.min(dr, Math.abs(r - (r2 + h * (i + 0.5) / nr * 0.26)));
      const st = TAU / kt;
      const at = mod(th - rot4 + 0.5 * st, st) - 0.5 * st;
      const dt = Math.max(Math.abs(r * at) - 0.45 * w, Math.abs(r - R0) - 0.02);
      const band = step(r2, r);
      const dd = Math.min(Math.min(dl, dr), Math.min(dt, Math.abs(r - R0)));
      v = Math.max(v, wo * band * Math.max(Math.max(ln(dd, w), ln(Math.max(bead, 0), w)), fil * 0.14 * step(r, lob) * step(r2 + 0.28 * h, r)));
      dmin = Math.min(dmin, step(0.01, wo) * band > 0 ? Math.min(dd, Math.max(bead, 0)) : 1e3);
    }
    const db = Math.min(Math.abs(r - r1), Math.abs(r - r2));
    v = Math.max(v, Math.max(Math.max(wf, ws) * ln(Math.abs(r - r1), w), Math.max(ws, wo) * ln(Math.abs(r - r2), w)));
    dmin = Math.min(dmin, db);
    v = Math.max(v, glo * 0.32 * Math.exp(-dmin / (PX * 1.3)) * (0.85 + 0.15 * Math.sin(TAU * 2 * u)) * step(r, R0 + 0.02));
    v *= 1 - cen * 0.85 * (smoothstep(0.022, 0.03, r) - smoothstep(0.05, 0.06, r));
    v = Math.max(v, cen * Math.max(1 - smoothstep(0.022, 0.03, r), 0.7 * Math.exp(-r / 0.035) * Math.pow(Math.abs(Math.cos(0.5 * n * (th - rot1))), 8) * step(0.03, r) * step(r, 0.09)));
    v = Math.max(v, glo * 0.2 * Math.exp(-Math.max(r - R0, 0) / 0.05) * step(R0, r));
    return Math.min(1, Math.max(0, v));
  },
};
