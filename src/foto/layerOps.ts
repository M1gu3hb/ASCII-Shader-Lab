/**
 * Layer operations of the photo studio (add, duplicate, delete with undo, rename, move, photo sources).
 * Each is one undo step through src/project/store.
 */
import { cloneProject, LAYER_NAMES, newLayer, sourceFromMedia, uid } from '../project/normalize';
import { addLayer, edit, moveLayer, removeLayer, select, undo, updateLayer, useProject } from '../project/store';
import type { Id, Layer, LayerKind, Project, Source } from '../project/types';
import type { MediaRef } from '../engine/recipe';
import { toast } from '../studio/toast';
import { say } from './ui';

const P = () => useProject.getState();

/** The picture most layers read: the bottom photo layer's source (or the first source). */
export function mainSource(p: Project): Id | null {
  const photo = p.layers.find(l => l.kind === 'photo' && l.source);
  if (photo && photo.kind === 'photo') return photo.source;
  return p.sources[0]?.id ?? null;
}

export const KIND_LABEL: Record<LayerKind, string> = {
  photo: 'Foto', ascii: 'ASCII (render gráfico)', glyphs: 'Caracteres reales', text: 'Texto', shape: 'Forma',
};
export const KIND_BLURB: Record<LayerKind, string> = {
  photo: 'La foto original (u otra), con ajustes y acabados.',
  ascii: 'El motor del laboratorio sobre la foto: luz, patrones, brillo. Es un dibujo, no texto.',
  glyphs: 'Caracteres de verdad en una rejilla: se copian y se exportan como texto.',
  text: 'Títulos, pies y etiquetas con las fuentes del estudio.',
  shape: 'Rectángulos, elipses, líneas, corchetes, miras y llamadas con etiqueta.',
};

/** A new layer of a kind over the selected one (or on top), reading the main photo when it can. */
export function addLayerOf(kind: LayerKind, init: Partial<Layer> = {}): Id | null {
  const p = P().project;
  if (!p) return null;
  const src = mainSource(p);
  const count = p.layers.filter(l => l.kind === kind).length;
  const name = `${LAYER_NAMES[kind]}${count ? ' ' + (count + 1) : ''}`;
  let layer: Layer;
  switch (kind) {
    case 'photo':
      if (!src) { say('Primero añade una foto al proyecto.'); return null; }
      layer = newLayer('photo', { name, source: src, ...(init as object) });
      break;
    // the lab's look (with its background): inside a mask it reads as ASCII, not as a faint copy of the photo
    case 'ascii': layer = newLayer('ascii', { name, source: src ?? 'style', opaque: true, ...(init as object) }); break;
    case 'glyphs': layer = newLayer('glyphs', { name, source: src ?? 'below', ...(init as object) }); break;
    case 'text': layer = newLayer('text', { name, box: { x: 0.08, y: 0.08, w: 0.84 }, ...(init as object) }); break;
    default: layer = newLayer('shape', { name, ...(init as object) }); break;
  }
  const sel = P().selection[0];
  const at = sel ? p.layers.findIndex(l => l.id === sel) + 1 : p.layers.length;
  addLayer(layer, at > 0 ? at : p.layers.length);
  say(`Capa «${layer.name}» añadida.`);
  return layer.id;
}

/** A new photo source from a stored file, with a photo layer showing it. */
export function addPhotoSource(ref: MediaRef, o: { duration?: number; fps?: number; hasAudio?: boolean } = {}): Id | null {
  const p = P().project;
  if (!p) return null;
  const s: Source = sourceFromMedia(ref, o.duration !== undefined ? { duration: o.duration, fps: o.fps, ...(o.hasAudio !== undefined ? { hasAudio: o.hasAudio } : {}) } : {});
  const layer = newLayer('photo', { name: ref.name ? ref.name.replace(/\.[a-z0-9]{2,5}$/i, '') : 'Foto', source: s.id });
  edit(d => {
    d.sources.push(s);
    const sel = P().selection[0];
    const at = sel ? d.layers.findIndex(l => l.id === sel) + 1 : d.layers.length;
    d.layers.splice(at > 0 ? at : d.layers.length, 0, layer);
  });
  select([layer.id]);
  say(o.duration !== undefined ? 'Video añadido como capa nueva.' : 'Foto añadida como capa nueva.');
  return layer.id;
}

/** Replaces the picture a photo layer shows (the old source stays if other layers use it). */
export function replaceSource(layerId: Id, ref: MediaRef, o: { duration?: number; fps?: number } = {}) {
  const s: Source = sourceFromMedia(ref, o.duration !== undefined ? { duration: o.duration, fps: o.fps } : {});
  edit(d => {
    const l = d.layers.find(x => x.id === layerId);
    if (!l || !('source' in l)) return;
    const old = (l as { source: string }).source;
    d.sources.push(s);
    (l as { source: string }).source = s.id;
    // every layer that read the old picture now reads the new one (ASCII over the photo keeps following it)
    for (const x of d.layers) if ('source' in x && (x as { source: string }).source === old) (x as { source: string }).source = s.id;
    if (!d.layers.some(x => 'source' in x && (x as { source: string }).source === old)) d.sources = d.sources.filter(x => x.id !== old);
  });
  say('Foto cambiada: las capas que la leían ahora leen la nueva.');
}

export function duplicateLayer(id: Id) {
  const p = P().project;
  const l = p?.layers.find(x => x.id === id);
  if (!p || !l) return;
  const copy = cloneProject({ ...p, layers: [l] }).layers[0];
  copy.id = uid();
  copy.name = `${l.name} (copia)`;
  copy.clips = copy.clips.map(c => ({ ...c, id: uid() }));
  const tracks = p.tracks.filter(t => t.layer === id).map(t => ({ ...t, layer: copy.id, keys: t.keys.map(k => ({ ...k })) }));
  edit(d => {
    const i = d.layers.findIndex(x => x.id === id);
    d.layers.splice(i + 1, 0, copy);
    d.tracks.push(...tracks);
  });
  select([copy.id]);
  say(`Capa duplicada: «${copy.name}».`);
}

/** Deletes a layer; the toast offers to bring it back (it is also one undo step). */
export function deleteLayer(id: Id) {
  const p = P().project;
  const l = p?.layers.find(x => x.id === id);
  if (!p || !l) return;
  const i = p.layers.findIndex(x => x.id === id);
  removeLayer(id);
  const after = P().project;
  const rest = after?.layers ?? [];
  const near = rest[Math.min(rest.length - 1, Math.max(0, i - 1))];
  if (near) select([near.id]);
  toast(`Capa «${l.name}» eliminada.`, { label: 'Deshacer', run: () => bringBack(p, l, i, after) });
  say(`Capa «${l.name}» eliminada. Ctrl+Z la recupera.`);
}

/**
 * The toast's «Deshacer» of a deletion brings THAT layer back: the undo step itself while nothing changed
 * since, else the layer (with its keys and pictures) put back where it was, keeping the edits made since;
 * nothing when it is already back (Ctrl+Z) or another project is open.
 */
function bringBack(before: Project, l: Layer, i: number, after: Project | null) {
  const cur = P().project;
  if (!cur || cur.id !== before.id) return;
  if (!cur.layers.some(x => x.id === l.id)) {
    if (cur === after) undo();
    else {
      const back = cloneProject({ ...before, layers: [l] });
      const tracks = before.tracks.filter(t => t.layer === l.id);
      edit(d => {
        d.layers.splice(Math.min(i, d.layers.length), 0, back.layers[0]);
        d.tracks.push(...cloneProject({ ...before, tracks }).tracks);
        // (its picture, when a change since dropped it from the project)
        const src = 'source' in l ? (l as { source?: unknown }).source : null;
        const s = before.sources.find(x => x.id === src);
        if (s && !d.sources.some(x => x.id === s.id)) d.sources.push(cloneProject({ ...before, sources: [s] }).sources[0]);
      });
    }
  }
  select([l.id]);
  say(`Capa «${l.name}» recuperada.`);
}

export function renameLayer(id: Id, name: string) {
  const n = name.trim().slice(0, 80);
  if (!n) return;
  updateLayer(id, { name: n });
}

/** Moves a layer by `d` places (+1 = up the stack). */
export function nudgeLayer(id: Id, d: number) {
  const p = P().project;
  if (!p) return;
  const i = p.layers.findIndex(x => x.id === id);
  const to = Math.max(0, Math.min(p.layers.length - 1, i + d));
  if (to === i) { say(d > 0 ? 'Ya está arriba del todo.' : 'Ya está abajo del todo.'); return; }
  moveLayer(id, to);
  say(`«${p.layers[i].name}» ahora es la capa ${to + 1} de ${p.layers.length} (contando desde abajo).`);
}
