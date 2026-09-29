/**
 * «Tus palabras forman la figura» (pure model): the person's words flow over a figure — the subject of a
 * cut-out, or the light or the dark zones of the photo — as a layer of real characters in «Tus palabras»
 * mode (src/glyphs: the text runs in reading order over the figure's cells and repeats until it fills it),
 * over a background (paper, the photo dimmed, or dark), optionally arriving with «Palabras que forman la
 * figura» (src/anim typing.ts). The layers it adds carry an id prefix ('wf…') so doing it again replaces them.
 */
import type { MediaRef } from '../../engine/recipe';
import { newLayer, normalizeProject, projectFromImage, uid } from '../../project/normalize';
import type { AnimClip, GlyphStyle, Layer, Project, Source } from '../../project/types';

export type WordsFigure = 'sujeto' | 'claros' | 'oscuros';
export type WordsBackground = 'papel' | 'tenue' | 'oscuro';
export type WordsColor = 'tinta' | 'foto' | 'acento';
export type WordsOrigin = 'izquierda' | 'derecha' | 'arriba' | 'abajo' | 'centro';

export interface WordsSpec {
  words: string;
  figure: WordsFigure;
  /** Characters across the frame (the density). */
  columns: number;
  font: string;
  weight: number;
  color: WordsColor;
  background: WordsBackground;
  /** Break only between words (true) or anywhere (false). */
  wholeWords: boolean;
  animate: boolean;
  origin: WordsOrigin;
  /** Seconds the words take to arrive. */
  dur: number;
}

export const DEFAULT_WORDS: WordsSpec = {
  words: 'lo que se escribe también dibuja', figure: 'claros', columns: 90, font: 'jetbrains', weight: 700, color: 'tinta', background: 'oscuro',
  wholeWords: true, animate: true, origin: 'izquierda', dur: 4,
};

export const WORDS_FONTS: Array<[string, string]> = [['jetbrains', 'JetBrains Mono'], ['martian', 'Martian Mono'], ['plex', 'IBM Plex Mono'], ['space', 'Space Mono'], ['vt', 'VT323 · terminal']];

const INK = '#0c0b0a', BONE = '#ede6da', PAPER = '#efe9df', VERM = '#ff5b1f';
const PREFIX = 'wf_';

/** Words cleaned for the grid: spaces collapsed, at most 2000 characters, never empty. */
export function cleanWords(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, 2000);
  return t || DEFAULT_WORDS.words;
}

/** The layers of the flow over a project's picture (and its cut-out), without ids in the project yet. */
export function wordsLayers(p: Project, spec: WordsSpec): { layers: Layer[]; duration: number; notes: string[] } {
  const notes: string[] = [];
  const main = p.layers.find(l => l.kind === 'photo' && l.source && p.sources.some(s => s.id === l.source && s.kind !== 'cutout')) as { source: string } | undefined;
  const mainId = main?.source ?? p.sources.find(s => s.kind !== 'cutout')?.id ?? p.sources[0]?.id ?? '';
  const cut: Source | undefined = p.sources.find(s => s.kind === 'cutout');
  let figure = spec.figure;
  if (figure === 'sujeto' && !cut) { figure = 'claros'; notes.push('Este proyecto no tiene recorte del sujeto: la figura se toma de las zonas claras. Usa «Quitar fondo» para que tus palabras llenen sólo al sujeto.'); }
  const dark = spec.background !== 'papel';
  const ink = spec.color === 'acento' ? VERM : dark ? BONE : INK;
  const cols = Math.max(20, Math.min(240, Math.round(spec.columns)));
  const glyphs: GlyphStyle = {
    charset: 'palabras', chars: cleanWords(spec.words), fill: 'words', font: spec.font, weight: spec.weight, cell: Math.max(3, +(p.canvas.w / cols).toFixed(2)), aspect: 1.8,
    bright: figure === 'sujeto' ? 0.32 : 0, contrast: figure === 'sujeto' ? 1 : 1.35, gamma: 1, sat: 1.2, invert: figure === 'oscuros', edge: 0,
    cutoff: figure === 'sujeto' ? 0.02 : 0.42, color: spec.color === 'foto' ? 'source' : 'mono', ink, paper: null, palette: [INK, '#5b544c', BONE, VERM],
  };
  if (spec.wholeWords) glyphs.wrap = 'word';
  const layers: Layer[] = [];
  if (spec.background === 'papel' || spec.background === 'oscuro') {
    layers.push(newLayer('shape', { id: PREFIX + uid(), name: spec.background === 'papel' ? 'Papel' : 'Fondo oscuro', shape: 'rect', pts: [0, 0, 1, 1], stroke: null, width: 0, fill: spec.background === 'papel' ? PAPER : INK }));
  } else {
    layers.push(newLayer('shape', { id: PREFIX + uid(), name: 'Velo sobre la foto', shape: 'rect', pts: [0, 0, 1, 1], stroke: null, width: 0, fill: INK, opacity: 0.78 }));
  }
  const clips: AnimClip[] = spec.animate ? [{
    id: uid(), template: 'palabras-figura', start: 0.3, dur: Math.max(0.5, spec.dur), params: { origen: spec.origin, vuelo: 0.25, curva: 0.35, color: spec.color === 'acento' ? 'hueso' : 'acento' },
    reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false,
  }] : [];
  layers.push(newLayer('glyphs', { id: PREFIX + uid(), name: 'Tus palabras', source: figure === 'sujeto' && cut ? cut.id : mainId || 'below', glyphs, clips }));
  const duration = spec.animate ? +(0.3 + Math.max(0.5, spec.dur) + 1.5).toFixed(2) : 0;
  return { layers, duration, notes };
}

/** The flow on a project (a copy): its earlier flow replaced, the new layers on top, the timeline long enough. */
export function applyWords(p0: Project, spec: WordsSpec): { project: Project; notes: string[]; layer: string } {
  const p: Project = JSON.parse(JSON.stringify(p0));
  const gone = new Set(p.layers.filter(l => l.id.startsWith(PREFIX)).map(l => l.id));
  p.layers = p.layers.filter(l => !gone.has(l.id));
  p.tracks = p.tracks.filter(t => !gone.has(t.layer));
  const r = wordsLayers(p, spec);
  p.layers.push(...r.layers);
  if (r.duration > p.time.duration) p.time = { ...p.time, duration: r.duration, loop: false };
  const out = normalizeProject(p);
  return { project: out, notes: r.notes, layer: r.layers[r.layers.length - 1].id };
}

/** A new project: the flow over a stored photo. */
export function wordsProject(ref: MediaRef, spec: WordsSpec): { project: Project; notes: string[] } {
  const base = projectFromImage(ref, { name: `Tus palabras · ${cleanWords(spec.words).slice(0, 40)}` });
  base.layers[0].name = 'Foto';
  const r = applyWords(base, spec);
  return { project: r.project, notes: r.notes };
}

/** The flow's spec read back from a project (to edit it again), or null. */
export function wordsSpecOf(p: Project): WordsSpec | null {
  const g = p.layers.find(l => l.id.startsWith(PREFIX) && l.kind === 'glyphs');
  if (!g || g.kind !== 'glyphs') return null;
  const bg = p.layers.find(l => l.id.startsWith(PREFIX) && l.kind === 'shape');
  const clip = g.clips.find(c => c.template === 'palabras-figura');
  const cut = p.sources.find(s => s.id === g.source)?.kind === 'cutout';
  return {
    words: g.glyphs.chars, figure: cut ? 'sujeto' : g.glyphs.invert ? 'oscuros' : 'claros', columns: Math.round(p.canvas.w / g.glyphs.cell), font: g.glyphs.font, weight: g.glyphs.weight,
    color: g.glyphs.color === 'source' ? 'foto' : g.glyphs.ink.toLowerCase() === VERM ? 'acento' : 'tinta',
    background: bg?.kind === 'shape' && bg.opacity < 1 ? 'tenue' : bg?.kind === 'shape' && bg.fill === PAPER ? 'papel' : 'oscuro',
    wholeWords: g.glyphs.wrap === 'word', animate: !!clip, origin: (clip?.params.origen as WordsOrigin) ?? 'izquierda', dur: clip?.dur ?? DEFAULT_WORDS.dur,
  };
}
