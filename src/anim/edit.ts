/**
 * Clip and span edits on a project draft (the store's edit(fn) copy): add, move, resize, duplicate,
 * delete, reverse, params, easing; layer spans; and the overlaps between clips of a layer, which the
 * timeline shows as transitions. Pure: no store, no DOM.
 */
import type { ParamValue } from '../project/clips';
import { uid } from '../project/normalize';
import type { AnimClip, Ease, Id, Project } from '../project/types';
import { findClip } from './keys';

/** Shortest clip (seconds). */
export const MIN_CLIP = 0.05;

export function addClip(d: Project, layer: Id, clip: AnimClip): AnimClip | null {
  const l = d.layers.find(x => x.id === layer);
  if (!l) return null;
  l.clips.push(clip);
  return clip;
}

/** Moves a clip to start at `start` (≥ 0), optionally to another layer (at the end of its list). */
export function moveClip(d: Project, id: Id, start: number, toLayer?: Id): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  f.clip.start = Math.max(0, start);
  if (toLayer && toLayer !== f.layer.id) {
    const to = d.layers.find(l => l.id === toLayer);
    if (!to) return true;
    f.layer.clips.splice(f.index, 1);
    to.clips.push(f.clip);
  }
  return true;
}

/** Moves one edge of a clip to t (the other edge stays; at least MIN_CLIP long, never before 0). */
export function resizeClip(d: Project, id: Id, edge: 'start' | 'end', t: number): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  const c = f.clip, end = c.start + c.dur;
  if (edge === 'start') {
    const s = Math.min(end - MIN_CLIP, Math.max(0, t));
    c.dur = end - s; c.start = s;
  } else c.dur = Math.max(MIN_CLIP, t - c.start);
  return true;
}

/** A copy of a clip right after it (or at `at`), on the same layer. Returns the copy. */
export function duplicateClip(d: Project, id: Id, at?: number): AnimClip | null {
  const f = findClip(d, id);
  if (!f) return null;
  const copy: AnimClip = { ...structuredCloneSafe(f.clip), id: uid(), start: at ?? f.clip.start + f.clip.dur };
  f.layer.clips.splice(f.index + 1, 0, copy);
  return copy;
}

export function deleteClip(d: Project, id: Id): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  f.layer.clips.splice(f.index, 1);
  return true;
}

export function setClipReverse(d: Project, id: Id, reverse: boolean): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  f.clip.reverse = reverse;
  return true;
}

export function setClipParam(d: Project, id: Id, key: string, v: ParamValue): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  f.clip.params[key] = v;
  return true;
}

export function setClipEase(d: Project, id: Id, ease: Ease): boolean {
  const f = findClip(d, id);
  if (!f) return false;
  f.clip.ease = ease.kind === 'bezier' ? { kind: 'bezier', p: [...ease.p] } : { kind: ease.kind };
  return true;
}

/** A layer's span (null = the whole timeline); `in` < `out`, both ≥ 0. */
export function setSpan(d: Project, layer: Id, span: { in: number; out: number } | null): boolean {
  const l = d.layers.find(x => x.id === layer);
  if (!l) return false;
  if (!span) { l.span = null; return true; }
  const a = Math.max(0, Math.min(span.in, span.out - MIN_CLIP)), b = Math.max(a + MIN_CLIP, span.out);
  l.span = { in: a, out: b };
  return true;
}

export interface Overlap { a: Id; b: Id; start: number; end: number }

/** Where clips of a layer overlap in time (shown as transitions: one hands over to the other). */
export function clipOverlaps(clips: readonly AnimClip[]): Overlap[] {
  const out: Overlap[] = [];
  const list = [...clips].sort((x, y) => x.start - y.start);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const s = Math.max(a.start, b.start), e = Math.min(a.start + a.dur, b.start + b.dur);
    if (e - s > 1e-6) out.push({ a: a.id, b: b.id, start: s, end: e });
  }
  return out;
}

/** The time where the project's content ends (clips, spans, keys), for «fit to content». */
export function contentEnd(p: Project): number {
  let end = 0;
  for (const l of p.layers) {
    if (l.span) end = Math.max(end, l.span.out);
    for (const c of l.clips) end = Math.max(end, c.start + c.dur);
  }
  for (const t of p.tracks) for (const k of t.keys) end = Math.max(end, k.t);
  return end;
}

function structuredCloneSafe<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}
