/**
 * Tone and colour finishes that work pixel by pixel: levels, threshold, posterize, invert, mono, duotone.
 * All keep the alpha of every pixel (threshold with transparent paper multiplies it by the ink).
 */
import { gaussBlur } from '../kernels';
import { luma, rgbOf, sat, smoothstep, type Img, type Op, type RGB } from '../core';

const lutMap = (src: Img, dst: Img, lut: Uint8ClampedArray | Float32Array) => {
  const s = src.data, d = dst.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = lut[s[i]]; d[i + 1] = lut[s[i + 1]]; d[i + 2] = lut[s[i + 2]]; d[i + 3] = s[i + 3];
  }
};

export const levels: Op = (src, dst, p) => {
  const b = p.black as number, w = Math.max(b + 1e-3, p.white as number), g = p.gamma as number;
  const ob = p.outBlack as number, ow = p.outWhite as number;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = Math.pow(sat((i / 255 - b) / (w - b)), 1 / g);
    lut[i] = (ob + (ow - ob) * v) * 255;
  }
  lutMap(src, dst, lut);
};

export const posterize: Op = (src, dst, p) => {
  const L = Math.max(2, Math.round(p.levels as number)) - 1;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = (Math.round((i / 255) * L) / L) * 255;
  if (p.mode !== 'luz') { lutMap(src, dst, lut); return; }
  const s = src.data, d = dst.data;
  for (let i = 0; i < s.length; i += 4) {
    const l = luma(s[i], s[i + 1], s[i + 2]);
    const q = (Math.round((l / 255) * L) / L) * 255, k = q - l;
    d[i] = s[i] + k; d[i + 1] = s[i + 1] + k; d[i + 2] = s[i + 2] + k; d[i + 3] = s[i + 3];
  }
};

export const invert: Op = (src, dst, p) => {
  const s = src.data, d = dst.data;
  if (p.mode === 'luz') {
    // YCbCr: new Y = 255 − Y with the same chroma = shifting the three channels by the same amount
    for (let i = 0; i < s.length; i += 4) {
      const l = luma(s[i], s[i + 1], s[i + 2]), k = 255 - 2 * l;
      d[i] = s[i] + k; d[i + 1] = s[i + 1] + k; d[i + 2] = s[i + 2] + k; d[i + 3] = s[i + 3];
    }
    return;
  }
  for (let i = 0; i < s.length; i += 4) {
    d[i] = 255 - s[i]; d[i + 1] = 255 - s[i + 1]; d[i + 2] = 255 - s[i + 2]; d[i + 3] = s[i + 3];
  }
};

export const threshold: Op = (src, dst, p, run) => {
  const s = src.data, d = dst.data, { width: w, height: h } = src;
  const level = p.level as number, soft = Math.max(0.002, p.soft as number);
  const ink = rgbOf(p.ink), paper = rgbOf(p.paper), clear = p.clear === true;
  const n = w * h;
  let local: Float32Array | null = null;
  if (p.mode === 'local') {
    local = run.scratch.f32('thr.l', n);
    for (let i = 0; i < n; i++) local[i] = luma(s[i * 4], s[i * 4 + 1], s[i * 4 + 2]) / 255;
    const m = run.scratch.f32('thr.m', n);
    m.set(local);
    gaussBlur(m, run.scratch.f32('thr.t', n), w, h, 1, ((p.radius as number) * run.scale) / 2);
    // keep flat areas as paper (a small bias, as adaptive thresholds do), move it with the level
    const bias = 0.03 - (level - 0.5) * 0.6;
    for (let i = 0; i < n; i++) local[i] = local[i] - m[i] + bias;
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const c = local ? smoothstep(-soft, soft, local[i]) : smoothstep(level - soft, level + soft, luma(s[j], s[j + 1], s[j + 2]) / 255);
    if (clear) { d[j] = ink[0]; d[j + 1] = ink[1]; d[j + 2] = ink[2]; d[j + 3] = s[j + 3] * (1 - c); }
    else {
      d[j] = ink[0] + (paper[0] - ink[0]) * c; d[j + 1] = ink[1] + (paper[1] - ink[1]) * c; d[j + 2] = ink[2] + (paper[2] - ink[2]) * c;
      d[j + 3] = s[j + 3];
    }
  }
};

const FILTERS: Record<string, RGB> = {
  neutro: [0.299, 0.587, 0.114],
  rojo: [0.78, 0.3, -0.08],
  naranja: [0.56, 0.44, 0],
  verde: [0.22, 0.72, 0.06],
  azul: [0.12, 0.3, 0.58],
};

/** Colour of a 3-stop ramp black → tint → white at t. */
function tintRamp(t: number, tint: RGB, out: Float32Array): void {
  if (t < 0.5) { const k = t * 2; out[0] = tint[0] * k; out[1] = tint[1] * k; out[2] = tint[2] * k; }
  else { const k = t * 2 - 1; out[0] = tint[0] + (255 - tint[0]) * k; out[1] = tint[1] + (255 - tint[1]) * k; out[2] = tint[2] + (255 - tint[2]) * k; }
}

export const mono: Op = (src, dst, p) => {
  const s = src.data, d = dst.data;
  const f = FILTERS[p.filter as string] ?? FILTERS.neutro;
  const k = p.contrast as number, tint = rgbOf(p.tint), ta = p.tintAmount as number;
  const ramp = new Float32Array(256 * 3), tmp = new Float32Array(3);
  for (let i = 0; i < 256; i++) {
    const g = sat((i / 255 - 0.5) * k + 0.5);
    tintRamp(g, tint, tmp);
    for (let c = 0; c < 3; c++) ramp[i * 3 + c] = g * 255 + (tmp[c] - g * 255) * ta;
  }
  for (let i = 0; i < s.length; i += 4) {
    let g = f[0] * s[i] + f[1] * s[i + 1] + f[2] * s[i + 2];
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    const q = Math.round(g) * 3;
    d[i] = ramp[q]; d[i + 1] = ramp[q + 1]; d[i + 2] = ramp[q + 2]; d[i + 3] = s[i + 3];
  }
};

export const duotone: Op = (src, dst, p) => {
  const s = src.data, d = dst.data;
  const a = rgbOf(p.dark), b = rgbOf(p.light), k = p.contrast as number, bal = p.balance as number;
  const ramp = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = sat((i / 255 - 0.5 - bal * 0.3) * k + 0.5);
    for (let c = 0; c < 3; c++) ramp[i * 3 + c] = a[c] + (b[c] - a[c]) * t;
  }
  for (let i = 0; i < s.length; i += 4) {
    const q = Math.round(luma(s[i], s[i + 1], s[i + 2])) * 3;
    d[i] = ramp[q]; d[i + 1] = ramp[q + 1]; d[i + 2] = ramp[q + 2]; d[i + 3] = s[i + 3];
  }
};
