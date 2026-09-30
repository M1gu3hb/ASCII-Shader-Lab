/**
 * The picture of the composition at an output size: the project's render (the compositor, as everywhere)
 * placed by `placement` (sizes.ts), covering the output or fitting in it. The sheet's preview is this same
 * call with a smaller factor, so what the preview shows is what the file holds, only smaller.
 */
import type { Compositor } from '../../project/compositor';
import { renderStill, type StillFormat } from '../../project/export';
import type { Project } from '../../project/types';
import { placement, type Fit } from './sizes';

const MIME: Record<StillFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

export interface SizedOptions {
  w: number;
  h: number;
  fit: Fit;
  t: number;
  transparent: boolean;
  /** Extra factor (≤ 1) for the preview; 1 for the file. */
  extra?: number;
  compositor?: Compositor;
  /** JPEG: what is transparent goes on the project's background. */
  format?: StillFormat;
}

/** Renders the composition at w × h (times `extra`) into a new canvas. */
export async function renderSized(p: Project, o: SizedOptions): Promise<HTMLCanvasElement> {
  const extra = o.extra ?? 1;
  const pl = placement(p.canvas, o.w, o.h, o.fit, extra);
  const ow = Math.max(1, Math.round(o.w * extra)), oh = Math.max(1, Math.round(o.h * extra));
  const alpha = o.transparent && o.format !== 'jpeg';
  const { canvas } = await renderStill(p, { scale: pl.k, t: o.t, transparent: alpha, ...(o.compositor ? { compositor: o.compositor } : {}) });
  if (canvas.width === ow && canvas.height === oh && pl.x === 0 && pl.y === 0) return canvas;
  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const x = out.getContext('2d')!;
  if (!alpha) { x.fillStyle = p.canvas.bg; x.fillRect(0, 0, ow, oh); }
  x.drawImage(canvas, pl.x, pl.y);
  canvas.width = canvas.height = 0;
  return out;
}

/** What is transparent goes on a colour (JPEG has no alpha). */
function flatten(c: HTMLCanvasElement, bg: string) {
  const x = c.getContext('2d')!;
  x.save();
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  x.restore();
}

export const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>(res => {
  try { c.toBlob(b => res(b), type, q); } catch { res(null); }
});

/** The file of a still at an output size. Rejects when this browser does not encode the format. */
export async function exportSized(p: Project, o: SizedOptions & { format: StillFormat; quality?: number }): Promise<Blob> {
  const canvas = await renderSized(p, o);
  if (o.format === 'jpeg') flatten(canvas, p.canvas.bg);
  const blob = await toBlob(canvas, MIME[o.format], o.format === 'png' ? undefined : o.quality ?? 0.92);
  canvas.width = canvas.height = 0;
  if (!blob || blob.type !== MIME[o.format]) throw new Error(`Este navegador no codifica ${o.format === 'jpeg' ? 'JPEG' : o.format === 'webp' ? 'WebP' : 'PNG'}: usa PNG.`);
  return blob;
}

/** A canvas as a data: URL (for an SVG that wraps a PNG). */
export async function pngDataUrl(c: HTMLCanvasElement): Promise<string> {
  const b = await toBlob(c, 'image/png');
  if (!b) throw new Error('No se pudo codificar la imagen.');
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error('No se pudo leer la imagen.'));
    fr.readAsDataURL(b);
  });
}
