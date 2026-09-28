/**
 * Textures laid over the picture: film grain, digital noise and CRT scanlines. All are seeded and
 * addressed in OUTPUT pixels, so a preview shows the same grains (averaged) as the final render, and the
 * same (seed, time) always gives the same pixels.
 */
import { clamp, frameOf, gauss3, hash3, luma, rand3, type Op, type Run } from '../core';

/* ------------------------------------------------------------------ grain */

/**
 * A lattice of normal values every `size` output px (optionally rotated), read bilinearly at output
 * coordinates. Bilinear reading lowers the variance by about 2/3 on average; LATTICE_STD compensates.
 */
class Lattice {
  readonly g: Float32Array;
  readonly i0: number; readonly j0: number; readonly gw: number; readonly gh: number;
  constructor(W: number, H: number, readonly size: number, readonly cos: number, readonly sin: number, seed: number, run: Run, key: string) {
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const [X, Y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const u = X * cos + Y * sin, v = -X * sin + Y * cos;
      umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    this.i0 = Math.floor(umin / size) - 1; this.j0 = Math.floor(vmin / size) - 1;
    this.gw = Math.floor(umax / size) + 3 - this.i0; this.gh = Math.floor(vmax / size) + 3 - this.j0;
    this.g = run.scratch.f32(key, this.gw * this.gh);
    for (let j = 0; j < this.gh; j++) for (let i = 0; i < this.gw; i++) {
      this.g[j * this.gw + i] = gauss3(i + this.i0, j + this.j0, seed);
    }
  }
  at(X: number, Y: number): number {
    const u = (X * this.cos + Y * this.sin) / this.size - this.i0, v = (-X * this.sin + Y * this.cos) / this.size - this.j0;
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j;
    const o = j * this.gw + i, g = this.g;
    // smoothstep weights: rounder grains than plain bilinear
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[o] + (g[o + 1] - g[o]) * sx, b = g[o + this.gw] + (g[o + this.gw + 1] - g[o + this.gw]) * sx;
    return a + (b - a) * sy;
  }
}

export const grain: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, scale = run.scale;
  const W = w / scale, H = h / scale, size = p.size as number;
  const frame = p.anim === true ? frameOf(run.t, 24) : 0;
  const seed = hash3(run.seed, frame, 0x6a09);
  // a preview pixel covers 1/scale output px: grains smaller than it average out, and so should the preview
  const att = Math.min(1, size * scale);
  const amp = (p.amount as number) * 70 * att;
  const cosB = Math.cos(0.6), sinB = Math.sin(0.6);
  const colour = p.color === true;
  const oct: Lattice[][] = [];
  for (let c = 0; c < (colour ? 3 : 1); c++) {
    oct.push([
      new Lattice(W, H, size, 1, 0, hash3(seed, c, 1), run, `grain.${c}a`),
      new Lattice(W, H, size * 0.71, cosB, sinB, hash3(seed, c, 2), run, `grain.${c}b`),
    ]);
  }
  const mixN = (l: Lattice[], X: number, Y: number) => (l[0].at(X, Y) * 0.8 + l[1].at(X, Y) * 0.6) * 1.35;
  for (let y = 0; y < h; y++) {
    const Y = (y + 0.5) / scale;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      const X = (x + 0.5) / scale;
      const l = luma(s[i], s[i + 1], s[i + 2]) / 255;
      const resp = amp * (0.3 + 2.8 * l * (1 - l)); // film grain shows most in the mid-tones
      const nm = mixN(oct[0], X, Y);
      if (colour) {
        const nr = mixN(oct[1], X, Y), ng = mixN(oct[2], X, Y);
        d[i] = s[i] + (nm * 0.55 + nr * 0.6) * resp;
        d[i + 1] = s[i + 1] + (nm * 0.55 + ng * 0.6) * resp;
        d[i + 2] = s[i + 2] + (nm * 0.55 - (nr + ng) * 0.42) * resp;
      } else {
        const v = nm * resp;
        d[i] = s[i] + v; d[i + 1] = s[i + 1] + v; d[i + 2] = s[i + 2] + v;
      }
      d[i + 3] = s[i + 3];
    }
  }
};

/* ------------------------------------------------------------------ noise */

export const noise: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, scale = run.scale;
  const size = Math.max(1, Math.round(p.size as number));
  const frame = p.anim === true ? frameOf(run.t, 24) : 0;
  const seed = hash3(run.seed, frame, 0x3c6e);
  const att = Math.min(1, size * scale);
  const amp = (p.amount as number) * 90 * att;
  const gauss = p.dist !== 'uniform', colour = p.color === true;
  const val = gauss ? (x: number, y: number, z: number) => gauss3(x, y, z) : (x: number, y: number, z: number) => (rand3(x, y, z) - 0.5) * 3.4641;
  const cellX = new Int32Array(w);
  for (let x = 0; x < w; x++) cellX[x] = Math.floor((x + 0.5) / scale / size);
  for (let y = 0; y < h; y++) {
    const cy = Math.floor((y + 0.5) / scale / size);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (s[i + 3] === 0) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0; continue; }
      const cx = cellX[x];
      if (colour) {
        d[i] = s[i] + val(cx, cy, seed) * amp;
        d[i + 1] = s[i + 1] + val(cx, cy, seed + 1) * amp;
        d[i + 2] = s[i + 2] + val(cx, cy, seed + 2) * amp;
      } else {
        const v = val(cx, cy, seed) * amp;
        d[i] = s[i] + v; d[i + 1] = s[i + 1] + v; d[i + 2] = s[i + 2] + v;
      }
      d[i + 3] = s[i + 3];
    }
  }
};

/* ------------------------------------------------------------------ scanlines */

export const scanlines: Op = (src, dst, p, run) => {
  const { width: w, height: h } = src;
  const s = src.data, d = dst.data, scale = run.scale;
  const sp = p.spacing as number, inten = p.intensity as number, wd = p.width as number;
  const off = run.t * (p.roll as number);
  const SUB = 4;
  // per row: the average darkening over the row's footprint (4 samples), soft-edged lines
  const rowK = new Float32Array(h);
  const soft = Math.min(0.24, 0.9 / sp);
  const gain = 1 + inten * wd * 0.35;
  for (let y = 0; y < h; y++) {
    let k = 0;
    for (let q = 0; q < SUB; q++) {
      const Y = (y + (q + 0.5) / SUB) / scale - off; // positive roll: the lines run down
      const ph = Y / sp - Math.floor(Y / sp);
      const dist = Math.abs(ph - 0.5); // 0 at the line centre
      const t = clamp((wd / 2 + soft - dist) / (2 * soft), 0, 1);
      k += 1 - inten * t * t * (3 - 2 * t);
    }
    rowK[y] = (k / SUB) * gain;
  }
  const mask = p.mask === true;
  const colK = new Float32Array(w * 3).fill(1);
  if (mask) {
    const triad = Math.max(3, sp * 0.75); // output px per R-G-B triad
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let q = 0; q < SUB; q++) {
        const X = (x + (q + 0.5) / SUB) / scale;
        const ch = Math.floor((X / triad - Math.floor(X / triad)) * 3);
        for (let c = 0; c < 3; c++) acc[c] += c === ch ? 1.18 : 0.72;
      }
      for (let c = 0; c < 3; c++) colK[x * 3 + c] = acc[c] / SUB;
    }
  }
  for (let y = 0; y < h; y++) {
    const rk = rowK[y];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = s[i] * rk * colK[x * 3]; d[i + 1] = s[i + 1] * rk * colK[x * 3 + 1]; d[i + 2] = s[i + 2] * rk * colK[x * 3 + 2];
      d[i + 3] = s[i + 3];
    }
  }
};
