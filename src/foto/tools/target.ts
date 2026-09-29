/**
 * The tools' link to the open project: the target layer and its mask, the operation a gesture uses, the layer's
 * own space, and every change as one undo step (src/project/store edit/updateLayer). Also the pictures the
 * tools store (painted rasters, flattened strokes, object mattes) in the media store.
 */
import { LIMITS, defaultMask } from '../../project/normalize';
import { putMedia } from '../../project/persist';
import { keepBlob } from '../../project/sources';
import { edit, useProject } from '../../project/store';
import type { Id, Layer, Mask, MaskOp, MaskPart, MaskRasterPart, Project } from '../../project/types';
import { hashBytes } from '../../studio/mediaStore';
import type { MediaRef } from '../../engine/recipe';
import { layerMapping, type Pt, type Size } from './geom';
import type { ToolEvent, ToolHost } from './types';

export const project = (): Project | null => useProject.getState().project;

export function layerById(id: Id | null): Layer | null {
  if (!id) return null;
  return project()?.layers.find(l => l.id === id) ?? null;
}

/** The target layer, or null with a message said to the person (no layer, locked). */
export function editableTarget(host: ToolHost, quiet = false): Layer | null {
  const l = layerById(host.target());
  if (!l) { if (!quiet) host.say('Elige una capa en la lista de capas: la herramienta dibuja su máscara.'); return null; }
  if (l.locked) { if (!quiet) host.say(`La capa «${l.name}» está bloqueada: desbloquéala para cambiar su máscara.`); return null; }
  return l;
}

export const partsOf = (l: Layer | null): MaskPart[] => l?.mask?.parts ?? [];

export const canvasSize = (host: ToolHost): Size => host.view().canvas;

/** Frame ↔ the target layer's own units (masks move with their layer's transform). */
export function mapping(host: ToolHost, layer: Layer | null = layerById(host.target())) {
  return layerMapping(layer?.xf, canvasSize(host));
}

/** A frame point of an event in the target layer's own units. */
export const layerPoint = (host: ToolHost, p: Pt, layer: Layer | null = layerById(host.target())) => mapping(host, layer).toLayer(p);

/** Layer units → viewport px (for the overlay). */
export function screenOf(host: ToolHost, layer: Layer | null = layerById(host.target())) {
  const m = mapping(host, layer), v = host.view();
  return (p: Pt) => v.toScreen(m.toFrame(p));
}

/** Viewport px per canvas px (a tolerance in screen px ÷ this = canvas px). */
export function screenPerPx(host: ToolHost): number {
  const v = host.view();
  return v.frame.w / Math.max(1, v.canvas.w);
}

/**
 * The operation of a gesture. Modifiers held when it STARTS choose it: ⇧ add, ⌥ subtract, ⇧⌥ intersect; with
 * none, the options bar's (touch has no modifier keys). Modifiers pressed once the gesture is under way shape
 * the figure instead (⇧ square/circle, ⌥ from the centre), as in most image editors.
 */
export function opFor(e: Pick<ToolEvent, 'shift' | 'alt'>, host: ToolHost): MaskOp {
  if (e.shift && e.alt) return 'intersect';
  if (e.shift) return 'add';
  if (e.alt) return 'subtract';
  return host.op();
}

export const OP_NAME: Record<MaskOp, string> = { add: 'sumar', subtract: 'restar', intersect: 'intersecar' };

/**
 * Tracks the shape modifiers of a gesture: one held since the start chose the operation, so it counts as a
 * shape modifier only after it was released and pressed again.
 */
export class Mods {
  private shiftFree: boolean;
  private altFree: boolean;
  constructor(start: Pick<ToolEvent, 'shift' | 'alt'>) { this.shiftFree = !start.shift; this.altFree = !start.alt; }
  update(e: Pick<ToolEvent, 'shift' | 'alt'>): { square: boolean; centre: boolean } {
    if (!e.shift) this.shiftFree = true;
    if (!e.alt) this.altFree = true;
    return { square: e.shift && this.shiftFree, centre: e.alt && this.altFree };
  }
}

/* ------------------------------------------------------------------ changes (each one undo step) */

function withMask(l: Layer): Mask {
  if (!l.mask) l.mask = defaultMask();
  return l.mask;
}

/** Appends a part to a layer's mask (one undo step). False (with a message) when it cannot. */
export function addPart(host: ToolHost, layerId: Id, part: MaskPart, said?: string): boolean {
  const l = layerById(layerId);
  if (!l) return false;
  if (partsOf(l).length >= LIMITS.parts) {
    host.say(`La máscara de «${l.name}» ya tiene ${LIMITS.parts} partes: aplana los trazos o borra alguna parte antes de añadir otra.`);
    return false;
  }
  edit(p => {
    const t = p.layers.find(x => x.id === layerId);
    if (t) withMask(t).parts.push(part);
  });
  if (said) host.say(said);
  return true;
}

/** Replaces part `index` of a layer's mask (one undo step, or coalesced with `key` for keyboard bursts). */
export function replacePart(layerId: Id, index: number, part: MaskPart, key = ''): boolean {
  const l = layerById(layerId);
  if (!l?.mask || index < 0 || index >= l.mask.parts.length) return false;
  edit(p => {
    const t = p.layers.find(x => x.id === layerId);
    if (t?.mask && index < t.mask.parts.length) t.mask.parts[index] = part;
  }, key ? `${layerId}|part|${index}|${key}` : '');
  return true;
}

export function removePart(layerId: Id, index: number): boolean {
  const l = layerById(layerId);
  if (!l?.mask || index < 0 || index >= l.mask.parts.length) return false;
  edit(p => {
    const t = p.layers.find(x => x.id === layerId);
    if (t?.mask) t.mask.parts.splice(index, 1);
  });
  return true;
}

/** Same part (by value)? Used to follow a part across undo/redo, which replace the project. */
export const samePart = (a: MaskPart | undefined, b: MaskPart | undefined) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------ the pictures of raster parts */

/** An opaque greyscale PNG of a coverage (0..255 per pixel): white shows, black hides. */
export async function coveragePng(cov: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let i = 0, o = 0; i < cov.length; i++, o += 4) { d[o] = d[o + 1] = d[o + 2] = cov[i]; d[o + 3] = 255; }
  x.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  if (!blob) throw new Error('No se pudo guardar la máscara.');
  return blob;
}

/** Stores a mask picture in the media store (kept for this tab when the store cannot). */
export async function storeCoverage(cov: Uint8ClampedArray, w: number, h: number, name: string): Promise<MediaRef> {
  const blob = await coveragePng(cov, w, h);
  const ref = await putMedia(blob, { kind: 'image', name, w, h });
  const { stored: _s, ...clean } = ref;
  return clean;
}

/**
 * A mask picture for a preview only: kept in this tab (not in the store) under its content id, so the
 * compositor can draw it like a stored one. Nothing is written to IndexedDB.
 */
export async function tabCoverage(cov: Uint8ClampedArray, w: number, h: number, name: string): Promise<MediaRef> {
  const blob = await coveragePng(cov, w, h);
  const id = await hashBytes(new Uint8Array(await blob.arrayBuffer()));
  keepBlob(id, blob, name);
  return { id, kind: 'image', name, type: 'image/png', size: blob.size, w, h };
}

export function rasterPart(media: MediaRef, op: MaskOp, extra: Partial<MaskRasterPart> = {}): MaskRasterPart {
  return { kind: 'raster', op, media, soft: 0, alpha: 1, ...extra };
}

/** Which source a colour or object selection reads: the target's own picture, else the bottom photo's. */
export function pixelSourceOf(layer: Layer | null): Id | null {
  const p = project();
  if (!p) return null;
  if (layer && 'source' in layer && typeof layer.source === 'string' && layer.source !== 'below' && layer.source !== 'style' && p.sources.some(s => s.id === layer.source)) return layer.source;
  const photo = p.layers.find(l => l.kind === 'photo' && p.sources.some(s => s.id === l.source));
  return photo && photo.kind === 'photo' ? photo.source : p.sources[0]?.id ?? null;
}

/** Reads a canvas's pixels (a copy). */
export function canvasPixels(c: HTMLCanvasElement | OffscreenCanvas): { data: Uint8ClampedArray; w: number; h: number } {
  const x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return { data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
