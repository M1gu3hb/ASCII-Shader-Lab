import type { AnalyticImpl } from '../types';
import { PI, TAU, V2, fbm, fract, gnoise, hash11, hash22, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { HACES_GLSL } from './haces';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const hueC = (h: number, c: number) => 0.5 + 0.5 * Math.cos(TAU * (h - c));

/** A point of the frame's outline (just outside a 16:9 canvas) at a fraction s of its perimeter, into out. */
export function hacesRim(s: number, out: Float64Array) {
  const A = 0.95, B = 0.54, u = s * (4 * A + 4 * B);
  if (u < 2 * A) { out[0] = -A + u; out[1] = B; }
  else if (u < 2 * A + 2 * B) { out[0] = A; out[1] = B - (u - 2 * A); }
  else if (u < 4 * A + 2 * B) { out[0] = A - (u - 2 * A - 2 * B); out[1] = -B; }
  else { out[0] = -A; out[1] = -B + (u - 4 * A - 2 * B); }
  return out;
}

/**
 * Where beam i of n starts and the direction it points to at layer time t (tests check the beams enter from the
 * frame or hang above it): [ex, ey, angle].
 */
export function hacesBeam(i: number, n: number, foco: boolean, sw: number, sp: number, t: number): [number, number, number] {
  const h1 = hash11(i * 3.7 + 1.1), h2 = hash11(i * 5.3 + 2.9);
  let ex: number, ey: number, a0: number;
  if (foco) {
    ex = (-0.5 + (i + 0.5) / n) * 1.5 + (h1 - 0.5) * 0.12; ey = 0.62;
    a0 = -PI * 0.5 + (h2 - 0.5) * 0.5 - ex * 0.25;
  } else {
    hacesRim(fract(i / n + 0.11 + 0.08 * h1), E);
    ex = E[0]; ey = E[1];
    a0 = Math.atan2(-ey, -ex) + (h2 - 0.5) * 0.9;
  }
  const om = 0.05 + sp * (0.35 + 0.5 * h2);
  return [ex, ey, a0 + sw * (foco ? 0.55 : 1) * Math.sin(t * om + h1 * TAU)];
}
const E = new Float64Array(2);
// each beam's emitter and direction this cell (the crossings read them)
const BE = new Float64Array(12), BD = new Float64Array(12);

// the last cell computed: the engine asks for its brightness and then its colour at the same point
let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const F = k[0] > 0.5;
  const n = Math.min(6, Math.max(2, Math.floor(k[1] + 0.5)));
  const wd = k[2], sw = k[3], sp = k[4], fog = k[5], dr = k[6], hue = k[7];
  const hr = k[8], fla = k[9], dust = k[10], ray = k[11], haze = k[12], sat = k[13];
  const fd = fbm(px * 2.2 + (0.15 + dr) * t * 0.07, py * 2.2 + (0.15 + dr) * t * 0.035);
  const dens = 1 + (1.6 * smoothstep(0.33, 0.62, fd) - 1) * fog;
  let S = 0, S2 = 0, ar = 0, ag = 0, ab = 0;
  for (let i = 0; i < n; i++) {
    const [ex, ey, a] = hacesBeam(i, n, F, sw, sp, t);
    const dx = Math.cos(a), dy = Math.sin(a);
    BE[i * 2] = ex; BE[i * 2 + 1] = ey; BD[i * 2] = dx; BD[i * 2 + 1] = dy;
    const qx = px - ex, qy = py - ey;
    const al = qx * dx + qy * dy, pe = qy * dx - qx * dy;
    if (al <= 0) continue;
    const w = F ? 0.02 + (0.08 + (0.34 - 0.08) * wd) * al : 0.003 + (0.004 + (0.07 - 0.004) * wd) * al;
    const x = pe / w;
    let I = F ? (1 - smoothstep(0.55, 1, Math.abs(x))) * (0.55 + 0.45 * Math.exp(-x * x * 2)) * Math.exp(-al * 0.35) : Math.exp(-x * x * 1.5) / (1 + al * 0.5);
    I *= 1 + (0.35 + 1.3 * gnoise(x * 3.5 + i * 7.3, al * 1.2 - t * 0.25) - 1) * ray;
    const core = F ? 0 : Math.exp(-pe * pe / (PX * PX * 0.25)) / (1 + al * 0.5);
    const h = hue + (F ? 0.04 : 0.5 / n) * i + hr * 0.05 * t;
    const cr = 1 + (hueC(h, 0) - 1) * sat, cg = 1 + (hueC(h, 0.333) - 1) * sat, cb = 1 + (hueC(h, 0.667) - 1) * sat;
    const b = I * dens + core * 0.6;
    ar += b * cr; ag += b * cg; ab += b * cb;
    S += b; S2 += b * b;
  }
  let fl = Math.min(1, Math.max(0, (S * S - S2) * 1.1));
  if (!F) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dix = BD[i * 2], diy = BD[i * 2 + 1], djx = BD[j * 2], djy = BD[j * 2 + 1];
      const det = dix * djy - diy * djx;
      if (Math.abs(det) < 0.05) continue;
      const bx = BE[j * 2] - BE[i * 2], by = BE[j * 2 + 1] - BE[i * 2 + 1];
      const si = (bx * djy - by * djx) / det, sj = (bx * diy - by * dix) / det;
      if (si <= 0 || sj <= 0) continue;
      const qx = px - (BE[i * 2] + si * dix), qy = py - (BE[i * 2 + 1] + si * diy);
      const r = Math.sqrt(qx * qx + qy * qy);
      const tw = 0.7 + 0.3 * Math.sin(t * 6 + i * 1.7 + j * 2.3);
      fl += (0.7 * Math.exp(-r * r / 0.0009) + 0.6 * Math.exp(-r * 9) * (Math.exp(-Math.abs(qy) / (0.35 * PX)) + Math.exp(-Math.abs(qx) / (0.35 * PX)))) * tw * (1 + (dens - 1) * fog) / (1 + 0.25 * (si + sj));
    }
  }
  fl = fla * Math.min(fl, 1);
  const g = 0.045;
  const gpx = px + (0.3 + dr) * t * 0.006, gpy = py + (0.3 + dr) * t * 0.012;
  const gcx = Math.floor(gpx / g), gcy = Math.floor(gpy / g);
  hash22(gcx + 7, gcy + 7);
  const ghx = V2[0], ghy = V2[1];
  const mpx = (gcx + 0.5 + 0.3 * Math.sin(t * (0.3 + 0.5 * ghx) + ghy * TAU)) * g, mpy = (gcy + 0.5 + 0.3 * Math.sin(t * (0.25 + 0.4 * ghy) + ghx * TAU)) * g;
  const dmx = gpx - mpx, dmy = gpy - mpy;
  const mote = (ghx < 0.3 ? 0 : 1) * Math.exp(-(dmx * dmx + dmy * dmy) / (PX * PX * 0.2)) * (0.65 + 0.35 * Math.sin(t * 2 + ghy * 30));
  const dv = dust * mote * Math.min(1, Math.max(0, S * 1.4));
  const tex = F ? (0.55 + 0.45 * Math.sin(px * 34 + 2.5 * gnoise(px * 2, py * 0.6))) * (0.6 + 0.4 * fd) : fd;
  const hv = haze * 0.3 * tex;
  let hcr: number, hcg: number, hcb: number;
  if (F) { hcr = 0.55; hcg = 0.06; hcb = 0.14; }
  else {
    const h = hue + 0.5 + hr * 0.05 * t;
    hcr = 0.3 + (hueC(h, 0) - 0.3) * 0.6; hcg = 0.25 + (hueC(h, 0.333) - 0.25) * 0.6; hcb = 0.6 + (hueC(h, 0.667) - 0.6) * 0.6;
  }
  const lum = S + fl + dv + hv;
  const lr = S > 1e-4 ? ar / S : 1, lg = S > 1e-4 ? ag / S : 1, lb = S > 1e-4 ? ab / S : 1;
  const il = 1 / Math.max(lum, 1e-4);
  C[0] = (ar + fl + dv * (0.5 + 0.5 * lr) + hv * hcr) * il;
  C[1] = (ag + fl + dv * (0.5 + 0.5 * lg) + hv * hcg) * il;
  C[2] = (ab + fl + dv * (0.5 + 0.5 * lb) + hv * hcb) * il;
  const Y = (C[0] * 0.299 + C[1] * 0.587 + C[2] * 0.114) / Math.max(C[0], C[1], C[2], 1e-3);
  C[3] = Math.min(1, Math.max(0, lum * (0.7 + 0.3 * Y)));
}

/** CPU twin of FC_haces_luz, line by line. */
export const impl: AnalyticImpl = {
  glsl: HACES_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
