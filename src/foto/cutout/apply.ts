/**
 * What the «Recorte» panel does to the project, each as ONE undo step:
 *   - a new cut-out layer: a Source of kind 'cutout' (the transparent PNG in the media store, its matte beside
 *     it, the refinement used) and a photo layer showing it, placed just above the target, fitted like the
 *     original so it sits exactly on it;
 *   - a mask on the target layer: the matte placed in the frame as the original is placed (fit), stored as a
 *     MaskRasterPart with origin 'subject', or inverted with origin 'background';
 *   - both at once.
 * Also: which source a panel cuts out, and decoding it from the media store.
 */
import type { CutoutRefine as ProjectRefine, Id, Layer, MaskRasterPart, Project, Source } from '../../project/types';
import { fitRect } from '../../project/adjust';
import { sourceFit } from '../../project/compositor';
import { defaultMask, newLayer, uid } from '../../project/normalize';
import { putMedia } from '../../project/persist';
import { storeBlob } from '../../project/sources';
import { edit, select, useProject } from '../../project/store';
import type { MediaRef } from '../../engine/recipe';
import type { Matte, RefineOptions } from '../../cutout';
import { storeCoverage } from '../tools/target';

export const project = (): Project | null => useProject.getState().project;

/** The source a panel works on: the one asked for, else the target layer's own, else the bottom photo's. */
export function sourceFor(p: Project, targetId: Id | null, asked?: Id): Source | null {
  if (asked) { const s = p.sources.find(x => x.id === asked); if (s) return s; }
  const l = p.layers.find(x => x.id === targetId);
  if (l && 'source' in l && typeof l.source === 'string') { const s = p.sources.find(x => x.id === l.source); if (s) return s; }
  const photo = p.layers.find(x => x.kind === 'photo') as (Layer & { source: string }) | undefined;
  return p.sources.find(x => x.id === photo?.source) ?? p.sources[0] ?? null;
}

/** Longest side the panel works at (a cut-out of a 6000 px photo would take minutes and gigabytes here). */
export const MAX_SIDE = 2400;

/** Decodes a still source (image or earlier cut-out) at ≤ MAX_SIDE; null for video and sequences. */
export async function decodeSource(s: Source): Promise<HTMLCanvasElement | null> {
  if (s.kind !== 'image' && s.kind !== 'cutout') return null;
  const ref = s.kind === 'cutout' && s.cutout ? (await originalOf(s)) ?? s.media[0] : s.media[0];
  if (!ref?.id) return null;
  const got = await storeBlob(ref.id);
  if (!got) return null;
  const bmp = await createImageBitmap(got.blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** A cut-out made from another source is cut again from that original (its pixels are complete). */
async function originalOf(s: Source): Promise<MediaRef | null> {
  const p = project();
  const from = p?.sources.find(x => x.id === s.cutout?.from);
  return from && from.kind === 'image' ? from.media[0] : null;
}

const baseName = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 80) || 'foto';

async function put(blob: Blob, name: string, w: number, h: number): Promise<MediaRef> {
  const { stored: _s, ...ref } = await putMedia(blob, { kind: 'image', name, w, h });
  return ref;
}

/** The matte placed in the frame like the source is (fit), as coverage 0..255 at the project's size. */
export function placeMatte(matteCanvas: HTMLCanvasElement, p: Project, s: Source, invert: boolean): { cov: Uint8ClampedArray; w: number; h: number } {
  const k = Math.min(1, 4096 / Math.max(p.canvas.w, p.canvas.h));
  const w = Math.max(1, Math.round(p.canvas.w * k)), h = Math.max(1, Math.round(p.canvas.h * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, w, h);
  const r = fitRect(matteCanvas.width, matteCanvas.height, w, h, sourceFit(p, s.id));
  x.imageSmoothingQuality = 'high';
  x.drawImage(matteCanvas, r.x, r.y, r.w, r.h);
  const d = x.getImageData(0, 0, w, h).data;
  c.width = c.height = 0;
  const cov = new Uint8ClampedArray(w * h);
  for (let i = 0; i < cov.length; i++) cov[i] = invert ? 255 - d[i * 4] : d[i * 4];
  return { cov, w, h };
}

export interface ApplyChoice {
  layer: boolean;
  mask: 'subject' | 'background' | null;
}

export interface ApplyInput {
  source: Source;
  targetId: Id | null;
  /** The finished matte (brushes, colours and refinement applied), at the working size. */
  matte: Matte;
  /** Grey PNG of the matte and the transparent cut-out PNG (already encoded by the panel). */
  matteBlob: Blob;
  cutoutBlob: Blob;
  /** The matte as a grey canvas (for placing it in the frame). */
  matteCanvas: HTMLCanvasElement;
  refine: RefineOptions;
}

/** Applies the choice in one undo step. Returns the new layer's id (when one was made). */
export async function applyCutout(inp: ApplyInput, choice: ApplyChoice): Promise<{ layer: Id | null; masked: Id | null }> {
  const p = project();
  if (!p) return { layer: null, masked: null };
  const { source: s, matte } = inp;
  const name = baseName(s.name || s.media[0]?.name || 'foto');
  // the files first (async), then the one edit
  let newSource: Source | null = null;
  let layer: Layer | null = null;
  if (choice.layer) {
    const cutRef = await put(inp.cutoutBlob, `recorte-${name}.png`, matte.w, matte.h);
    const matteRef = await put(inp.matteBlob, `mate-${name}.png`, matte.w, matte.h);
    const refine: ProjectRefine = { feather: inp.refine.feather, shift: inp.refine.shift, decontaminate: inp.refine.decontaminate, detail: inp.refine.detail };
    newSource = { id: uid(), kind: 'cutout', name: `Recorte de ${name}`, media: [cutRef], w: matte.w, h: matte.h, cutout: { from: s.id, matte: matteRef, refine } };
    const fit = sourceFit(p, s.id);
    layer = newLayer('photo', { name: 'Recorte', source: newSource.id, fit });
  }
  let part: MaskRasterPart | null = null;
  const targetId = inp.targetId;
  if (choice.mask && targetId) {
    const placed = placeMatte(inp.matteCanvas, p, s, choice.mask === 'background');
    const ref = await storeCoverage(placed.cov, placed.w, placed.h, `${choice.mask === 'background' ? 'fondo' : 'sujeto'}-${name}.png`);
    part = { kind: 'raster', op: 'add', media: ref, soft: 0, alpha: 1, origin: choice.mask };
  }
  edit(d => {
    if (newSource && layer) {
      d.sources.push(newSource);
      const at = d.layers.findIndex(l => l.id === targetId);
      d.layers.splice(at >= 0 ? at + 1 : d.layers.length, 0, layer);
    }
    if (part && targetId) {
      const t = d.layers.find(l => l.id === targetId);
      if (t) { t.mask ??= defaultMask(); t.mask.parts.push(part); }
    }
  });
  if (layer) select([layer.id]);
  return { layer: layer?.id ?? null, masked: part ? targetId : null };
}
