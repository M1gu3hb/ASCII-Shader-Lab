/**
 * The automatic split into depth layers (pure): when a project has a subject — a cut-out made by «Quitar
 * fondo» («Recorte como capa»), or a subject mask on a layer — the subject goes in front (depth +1) and the
 * photo behind (depth −1). So the subject can move over its background without showing a copy of itself,
 * the background layer gets a hole where the subject is (the cut-out's matte, or the subject mask, removed
 * from it) and, under it, a blurred copy of the photo fills that hole with the colours around it.
 */
import { newLayer, uid } from '../../project/normalize';
import type { Id, Layer, MaskPart, MaskRasterPart, PhotoLayer, Project, Source } from '../../project/types';

export interface SplitResult { project: Project; notes: string[]; front: Id | null; back: Id | null }

/** What a project offers as a subject (null when there is nothing to split with). */
export function subjectOf(p: Project): { cutout: Source | null; mask: MaskRasterPart | null; layer: Id | null } | null {
  const cutout = p.sources.find(s => s.kind === 'cutout' && s.cutout?.matte) ?? null;
  let mask: MaskRasterPart | null = null, layer: Id | null = null;
  for (const l of p.layers) for (const part of l.mask?.parts ?? []) {
    if (part.kind === 'raster' && part.origin === 'subject' && !part.off && !mask) { mask = part; layer = l.id; }
  }
  if (!cutout && !mask) return null;
  return { cutout, mask, layer };
}

const isMainPhoto = (p: Project, l: Layer): l is PhotoLayer => l.kind === 'photo' && !!l.source && p.sources.some(s => s.id === l.source && s.kind !== 'cutout');

/** Splits the project (a copy) into a subject in front and its background behind. */
export function splitDepth(p0: Project): SplitResult {
  const p: Project = JSON.parse(JSON.stringify(p0));
  const notes: string[] = [];
  const subj = subjectOf(p);
  const bi = p.layers.findIndex(l => isMainPhoto(p, l));
  if (!subj || bi < 0) {
    notes.push(subj ? 'No hay una foto de fondo que separar.' : 'Primero separa el sujeto con «Quitar fondo» (como capa o como máscara del sujeto).');
    return { project: p0, notes, front: null, back: null };
  }
  const back = p.layers[bi] as PhotoLayer;
  const blur = Math.round(Math.max(p.canvas.w, p.canvas.h) * 0.025);
  const feather = Math.round(Math.max(p.canvas.w, p.canvas.h) * 0.004);
  // the hole: the subject's coverage placed in the frame (a matte stretches with the frame, so it fits only
  // when the canvas keeps the photo's shape)
  let hole: MaskPart | null = null;
  const src = p.sources.find(s => s.id === back.source);
  if (subj.mask) hole = { ...subj.mask, op: 'subtract', soft: feather, alpha: 1 };
  else if (subj.cutout?.cutout && src && src.w > 0 && src.h > 0 && Math.abs(p.canvas.w / p.canvas.h - src.w / src.h) < 0.01 * (src.w / src.h) && (back.fit ?? 'cover') !== 'contain') {
    hole = { kind: 'raster', op: 'subtract', media: subj.cutout.cutout.matte, soft: feather, alpha: 1, origin: 'subject' };
  } else notes.push('El lienzo no tiene la forma de la foto: el fondo conserva al sujeto (con movimientos pequeños apenas se nota).');
  // the front: the layer showing the cut-out, or a new one; or the photo inside the subject mask
  let front: Layer | null = subj.cutout ? p.layers.find(l => 'source' in l && l.source === subj.cutout!.id) ?? null : null;
  if (!front && subj.cutout) {
    front = newLayer('photo', { name: 'Sujeto (delante)', source: subj.cutout.id, fit: back.fit });
    p.layers.splice(bi + 1, 0, front);
  }
  if (!front && subj.mask) {
    front = newLayer('photo', { name: 'Sujeto (delante)', source: back.source, fit: back.fit, adjust: { ...back.adjust }, mask: { invert: false, feather: 0, opacity: 1, parts: [{ ...subj.mask, op: 'add' }] } });
    p.layers.splice(bi + 1, 0, front);
  }
  // the background: a hole where the subject was, and a blurred copy under it
  if (hole) {
    back.mask = back.mask ? { ...back.mask, off: false, parts: [...back.mask.parts, hole] } : { invert: false, feather: 0, opacity: 1, parts: [hole] };
    const fill = newLayer('photo', {
      id: `sqfill_${uid()}`, name: 'Relleno del fondo', source: back.source, fit: back.fit, adjust: { ...back.adjust, blur: Math.min(500, back.adjust.blur + blur) },
    });
    fill.depth = -1.2;
    p.layers.splice(bi, 0, fill);
  }
  back.depth = -1;
  if (front) {
    front.depth = 1;
    // the front's characters and ASCII layers reading the cut-out come forward with it
    for (const l of p.layers) if (subj.cutout && 'source' in l && l.source === subj.cutout.id && l !== front) l.depth = 1;
  }
  notes.push('Sujeto delante (profundidad +1) y fondo detrás (−1). Ajusta la profundidad de cada capa y elige un movimiento de cámara.');
  return { project: p, notes, front: front?.id ?? null, back: back.id };
}
