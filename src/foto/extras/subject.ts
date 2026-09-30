/**
 * Where the subject of a cut-out is: the box of its opaque pixels (read once per file from a small copy),
 * in the source's own units, and that box placed in a frame of any size like the photo is (cover).
 */
import { fitRect } from '../../project/adjust';
import type { Rect } from '../../project/posters';
import { storeBlob } from '../../project/sources';
import type { LayerFit, Project, Source } from '../../project/types';

const boxes = new Map<string, Promise<Rect | null>>();

/** The opaque box of a cut-out (0..1 of its own width and height), or null. */
export function cutoutBox(s: Source): Promise<Rect | null> {
  const id = s.media[0]?.id;
  if (!id || s.kind !== 'cutout') return Promise.resolve(null);
  let p = boxes.get(id);
  if (!p) {
    p = (async () => {
      const got = await storeBlob(id);
      if (!got) return null;
      const bmp = await createImageBitmap(got.blob);
      const k = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const d = x.getImageData(0, 0, w, h).data;
      c.width = c.height = 0;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        if (d[(yy * w + xx) * 4 + 3] > 96) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      }
      if (x1 < x0 || y1 < y0) return null;
      return { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
    })().catch(() => null);
    boxes.set(id, p);
  }
  return p;
}

/** A box of a source (0..1 of the source) placed in a W×H frame like the source is, in frame units (clipped). */
export function boxInFrame(box: Rect, s: { w: number; h: number }, W: number, H: number, fit: LayerFit = 'cover'): Rect {
  const r = fitRect(Math.max(1, s.w), Math.max(1, s.h), W, H, fit);
  const x0 = Math.max(0, (r.x + box.x * r.w) / W), y0 = Math.max(0, (r.y + box.y * r.h) / H);
  const x1 = Math.min(1, (r.x + (box.x + box.w) * r.w) / W), y1 = Math.min(1, (r.y + (box.y + box.h) * r.h) / H);
  return { x: x0, y: y0, w: Math.max(0.05, x1 - x0), h: Math.max(0.05, y1 - y0) };
}

const tones = new Map<string, Promise<number | null>>();

/** Mean brightness 0..1 of a still source (its first picture), read from a small copy; null for videos. */
export function toneOf(s: Source | null | undefined): Promise<number | null> {
  const id = s?.media[0]?.id;
  if (!s || !id || s.kind === 'video') return Promise.resolve(null);
  let p = tones.get(id);
  if (!p) {
    p = (async () => {
      const got = await storeBlob(id);
      if (!got) return null;
      const bmp = await createImageBitmap(got.blob);
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(bmp, 0, 0, 48, 48);
      bmp.close();
      const d = x.getImageData(0, 0, 48, 48).data;
      c.width = c.height = 0;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
      return n ? sum / n : null;
    })().catch(() => null);
    tones.set(id, p);
  }
  return p;
}

/** The subject's box in a W×H poster frame of a project with a cut-out, or null. */
export async function subjectBoxFor(p: Project, W: number, H: number): Promise<Rect | null> {
  const cut = p.sources.find(s => s.kind === 'cutout');
  if (!cut) return null;
  const box = await cutoutBox(cut);
  return box ? boxInFrame(box, cut, W, H, 'cover') : null;
}
