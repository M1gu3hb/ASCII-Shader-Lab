/** Reading pixels from the image kinds the cutout API accepts (page side). */
import type { Pixels } from './index';

export function sizeOf(src: Pixels): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: (src as { width: number }).width, h: (src as { height: number }).height };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function scratch(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx2D } {
  const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('No se pudo leer la imagen (sin Canvas 2D).');
  return { canvas, ctx };
}

/** RGBA bytes of the source, optionally resampled to w × h. */
export function readRGBA(src: Pixels, w?: number, h?: number): ImageData {
  const s = sizeOf(src);
  const W = w ?? s.w, H = h ?? s.h;
  if (typeof ImageData !== 'undefined' && src instanceof ImageData && W === src.width && H === src.height) return src;
  const { ctx } = scratch(W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (typeof ImageData !== 'undefined' && src instanceof ImageData) {
    const tmp = scratch(src.width, src.height);
    tmp.ctx.putImageData(src, 0, 0);
    ctx.drawImage(tmp.canvas as CanvasImageSource, 0, 0, W, H);
  } else ctx.drawImage(src as CanvasImageSource, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H);
}

/** A transferable bitmap of the source (the worker gets its own copy; the caller keeps the original). */
export async function toBitmap(src: Pixels): Promise<ImageBitmap> {
  return createImageBitmap(src as ImageBitmapSource, { premultiplyAlpha: 'none' });
}
