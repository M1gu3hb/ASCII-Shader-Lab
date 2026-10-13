import type { AnalyticImpl } from '../types';
import { PI, TAU, fract, hash11, mod, smoothstep } from '../../engine/basic/core';
import { currentPX } from '../../engine/basic/px';
import { DIAMANTE_GLSL } from './diamante';

// the layer's cell size, from prep (the engine's own; currentPX only where a test sets it directly)
let PXc: number | null = null;
const pxNow = () => PXc ?? currentPX();

const spec = (h: number, o: number) => Math.min(1, Math.max(0, Math.abs(fract(h + o) * 6 - 3) - 1));

/** The cut's angle at layer time t (tests: the stone turns a whole number of times per cycle). */
export function diamanteTurn(k: Float32Array, t: number) {
  const cut = Math.floor(k[0] + 0.5);
  return TAU * (t / Math.max(k[3], 1)) * Math.floor(k[4] + 0.5) * (cut > 1.5 ? -1 : 1);
}

/** Glint j's centre and strength (0..1, before «Estrellas») at layer time t (tests). */
export function diamanteGlint(j: number, k: Float32Array, t: number) {
  const Rg = 0.26 + (0.45 - 0.26) * k[1], u = t / Math.max(k[3], 1);
  const gh = hash11(j * 5.7 + 2.2);
  const ga = j * 2.39996 + gh + diamanteTurn(k, t);
  const gr = Rg * (0.3 + 0.6 * fract(gh * 3.7));
  return { x: gr * Math.cos(ga), y: gr * Math.sin(ga), on: Math.pow(0.5 + 0.5 * Math.sin(TAU * u * (2 + j) + gh * 30), 14), phase: gh * 30 };
}

/** Which facet a point of the stone falls in (tests): ring and facet id, or -1 outside the girdle. */
export const FACET = { ring: -1, cell: -1 };

let lx = NaN, ly = NaN, lt = NaN, lk: Float32Array | null = null;
const C = new Float64Array(4);

function eval4(px: number, py: number, t: number, k: Float32Array) {
  if (px === lx && py === ly && t === lt && k === lk) return;
  lx = px; ly = py; lt = t; lk = k;
  const PX = pxNow();
  const cut = Math.floor(k[0] + 0.5);
  const Rg = 0.26 + (0.45 - 0.26) * k[1], fm = Math.min(3, Math.max(1, Math.floor(k[2] + 0.5)));
  const P = Math.max(k[3], 1), u = t / P;
  const rot = TAU * u * Math.floor(k[4] + 0.5) * (cut > 1.5 ? -1 : 1);
  const fire = k[5], spk = k[6], star = k[7];
  const shp = 6 + (60 - 6) * k[8], edg = k[9], cau = k[10], La = k[11] * TAU;
  const r = Math.hypot(px, py), th = Math.atan2(py, px);
  const a = th - rot;
  const N = cut < 0.5 ? 0 : cut < 1.5 ? 4 : 6;
  const sh = N > 0 ? Math.cos(PI / N) / Math.cos(mod(a + PI / N, TAU / N) - PI / N) : 1;
  let s = r / (Rg * sh);
  const sym = cut > 1.5 ? 6 : 8;
  let lxv = Math.cos(La), lyv = Math.sin(La), lzv = 1.6;
  const ll = Math.hypot(lxv, lyv, lzv); lxv /= ll; lyv /= ll; lzv /= ll;
  let hx = lxv, hy = lyv, hz = lzv + 1;
  const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
  let cr = 0, cg = 0, cb = 0, v = 0;
  FACET.ring = -1; FACET.cell = -1;
  if (s < 1) {
    let s0 = 0, s1 = 0.48, ns = 1, off = 0, tilt = 0, ri = 0;
    if (cut > 1.5) {
      if (s < 0.4) { s0 = 0; s1 = 0.4; ns = sym * fm; off = 0; tilt = 0.32; ri = 1; }
      else if (s < 0.75) { s0 = 0.4; s1 = 0.75; ns = 2 * sym * fm; off = 0.5; tilt = 0.5; ri = 2; }
      else { s0 = 0.75; s1 = 1; ns = 2 * sym * fm; off = 0; tilt = 0.68; ri = 3; }
    } else {
      const so = r * Math.cos(PI / 8) / Math.cos(mod(a + PI / 8, PI / 4) - PI / 8) / (Rg * sh);
      if (so < 0.48) { s0 = 0; s1 = 0.48; ns = 1; tilt = 0; ri = 0; s = so; }
      else if (s < 0.68) { s0 = 0.48; s1 = 0.68; ns = 2 * sym * fm; off = 0; tilt = 0.38; ri = 1; }
      else if (s < 0.86) { s0 = 0.68; s1 = 0.86; ns = sym * fm; off = 0.5; tilt = 0.52; ri = 2; }
      else { s0 = 0.86; s1 = 1; ns = 2 * sym * fm; off = 0.5; tilt = 0.7; ri = 3; }
    }
    let fa: number, cell: number, edge: number;
    const vv = Math.min(1, Math.max(0, (s - s0) / (s1 - s0)));
    if (ns < 1.5) {
      fa = 0; cell = 0;
      edge = (1 - vv) * (s1 - s0) * Rg;
      tilt = 0;
    } else {
      const w = TAU / ns;
      const uu = (a + PI) / w + off;
      const si0 = Math.floor(uu);
      const fu = uu - si0;
      const si = mod(si0, ns);
      const tri = 1 - Math.abs(2 * fu - 1);
      const inner = vv < tri;
      const cu = inner ? 0.5 : fu < 0.5 ? 0 : 1;
      fa = (si + cu - off) * w - PI;
      cell = ri * 97 + mod(si * 2 + (inner ? 0 : fu < 0.5 ? -1 : 1), 2 * ns);
      const dz = (s1 - s0) * Rg * sh, arc = r * w;
      edge = Math.min(Math.min(vv, 1 - vv) * dz, Math.min(Math.abs(tri - vv) * dz * 0.45, Math.min(fu, 1 - fu) * arc));
    }
    FACET.ring = ri; FACET.cell = cell;
    const az = fa + rot;
    const nx = Math.sin(tilt) * Math.cos(az), ny = Math.sin(tilt) * Math.sin(az), nz = Math.cos(tilt);
    const nh = Math.max(nx * hx + ny * hy + nz * hz, 0);
    const sp = Math.pow(nh, shp);
    const dif = Math.max(nx * lxv + ny * lyv + nz * lzv, 0);
    const hf = hash11(cell * 1.37 + 4.1);
    const tw = Math.pow(0.5 + 0.5 * Math.sin(TAU * u * (3 + Math.floor(hf * 9)) + hf * 40), 10);
    const env = 0.5 + 0.5 * Math.sin(az * 3 + tilt * 9 + ri * 1.3) * Math.cos(az * 2 - ri);
    let b = 0.14 + 0.55 * env + 0.2 * dif + 1.1 * sp + spk * 0.9 * tw * (0.3 + 0.7 * dif);
    if (ns < 1.5) b = 0.14 + 0.15 * dif + 0.45 * sp + 0.35 * (1 - Math.pow(Math.abs(Math.cos(0.5 * sym * a)), 6));
    const hue = fract(Math.acos(Math.min(1, Math.max(-1, nh))) * 2.2 + ri * 0.17 + hf * 0.35 * fire + u * 2);
    const m = fire * (0.35 + 0.65 * smoothstep(0.15, 0.9, b));
    cr = 1 + (spec(hue, 0) - 1) * m; cg = 1 + (spec(hue, 2 / 3) - 1) * m; cb = 1 + (spec(hue, 1 / 3) - 1) * m;
    const e = 1 + (0.25 + 0.75 * smoothstep(0.15 * PX, 0.9 * PX, edge) - 1) * edg;
    v = b * e;
    const gq = (1 - s) * Rg / (0.6 * PX);
    v = Math.max(v, 0.75 * Math.exp(-gq * gq));
  }
  if (s >= 1 && cau > 0) {
    const ns2 = 2 * sym;
    const ray = Math.pow(0.5 + 0.5 * Math.cos(ns2 * (th - 2 * rot) + 2.5 * Math.sin(3 * th + rot)), 24);
    v = cau * 0.9 * Math.exp(-(r - Rg * sh) / 0.11) * ray;
    const h = fract(th * ns2 / TAU * 0.5 + r * 3);
    cr = spec(h, 0); cg = spec(h, 2 / 3); cb = spec(h, 1 / 3);
  }
  for (let j = 0; j < 5; j++) {
    const gh = hash11(j * 5.7 + 2.2);
    const ga = j * 2.39996 + gh + rot;
    const gr = Rg * (0.3 + 0.6 * fract(gh * 3.7));
    const on = star * Math.pow(0.5 + 0.5 * Math.sin(TAU * u * (2 + j) + gh * 30), 14);
    if (on < 0.002) continue;
    const qx = px - gr * Math.cos(ga), qy = py - gr * Math.sin(ga);
    const d = Math.hypot(qx, qy);
    const w2 = 0.35 * PX;
    const spv = Math.exp(-d * d / (PX * PX * 1.5)) + 0.9 * Math.exp(-d * 7) * (Math.exp(-Math.abs(qx) / w2) + Math.exp(-Math.abs(qy) / w2))
      + 0.45 * Math.exp(-d * 12) * (Math.exp(-Math.abs(qx + qy) * 0.7071 / w2) + Math.exp(-Math.abs(qx - qy) * 0.7071 / w2));
    const sv = on * spv;
    const mm = Math.min(1, Math.max(0, sv / Math.max(v + sv, 1e-4)));
    cr += (1 - cr) * mm; cg += (1 - cg) * mm; cb += (1 - cb) * mm;
    v += sv;
  }
  C[0] = cr; C[1] = cg; C[2] = cb;
  const Y = (cr * 0.299 + cg * 0.587 + cb * 0.114) / Math.max(cr, cg, cb, 1e-3);
  C[3] = Math.min(1, Math.max(0, v * (0.7 + 0.3 * Y)));
}

/** CPU twin of FC_talla_diamante, line by line. */
export const impl: AnalyticImpl = {
  glsl: DIAMANTE_GLSL,
  prep(_t, _k, _p, px) { PXc = px ?? null; lx = NaN; },
  cpu: (x, y, t, k) => { eval4(x, y, t, k); return C[3]; },
  cpuColor: (x, y, t, k, out) => { eval4(x, y, t, k); out[0] = C[0]; out[1] = C[1]; out[2] = C[2]; },
};
