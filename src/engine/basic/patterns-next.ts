/** CPU twins of patterns-next.ts for Canvas preview and standalone exports. */
import { TAU, clamp, fbm, hash12, rotXY, sat, smoothstep } from './core';
import type { BasicPattern, PatternFn } from './patterns';
import { particlePattern } from './particles';

const P = (f: PatternFn): BasicPattern => ({ f });
const len = Math.hypot;
const fract = (n: number) => n - Math.floor(n);
const seg = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay, h = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return len(x - ax - vx * h, y - ay - vy * h);
};

const mareas_lentas: PatternFn = (x, y, t, a, b) => {
  const u = (y + 0.14 * Math.sin(x * 2.7 + t * 0.21) + 0.045 * Math.sin(x * 8 - t * 0.14)) * (13 + a * 19);
  return sat(0.08 + 0.65 * Math.pow(Math.abs(Math.sin(u)), 1.5 + b * 2) + 0.26 * (1 - smoothstep(-0.45, 0.45, y)));
};
const jardin_zen: PatternFn = (x, y, t, a, b) => {
  const d = len(x - 0.15 * Math.sin(t * 0.12), y - 0.1 * Math.cos(t * 0.1)) + 0.2 * len(x + 0.62, y - 0.18);
  return sat(0.05 + 0.83 * Math.pow(Math.abs(Math.sin((19 + a * 25) * d)), 3 + b * 4) + 0.12 * fbm(x * 2, y * 2));
};
const bruma_lejana: PatternFn = (x, y, t, a, b) => {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const n = fbm(x * (0.8 + i * 0.34) + t * (0.025 + i * 0.008), i * 7.1);
    const horizon = -0.35 + i * 0.17 + (n - 0.5) * (0.12 + a * 0.17);
    s = Math.max(s, (1 - smoothstep(-0.12, 0.055 + b * 0.08, y - horizon)) * (0.28 + i * 0.17));
  }
  return sat(s);
};
const luciernagas: PatternFn = (x, y, t, a, b) => {
  const k = 7 + a * 9, ix = Math.floor(x * k), iy = Math.floor(y * k), h = hash12(ix, iy);
  const phase = t * (0.25 + h * 0.4) + h * TAU;
  const d = len(fract(x * k) - 0.5 - 0.24 * Math.sin(phase * 1.17), fract(y * k) - 0.5 - 0.24 * Math.cos(phase * 0.83));
  const alive = (h >= 0.57 ? 1 : 0) * (0.45 + 0.55 * Math.sin(phase) ** 2);
  return sat(alive * (Math.exp(-d * d * (50 + b * 120)) + 0.19 * Math.exp(-d * d * 12)));
};
const lluvia_mansa: PatternFn = (x, y, t, a, b) => {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const k = fract(t * (0.055 + i * 0.009) + hash12(i, 7));
    const d = len(x + 0.57 - (i % 4) * 0.38, y - 0.23 + Math.floor(i / 4) * 0.44);
    v = Math.max(v, (1 - smoothstep(0.005, 0.03 + b * 0.018, Math.abs(d - k * (0.22 + a * 0.34)))) * (1 - k) * 1.05);
  }
  return sat(v);
};
const bambu: PatternFn = (x, y, t, a, b) => {
  const k = 7 + a * 10, ix = Math.floor(x * k), h = hash12(ix, 0);
  const cx = (ix + 0.5) / k + 0.018 * Math.sin(y * 4 + t * 0.18 + h * TAU);
  const stalk = 1 - smoothstep(0.004, 0.012 + b * 0.014, Math.abs(x - cx));
  const joint = 1 - smoothstep(0.01, 0.028, Math.abs(fract((y + 0.5) * (4 + h * 3)) - 0.5));
  let leaves = 0;
  for (let j = 0; j < 4; j++) {
    const yy = -0.37 + j * 0.24 + h * 0.12;
    leaves = Math.max(leaves, 1 - smoothstep(0.027, 0.055, len(x - cx - 0.12 * Math.sin(j * 2 + h * 8), (y - yy) * 2 - 0.055)));
  }
  return sat(stalk * (0.35 + 0.35 * joint) + leaves * 0.55);
};
const respiracion: PatternFn = (x, y, t, a, b) => {
  const r = len(x, y / 0.78), pulse = 0.36 + 0.045 * Math.sin(t * 0.52);
  return sat(Math.exp(-Math.pow((r - pulse) * (19 + a * 36), 2)) * 0.77 + Math.exp(-r * r * (6 + b * 14)) * (0.35 + 0.13 * Math.sin(t * 0.52)));
};
const estuario: PatternFn = (x, y, t, a, b) => {
  const flow = x * 0.65 + y * 0.9 + Math.sin(y * 3 + t * 0.15) * (0.12 + a * 0.25);
  const q = flow * (13 + b * 17) + fbm(x * 3 + t * 0.025, y * 3) * 2;
  return sat(0.1 + 0.74 * Math.pow(Math.abs(Math.sin(q)), 3) + 0.14 * fbm(x * 2, y * 2));
};
const lemniscata: PatternFn = (x, y, _t, a, b) => {
  const qx = x / 0.9, qy = y / 0.8, r2 = qx * qx + qy * qy, k = 0.17 + a * 0.21;
  const f = Math.abs(r2 * r2 - 2 * k * (qx * qx - qy * qy));
  return sat((1 - smoothstep(0.003, 0.01 + b * 0.024, f)) * 0.9 + 0.16 * Math.exp(-f * 40));
};
const superformula: PatternFn = (x, y, t, a, b) => {
  const th = Math.atan2(y, x) + t * 0.08, m = Math.floor(3 + a * 7), n = 0.4 + b * 1.3;
  const co = Math.abs(Math.cos(m * th / 4)), si = Math.abs(Math.sin(m * th / 4));
  const rad = 0.43 / Math.pow(co ** n + si ** n, 1 / n), d = Math.abs(len(x, y) - rad);
  return sat((1 - smoothstep(0.004, 0.017, d)) * 0.9 + 0.17 * Math.exp(-d * 28));
};
const armonografo: PatternFn = (x, y, t, a, b) => {
  let d = 3, px = 0, py = 0;
  for (let i = 0; i < 96; i++) {
    const u = i * 0.095, fade = Math.exp(-u * (0.09 + b * 0.06));
    const nx = (Math.sin(u * 2.1 + t * 0.12) + 0.45 * Math.sin(u * 3.02)) * 0.34 * fade;
    const ny = (Math.cos(u * (2.2 + a * 0.35)) + 0.3 * Math.cos(u * 3.11 + t * 0.09)) * 0.34 * fade;
    if (i > 0) d = Math.min(d, seg(x, y, px, py, nx, ny)); px = nx; py = ny;
  }
  return sat(1 - smoothstep(0.004, 0.014, d) + 0.12 * Math.exp(-d * 20));
};
const catenaria: PatternFn = (x, y, t, a, b) => {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const qx = x * (1.5 + a * 1.7) + 0.12 * Math.sin(t * 0.12 + i);
    const cy = 0.17 * (Math.cosh(qx) - 1) - 0.35 + i * 0.15;
    v = Math.max(v, (1 - smoothstep(0.005, 0.013 + b * 0.008, Math.abs(y - cy))) * (0.48 + i * 0.08));
  }
  return sat(v);
};
const apolonio: PatternFn = (x, y, _t, a, b) => {
  let v = 0, qx = x, qy = y;
  for (let i = 0; i < 5; i++) {
    const r = 0.44 / 2 ** i, d = Math.abs(len(qx, qy) - r);
    v = Math.max(v, (1 - smoothstep(0.004, 0.012 + b * 0.01, d)) * (0.9 - i * 0.1));
    qx = (Math.abs(qx) - r * 0.5) * (1.55 + a * 0.12);
    qy = Math.abs(qy) * (1.55 + a * 0.12);
  }
  return sat(v);
};
const campo_flujo: PatternFn = (x, y, t, a, b) => {
  const u = y + (0.13 + a * 0.2) * Math.sin(x * 4 + t * 0.16) + 0.08 * Math.sin(x * 9 - y * 5 + t * 0.1);
  return sat(0.06 + 0.83 * Math.pow(Math.abs(Math.sin(u * (22 + b * 18))), 5));
};
const flor_armonica: PatternFn = (x, y, t, a, b) => {
  const th = Math.atan2(y, x), r = len(x, y), k = Math.floor(5 + a * 8);
  const edge = 0.3 + 0.12 * Math.cos(k * th + t * 0.28) + 0.045 * Math.cos((k * 2 + 3) * th - t * 0.21);
  const d = Math.abs(r - edge), inner = Math.abs(r - 0.17 - 0.022 * Math.sin(k * th - t * 0.16));
  return sat(1 - smoothstep(0.004, 0.015 + b * 0.007, Math.min(d, inner)) + 0.12 * Math.exp(-d * 20));
};
const estrella_mar: PatternFn = (x, y, t, a, b) => {
  const th = Math.atan2(y, x) + t * 0.08, r = len(x, y);
  const petals = Math.pow(0.5 + 0.5 * Math.cos((5 + Math.floor(a * 4)) * th), 2 + b * 3);
  const edge = 0.16 + 0.34 * petals;
  return sat((1 - smoothstep(0.006, 0.028, Math.abs(r - edge))) * 0.83 + 0.3 * (1 - smoothstep(edge - 0.06, edge + 0.03, r)));
};

type Sdf = (x: number, y: number, z: number, t: number, a: number, b: number) => number;
/** Same camera, bounded marching and light as the GLSL helper. */
function solid(sdf: Sdf, detail: (x: number, y: number, z: number, t: number) => number): BasicPattern {
  const M = new Float64Array(9);
  let ox = 0, oy = 0, oz = 0, lx = 0, ly = 0, lz = 0;
  return {
    prep(t) {
      rotXY(0.27 + 0.13 * Math.sin(t * 0.16), 0.3 + t * 0.23, M);
      ox = -2.55 * M[2]; oy = -2.55 * M[5]; oz = -2.55 * M[8];
      const ex = M[0] * -0.6 + M[1] * 0.7 + M[2] * -0.5;
      const ey = M[3] * -0.6 + M[4] * 0.7 + M[5] * -0.5;
      const ez = M[6] * -0.6 + M[7] * 0.7 + M[8] * -0.5;
      const l = Math.hypot(ex, ey, ez); lx = ex / l; ly = ey / l; lz = ez / l;
    },
    f(x, y, t, a, b) {
      const inv = 1 / Math.hypot(x, y, 1.65), vx = x * inv, vy = y * inv, vz = 1.65 * inv;
      const dx = M[0] * vx + M[1] * vy + M[2] * vz;
      const dy = M[3] * vx + M[4] * vy + M[5] * vz;
      const dz = M[6] * vx + M[7] * vy + M[8] * vz;
      let dist = 0, qx = 0, qy = 0, qz = 0, hit = false;
      for (let i = 0; i < 72; i++) {
        qx = ox + dx * dist; qy = oy + dy * dist; qz = oz + dz * dist;
        const d = sdf(qx, qy, qz, t, a, b);
        if (d < 0.002) { hit = true; break; }
        dist += Math.max(d * 0.66, 0.002); if (dist > 6) break;
      }
      if (!hit) return 0;
      const e = 0.003;
      let nx = sdf(qx + e, qy, qz, t, a, b) - sdf(qx - e, qy, qz, t, a, b);
      let ny = sdf(qx, qy + e, qz, t, a, b) - sdf(qx, qy - e, qz, t, a, b);
      let nz = sdf(qx, qy, qz + e, t, a, b) - sdf(qx, qy, qz - e, t, a, b);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      return sat(0.09 + 0.64 * Math.max(nx * lx + ny * ly + nz * lz, 0)
        + 0.2 * Math.max(-nx * dx - ny * dy - nz * dz, 0) + 0.2 * detail(qx, qy, qz, t));
    },
  };
}

const simbiosis: Sdf = (x, y, z, t, a, b) => {
  let s = 10;
  for (let i = 0; i < 3; i++) {
    const ph = t * 0.63 + i * TAU / 3, rad = 0.23 + 0.22 * Math.sin(t * 0.4);
    const d = Math.hypot(x - rad * Math.cos(ph), y - 0.28 * Math.sin(ph * 0.85), z - rad * Math.sin(ph)) - (0.24 + a * 0.1);
    const k = 0.12 + b * 0.18, h = Math.max(k - Math.abs(s - d), 0) / k;
    s = Math.min(s, d) - h * h * k * 0.25;
  }
  return s;
};
const pendulos: Sdf = (x, y, z, t, a, b) => {
  let s = 10;
  for (let i = 0; i < 5; i++) {
    const px = (i - 2) * 0.23, pz = (i - 2) * 0.035;
    const angle = Math.sin(t * (0.65 + i * 0.12)) * (0.2 + a * 0.35);
    const cx = px + 0.38 * Math.sin(angle), cy = 0.13 - 0.38 * Math.cos(angle);
    const ball = Math.hypot(x - cx, y - cy, z - pz) - (0.11 + b * 0.055);
    const vx = px - cx, vy = 0.55 - cy, vz = 0;
    const u = clamp(((x - cx) * vx + (y - cy) * vy + (z - pz) * vz) / (vx * vx + vy * vy + vz * vz), 0, 1);
    const wire = Math.hypot(x - cx - vx * u, y - cy - vy * u, z - pz - vz * u) - 0.014;
    s = Math.min(s, ball, wire);
  }
  return s;
};
const cinta_ola: Sdf = (x, y, z, t, a, b) => {
  const wave = 0.22 * Math.sin(x * 7 + t * 0.9) * (1 - x * x * 0.5);
  return Math.max(Math.abs(y - wave) - (0.018 + b * 0.01), Math.abs(x) - 0.6, Math.abs(z - 0.12 * Math.cos(x * 5 + t * 0.9)) - (0.38 + a * 0.12));
};
const jade_vivo: Sdf = (x, y, z, t, a, b) => {
  const r = Math.hypot(x, y, z), th = Math.atan2(z, x), phi = Math.atan2(y, Math.hypot(x, z));
  const wave = 0.045 * Math.sin(th * 6 + t * 0.58) * Math.cos(phi * 4 - t * 0.41) + 0.025 * Math.sin(phi * 11 + th * 3 + t * 0.3);
  return r - (0.43 + a * 0.12 + wave * (0.4 + b));
};
const caliz: Sdf = (x, y, z, _t, a, b) => {
  const radius = 0.12 + (0.26 + a * 0.1) * smoothstep(-0.46, 0.4, y);
  const shell = Math.abs(Math.hypot(x, z) - radius) - (0.026 + b * 0.015);
  const body = Math.max(shell, -0.5 - y, y - 0.47);
  const stem = Math.max(Math.hypot(x, z) - 0.035, -0.62 - y, y + 0.44);
  const lip = Math.hypot(Math.hypot(x, z) - radius, y - 0.45) - 0.033;
  return Math.min(body, stem, lip);
};
const medusa: Sdf = (x, y, z, t, a, b) => {
  const dome = Math.max(Math.hypot(x, Math.max(y - 0.05, 0) * 0.75, z) - (0.35 + a * 0.12), -y + 0.04);
  let tent = 10;
  for (let i = 0; i < 7; i++) {
    const ph = i * TAU / 7;
    const cx = 0.19 * Math.cos(ph) + 0.05 * Math.sin(t * 0.5 + y * 7 + ph);
    const cz = 0.19 * Math.sin(ph) + 0.05 * Math.cos(t * 0.5 + y * 7 + ph);
    tent = Math.min(tent, Math.max(Math.hypot(x - cx, z - cz) - (0.012 + b * 0.013), -0.6 - y, y + 0.07));
  }
  return Math.min(dome, tent);
};
const esferas_orbita: Sdf = (x, y, z, t, a, b) => {
  let s = 10;
  for (let i = 0; i < 6; i++) {
    const ph = i * TAU / 6 + t * (0.35 + a * 0.35);
    s = Math.min(s, Math.hypot(x - 0.4 * Math.cos(ph), y - 0.21 * Math.sin(ph * 2 + t * 0.2), z - 0.4 * Math.sin(ph)) - (0.11 + b * 0.05));
  }
  return Math.min(s, Math.hypot(Math.hypot(x, z) - 0.4, y) - 0.017);
};

export const NEXT_BASIC: Record<string, BasicPattern> = {
  enjambre_vivo: particlePattern(0), estela_cometas: particlePattern(1),
  lluvia_ascendente: particlePattern(2), orbitas_gemelas: particlePattern(3),
  corazon_particulas: particlePattern(4), cardumen_luz: particlePattern(5),
  vortice_polvo: particlePattern(6), ondas_estelares: particlePattern(7),
  mariposa_puntos: particlePattern(8), nieve_orbital: particlePattern(9),
  floracion_luz: particlePattern(10), constelacion_dinamica: particlePattern(11),
  mareas_lentas: P(mareas_lentas), jardin_zen: P(jardin_zen), bruma_lejana: P(bruma_lejana),
  luciernagas: P(luciernagas), lluvia_mansa: P(lluvia_mansa), bambu: P(bambu),
  respiracion: P(respiracion), estuario: P(estuario), lemniscata: P(lemniscata),
  superformula: P(superformula), armonografo: P(armonografo), catenaria: P(catenaria),
  apolonio: P(apolonio), campo_flujo: P(campo_flujo), flor_armonica: P(flor_armonica),
  estrella_mar: P(estrella_mar),
  simbiosis: solid(simbiosis, (_x, y, _z, t) => 0.4 + 0.4 * Math.sin(y * 11 + t * 0.7)),
  pendulos: solid(pendulos, () => 0.2),
  cinta_ola: solid(cinta_ola, (x, _y, _z, t) => 0.5 + 0.5 * Math.cos(x * 18 + t)),
  jade_vivo: solid(jade_vivo, (_x, y, _z, t) => 0.5 + 0.5 * Math.sin(y * 17 + t * 0.5)),
  caliz: solid(caliz, (x, _y, z, t) => 0.45 + 0.35 * Math.cos(Math.atan2(z, x) * 8 + t * 0.3)),
  medusa: solid(medusa, (_x, y) => 0.4 + 0.5 * Math.exp(-Math.abs(y - 0.05) * 6)),
  esferas_orbita: solid(esferas_orbita, (x, _y, z) => 0.5 + 0.5 * Math.cos(x * 9 + z * 8)),
};

export function setNextPX(_v: number) { /* Chunk widths are expressed in pattern space. */ }
