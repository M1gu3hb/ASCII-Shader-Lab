import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params } from '../types';

/**
 * Hydraulic and thermal erosion of a height map, drawn as a diorama seen by a camera that orbits it.
 *
 * Terrain: seeded fbm value noise (ridged for the ranges) shaped as a range, a slope down to the sea or a
 * plateau; the sea is everything under height 0.
 *
 * Hydraulic erosion by droplets (the particle model of Beyer 2015, written from the thesis): every step a
 * number of raindrops falls on seeded places. Each one rolls downhill on the bilinear gradient with some
 * inertia, gains speed going down (v² += g·Δh) and loses water to evaporation. Its sediment capacity is
 * C = Kc·max(−Δh, slope₀)·v·water: below capacity it dissolves the bed around it (rate Ks, through a small
 * brush, never more than the drop in height), above it or going uphill it lays sediment down (rate Kd).
 * In the sea it slows and drops its load (deltas). Its leftover load stays where it ends, so terrain is
 * conserved except what leaves through the map's edges (counted). The paths of the drops feed a flow map
 * that fades with time: the rivers that are drawn.
 *
 * Thermal erosion moves material down any slope steeper than the talus angle. Optional hard strata (layers of
 * rock every few units of height) resist both, which turns slopes into terraces.
 *
 * Drawing (does not touch the state): voxel-space ray casting, column by column front to back with a height
 * buffer (Comanche style), Lambert shading with exaggerated relief, rivers and sea brighter, distance fog and
 * the diorama's walls.
 */

const ID = 'erosion', V = 1;
/** Vertical exaggeration of the drawn relief. */
const EX = 1.7;
const MAX_N = 160, MAX_DROPS = 96, MAX_LIFE = 64, SEA_LIFE = 6;
const INERTIA = 0.1, GRAV = 1, MIN_SLOPE = 0.01, BRUSH = 1.6, MAX_SPEED = 4;

interface P {
  rain: number; erode: number; deposit: number; capacity: number; evap: number; talus: number; strata: number;
  height: number; scale: number; shape: string; view: string; orbit: number; pitch: number;
}
const read = (p: Params): P => ({
  rain: Number(p.rain ?? 0.5), erode: Number(p.erode ?? 0.5), deposit: Number(p.deposit ?? 0.5), capacity: Number(p.capacity ?? 0.5),
  evap: Number(p.evap ?? 0.3), talus: Number(p.talus ?? 40), strata: Number(p.strata ?? 0), height: Number(p.height ?? 0.6),
  scale: Number(p.scale ?? 3), shape: String(p.shape ?? 'cordillera'), view: String(p.view ?? 'relieve'), orbit: Number(p.orbit ?? 0.5),
  pitch: Number(p.pitch ?? 0.4),
});

/** Bilinear sample of an n × n field at index coordinates (fx, fy), clamped at its edges. */
function bil(f: Float32Array, n: number, fx: number, fy: number): number {
  fx = fx < 0 ? 0 : fx > n - 1 ? n - 1 : fx;
  fy = fy < 0 ? 0 : fy > n - 1 ? n - 1 : fy;
  const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
  const o = iy * n + ix, dx = ix < n - 1 ? 1 : 0, dy = iy < n - 1 ? n : 0;
  const a = f[o] + (f[o + dx] - f[o]) * tx, b = f[o + dy] + (f[o + dy + dx] - f[o + dy]) * tx;
  return a + (b - a) * ty;
}

/** Seeded value noise on a 256-periodic lattice, smoothstep-interpolated; fbm and ridged sums of it. */
function noise(rng: SimRng) {
  const perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rng.next(); }
  for (let i = 255; i > 0; i--) { const j = rng.int(i + 1), t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x: number, y: number) => val[perm[(perm[x & 255] + y) & 511]];
  const vn = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return {
    fbm(x: number, y: number, oct = 5) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * vn(x * f + i * 17.3, y * f - i * 9.1); t += a; a *= 0.5; f *= 2.03; } return s / t; },
    ridged(x: number, y: number, oct = 5) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(2 * vn(x * f + i * 31.7, y * f + i * 5.3) - 1); s += a * r * r; t += a; a *= 0.5; f *= 2.03; } return s / t; },
  };
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const N = Math.max(32, Math.min(MAX_N, Math.round(h * 1.15))), nn = N * N;
  const B = new Float32Array(nn), F = new Float32Array(nn), dB = new Float32Array(nn);
  const shade = new Float32Array(nn), ybuf = new Float32Array(w);
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0, lost = 0, dropAcc = 0;

  // ---- the initial relief (structural: changing it rebuilds the model)
  const nz = noise(rng);
  const amp = p.height * N * 0.14, fq = p.scale / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / (N - 1), v = y / (N - 1);
    let e: number;
    if (p.shape === 'ladera') {
      // high at the back, under the sea at the front, with valleys from the noise
      e = 0.95 * (1 - v) + 0.4 * nz.fbm(x * fq, y * fq) - 0.38;
    } else if (p.shape === 'meseta') {
      // a plateau with steep sides
      const r = Math.hypot(u - 0.5, v - 0.5) * 2 + 0.35 * (nz.fbm(x * fq, y * fq) - 0.5);
      e = 0.85 / (1 + Math.exp((r - 0.62) * 18)) + 0.1 * nz.fbm(x * fq * 2, y * fq * 2);
    } else {
      // ridged ranges that fall off towards the edges
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      e = (0.75 * nz.ridged(x * fq, y * fq) + 0.35 * nz.fbm(x * fq * 0.5, y * fq * 0.5)) * Math.max(0, 1.1 - r * r * 0.75) - 0.05;
    }
    B[y * N + x] = Math.max(-0.12, e) * amp;
  }
  let top0 = 1;
  for (let k = 0; k < nn; k++) if (B[k] > top0) top0 = B[k];
  top0 *= EX;
  const layer = Math.max(0.5, amp / 5);

  /** Hardness of the rock at height z: hard bands every `layer` units when «Estratos» is on (0 soft … 1 hard). */
  const hard = (z: number) => {
    if (p.strata <= 0) return 0;
    const f = z / layer - Math.floor(z / layer);
    return p.strata * 0.95 * (f < 0.5 ? 0 : f > 0.62 ? 1 : (f - 0.5) / 0.12);
  };

  // erosion brush: cells within BRUSH of the drop, weights falling linearly with distance
  const bo: number[] = [], bx: number[] = [], by: number[] = [], bw: number[] = [];
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const d = Math.hypot(i, j);
    if (d < BRUSH) { bx.push(i); by.push(j); bo.push(j * N + i); bw.push(BRUSH - d); }
  }
  const HG = new Float64Array(3);
  /** Height and gradient at (x, y) by bilinear interpolation of the four corners. */
  const heightGrad = (x: number, y: number) => {
    const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy, k = iy * N + ix;
    const a = B[k], b = B[k + 1], c = B[k + N], d = B[k + N + 1];
    HG[0] = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    HG[1] = (b - a) * (1 - v) + (d - c) * v;
    HG[2] = (c - a) * (1 - u) + (d - b) * u;
  };
  /** Lays `amount` on the four corners of the cell under (x, y). */
  const lay = (x: number, y: number, amount: number) => {
    const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy, k = iy * N + ix;
    B[k] += amount * (1 - u) * (1 - v); B[k + 1] += amount * u * (1 - v);
    B[k + N] += amount * (1 - u) * v; B[k + N + 1] += amount * u * v;
  };
  /** Takes up to `amount` from the brush around (x, y); returns what it took. */
  const dig = (x: number, y: number, amount: number) => {
    const ix = Math.round(x), iy = Math.round(y), k = iy * N + ix;
    let ws = 0;
    for (let i = 0; i < bo.length; i++) {
      const xx = ix + bx[i], yy = iy + by[i];
      if (xx >= 0 && yy >= 0 && xx < N && yy < N) ws += bw[i];
    }
    let took = 0;
    for (let i = 0; i < bo.length; i++) {
      const xx = ix + bx[i], yy = iy + by[i];
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const q = k + bo[i], e = (amount * bw[i]) / ws * (1 - hard(B[q]));
      B[q] -= e; took += e;
    }
    return took;
  };

  const drop = (Kc: number, Ks: number, Kd: number, ev: number) => {
    let x = rng.next() * (N - 1), y = rng.next() * (N - 1);
    let dx = 0, dy = 0, speed = 1, water = 1, sed = 0, sea = 0;
    heightGrad(x, y);
    if (HG[0] < 0) return; // rain on the sea
    for (let life = 0; life < MAX_LIFE; life++) {
      const h0 = HG[0];
      dx = dx * INERTIA - HG[1] * (1 - INERTIA); dy = dy * INERTIA - HG[2] * (1 - INERTIA);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-9) break;
      dx /= len; dy /= len;
      const ox = x, oy = y;
      x += dx; y += dy;
      F[(oy | 0) * N + (ox | 0)] += water;
      if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) { lost += sed; sed = 0; break; }
      heightGrad(x, y);
      const dh = HG[0] - h0;
      if (HG[0] < 0) { speed *= 0.5; sea++; }
      const cap = HG[0] < 0 ? 0 : Math.max(-dh, MIN_SLOPE) * speed * water * Kc;
      if (sed > cap || dh > 0) {
        // uphill: fill the hollow behind; otherwise lay down part of the excess
        const put = dh > 0 ? Math.min(dh, sed) : (sed - cap) * Kd;
        sed -= put; lay(ox, oy, put);
      } else {
        sed += dig(ox, oy, Math.min((cap - sed) * Ks, -dh));
      }
      speed = Math.min(MAX_SPEED, Math.sqrt(Math.max(0, speed * speed - dh * GRAV)));
      water *= 1 - ev;
      if (sea > SEA_LIFE || water < 0.01) break;
    }
    if (sed > 0) {
      if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) lost += sed;
      else lay(x, y, sed);
    }
  };

  const step1 = () => {
    const Kc = 0.05 + 0.6 * p.capacity, Ks = 0.02 + 0.4 * p.erode, Kd = 0.02 + 0.4 * p.deposit, ev = 0.005 + 0.08 * p.evap;
    // the flow map fades (a few seconds of memory)
    for (let k = 0; k < nn; k++) F[k] *= 0.96;
    dropAcc += p.rain * MAX_DROPS;
    for (; dropAcc >= 1; dropAcc--) drop(Kc, Ks, Kd, ev);
    // thermal erosion: material above the talus slope slides to the lower neighbours (hard rock holds cliffs)
    const T0 = Math.tan((p.talus * Math.PI) / 180), Kt = 0.25;
    dB.fill(0);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = y * N + x, z = B[k], hz = hard(z), T = T0 + 8 * hz;
      const a = x > 0 ? z - B[k - 1] - T : 0, b = x < N - 1 ? z - B[k + 1] - T : 0;
      const c = y > 0 ? z - B[k - N] - T : 0, d = y < N - 1 ? z - B[k + N] - T : 0;
      const ea = a > 0 ? a : 0, eb = b > 0 ? b : 0, ec = c > 0 ? c : 0, ed = d > 0 ? d : 0, tot = ea + eb + ec + ed;
      if (tot <= 0) continue;
      const m = Kt * Math.max(ea, eb, ec, ed) * 0.5 * (1 - hz), r = m / tot;
      dB[k] -= m;
      if (ea > 0) dB[k - 1] += r * ea;
      if (eb > 0) dB[k + 1] += r * eb;
      if (ec > 0) dB[k - N] += r * ec;
      if (ed > 0) dB[k + N] += r * ed;
    }
    for (let k = 0; k < nn; k++) B[k] += dB[k];
    steps++;
  };

  // ---- drawing
  const render = (out: Uint8Array, t: number) => {
    out.fill(0);
    // light from a fixed sun over the map (not the camera), on the relief as drawn (heights × EX)
    const Lx = -0.55, Ly = -0.45, Lz = 0.7, ll = Math.hypot(Lx, Ly, Lz);
    let maxB = 1e-6;
    for (let k = 0; k < nn; k++) if (B[k] > maxB) maxB = B[k];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = y * N + x, z = B[k];
      const gx = 0.5 * EX * ((x < N - 1 ? Math.max(0, B[k + 1]) : z) - (x > 0 ? Math.max(0, B[k - 1]) : z));
      const gy = 0.5 * EX * ((y < N - 1 ? Math.max(0, B[k + N]) : z) - (y > 0 ? Math.max(0, B[k - N]) : z));
      const lam = Math.max(0, (-gx * Lx - gy * Ly + Lz) / (ll * Math.sqrt(gx * gx + gy * gy + 1)));
      const river = 1 - Math.exp(-F[k] * 0.08), sea = z < 0 ? Math.min(1, 0.55 - z * 0.4) : 0;
      if (p.view === 'agua') shade[k] = Math.max(0.04 + 0.2 * lam + 0.85 * river, sea);
      else if (p.view === 'alturas') shade[k] = z < 0 ? 0.04 : 0.08 + 0.55 * (z / maxB) + 0.4 * (lam - 0.55);
      else shade[k] = z < 0 ? 0.3 + 0.25 * sea : (0.05 + 0.85 * lam * lam) * (1 - 0.4 * river) + 0.7 * river;
    }
    if (p.view !== 'relieve') {
      // top-down map in the centre of the raster
      const o = (w - h) / 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
        const v = bil(shade, N, ((x + 0.5) * N) / h - 0.5, ((y + 0.5) * N) / h - 0.5);
        out[y * w + o + x] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
      }
      return;
    }
    // camera: orbits the centre; «Inclinación» raises it from 11° to 43° over the map (a voxel-space camera
    // tilts by shifting its horizon, which only looks right at moderate angles)
    const yaw = 0.6 + (t * p.orbit * Math.PI * 2) / 60, c = (N - 1) / 2;
    const elev = 0.2 + 0.55 * p.pitch, R = N * 2.2, camH = top0 * 0.4 + Math.tan(elev) * R;
    const cx = c - Math.sin(yaw) * R, cy = c + Math.cos(yaw) * R;
    const fwx = Math.sin(yaw), fwy = -Math.cos(yaw);
    // framing: the map's corners stay within the raster at any yaw (the steeper the view, the taller the map)
    const a = N * 0.71, base = -top0 * 0.12 - N * 0.04, far = R + N * 0.75;
    const focal = Math.min(2 * h, (0.86 * h) / ((camH - base) / (R - a) - (camH - top0) / (R + a)));
    const horizon = h * 0.5 - (((camH - base) / (R - a) + (camH - top0) / (R + a)) * focal) / 2;
    ybuf.fill(h);
    for (let sx = 0; sx < w; sx++) {
      const off = (sx + 0.5 - w / 2) / focal;
      // ray in the map plane: forward plus sideways, marched by depth along the view axis
      const rx = fwx - off * fwy, ry = fwy + off * fwx;
      let inside = false, z = R - N * 0.75;
      while (z < far) {
        const px = cx + rx * z, py = cy + ry * z;
        if (px < 0 || py < 0 || px > N - 1 || py > N - 1) { if (inside) break; z += 0.5; continue; }
        // the sea is a flat surface at height 0
        const top = Math.max(0, bil(B, N, px, py)) * EX;
        const ys = horizon + ((camH - top) * focal) / z;
        const fog = Math.min(1, Math.max(0, (z - (R - N * 0.6)) / (N * 1.5)));
        if (!inside) {
          // the diorama's wall where the ray enters the map
          inside = true;
          const yb = horizon + ((camH - base) * focal) / z;
          if (yb < ybuf[sx]) ybuf[sx] = Math.max(0, yb);
          const wall = ((0.16 * (1 - 0.5 * fog)) * 255 + 0.5) | 0;
          for (let y = Math.max(0, Math.ceil(ys)); y < ybuf[sx]; y++) out[y * w + sx] = wall;
          if (ys < ybuf[sx]) ybuf[sx] = Math.max(0, ys);
        } else if (ys < ybuf[sx]) {
          const v = bil(shade, N, px, py) * (1 - 0.55 * fog);
          const b = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
          for (let y = Math.max(0, Math.ceil(ys)); y < ybuf[sx]; y++) out[y * w + sx] = b;
          ybuf[sx] = Math.max(0, ys);
        }
        if (ybuf[sx] <= 0) break;
        z += 0.3 + (z - R + N) * 0.004;
      }
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render,
    snapshot(): ModelState {
      const scalars: Record<string, number> = { lost, dropAcc };
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { b: B.slice(), flow: F.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este terreno.');
      const a = s.arrays, ok = (x: unknown): x is Float32Array => x instanceof Float32Array && x.length === nn;
      if (!ok(a.b) || !ok(a.flow)) throw new Error('El estado guardado está incompleto.');
      B.set(a.b); F.set(a.flow);
      steps = s.steps; lost = s.scalars.lost ?? 0; dropAcc = s.scalars.dropAcc ?? 0;
      rng.load(s.scalars);
    },
  };
}
