/**
 * Adding animation to a layer, shared by the timeline's «Animación» button and the layer inspector's
 * «Animar»: a library item becomes a clip at the playhead; a choreography lays out its entry, centre and
 * exit over the layer's span (or the project's length). Each is one undo step, and the project grows when
 * the new clips go past its end.
 */
import { applyChoreo, type Choreo } from '../../anim/choreo';
import { addClip, contentEnd } from '../../anim/edit';
import { newClip, type LibraryItem } from '../../anim/library';
import { edit, select, useProject } from '../../project/store';
import type { Id, Layer, LayerKind, Project } from '../../project/types';
import { formatTime } from './math';

/** Grows the project's duration when content passes its end (a still project gets a length). */
export function fitDuration(d: Project) {
  const end = contentEnd(d);
  if (end > d.time.duration) d.time.duration = Math.round(end * 100) / 100;
}

const lenOf = (p: Project) => Math.max(p.time.duration, contentEnd(p), 1);

/** The layer to animate: the one asked for when the item works on it, else the selected one, else the top one it works on. */
function targetFor(p: Project, kinds: LayerKind[], layer?: Id | null): Layer | undefined {
  const asked = layer ? p.layers.find(l => l.id === layer) : undefined;
  if (asked && kinds.includes(asked.kind)) return asked;
  const sel = p.layers.find(l => l.id === useProject.getState().selection[0]);
  if (sel && kinds.includes(sel.kind)) return sel;
  return p.layers.slice().reverse().find(l => kinds.includes(l.kind));
}

export interface Added { ok: boolean; msg: string; layer?: Id; clip?: Id }

/** A clip of a library item at the playhead. */
export function addLibraryItem(item: LibraryItem, layer?: Id | null): Added {
  const p = useProject.getState().project;
  if (!p) return { ok: false, msg: 'Abre un proyecto primero.' };
  const target = targetFor(p, item.kinds, layer);
  if (!target) return { ok: false, msg: `«${item.name}» no funciona en ninguna capa de este proyecto.` };
  const c = newClip(item, useProject.getState().time);
  edit(d => { addClip(d, target.id, c); fitDuration(d); });
  select([target.id]);
  return { ok: true, msg: `Añadido «${item.name}» a «${target.name}» en ${formatTime(c.start)}.`, layer: target.id, clip: c.id };
}

/** A choreography (entry + centre + exit) over the layer's span, or the project's length (at least 4 s). */
export function addChoreography(c: Choreo, layer?: Id | null): Added {
  const p = useProject.getState().project;
  if (!p) return { ok: false, msg: 'Abre un proyecto primero.' };
  const target = targetFor(p, c.kinds, layer);
  if (!target) return { ok: false, msg: `«${c.name}» no funciona en ninguna capa de este proyecto.` };
  const start = target.span ? target.span.in : 0;
  const total = target.span ? target.span.out - target.span.in : Math.max(4, lenOf(p));
  edit(d => { applyChoreo(d, target.id, c.id, start, total, 0.2); fitDuration(d); });
  select([target.id]);
  return { ok: true, msg: `Coreografía «${c.name}» en «${target.name}».`, layer: target.id };
}
