import { Accum, OrbitCamera } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, Stroke } from '../types';

/**
 * Curl-noise smoke (Bridson, Hourihan and Nordenstam 2007, written here from the paper's idea): thousands of
 * particles carried by v = ∇ × Ψ, where Ψ = (ψ₁, ψ₂, ψ₃) are three 3D gradient noises shifted apart and
 * sliding slowly through time. The curl of any field has no divergence, so the flow neither piles particles up
 * nor empties regions: it rolls them into filaments and eddies, the look of smoke. On top of it:
 *  - a pull towards a target that orbits or stays put, only beyond a radius (a soft leash), and a rise;
 *  - a life that runs down; a spent particle is born again inside a sphere around the target (or anywhere in
 *    the volume when there is none), so the figure keeps being fed;
 * Drawn through a camera that orbits slowly (the render depends on t, the state does not): every particle is
 * a short streak along its motion, weighted by its depth (nearer is brighter), its age (it fades in and out)
 * and a self-shadow read from the projected density towards a light (relief: the far side of a puff is darker).
 */

const ID = 'humo', V = 1, RATE = 30, DT = 1 / RATE;
const MAX_PARTICLES = 12000;
/** Camera distance (world units: one screen height ≈ two units at zoom 1). */
const CAM_DIST = 3.2;
/** Streak samples per particle. */
const STREAK = 3;

/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

interface P {
  count: number; scale: number; speed: number; life: number; attract: number; radius: number; target: string; rise: number;
  orbit: number; tilt: number; zoom: number; trail: number; shadow: number; gain: number;
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  count: Math.max(100, Math.min(MAX_PARTICLES, Math.round(num(p.count, 6000)))), scale: num(p.scale, 1), speed: num(p.speed, 0.35),
  life: num(p.life, 3), attract: num(p.attract, 0.5), radius: num(p.radius, 0.15), target: String(p.target ?? 'orbita'),
  rise: num(p.rise, 0), orbit: num(p.orbit, 0.15), tilt: num(p.tilt, 20), zoom: num(p.zoom, 1), trail: num(p.trail, 0.5),
  shadow: num(p.shadow, 0.5), gain: num(p.gain, 1),
});

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h, n = w * h;
  const rng = new SimRng(`${ID}|${V}|${cfg.seed}`);
  let p = read(cfg.params);
  let steps = 0;

  // ---- gradient noise: a seeded permutation and 12 edge directions
  const perm = new Uint8Array(512);
  {
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) a[i] = i;
    for (let i = 255; i > 0; i--) { const j = rng.int(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = a[i & 255];
  }
  const GX = [1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0], GY = [1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1], GZ = [0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1];
  const gxs = new Float64Array(512), gys = new Float64Array(512), gzs = new Float64Array(512);
  for (let i = 0; i < 512; i++) { const g = perm[i] % 12; gxs[i] = GX[g]; gys[i] = GY[g]; gzs[i] = GZ[g]; }
  /** Gradient noise at (x, y, z): its gradient written into ND[0..2] (the value itself is not needed). */
  const ND = new Float64Array(3);
  const noiseGrad = (x: number, y: number, z: number) => {
    let ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    ix &= 255; iy &= 255; iz &= 255;
    // quintic fade and its derivative
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const dux = 30 * fx * fx * (fx - 1) * (fx - 1), duy = 30 * fy * fy * (fy - 1) * (fy - 1), duz = 30 * fz * fz * (fz - 1) * (fz - 1);
    const a0 = perm[ix] + iy, a1 = perm[ix + 1] + iy;
    const h000 = perm[perm[a0] + iz], h100 = perm[perm[a1] + iz], h010 = perm[perm[a0 + 1] + iz], h110 = perm[perm[a1 + 1] + iz];
    const h001 = perm[perm[a0] + iz + 1], h101 = perm[perm[a1] + iz + 1], h011 = perm[perm[a0 + 1] + iz + 1], h111 = perm[perm[a1 + 1] + iz + 1];
    // corner gradients and their dot products with the offsets
    const ax = gxs[h000], ay = gys[h000], az = gzs[h000], va = ax * fx + ay * fy + az * fz;
    const bx = gxs[h100], by = gys[h100], bz = gzs[h100], vb = bx * (fx - 1) + by * fy + bz * fz;
    const cx = gxs[h010], cy = gys[h010], cz = gzs[h010], vc = cx * fx + cy * (fy - 1) + cz * fz;
    const dx = gxs[h110], dy = gys[h110], dz = gzs[h110], vd = dx * (fx - 1) + dy * (fy - 1) + dz * fz;
    const ex = gxs[h001], ey = gys[h001], ez = gzs[h001], ve = ex * fx + ey * fy + ez * (fz - 1);
    const fgx = gxs[h101], fgy = gys[h101], fgz = gzs[h101], vf = fgx * (fx - 1) + fgy * fy + fgz * (fz - 1);
    const gx = gxs[h011], gy = gys[h011], gz = gzs[h011], vg = gx * fx + gy * (fy - 1) + gz * (fz - 1);
    const hx = gxs[h111], hy = gys[h111], hz = gzs[h111], vh = hx * (fx - 1) + hy * (fy - 1) + hz * (fz - 1);
    // trilinear blend n = Σ weights · values, differentiated: Σ weights · gradients + Σ d(weights) · values
    const k1 = vb - va, k2 = vc - va, k3 = ve - va, k4 = va - vb - vc + vd, k5 = va - vc - ve + vg, k6 = va - vb - ve + vf, k7 = -va + vb + vc - vd + ve - vf - vg + vh;
    const uxy = ux * uy, uyz = uy * uz, uzx = uz * ux, uxyz = uxy * uz;
    ND[0] = ax + ux * (bx - ax) + uy * (cx - ax) + uz * (ex - ax) + uxy * (ax - bx - cx + dx) + uyz * (ax - cx - ex + gx) + uzx * (ax - bx - ex + fgx) + uxyz * (-ax + bx + cx - dx + ex - fgx - gx + hx)
      + dux * (k1 + uy * k4 + uz * k6 + uyz * k7);
    ND[1] = ay + ux * (by - ay) + uy * (cy - ay) + uz * (ey - ay) + uxy * (ay - by - cy + dy) + uyz * (ay - cy - ey + gy) + uzx * (ay - by - ey + fgy) + uxyz * (-ay + by + cy - dy + ey - fgy - gy + hy)
      + duy * (k2 + ux * k4 + uz * k5 + uzx * k7);
    ND[2] = az + ux * (bz - az) + uy * (cz - az) + uz * (ez - az) + uxy * (az - bz - cz + dz) + uyz * (az - cz - ez + gz) + uzx * (az - bz - ez + fgz) + uxyz * (-az + bz + cz - dz + ez - fgz - gz + hz)
      + duz * (k3 + uy * k5 + ux * k6 + uxy * k7);
  };

  // ---- particles
  const pos = new Float32Array(MAX_PARTICLES * 3), vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES), span = new Float32Array(MAX_PARTICLES);
  const TG = new Float64Array(3);
  // with no target, smoke comes from a few emitters that wander slowly through the volume (a flow without
  // divergence keeps a uniform cloud uniform: the filaments come from where the smoke is born)
  const EMIT = 6, EB = new Float64Array(EMIT * 6);
  for (let k = 0; k < EMIT; k++) {
    EB[k * 6] = rng.range(-1.3, 1.3); EB[k * 6 + 1] = rng.range(-0.6, 0.6); EB[k * 6 + 2] = rng.range(-1, 1);
    EB[k * 6 + 3] = rng.range(0, 6.283); EB[k * 6 + 4] = rng.range(0, 6.283); EB[k * 6 + 5] = rng.range(0, 6.283);
  }
  /** The target at time τ (s): orbiting on a slow 3D Lissajous, fixed low in the frame, or emitter k. */
  const targetAt = (tau: number, k = 0) => {
    if (p.target === 'orbita') {
      const a = 0.32 * tau;
      TG[0] = 0.95 * Math.cos(a); TG[1] = 0.32 * Math.sin(1.7 * a + 0.6); TG[2] = 0.75 * Math.sin(a);
    } else if (p.target === 'fijo') { TG[0] = 0; TG[1] = -0.85; TG[2] = 0; }
    else {
      const o = (k % EMIT) * 6;
      TG[0] = EB[o] + 0.4 * Math.sin(0.11 * tau + EB[o + 3]); TG[1] = EB[o + 1] + 0.25 * Math.sin(0.09 * tau + EB[o + 4]); TG[2] = EB[o + 2] + 0.4 * Math.sin(0.07 * tau + EB[o + 5]);
    }
  };
  const spawn = (i: number, tau: number, first: boolean) => {
    // a point in a ball around the target (rejection sampling, bounded)
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 8; k++) {
      x = rng.range(-1, 1); y = rng.range(-1, 1); z = rng.range(-1, 1);
      if (x * x + y * y + z * z <= 1) break;
    }
    const o = i * 3;
    targetAt(tau, i);
    const R = p.target === 'libre' ? 0.5 * p.radius : p.radius;
    pos[o] = TG[0] + R * x; pos[o + 1] = TG[1] + R * y * (p.target === 'fijo' ? 0.4 : 0.8); pos[o + 2] = TG[2] + R * z;
    vel[o] = vel[o + 1] = vel[o + 2] = 0;
    span[i] = rng.range(0.6, 1.4);
    life[i] = first ? rng.next() : 1;
  };
  for (let i = 0; i < MAX_PARTICLES; i++) spawn(i, 0, true);

  // the three potentials sit far apart in the noise and slide along their own directions
  const OFF = [0, 0, 0, 31.4, 17.9, 7.3, 53.1, 71.7, 29.9];
  const SLIDE = [0.13, 0.07, -0.05, -0.06, 0.11, 0.09, 0.08, -0.1, 0.12];
  const step1 = () => {
    const tau = steps * DT;
    const k = 1.4 / p.scale, sp = p.speed * 0.55 * p.scale;
    const np = p.count;
    targetAt(tau);
    const tx = TG[0], ty = TG[1], tz = TG[2], leash = p.target !== 'libre';
    const r1 = Math.max(0.05, p.radius * 1.5), r2 = r1 + 0.6;
    const pull = 1.6 * p.attract, rise = 0.35 * p.rise;
    const decay = DT / Math.max(0.2, p.life);
    for (let i = 0; i < np; i++) {
      const o = i * 3;
      const x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const sx = x * k + 0.5, sy = y * k + 0.5, sz = z * k + 0.5;
      noiseGrad(sx + OFF[0] + SLIDE[0] * tau, sy + OFF[1] + SLIDE[1] * tau, sz + OFF[2] + SLIDE[2] * tau);
      const a1y = ND[1], a1z = ND[2];
      noiseGrad(sx + OFF[3] + SLIDE[3] * tau, sy + OFF[4] + SLIDE[4] * tau, sz + OFF[5] + SLIDE[5] * tau);
      const a2x = ND[0], a2z = ND[2];
      noiseGrad(sx + OFF[6] + SLIDE[6] * tau, sy + OFF[7] + SLIDE[7] * tau, sz + OFF[8] + SLIDE[8] * tau);
      const a3x = ND[0], a3y = ND[1];
      // v = ∇ × Ψ
      let vx = (a3y - a2z) * sp, vy = (a1z - a3x) * sp + rise, vz = (a2x - a1y) * sp;
      if (pull > 0) {
        // the leash: no pull inside r1, full pull beyond r2 (the free volume pulls back towards its box)
        let ddx: number, ddy: number, ddz: number, d: number;
        if (leash) { ddx = tx - x; ddy = ty - y; ddz = tz - z; d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz); }
        else { ddx = -x / 1.7; ddy = -y / 0.95; ddz = -z / 1.3; d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) * 1.2; }
        const s = d <= r1 ? 0 : d >= r2 ? 1 : ((d - r1) / (r2 - r1)) ** 2 * (3 - 2 * (d - r1) / (r2 - r1));
        vx += pull * s * ddx; vy += pull * s * ddy; vz += pull * s * ddz;
      }
      vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
      pos[o] = x + vx * DT; pos[o + 1] = y + vy * DT; pos[o + 2] = z + vz * DT;
      life[i] -= decay / span[i];
      // spent or lost far away: born again
      if (life[i] <= 0 || Math.abs(pos[o]) > 4 || Math.abs(pos[o + 1]) > 3 || Math.abs(pos[o + 2]) > 4) spawn(i, tau, false);
    }
    steps++;
  };

  // ---- render
  const cam = new OrbitCamera();
  const dh = Math.max(8, h >> 1), dw = 2 * dh;
  const dens = new Float32Array(dw * dh), accA = new Accum(w, h), acc = accA.d, blurTmp = new Float32Array(n);
  const scrX = new Float32Array(MAX_PARTICLES), scrY = new Float32Array(MAX_PARTICLES), wgt = new Float32Array(MAX_PARTICLES);
  const Q = new Float64Array(3);
  const deposit = (f: Float32Array, fw: number, fh: number, fx: number, fy: number, v: number) => {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= fw - 1 || iy >= fh - 1) return;
    const tx = fx - ix, ty = fy - iy, j = iy * fw + ix;
    f[j] += v * (1 - tx) * (1 - ty); f[j + 1] += v * tx * (1 - ty); f[j + fw] += v * (1 - tx) * ty; f[j + fw + 1] += v * tx * ty;
  };
  const sample = (f: Float32Array, fw: number, fh: number, fx: number, fy: number) => {
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= fw - 1 || iy >= fh - 1) return 0;
    const tx = fx - ix, ty = fy - iy, j = iy * fw + ix;
    return (f[j] * (1 - tx) + f[j + 1] * tx) * (1 - ty) + (f[j + fw] * (1 - tx) + f[j + fw + 1] * tx) * ty;
  };
  const render = (out: Uint8Array, t: number) => {
    const np = p.count;
    cam.set(0.35 + p.orbit * 0.25 * t, (p.tilt * Math.PI) / 180, CAM_DIST);
    cam.fov = CAM_DIST * p.zoom;
    dens.fill(0); acc.fill(0);
    // projection (domain → raster pixels), depth weight and age fade
    const area = (h / 96) * (h / 96);
    for (let i = 0; i < np; i++) {
      const o = i * 3;
      if (!cam.project(pos[o], pos[o + 1], pos[o + 2], Q)) { wgt[i] = 0; continue; }
      const fx = (Q[0] * 0.5 + 0.5) * w, fy = (0.5 - Q[1]) * h;
      const near = CAM_DIST / Q[2], L = life[i];
      // fades in over the first 25 % of its life and out over the last 35 %
      const age = Math.min(1, (1 - L) / 0.25, L / 0.35);
      scrX[i] = fx; scrY[i] = fy; wgt[i] = near * near * age * area;
      deposit(dens, dw, dh, fx * 0.5 - 0.25, fy * 0.5 - 0.25, near * age);
    }
    // the light comes from the upper left of the screen: density in that direction shadows a particle
    const sh = p.shadow * 0.9, lx = -2.2, ly = -2.6;
    const streak = p.trail * 0.09 * p.zoom;
    for (let i = 0; i < np; i++) {
      const wv = wgt[i];
      if (wv <= 0) continue;
      const fx = scrX[i], fy = scrY[i];
      let lit = 1;
      if (sh > 0) {
        const occ = sample(dens, dw, dh, fx * 0.5 - 0.25 + lx, fy * 0.5 - 0.25 + ly) + 0.5 * sample(dens, dw, dh, fx * 0.5 - 0.25 + 2 * lx, fy * 0.5 - 0.25 + 2 * ly);
        lit = 1 - sh + sh * Math.exp(-occ * 0.35);
      }
      const v = wv * lit;
      if (streak > 0) {
        // a short streak back along the motion (projected by finite difference of the camera's scale)
        const o = i * 3;
        const vx = vel[o], vy = vel[o + 1], vz = vel[o + 2], vl = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
        if (cam.project(pos[o] - (vx / vl) * streak, pos[o + 1] - (vy / vl) * streak, pos[o + 2] - (vz / vl) * streak, Q)) {
          const bxp = (Q[0] * 0.5 + 0.5) * w, byp = (0.5 - Q[1]) * h;
          for (let k = 0; k < STREAK; k++) {
            const f = k / STREAK;
            deposit(acc, w, h, fx + (bxp - fx) * f - 0.5, fy + (byp - fy) * f - 0.5, (v * (1 - 0.6 * f)) / STREAK * 1.6);
          }
          continue;
        }
      }
      deposit(acc, w, h, fx - 0.5, fy - 0.5, v);
    }
    // one soft pass: puffs read as volumes, filaments stay a glyph wide
    accA.blur(1, false, blurTmp);
    // logarithmic tone against the mean density where there is smoke: the body of a puff reads in the middle
    // of the ramp at any count or resolution, a lone wisp still shows and the core does not burn out
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (acc[i] > 0.02) { sum += acc[i]; cnt++; }
    if (!cnt) { out.fill(0, 0, n); return; }
    const g = (3 * p.gain * cnt) / sum, L = 1 / Math.log(10);
    for (let i = 0; i < n; i++) out[i] = byte(Math.log(1 + acc[i] * g) * L);
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array, t: number) { render(out, t); },
    stroke(s: Stroke) {
      // a puff: particles reborn along the stroke, around the plane through the origin
      const cnt = Math.min(p.count, Math.round(40 + 260 * Math.max(0, Math.min(1, s.strength))));
      for (let k = 0; k < cnt; k++) {
        const i = rng.int(p.count), o = i * 3, f = rng.next();
        const x = s.x0 + (s.x1 - s.x0) * f, y = s.y0 + (s.y1 - s.y0) * f;
        pos[o] = (x * 2) / p.zoom + rng.gauss() * s.r; pos[o + 1] = (y * 2) / p.zoom + rng.gauss() * s.r; pos[o + 2] = rng.gauss() * s.r;
        life[i] = 1; span[i] = rng.range(0.6, 1.4);
      }
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: V, steps, res: h, scalars, arrays: { pos: pos.slice(), vel: vel.slice(), life: life.slice(), span: span.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a este humo.');
      const A = s.arrays;
      const ok = (x: unknown, len: number): x is Float32Array => x instanceof Float32Array && x.length === len;
      if (!ok(A.pos, pos.length) || !ok(A.vel, vel.length) || !ok(A.life, life.length) || !ok(A.span, span.length)) throw new Error('El estado guardado está incompleto.');
      pos.set(A.pos); vel.set(A.vel); life.set(A.life); span.set(A.span);
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
