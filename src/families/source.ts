import type { Recipe } from '../engine/recipe';
import type { HostSource } from './host';

/**
 * The piece's source for the raster families that read it (FamilyMeta.reads 'source', FieldModel.feed): small
 * CPU copies of the picture or the letters, sampled at a point of the canvas with the same fit, zoom, pan and
 * mirror as the field pass (engine/glsl/programs.ts mediaUV, basic/field.ts MediaMap). Models read a coarse
 * raster (a few hundred cells across), so a copy of at most `SIDE` px on its long side is enough.
 */

export const SIDE = 256;

/** RGBA copy of a picture or video frame and the picture's real size (its aspect). */
export interface SmallMedia { data: Uint8Array | Uint8ClampedArray; w: number; h: number; natW: number; natH: number }

function bilinear(d: ArrayLike<number>, w: number, h: number, ch: number, stride: number, u: number, v: number): number {
  const x = u * w - 0.5, y = v * h - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let x1 = x0 + 1, y1 = y0 + 1;
  x0 = x0 < 0 ? 0 : x0 > w - 1 ? w - 1 : x0; x1 = x1 < 0 ? 0 : x1 > w - 1 ? w - 1 : x1;
  y0 = y0 < 0 ? 0 : y0 > h - 1 ? h - 1 : y0; y1 = y1 < 0 ? 0 : y1 > h - 1 ? h - 1 : y1;
  const a = d[(y0 * w + x0) * stride + ch], b = d[(y0 * w + x1) * stride + ch], c = d[(y1 * w + x0) * stride + ch], e = d[(y1 * w + x1) * stride + ch];
  const top = a + (b - a) * fx, bot = c + (e - c) * fx;
  return (top + (bot - top) * fy) / 255;
}

/** A picture as the families read it: the recipe's fit, zoom, pan and mirror on a W × H canvas. */
export function mediaSource(m: SmallMedia, W: number, H: number, media: Recipe['media'], version: number): HostSource {
  const ca = W / H, ma = m.natW / Math.max(m.natH, 1);
  let kx = 1, ky = 1;
  if (media.fit === 'cover') { if (ca > ma) ky = ma / ca; else kx = ca / ma; }
  else if (media.fit === 'contain') { if (ca > ma) kx = ca / ma; else ky = ma / ca; }
  const zoom = media.zoom, panX = media.panX, panY = media.panY, mirror = media.mirror;
  return {
    kind: 1, version, W, H,
    at(px, py, out) {
      const sx = px * (H / W) + 0.5, sy = 0.5 - py;
      let u = ((sx - 0.5) * kx) / zoom + 0.5 - panX * 0.5;
      const v = ((sy - 0.5) * ky) / zoom + 0.5 + panY * 0.5;
      if (mirror) u = 1 - u;
      if (u < 0 || v < 0 || u > 1 || v > 1) { out[0] = out[1] = out[2] = out[3] = 0; return; }
      const a = bilinear(m.data, m.w, m.h, 3, 4, u, v);
      const r = bilinear(m.data, m.w, m.h, 0, 4, u, v) * a, g = bilinear(m.data, m.w, m.h, 1, 4, u, v) * a, b = bilinear(m.data, m.w, m.h, 2, 4, u, v) * a;
      out[0] = r; out[1] = g; out[2] = b; out[3] = r * 0.299 + g * 0.587 + b * 0.114;
    },
  };
}

/** The letters as the families read them: the text source's mask (one byte per pixel) covering the W × H canvas. */
export function textSource(mask: Uint8Array, w: number, h: number, W: number, H: number, text: string, version: number): HostSource {
  return {
    kind: 2, version, W, H, text,
    at(px, py, out) {
      const u = px * (H / W) + 0.5, v = 0.5 - py;
      const m = u < 0 || v < 0 || u > 1 || v > 1 ? 0 : bilinear(mask, w, h, 0, 1, u, v);
      out[0] = out[1] = out[2] = out[3] = m;
    },
  };
}

/** A small copy of an image, video frame or canvas (DOM): RGBA, at most SIDE px on its long side. */
export function smallCopy(el: CanvasImageSource, natW: number, natH: number, cv: HTMLCanvasElement): SmallMedia {
  const k = Math.min(1, SIDE / Math.max(natW, natH, 1));
  const w = Math.max(1, Math.round(natW * k)), h = Math.max(1, Math.round(natH * k));
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.clearRect(0, 0, w, h);
  cx.drawImage(el, 0, 0, w, h);
  return { data: cx.getImageData(0, 0, w, h).data, w, h, natW, natH };
}

/** The red channel of a small copy (text masks). */
export function redOf(m: SmallMedia): Uint8Array {
  const out = new Uint8Array(m.w * m.h);
  for (let i = 0; i < out.length; i++) out[i] = m.data[i * 4];
  return out;
}
