/**
 * Pictures the document uses (imported PNGs), decoded once per tab: the editor draws them under a glyph,
 * vectorising reads their ink, and compiling turns a picture used as a glyph into its bitmap.
 */
import { pictureInk, type Picture } from '../compile';
import { getImage } from '../storage';

export const IMAGE_LIMITS = { bytes: 20 * 1024 * 1024, side: 4096 } as const;

interface Decoded { bitmap: ImageBitmap | HTMLCanvasElement; pic: Picture }
const cache = new Map<string, Decoded | null>();
const loading = new Map<string, Promise<Decoded | null>>();
const listeners = new Set<() => void>();

/** Called when a picture finishes decoding (the editor and the preview redraw). */
export function onPictures(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function decodeBlob(blob: Blob): Promise<Decoded> {
  if (blob.size > IMAGE_LIMITS.bytes) throw new Error('La imagen pesa más de 20 MB.');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(blob); } catch { throw new Error('No se pudo leer la imagen (¿es PNG, JPEG o WebP?).'); }
  if (bmp.width > IMAGE_LIMITS.side || bmp.height > IMAGE_LIMITS.side) { bmp.close(); throw new Error(`La imagen mide más de ${IMAGE_LIMITS.side} px de lado.`); }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(bmp, 0, 0);
  const data = cx.getImageData(0, 0, c.width, c.height).data;
  return { bitmap: bmp, pic: { w: c.width, h: c.height, rgba: data } };
}

/** Starts decoding a stored picture; resolves when it is ready (null when this browser does not have it). */
export function loadPicture(id: string): Promise<Decoded | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id)!);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      try {
        const img = await getImage(id);
        const blob = img?.blob;
        const d = blob ? await decodeBlob(blob) : null;
        cache.set(id, d);
        return d;
      } catch { cache.set(id, null); return null; }
      finally { loading.delete(id); for (const l of [...listeners]) l(); }
    })();
    loading.set(id, p);
  }
  return p;
}

export function rememberPicture(id: string, d: Decoded) { cache.set(id, d); for (const l of [...listeners]) l(); }

/** The decoded picture if ready (starting to load it otherwise). */
export function pictureOf(id: string): Picture | undefined {
  const d = cache.get(id);
  if (d === undefined) void loadPicture(id);
  return d?.pic;
}

export function bitmapOf(id: string): (CanvasImageSource & { width: number; height: number }) | undefined {
  const d = cache.get(id);
  if (d === undefined) void loadPicture(id);
  return d?.bitmap ?? undefined;
}

export function inkOf(id: string, crop: { x: number; y: number; w: number; h: number }, read: 'transparencia' | 'oscuro') {
  const p = pictureOf(id);
  return p ? pictureInk(p, read, crop) : undefined;
}

/** Whether a picture has transparency (then its alpha is the ink; otherwise dark pixels are). */
export function hasAlpha(p: Picture): boolean {
  for (let i = 3; i < p.rgba.length; i += 4 * 7) if (p.rgba[i] < 250) return true;
  return false;
}

/** The box of a picture's ink (for «Recortar a la tinta»), or the whole picture. */
export function inkBox(p: Picture, read: 'transparencia' | 'oscuro', threshold = 0.5): { x: number; y: number; w: number; h: number } {
  const { ink } = pictureInk(p, read, { x: 0, y: 0, w: p.w, h: p.h });
  const t = threshold * 255;
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (ink[y * p.w + x] > t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? { x: 0, y: 0, w: p.w, h: p.h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
