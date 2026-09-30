/**
 * CPU twins of ../glsl/patterns-next.ts, step by step. Listed in the BASIC_PATTERNS table of patterns.ts;
 * every export is pure (scripts/runtime-plugin.ts cuts one pattern per exported script). `setNextPX` is
 * called by setPX in patterns.ts.
 */
import { TAU, clamp, fbm, fract, hash12, mix, mod, sat, smoothstep } from './core';
import type { BasicPattern } from './patterns';
import { solidPattern, type Sdf, type SolidSpec } from './solid';

let PX = 0.02;
export function setNextPX(v: number) { PX = Math.fround(v); }

const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
const sdSeg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return len(pax - bax * h, pay - bay * h);
};
/** 1 on a line of half-width w at distance d, anti-aliased over one cell. */
const line = (d: number, w: number) => 1 - smoothstep(w, w + PX * 1.2, d);

export const mareas_lentas: BasicPattern = {
  f(x, y, t, a, b) {
    const yy = y + 0.14 * Math.sin(x * 2.7 + t * 0.21) + 0.045 * Math.sin(x * 8 - t * 0.14);
    const f = Math.abs(Math.sin(yy * (13 + a * 19)));
    return sat(0.08 + 0.65 * Math.pow(f, 1.5 + b * 2) + 0.26 * (1 - smoothstep(-0.45, 0.45, y)));
  },
};

export const jardin_zen: BasicPattern = {
  f(x, y, t, a, b) {
    const s1x = -0.36 + 0.04 * Math.sin(t * 0.07), s1y = 0.07, s2x = 0.4, s2y = -0.13 + 0.03 * Math.cos(t * 0.05);
    const dm = Math.min(len(x - s1x, y - s1y) - 0.085, len(x - s2x, y - s2y) - 0.06);
    const w = smoothstep(0.3, 0.03, dm);
    const u = mix(y + 0.012 * Math.sin(x * 3 + t * 0.1), dm, w) * (19 + a * 25) - t * 0.15;
    const v = Math.pow(Math.abs(Math.sin(u)), 3 + b * 4);
    const stone = 1 - smoothstep(-PX, PX, dm);
    return sat(mix(0.05 + 0.8 * v + 0.1 * fbm(x * 2, y * 2), 0.92 - 0.25 * smoothstep(-0.06, 0, dm), stone));
  },
};

export const bruma_lejana: BasicPattern = {
  f(x, y, t, a, b) {
    let v = 0.03 * (1 - smoothstep(-0.5, 0.5, y));
    for (let i = 0; i < 5; i++) {
      const xx = x * (1.1 + i * 0.35) + t * (0.012 + i * 0.014) + i * 3.7;
      const ridge = 0.28 - i * 0.15 + (fbm(xx, i * 7.1) - 0.5) * (0.25 + a * 0.45) * (1 - i * 0.1);
      const below = ridge - y;
      const lum = (0.14 + i * 0.15) * (0.5 + 0.5 * Math.exp(-Math.max(below, 0) / (0.04 + b * 0.2)));
      v = mix(v, lum, smoothstep(-PX, PX, below));
    }
    return sat(v);
  },
};

export const luciernagas: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 4 + a * 7, gx = Math.fround(x * k), gy = Math.fround(y * k), ix = Math.floor(gx), iy = Math.floor(gy);
    let v = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx0 = ix + i, cy0 = iy + j, h = hash12(cx0, cy0);
      if (h < 0.3) continue;
      const ph = t * (0.3 + h * 0.5) + h * TAU;
      const cx = cx0 + 0.5 + 0.38 * Math.sin(ph * 1.17), cy = cy0 + 0.5 + 0.38 * Math.cos(ph * 0.83 + h * 4);
      let blink = 0.5 + 0.5 * Math.sin(t * (0.8 + h * 1.5) + h * 20);
      blink = blink * blink * blink;
      const qx = gx - cx, qy = gy - cy, d2 = qx * qx + qy * qy;
      v = Math.max(v, blink * (Math.exp(-d2 * 60) + (0.15 + b * 0.5) * Math.exp(-d2 * (6 - b * 4))));
    }
    return sat(v);
  },
};

export const lluvia_mansa: BasicPattern = {
  f(x, y, t, a, b) {
    let v = 0;
    const w = PX * (0.4 + b * 1.4);
    for (let i = 0; i < 10; i++) {
      const u = t * (0.16 + hash12(i, 3) * 0.08) + hash12(i, 7), n = Math.floor(u), k = u - n;
      const cx = hash12(i, n) * 1.7 - 0.85, cy = hash12(n, i + 11) * 0.9 - 0.45;
      const d = len(x - cx, y - cy);
      for (let j = 0; j < 3; j++) {
        const kj = k - j * 0.12;
        if (kj <= 0) continue;
        const fade = 1 - kj;
        v = Math.max(v, line(Math.abs(d - kj * (0.16 + a * 0.3)), w) * fade * Math.sqrt(fade) * (1 - j * 0.25));
      }
      v = Math.max(v, Math.exp(-d * d * 4000) * (1 - smoothstep(0, 0.06, k)));
    }
    return sat(v);
  },
};

export const bambu: BasicPattern = {
  f(x, y, t, a, b) {
    const k = 3 + a * 6, col = Math.floor(Math.fround(x * k));
    let v = 0;
    for (let j = -1; j <= 1; j++) {
      const c = col + j, h = hash12(c, 3);
      if (h < 0.2) continue;
      const lean = (h - 0.5) * 0.12 + 0.025 * Math.sin(t * 0.35 + h * 6);
      const base = (c + 0.3 + 0.4 * hash12(c, 9)) / k;
      const wd = (0.008 + b * 0.014) * (0.7 + 0.6 * h);
      const seg = 0.16 + h * 0.1, fy = fract((y + h) / seg);
      const joint = 1 - smoothstep(0, 0.07, Math.min(fy, 1 - fy));
      const dx = Math.abs(x - base - lean * (y + 0.5));
      const ww = wd * (1 + 0.5 * joint);
      v = Math.max(v, line(dx, ww) * (0.5 + 0.4 * joint));
      for (let m = 0; m < 3; m++) {
        const hm = hash12(c, m + 20);
        const y0 = -0.3 + m * 0.28 + h * 0.1;
        const ox = base + lean * (y0 + 0.5), oy = y0;
        const an = (mod(m + c, 2) < 0.5 ? 1 : -1) * (0.55 + 0.5 * hm) - 1.5708 + 0.12 * Math.sin(t * 0.9 + hm * 9);
        const dxn = Math.cos(an), dyn = Math.sin(an), qx = x - ox, qy = y - oy;
        const lx = qx * dxn + qy * dyn, ly = -qx * dyn + qy * dxn, L = 0.09 + 0.06 * hm;
        const hw = 0.018 * Math.sin(3.14159 * clamp(lx / L, 0, 1));
        const leaf = Math.max(Math.abs(ly) - hw, Math.max(-lx, lx - L));
        v = Math.max(v, (1 - smoothstep(0, PX, leaf)) * 0.7);
      }
    }
    return sat(v);
  },
};

export const respiracion: BasicPattern = {
  f(x, y, t, a, b) {
    const r = len(x, y / 0.78), pulse = 0.36 + 0.045 * Math.sin(t * 0.52);
    const z = (r - pulse) * (19 + a * 36);
    return sat(Math.exp(-z * z) * 0.77 + Math.exp(-r * r * (6 + (1 - b) * 14)) * (0.35 + 0.13 * Math.sin(t * 0.52)));
  },
};

export const estuario: BasicPattern = {
  f(x, y, t, a, b) {
    const flow = x * 0.65 + y * 0.9 + Math.sin(y * 3 + t * 0.15) * (0.12 + a * 0.25);
    const q = flow * (13 + b * 17) + fbm(x * 3 + t * 0.025, y * 3) * 2 - t * 0.3;
    return sat(0.1 + 0.74 * Math.pow(Math.abs(Math.sin(q)), 3) + 0.14 * fbm(x * 2, y * 2));
  },
};

/** The four pens of light along the lemniscate depend only on t and a: computed once per frame. */
const LPX = new Float64Array(4), LPY = new Float64Array(4);
let lemCr = 1, lemSr = 0, lemK = 0.26;
export const lemniscata: BasicPattern = {
  prep(t, a) {
    lemCr = Math.cos(t * 0.05); lemSr = Math.sin(t * 0.05);
    lemK = 0.16 + a * 0.2 + 0.025 * Math.sin(t * 0.31);
    const c = Math.sqrt(2 * lemK);
    for (let j = 0; j < 4; j++) {
      const u = t * 0.7 - j * 0.1, su = Math.sin(u), den = 1 + su * su;
      LPX[j] = c * Math.cos(u) / den; LPY[j] = c * su * Math.cos(u) / den;
    }
  },
  f(x, y, _t, _a, b) {
    const qx = (lemCr * x + lemSr * y) / 0.9, qy = (-lemSr * x + lemCr * y) / 0.9, k = lemK, r2 = qx * qx + qy * qy;
    const f = r2 * r2 - 2 * k * (qx * qx - qy * qy);
    const gx = 4 * r2 * qx - 4 * k * qx, gy = 4 * r2 * qy + 4 * k * qy;
    const d = Math.abs(f) / Math.sqrt(gx * gx + gy * gy + 1e-4) * 0.9, w = PX * (0.4 + b * 1.6);
    let v = line(d, w) * 0.8 + 0.12 * Math.exp(-d * 30);
    const s2 = 0.0004 + PX * PX;
    for (let j = 0; j < 4; j++) {
      const ex = (qx - LPX[j]) * 0.9, ey = (qy - LPY[j]) * 0.9;
      v = Math.max(v, Math.exp(-(ex * ex + ey * ey) / s2) * (1 - j * 0.22));
    }
    return sat(v);
  },
};

export const superformula: BasicPattern = {
  f(x, y, t, a, b) {
    const th = Math.atan2(y, x) + t * 0.08, m = Math.floor(3 + a * 7), n = 0.4 + b * 1.3 + 0.2 * Math.sin(t * 0.23);
    const co = Math.abs(Math.cos(m * th / 4)), si = Math.abs(Math.sin(m * th / 4));
    const rad = 0.43 / Math.pow(Math.pow(co, n) + Math.pow(si, n), 1 / n);
    const co2 = Math.abs(Math.cos(m * (th + 0.01) / 4)), si2 = Math.abs(Math.sin(m * (th + 0.01) / 4));
    const slope = (0.43 / Math.pow(Math.pow(co2, n) + Math.pow(si2, n), 1 / n) - rad) / 0.01 / Math.max(len(x, y), 0.05);
    const d = Math.abs(len(x, y) - rad) / Math.sqrt(1 + Math.min(slope * slope, 25));
    return sat((1 - smoothstep(PX * 0.6, PX * 1.8, d)) * 0.9 + 0.17 * Math.exp(-d * 28));
  },
};

/** The harmonograph's 321 points (and their fade) depend only on t, a and b: computed once per frame. */
const HX = new Float64Array(321), HY = new Float64Array(321), HE = new Float64Array(321);
let hMinX = 0, hMaxX = 0, hMinY = 0, hMaxY = 0;
export const armonografo: BasicPattern = {
  prep(t, a, b) {
    const ph = t * 0.07, dec = 0.02 + b * 0.05, f2 = 3.004 + a * 0.04;
    hMinX = hMinY = 9; hMaxX = hMaxY = -9;
    for (let i = 0; i <= 320; i++) {
      const u = i * 0.075, ex = Math.exp(-u * dec);
      HX[i] = (Math.sin(2 * u + ph) + 0.7 * Math.sin(f2 * u + 1.2)) * 0.26 * ex;
      HY[i] = (Math.cos(2.005 * u + ph) + 0.7 * Math.sin(3 * u + 2)) * 0.26 * ex;
      HE[i] = ex;
      hMinX = Math.min(hMinX, HX[i]); hMaxX = Math.max(hMaxX, HX[i]); hMinY = Math.min(hMinY, HY[i]); hMaxY = Math.max(hMaxY, HY[i]);
    }
  },
  f(x, y) {
    // far outside the drawing only the faint glow is left (exp(-25·d) < 0.004 beyond 0.22): skip the segments
    const out = Math.max(hMinX - x, x - hMaxX, hMinY - y, y - hMaxY);
    if (out > 0.22) return 0;
    let d = 9, e = 1;
    for (let i = 1; i <= 320; i++) {
      const s = sdSeg(x, y, HX[i - 1], HY[i - 1], HX[i], HY[i]);
      if (s < d) { d = s; e = HE[i]; }
    }
    return sat((1 - smoothstep(PX * 0.5, PX * 1.6, d)) * (0.4 + 0.6 * e) + 0.1 * Math.exp(-d * 25));
  },
};

export const catenaria: BasicPattern = {
  f(x, y, t, a, b) {
    let v = 0;
    const w = PX * (0.4 + b * 1.4);
    for (let i = 0; i < 5; i++) {
      const k = 1.6 + a * 2.4 + i * 0.35, span = 0.8 - i * 0.1, top = 0.36 - i * 0.02;
      const sag = (0.18 + i * 0.09) * (1 + 0.08 * Math.sin(t * 0.4 + i * 1.3));
      const xr = x / span, xx = x - 0.025 * Math.sin(t * 0.5 + i) * (1 - xr * xr);
      const den = Math.cosh(span * k) - 1;
      const cy = top - sag * (1 - (Math.cosh(xx * k) - 1) / den), dy = sag * k * Math.sinh(xx * k) / den;
      const d = Math.abs(y - cy) / Math.sqrt(1 + dy * dy);
      v = Math.max(v, line(d, w) * (Math.abs(x) <= span ? 1 : 0) * (0.5 + i * 0.1));
      v = Math.max(v, 1 - smoothstep(0.012, 0.012 + PX, len(Math.abs(x) - span, y - top)));
    }
    return sat(v);
  },
};

/** The nested circles (centres and radii) depend only on t and a: computed once per frame. */
const ACX = new Float64Array(14), ACY = new Float64Array(14), ACR = new Float64Array(14);
export const apolonio: BasicPattern = {
  prep(t, a) {
    let r = 0.46, cx = 0, cy = 0;
    const q = 0.74 + a * 0.16, turn = 0.5 + 0.25 * Math.sin(t * 0.11);
    for (let i = 0; i < 14; i++) {
      ACX[i] = cx; ACY[i] = cy; ACR[i] = r;
      const rn = r * q, an = t * 0.15 + i * turn;
      cx += (r - rn) * Math.cos(an); cy += (r - rn) * Math.sin(an);
      r = rn;
    }
  },
  f(x, y, _t, _a, b) {
    let v = 0;
    const w = PX * (0.4 + b * 1.4);
    for (let i = 0; i < 14; i++) v = Math.max(v, line(Math.abs(len(x - ACX[i], y - ACY[i]) - ACR[i]), w) * (1 - i * 0.045));
    return sat(v);
  },
};

export const campo_flujo: BasicPattern = {
  f(x, y, t, a, b) {
    const u = y + (0.13 + a * 0.2) * Math.sin(x * 4 + t * 0.16) + 0.08 * Math.sin(x * 9 - y * 5 + t * 0.1);
    return sat(0.06 + 0.83 * Math.pow(Math.abs(Math.sin(u * (22 + b * 18) - t * 0.2)), 5));
  },
};

export const flor_armonica: BasicPattern = {
  f(x, y, t, a, b) {
    const th = Math.atan2(y, x), r = len(x, y), k = Math.floor(5 + a * 8);
    const edge = 0.3 + 0.12 * Math.cos(k * th + t * 0.28) + 0.045 * Math.cos((k * 2 + 3) * th - t * 0.21);
    const de = (-0.12 * k * Math.sin(k * th + t * 0.28) - 0.045 * (k * 2 + 3) * Math.sin((k * 2 + 3) * th - t * 0.21)) / Math.max(r, 0.05);
    const di = 0.022 * k * Math.cos(k * th - t * 0.16) / Math.max(r, 0.05);
    const d = Math.abs(r - edge) / Math.sqrt(1 + Math.min(de * de, 25)), inner = Math.abs(r - 0.17 - 0.022 * Math.sin(k * th - t * 0.16)) / Math.sqrt(1 + Math.min(di * di, 25));
    const w = PX * (0.4 + b * 1.4);
    return sat(line(Math.min(d, inner), w) + 0.12 * Math.exp(-d * 20));
  },
};

export const estrella_mar: BasicPattern = {
  f(x, y, t, a, b) {
    const th = Math.atan2(y, x) + t * 0.08, r = len(x, y), n = 5 + Math.floor(a * 4), e = 2 + b * 3;
    const c = 0.5 + 0.5 * Math.cos(n * th), petals = Math.pow(c, e);
    const edge = 0.16 + 0.34 * petals, slope = 0.34 * e * Math.pow(c, e - 1) * 0.5 * n * Math.sin(n * th) / Math.max(r, 0.05);
    const d = Math.abs(r - edge) / Math.sqrt(1 + Math.min(slope * slope, 25));
    return sat((1 - smoothstep(PX * 0.5, PX * 1.8, d)) * 0.83 + 0.3 * (1 - smoothstep(edge - 0.06, edge + 0.03, r)));
  },
};

/* ------------------------------------------------------------------ */
/* Solids: one camera, light and march (see ../glsl/patterns-next.ts)   */
/* ------------------------------------------------------------------ */

const SOLID: Omit<SolidSpec, 'sdf' | 'shade'> = {
  rot: t => [0.27 + 0.13 * Math.sin(t * 0.16), 0.3 + t * 0.23], eye: 2.55, focal: 1.65, bound: 1, steps: 72, k: 0.66, light: [-0.6, 0.7, -0.5],
};
const solid = (sdf: Sdf, detail: (x: number, y: number, z: number, t: number) => number, over: Partial<SolidSpec> = {}): BasicPattern =>
  solidPattern({ ...SOLID, ...over, sdf, shade: (x, y, z, t, _a, _b, dif, face, spec) => 0.06 + 0.66 * dif + 0.18 * face + 0.3 * spec + detail(x, y, z, t) * 0.16 });

export const simbiosis: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  let s = 10;
  const k = 0.05 + b * 0.35, rad = 0.23 + 0.22 * Math.sin(t * 0.4);
  for (let i = 0; i < 3; i++) {
    const ph = t * 0.63 + i * TAU / 3;
    const d = len3(x - rad * Math.cos(ph), y - 0.28 * Math.sin(ph * 0.85), z - rad * Math.sin(ph)) - (0.22 + a * 0.1);
    const h = Math.max(k - Math.abs(s - d), 0) / k;
    s = Math.min(s, d) - h * h * k * 0.25;
  }
  return s;
}, (_x, y, _z, t) => 0.4 + 0.4 * Math.sin(y * 11 + t * 0.7));

export const pendulos: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  let s = Math.max(len(y - 0.5, z) - 0.018, Math.abs(x) - 0.74);
  for (let i = 0; i < 9; i++) {
    const px = -0.64 + i * 0.16;
    const an = Math.sin(t * (1 + i * 0.07)) * (0.15 + a * 0.45);
    const cx = px, cy = 0.5 - 0.72 * Math.cos(an), cz = 0.72 * Math.sin(an);
    const ball = len3(x - cx, y - cy, z - cz) - (0.05 + b * 0.045);
    const vx = px - cx, vy = 0.5 - cy, vz = -cz;
    const u = clamp(((x - cx) * vx + (y - cy) * vy + (z - cz) * vz) / (vx * vx + vy * vy + vz * vz), 0, 1);
    s = Math.min(s, Math.min(ball, len3(x - cx - vx * u, y - cy - vy * u, z - cz - vz * u) - 0.007));
  }
  return s;
}, () => 0.2, { rot: t => [0.3, 0.35 + 0.22 * Math.sin(t * 0.13)], bound: 1.05 });

export const cinta_ola: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  const ph = x * 4 + t * 0.9, c = Math.cos(ph), s = Math.sin(ph);
  const ox = y - 0.2 * s, oy = z - 0.14 * c;
  const u = c * ox - s * oy, v = s * ox + c * oy;
  return Math.max(Math.max(Math.abs(u) - (0.012 + b * 0.02), Math.abs(v) - (0.06 + a * 0.07)), Math.abs(x) - 0.8) * 0.45;
}, (x, _y, _z, t) => 0.5 + 0.5 * Math.sin(x * 22 - t * 1.2), { steps: 96 });

export const jade_vivo: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  const r = len3(x, y, z), th = Math.atan2(z, x), phi = Math.atan2(y, len(x, z));
  const wave = 0.045 * Math.sin(th * 6 + t * 0.58) * Math.cos(phi * 4 - t * 0.41) + 0.025 * Math.sin(phi * 11 + th * 3 + t * 0.3);
  return r - (0.43 + a * 0.12 + wave * (0.4 + b));
}, (_x, y, _z, t) => 0.5 + 0.5 * Math.sin(y * 17 + t * 0.5));

export const caliz: BasicPattern = /* @__PURE__ */ solid((x, y, z, _t, a, b) => {
  const l = len(x, z), R = 0.28 + a * 0.08;
  const bowl = Math.max(Math.abs(len(l, y - 0.16) - R) - (0.012 + b * 0.02), y - 0.16 - R * 0.7);
  const stem = Math.max(l - 0.03, Math.max(y - 0.2 + R, -0.48 - y));
  const knot = len(l, y + 0.3) - 0.05;
  const foot = len(Math.max(l - 0.2, 0), y + 0.5) - 0.018;
  return Math.min(Math.min(bowl, stem), Math.min(knot, foot));
}, (x, _y, z, t) => 0.45 + 0.35 * Math.cos(Math.atan2(z, x) * 8 + t * 0.3));

export const medusa: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  const bell = (0.33 + a * 0.12) * (1 + 0.06 * Math.sin(t * 1.3));
  const dome = Math.max(len3(x, Math.max(y - 0.05, 0) * 0.75, z) - bell, -y + 0.04);
  let tent = 10;
  for (let i = 0; i < 7; i++) {
    const ph = i * TAU / 7;
    const cx = 0.19 * Math.cos(ph) + 0.05 * Math.sin(t * 0.5 + y * 7 + ph);
    const cz = 0.19 * Math.sin(ph) + 0.05 * Math.cos(t * 0.5 + y * 7 + ph);
    tent = Math.min(tent, Math.max(len(x - cx, z - cz) - (0.012 + b * 0.013), Math.max(-0.6 - y, y + 0.07)));
  }
  return Math.min(dome, tent);
}, (_x, y) => 0.4 + 0.5 * Math.exp(-Math.abs(y - 0.05) * 6));

export const esferas_orbita: BasicPattern = /* @__PURE__ */ solid((x, y, z, t, a, b) => {
  let s = 10;
  for (let i = 0; i < 6; i++) {
    const ph = i * TAU / 6 + t * (0.35 + a * 0.35);
    s = Math.min(s, len3(x - 0.4 * Math.cos(ph), y - 0.21 * Math.sin(ph * 2 + t * 0.2), z - 0.4 * Math.sin(ph)) - (0.11 + b * 0.05));
  }
  return Math.min(s, len(len(x, z) - 0.4, y) - 0.017);
}, (x, _y, z) => 0.5 + 0.5 * Math.cos(x * 9 + z * 8));
