/**
 * Adjustments of a photo layer (Adjust in types.ts). The compositor uses the browser's canvas filters for
 * what CSS filters express (brightness, contrast, saturation, hue, grey, invert, blur) when this browser
 * applies them, and these CPU versions otherwise; gamma, temperature and sharpening are always CPU.
 * The CPU filters follow the CSS Filter Effects formulas (sRGB, each step clamped), so both paths agree
 * closely; one browser always takes the same path, so its preview and its exports agree exactly.
 */
import { blurAlpha } from './masks';
import type { Adjust } from './types';

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** The CSS filter string for the parts of an adjustment CSS can express ('none' when there are none). */
export function cssFilter(a: Adjust, scale: number): string {
  const f: string[] = [];
  if (a.bright !== 0) f.push(`brightness(${round4(1 + a.bright)})`);
  if (a.contrast !== 1) f.push(`contrast(${round4(a.contrast)})`);
  if (a.sat !== 1) f.push(`saturate(${round4(a.sat)})`);
  if (a.hue !== 0) f.push(`hue-rotate(${round4(a.hue)}deg)`);
  if (a.mono) f.push('grayscale(1)');
  if (a.invert) f.push('invert(1)');
  if (a.blur > 0 && a.blur * scale >= 0.3) f.push(`blur(${round4(a.blur * scale)}px)`);
  return f.length ? f.join(' ') : 'none';
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Whether an adjustment needs the CPU pass that no canvas filter covers (gamma, temperature, sharpening). */
export const needsTone = (a: Adjust) => a.gamma !== 1 || a.temp !== 0 || a.sharpen > 0;

/** 3×3 colour matrices of the CSS filter functions (Filter Effects Level 1). */
function saturateM(s: number): number[] {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}
function hueM(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}
const GREY = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];

function matrix(d: Uint8ClampedArray, m: number[]) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = clamp255(m[0] * r + m[1] * g + m[2] * b);
    d[i + 1] = clamp255(m[3] * r + m[4] * g + m[5] * b);
    d[i + 2] = clamp255(m[6] * r + m[7] * g + m[8] * b);
  }
}

/** The CSS-expressible part of an adjustment, on RGBA pixels (not premultiplied), in the CSS order. */
export function cssAdjustCpu(d: Uint8ClampedArray, w: number, h: number, a: Adjust, scale: number): void {
  if (a.bright !== 0) { const k = Math.max(0, 1 + a.bright); for (let i = 0; i < d.length; i += 4) { d[i] = clamp255(d[i] * k); d[i + 1] = clamp255(d[i + 1] * k); d[i + 2] = clamp255(d[i + 2] * k); } }
  if (a.contrast !== 1) {
    const c = a.contrast, o = 127.5 * (1 - c);
    for (let i = 0; i < d.length; i += 4) { d[i] = clamp255(d[i] * c + o); d[i + 1] = clamp255(d[i + 1] * c + o); d[i + 2] = clamp255(d[i + 2] * c + o); }
  }
  if (a.sat !== 1) matrix(d, saturateM(a.sat));
  if (a.hue !== 0) matrix(d, hueM(a.hue));
  if (a.mono) matrix(d, GREY);
  if (a.invert) for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  if (a.blur > 0 && a.blur * scale >= 0.3) blurRgba(d, w, h, a.blur * scale);
}

/** Gaussian-like blur of RGBA pixels, colour weighted by alpha (so edges of a cut-out do not go dark). */
export function blurRgba(d: Uint8ClampedArray, w: number, h: number, sigma: number): void {
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const al = d[i * 4 + 3] / 255;
    ch[0][i] = d[i * 4] * al; ch[1][i] = d[i * 4 + 1] * al; ch[2][i] = d[i * 4 + 2] * al; ch[3][i] = al;
  }
  for (const c of ch) blurAlpha(c, w, h, sigma);
  for (let i = 0; i < n; i++) {
    const al = ch[3][i];
    d[i * 4 + 3] = clamp255(Math.round(al * 255));
    if (al > 1e-5) { d[i * 4] = clamp255(ch[0][i] / al); d[i * 4 + 1] = clamp255(ch[1][i] / al); d[i * 4 + 2] = clamp255(ch[2][i] / al); }
  }
}

/** Gamma, temperature and sharpening (always on the CPU). */
export function toneCpu(d: Uint8ClampedArray, w: number, h: number, a: Adjust): void {
  if (a.gamma !== 1 || a.temp !== 0) {
    const g = 1 / Math.max(0.05, a.gamma);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, g));
    // warm: more red, less blue (and the reverse for cool), up to ±20 %
    const kr = 1 + 0.2 * a.temp, kb = 1 - 0.2 * a.temp, kg = 1 + 0.04 * a.temp;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp255(lut[d[i]] * kr);
      d[i + 1] = clamp255(lut[d[i + 1]] * kg);
      d[i + 2] = clamp255(lut[d[i + 2]] * kb);
    }
  }
  if (a.sharpen > 0 && w > 2 && h > 2) {
    // unsharp mask with a 3×3 box: out = in + k·(in − box), the box summed in two passes (rows, then columns)
    const k = a.sharpen * 1.5;
    const n = w * h;
    const row = new Uint16Array(n);
    const orig = new Uint8ClampedArray(n);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < n; i++) orig[i] = d[i * 4 + c];
      for (let y = 0; y < h; y++) {
        const o = y * w;
        for (let x = 1; x < w - 1; x++) row[o + x] = orig[o + x - 1] + orig[o + x] + orig[o + x + 1];
      }
      for (let y = 1; y < h - 1; y++) {
        const o = y * w;
        for (let x = 1; x < w - 1; x++) {
          const i = o + x;
          const v = orig[i];
          d[i * 4 + c] = clamp255(v + k * (v - (row[i - w] + row[i] + row[i + w]) / 9));
        }
      }
    }
  }
}

/** Where a picture of sw×sh goes in a frame of dw×dh (cover crops, contain letterboxes, fill stretches). */
export function fitRect(sw: number, sh: number, dw: number, dh: number, fit: 'cover' | 'contain' | 'fill'): { x: number; y: number; w: number; h: number } {
  if (fit === 'fill' || !(sw > 0 && sh > 0)) return { x: 0, y: 0, w: dw, h: dh };
  const k = fit === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  const w = sw * k, h = sh * k;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}
