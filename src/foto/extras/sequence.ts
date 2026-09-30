/**
 * Photo sequences → animation (pure model). Several photos become one 'sequence' source (each photo shown
 * `hold` seconds, in order, looping) under a photo layer, plus the layers of the chosen transition:
 *
 *   'corte'       a straight cut;
 *   'fundido'     a cross-fade: a second sequence of the same photos, one step ahead, fades in over the end of
 *                 each photo (opacity keys, so the timeline shows and edits them);
 *   'caracteres'  «Transición entre fotos» (src/anim reveals.ts, 'secuencia-fotos') on a layer of real
 *                 characters over the sequence: characters cover each change and withdraw;
 *   'ascii'       the same template on a shader-ASCII layer (the lab's look).
 *
 * The layers and sources the sequence manages carry an id prefix ('sq…'), so the sheet can read the
 * sequence back from a project and rebuild it after a reorder or a new hold time without touching the
 * person's own layers.
 */
import type { MediaRef, Recipe } from '../../engine/recipe';
import { defaultAsciiStyle, frameFor, LIMITS, newLayer, newProject, normalizeProject, uid } from '../../project/normalize';
import type { AnimClip, GlyphStyle, Key, Layer, Project, Source, Track } from '../../project/types';
import { PRESETS } from '../../studio/presets';

export type SeqTransition = 'corte' | 'fundido' | 'caracteres' | 'ascii';

export const SEQ_TRANSITIONS: Array<{ id: SeqTransition; name: string; blurb: string }> = [
  { id: 'corte', name: 'Corte', blurb: 'Una foto tras otra, sin transición.' },
  { id: 'fundido', name: 'Fundido', blurb: 'Cada foto se funde en la siguiente.' },
  { id: 'caracteres', name: 'Caracteres', blurb: '«Transición entre fotos»: los caracteres cubren el cambio y se retiran.' },
  { id: 'ascii', name: 'ASCII', blurb: 'La misma transición con el motor ASCII del laboratorio.' },
];

export interface SequenceSpec {
  photos: MediaRef[];
  /** Seconds each photo shows. */
  hold: number;
  transition: SeqTransition;
  /** Seconds each change takes (fade or characters). */
  change: number;
  loop: boolean;
}

export const HOLD_MIN = 0.2, HOLD_MAX = 10;
const MAX_FADE_PHOTOS = Math.floor(LIMITS.keys / 3);

const P = { src: 'sqsrc', next: 'sqnext', base: 'sqbase', fade: 'sqfade', tr: 'sqtr' } as const;
const mid = (prefix: string) => `${prefix}_${uid()}`;
const is = (id: string, prefix: string) => id.startsWith(prefix + '_');

export const clampHold = (h: number) => Math.min(HOLD_MAX, Math.max(HOLD_MIN, Number.isFinite(h) ? h : 1));
export const clampChange = (c: number, hold: number) => Math.min(Math.max(0.05, hold * 0.95), Math.max(0.05, Number.isFinite(c) ? c : 0.4));

/** The sequence's length: every photo once. */
export const sequenceDuration = (s: Pick<SequenceSpec, 'photos' | 'hold'>) => Math.max(0.1, s.photos.length * clampHold(s.hold));

/** Which photo shows at t (0-based, looping), as sources.ts picks it. */
export function photoAt(s: Pick<SequenceSpec, 'photos' | 'hold'>, t: number): number {
  const n = s.photos.length;
  if (n <= 1) return 0;
  return Math.floor(Math.max(0, t) / clampHold(s.hold) + 1e-9) % n;
}

/** Moves photo `from` to position `to` (a copy of the list). */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
}

/** Opacity keys of the cross-fade layer: 0 until `change` before each cut, 1 right before it, 0 at it. */
export function fadeKeys(n: number, hold: number, change: number, loop: boolean): Key[] {
  const keys: Key[] = [{ t: 0, v: 0, ease: { kind: 'linear' } }];
  const f = clampChange(change, hold);
  const cuts = loop ? n : n - 1;
  for (let i = 1; i <= Math.min(cuts, MAX_FADE_PHOTOS); i++) {
    const at = i * hold;
    keys.push({ t: +(at - f).toFixed(4), v: 0, ease: { kind: 'inOut' } });
    keys.push({ t: +(at - 0.0005).toFixed(4), v: 1, ease: { kind: 'hold' } });
    keys.push({ t: +at.toFixed(4), v: 0, ease: { kind: 'linear' } });
  }
  return keys;
}

function glyphStyle(): GlyphStyle {
  return {
    charset: 'estandar', chars: '', fill: 'ramp', font: 'jetbrains', weight: 700, cell: 12, aspect: 1.8, bright: 0.05, contrast: 1.3, gamma: 1, sat: 1.2,
    invert: false, edge: 0.2, cutoff: 0, color: 'source', ink: '#ede6da', paper: '#0c0b0a', palette: ['#0c0b0a', '#5b544c', '#ede6da', '#ff5b1f'],
  };
}

function asciiStyle(): Recipe {
  const p = PRESETS.media.find(x => x.id === 'fosforo');
  const r = p ? p.make() : defaultAsciiStyle();
  r.interact = { ...r.interact, mode: 'none', auto: false };
  r.glyph = { ...r.glyph, cell: 11 };
  return r;
}

/** The sources and layers a spec needs (new ids), and its tracks. */
function build(spec: SequenceSpec, canvasW: number): { sources: Source[]; layers: Layer[]; tracks: Track[] } {
  const photos = spec.photos.slice(0, LIMITS.sequence);
  const hold = clampHold(spec.hold);
  const first = photos[0];
  const src: Source = { id: mid(P.src), kind: 'sequence', name: 'Secuencia', media: photos, w: first?.w ?? 0, h: first?.h ?? 0, hold };
  const sources: Source[] = [src];
  const layers: Layer[] = [newLayer('photo', { id: mid(P.base), name: 'Secuencia de fotos', source: src.id, fit: 'cover' })];
  const tracks: Track[] = [];
  const total = sequenceDuration({ photos, hold });
  if (spec.transition === 'fundido' && photos.length > 1) {
    const next: Source = { ...src, id: mid(P.next), name: 'Secuencia (la foto siguiente)', media: [...photos.slice(1), photos[0]] };
    sources.push(next);
    const fade = newLayer('photo', { id: mid(P.fade), name: 'Fundido a la foto siguiente', source: next.id, fit: 'cover', opacity: 0 });
    layers.push(fade);
    tracks.push({ layer: fade.id, path: 'opacity', keys: fadeKeys(photos.length, hold, spec.change, spec.loop) });
  }
  if ((spec.transition === 'caracteres' || spec.transition === 'ascii') && photos.length > 1) {
    const clip: AnimClip = {
      id: uid(), template: 'secuencia-fotos', start: 0, dur: total, params: { cobertura: +clampChange(spec.change, hold).toFixed(2), orden: 'azar', suavidad: 0.25 },
      reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false,
    };
    const cell = Math.max(8, Math.round(canvasW / 110));
    layers.push(spec.transition === 'caracteres'
      ? newLayer('glyphs', { id: mid(P.tr), name: 'Transición entre fotos', source: src.id, glyphs: { ...glyphStyle(), cell }, clips: [clip] })
      : newLayer('ascii', { id: mid(P.tr), name: 'Transición entre fotos (ASCII)', source: src.id, style: { ...asciiStyle(), glyph: { ...asciiStyle().glyph, cell } }, opaque: true, clips: [clip] }));
  }
  return { sources, layers, tracks };
}

/** A new project from a spec. */
export function sequenceProject(spec: SequenceSpec, name = 'Secuencia'): Project {
  const first = spec.photos[0];
  const f = frameFor(first?.w ?? 0, first?.h ?? 0, 2048);
  const p = newProject({ name, w: f.w, h: f.h, duration: sequenceDuration(spec), fps: 24 });
  p.time.loop = spec.loop;
  const b = build(spec, f.w);
  p.sources = b.sources;
  p.layers = b.layers;
  p.tracks = b.tracks;
  p.meta = { origin: 'sequence' };
  return normalizeProject(p);
}

/** Whether a project has a sequence this module made (or any sequence source to adopt). */
export function hasSequence(p: Project): boolean {
  return p.sources.some(s => s.kind === 'sequence');
}

/** The spec of a project's sequence (its managed layers), or null. */
export function sequenceSpecOf(p: Project): SequenceSpec | null {
  const src = p.sources.find(s => s.kind === 'sequence' && is(s.id, P.src)) ?? p.sources.find(s => s.kind === 'sequence');
  if (!src) return null;
  const hold = clampHold(src.hold ?? 1);
  const tr = p.layers.find(l => is(l.id, P.tr));
  const fade = p.layers.find(l => is(l.id, P.fade));
  let transition: SeqTransition = 'corte', change = 0.4;
  if (fade) {
    transition = 'fundido';
    const keys = p.tracks.find(t => t.layer === fade.id && t.path === 'opacity')?.keys ?? [];
    if (keys.length >= 3) change = Math.max(0.05, Math.round((keys[2].t - keys[1].t + 0.0005) * 100) / 100);
  } else if (tr) {
    transition = tr.kind === 'ascii' ? 'ascii' : 'caracteres';
    const c = tr.clips.find(x => x.template === 'secuencia-fotos');
    if (c && typeof c.params.cobertura === 'number') change = c.params.cobertura;
  }
  return { photos: src.media.slice(), hold, transition, change: clampChange(change, hold), loop: p.time.loop };
}

/**
 * The project with its sequence rebuilt from a spec (a copy): the managed sources, layers and keys are
 * replaced (at the bottom of the stack), the person's own layers stay above them; layers that read the old
 * sequence read the new one; the length follows the photos.
 */
export function applySequence(p0: Project, spec: SequenceSpec): Project {
  const p: Project = JSON.parse(JSON.stringify(p0));
  const old = p.sources.find(s => s.kind === 'sequence' && is(s.id, P.src)) ?? p.sources.find(s => s.kind === 'sequence');
  const managedL = (l: Layer) => is(l.id, P.base) || is(l.id, P.fade) || is(l.id, P.tr) || (!!old && l.kind === 'photo' && l.source === old.id && p.layers.indexOf(l) === 0);
  const gone = new Set(p.layers.filter(managedL).map(l => l.id));
  const b = build(spec, p.canvas.w);
  const src = b.sources[0];
  p.sources = [...b.sources, ...p.sources.filter(s => !is(s.id, P.src) && !is(s.id, P.next) && s.id !== old?.id)];
  const own = p.layers.filter(l => !gone.has(l.id));
  for (const l of own) if ('source' in l && old && l.source === old.id) (l as { source: string }).source = src.id;
  // colour masks that read the old sequence follow it too (left on a removed source they come out empty)
  for (const l of own) for (const part of l.mask?.parts ?? []) if (part.kind === 'color' && old && part.source === old.id) part.source = src.id;
  p.layers = [...b.layers, ...own];
  p.tracks = [...b.tracks, ...p.tracks.filter(t => !gone.has(t.layer))];
  p.time = { ...p.time, duration: sequenceDuration(spec), loop: spec.loop };
  p.meta = { ...p.meta, origin: 'sequence' };
  return normalizeProject(p);
}
