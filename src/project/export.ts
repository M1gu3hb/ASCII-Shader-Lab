/**
 * Exports of a project: what the compositor draws at scale 1 (the same call as the preview, so they match),
 * encoded by this browser, and the files the project is made of.
 *
 *   exportStill    the final picture: PNG (with real transparency when the project or the call asks for it),
 *                  JPEG or WebP when this browser encodes them (checked: never a PNG under another name);
 *                  at the project's size or a chosen width (the project's aspect is kept);
 *   exportLayer    one layer alone, on transparency;
 *   exportMask     a layer's mask as a PNG: grey (white shows, black hides) or white with alpha;
 *   exportOriginal the original file(s) of a source, untouched; exportMatte / exportCutout for cut-outs;
 *   frames         the frame loop (t = from + i / fps), rendered in order with the frame-exact video
 *                  provider, for the video and GIF exporters of a later round;
 *   thumbnail      a small picture of the project (versions, the project list).
 */
import { Compositor, sourceFit, type RenderReport } from './compositor';
import { fitRect } from './adjust';
import { evaluate, frameTimes } from './evaluate';
import { maskCanvas, coverageOfImage, coverageToGrey } from './masks';
import { projectMedia } from './refs';
import { createSourceProvider, storeBlob, type BlobResolver } from './sources';
import type { Id, Project } from './types';
import { safeFileName } from '../shared/project';

export type StillFormat = 'png' | 'jpeg' | 'webp';

export interface StillOptions {
  format?: StillFormat;
  /** 0..1 for JPEG and WebP (default 0.92). */
  quality?: number;
  /** Project time (default 0). */
  t?: number;
  /** Output width in px (the height follows the project's aspect); default the project's own size. */
  width?: number;
  /** Render scale instead of a width (1 = the project's size). */
  scale?: number;
  /** Transparent background (PNG and WebP only); default the project's canvas.transparent. */
  transparent?: boolean;
  /** Draw only these layers. */
  only?: Id[];
  /** A compositor to draw with (default: a new one with frame-exact video, released afterwards). */
  compositor?: Compositor;
}

const MIME: Record<StillFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>(res => {
  try { c.toBlob(b => res(b), type, q); } catch { res(null); }
});

const encodable = new Map<StillFormat, Promise<boolean>>();
/** Whether this browser encodes a format (a browser that cannot silently gives a PNG). */
export function canEncode(format: StillFormat): Promise<boolean> {
  let p = encodable.get(format);
  if (!p) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    p = toBlob(c, MIME[format], 0.9).then(b => !!b && b.type === MIME[format]);
    encodable.set(format, p);
  }
  return p;
}

/** Runs `job` with the given compositor, or a new export compositor released afterwards. */
async function withCompositor<T>(c: Compositor | undefined, job: (c: Compositor) => Promise<T>): Promise<T> {
  if (c) return job(c);
  const own = new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
  try { return await job(own); } finally { own.destroy(); own.provider.release(); }
}

const scaleFor = (p: Project, o: { width?: number; scale?: number }) =>
  o.scale && o.scale > 0 ? o.scale : o.width && o.width > 0 ? o.width / p.canvas.w : 1;

/** Renders a still into a new canvas (what exportStill encodes). */
export async function renderStill(p: Project, o: StillOptions = {}): Promise<{ canvas: HTMLCanvasElement; report: RenderReport }> {
  const canvas = document.createElement('canvas');
  const transparent = (o.transparent ?? p.canvas.transparent) && o.format !== 'jpeg';
  const report = await withCompositor(o.compositor, c => c.render(evaluate(p, o.t ?? 0), canvas, {
    scale: scaleFor(p, o), quality: 'final', transparent, ...(o.only ? { only: o.only } : {}),
  }));
  return { canvas, report };
}

/** The final picture as a file (see the top of this file). Rejects when this browser cannot encode the format. */
export async function exportStill(p: Project, o: StillOptions = {}): Promise<Blob> {
  const format = o.format ?? 'png';
  if (format !== 'png' && !(await canEncode(format))) throw new Error(`Este navegador no codifica ${format.toUpperCase()}: usa PNG.`);
  const { canvas } = await renderStill(p, o);
  if (format === 'jpeg') {
    // JPEG has no transparency: what is transparent goes on the project's background colour
    const x = canvas.getContext('2d')!;
    x.save();
    x.globalCompositeOperation = 'destination-over';
    x.fillStyle = p.canvas.bg;
    x.fillRect(0, 0, canvas.width, canvas.height);
    x.restore();
  }
  const blob = await toBlob(canvas, MIME[format], format === 'png' ? undefined : o.quality ?? 0.92);
  if (!blob || blob.type !== MIME[format]) throw new Error(`Este navegador no codifica ${format.toUpperCase()}: usa PNG.`);
  return blob;
}

/** One layer alone, on transparency (PNG). */
export function exportLayer(p: Project, layerId: Id, o: Omit<StillOptions, 'only' | 'format' | 'transparent'> = {}): Promise<Blob> {
  return exportStill(p, { ...o, only: [layerId], format: 'png', transparent: true });
}

/**
 * A layer's mask at time t as a PNG at the project's size (or a width): 'grey' = opaque, white shows and
 * black hides (what editors expect); 'alpha' = white with the mask as transparency. Null without a mask.
 */
export async function exportMask(p: Project, layerId: Id, o: { t?: number; width?: number; mode?: 'grey' | 'alpha'; compositor?: Compositor } = {}): Promise<Blob | null> {
  const t = o.t ?? 0;
  const lf = evaluate(p, t).layers.find(l => l.layer.id === layerId);
  const mask = lf?.layer.mask ?? p.layers.find(l => l.id === layerId)?.mask;
  if (!mask) return null;
  const scale = scaleFor(p, o);
  const w = Math.max(1, Math.round(p.canvas.w * scale)), h = Math.max(1, Math.round(p.canvas.h * scale));
  const provider = o.compositor?.provider ?? createSourceProvider({ video: 'exact' });
  try {
    for (const part of mask.parts) {
      if (part.kind === 'raster') for (const m of [part.media, ...(part.frames ?? []).map(f => f.media)]) await provider.prepareMedia(m);
      if (part.kind === 'color') { const s = p.sources.find(x => x.id === part.source); if (s) await provider.prepare(s, t); }
    }
    const m = maskCanvas(mask, {
      w, h, scale, t,
      raster: ref => { const img = provider.image(ref); return img ? coverageOfImage(img, w, h) : null; },
      pixels: id => {
        const s = p.sources.find(x => x.id === id);
        const img = s ? provider.frame(s, t) : null;
        if (!img) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        const r = fitRect(img.width, img.height, w, h, sourceFit(p, id));
        x.drawImage(img, r.x, r.y, r.w, r.h);
        return x.getImageData(0, 0, w, h).data;
      },
    });
    const c = o.mode === 'alpha' ? m.canvas : coverageToGrey(m.coverage, w, h);
    const blob = await toBlob(c, 'image/png');
    if (!blob) throw new Error('No se pudo codificar la máscara.');
    return blob;
  } finally {
    if (!o.compositor) provider.release();
  }
}

export interface ExportedFile { blob: Blob; name: string }

/** The original file(s) of a source, untouched (a sequence gives every photo). */
export async function exportOriginal(p: Project, sourceId: Id, o: { blob?: BlobResolver } = {}): Promise<ExportedFile[]> {
  const s = p.sources.find(x => x.id === sourceId);
  if (!s) return [];
  const blobOf = o.blob ?? storeBlob;
  const out: ExportedFile[] = [];
  for (const [i, m] of s.media.entries()) {
    const got = m.id ? await blobOf(m.id) : null;
    if (got) out.push({ blob: got.blob, name: safeFileName(m.name ?? got.name, `${s.kind === 'sequence' ? `foto-${i + 1}` : 'original'}`) });
  }
  return out;
}

/** The matte of a cut-out source (white = subject), as it was stored. */
export async function exportMatte(p: Project, sourceId: Id, o: { blob?: BlobResolver } = {}): Promise<ExportedFile | null> {
  const s = p.sources.find(x => x.id === sourceId);
  const ref = s?.cutout?.matte;
  const got = ref?.id ? await (o.blob ?? storeBlob)(ref.id) : null;
  return got ? { blob: got.blob, name: safeFileName(ref?.name ?? got.name, 'mate.png') } : null;
}

/** The cut-out itself (the subject with real transparency), as it was stored. */
export async function exportCutout(p: Project, sourceId: Id, o: { blob?: BlobResolver } = {}): Promise<ExportedFile | null> {
  const s = p.sources.find(x => x.id === sourceId);
  if (!s || s.kind !== 'cutout') return null;
  return (await exportOriginal(p, sourceId, o))[0] ?? null;
}

/** Every file of the project with its role (for an «export everything» list). */
export const projectFiles = projectMedia;

/* ------------------------------------------------------------------ frames */

export interface FrameOptions {
  fps?: number;
  from?: number;
  to?: number;
  scale?: number;
  width?: number;
  transparent?: boolean;
  compositor?: Compositor;
  /** Stops the loop between frames. */
  signal?: { cancelled: boolean };
}

/**
 * The frames of a stretch of the project, in order: t = from + i / fps (the same times a video or GIF
 * export needs). Each yielded canvas is reused for the next frame: encode it before asking for the next.
 */
export async function* frames(p: Project, o: FrameOptions = {}): AsyncGenerator<{ i: number; n: number; t: number; canvas: HTMLCanvasElement; report: RenderReport }> {
  const times = frameTimes(p, o);
  const own = !o.compositor;
  const comp = o.compositor ?? new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
  const canvas = document.createElement('canvas');
  const scale = scaleFor(p, o);
  try {
    for (let i = 0; i < times.length; i++) {
      if (o.signal?.cancelled) return;
      const report = await comp.render(evaluate(p, times[i]), canvas, { scale, quality: 'final', sequential: true, transparent: o.transparent ?? p.canvas.transparent });
      yield { i, n: times.length, t: times[i], canvas, report };
    }
  } finally {
    if (own) { comp.destroy(); comp.provider.release(); }
    canvas.width = canvas.height = 0;
  }
}

/* ------------------------------------------------------------------ thumbnails and names */

/** A small picture of the project at time t (WebP when this browser encodes it, JPEG otherwise) as a data URL. */
export async function thumbnail(p: Project, o: { width?: number; t?: number; compositor?: Compositor } = {}): Promise<string | null> {
  const width = o.width ?? 320;
  const canvas = document.createElement('canvas');
  await withCompositor(o.compositor, c => c.render(evaluate(p, o.t ?? 0), canvas, { scale: Math.min(1, width / p.canvas.w), quality: 'preview' }));
  const webp = await toBlob(canvas, 'image/webp', 0.8);
  const blob = webp && webp.type === 'image/webp' ? webp : await toBlob(canvas, 'image/jpeg', 0.82);
  if (!blob) return null;
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(typeof fr.result === 'string' ? fr.result : null);
    fr.onerror = () => res(null);
    fr.readAsDataURL(blob);
  });
}

/** A file name for an export of the project: glyphos-<name>[-<what>].<ext>. */
export function exportName(p: Project, ext: string, what = ''): string {
  const slug = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'proyecto';
  const w = what ? '-' + what.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) : '';
  return `glyphos-${slug}${w}.${ext}`;
}
