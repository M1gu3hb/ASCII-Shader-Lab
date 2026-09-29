/**
 * The sheet's choices as one plain object (pure): what goes out, in which format, at which size, time and
 * options; and the destination presets («Web», «Terminal», «Vertical», «Cartel para imprimir», «README»,
 * «Presentación»), each a sensible starting point the person can still change.
 */
import type { ColorDepth } from '../../exporters/text';
import { formatsFor, usableFormat, type Facts, type FormatId, type WhatKind } from './formats';
import type { Dpi, Fit, Orient, SizeId } from './sizes';

export type DestId = 'libre' | 'web' | 'terminal' | 'vertical' | 'cartel' | 'readme' | 'presentacion';

export interface Plan {
  dest: DestId;
  what: WhatKind;
  /** The layer or source the part belongs to ('capa', 'mascara', 'original', 'recorte', 'texto'). */
  target: string | null;
  format: FormatId;
  size: SizeId;
  dpi: Dpi;
  orient: Orient;
  fit: Fit;
  /** Instant of a still (s). */
  t: number;
  /** Stretch of a moving export (s) and its frame rate. */
  start: number;
  end: number;
  fps: number;
  transparent: boolean;
  loop: boolean;
  audio: 'keep' | 'none';
  /** Whose sound (a video source id) when several videos have one; null = the bottom-most video with sound. */
  audioSource: string | null;
  /** JPEG / WebP quality 0..1. */
  quality: number;
  gif: { colors: number; dither: 'none' | 'bayer' | 'floyd'; palette: 'global' | 'frame' };
  /** Colours of ANSI and terminal players. */
  depth: ColorDepth;
  /** README: the glyph layer whose text goes in it (null = none) and the picture's width. */
  readmeText: string | null;
  readmeW: number;
  /** SVGs carry the studio's font files (so they look the same in a browser). */
  embedFonts: boolean;
}

export interface Destination {
  id: DestId;
  name: string;
  /** What it prepares, in one line. */
  what: string;
}

export const DESTINATIONS: Destination[] = [
  { id: 'libre', name: 'Libre', what: 'Tú eliges el formato y el tamaño.' },
  { id: 'web', name: 'Web', what: 'Imagen ligera o video en bucle para una página; texto animado real si la pieza es de caracteres.' },
  { id: 'terminal', name: 'Terminal', what: 'Sólo caracteres reales: ANSI con color, o una grabación y reproductores para la consola.' },
  { id: 'vertical', name: 'Vertical (historias)', what: '1080 × 1920 para historias, reels y shorts: video si se mueve, imagen si no.' },
  { id: 'cartel', name: 'Cartel para imprimir', what: 'A4, A3, Carta o Tabloide a 300 ppp, en PNG sin pérdida.' },
  { id: 'readme', name: 'README', what: 'Un README.md con la pieza (GIF o PNG) y su versión en texto, listo para GitHub.' },
  { id: 'presentacion', name: 'Presentación', what: 'Para diapositivas: una imagen 1920 × 1080 (16:9) con la pieza entera; un video a su propia proporción.' },
];

export const destinationById = (id: string) => DESTINATIONS.find(d => d.id === id) ?? DESTINATIONS[0];

export function defaultPlan(p: { canvas: { transparent: boolean }; time: { duration: number; fps: number; loop: boolean } }, t: number): Plan {
  const dur = p.time.duration > 0 ? p.time.duration : 0;
  return {
    dest: 'libre', what: 'resultado', target: null, format: 'png', size: 'proyecto', dpi: 300, orient: 'auto', fit: 'cover',
    t: Math.max(0, Math.min(t, dur)), start: 0, end: dur, fps: Math.min(60, Math.max(1, p.time.fps || 24)),
    transparent: p.canvas.transparent, loop: p.time.loop !== false, audio: 'keep', audioSource: null, quality: 0.92,
    gif: { colors: 256, dither: 'bayer', palette: 'global' }, depth: 'truecolor', readmeText: null, readmeW: 800, embedFonts: true,
  };
}

/** The first available of a list of formats (for a destination's preference order). */
function firstOf(facts: Facts, what: WhatKind, prefs: FormatId[], target?: string | null): FormatId {
  const list = formatsFor(what, facts, target ? { layer: target } : {});
  for (const id of prefs) if (list.find(x => x.id === id)?.available) return id;
  return usableFormat(list, prefs[0]) ?? prefs[0];
}

/**
 * The plan a destination starts from (the person can change anything afterwards). Moving pieces get moving
 * formats where the destination plays them; pieces of real characters get text where text is the point.
 */
export function applyDestination(plan: Plan, dest: DestId, facts: Facts): Plan {
  const next: Plan = { ...plan, dest };
  const glyph = facts.glyphs.find(g => g.visible) ?? facts.glyphs[0];
  const moving = facts.moving;
  switch (dest) {
    case 'libre':
      return next;
    case 'web': {
      // the whole piece is one layer of characters and it moves: the real thing as code; otherwise a picture or a video
      const solo = facts.glyphs.find(g => g.id === facts.soloGlyph);
      if (solo && moving && solo.moves) return { ...next, what: 'texto', target: solo.id, format: firstOf(facts, 'texto', ['web'], solo.id) };
      return {
        ...next, what: 'resultado', target: null, size: 'proyecto', fit: 'cover',
        format: moving ? firstOf(facts, 'resultado', ['webm', 'mp4', 'gif', 'webp', 'png']) : firstOf(facts, 'resultado', ['webp', 'png']),
      };
    }
    case 'terminal':
      return { ...next, what: 'texto', target: glyph?.id ?? null, format: glyph && moving && glyph.moves ? 'cast' : 'ansi', depth: 'truecolor' };
    case 'vertical':
      return {
        ...next, what: 'resultado', target: null, size: 'historia', fit: 'cover',
        format: moving ? firstOf(facts, 'resultado', ['mp4', 'webm', 'gif', 'png']) : firstOf(facts, 'resultado', ['png', 'jpeg']),
      };
    case 'cartel':
      return { ...next, what: 'resultado', target: null, size: 'a4', dpi: 300, orient: 'auto', fit: 'contain', format: 'png' };
    case 'readme':
      return { ...next, what: 'resultado', target: null, format: 'readme', readmeText: glyph?.id ?? null, readmeW: 800 };
    case 'presentacion': {
      // a still goes whole on the 16:9 slide (bands); a video keeps its own proportion unless it is 16:9
      // already (a video that does not match is cropped, and a slide can hold a video of any shape)
      const wide = Math.abs((facts.aspect ?? 16 / 9) - 16 / 9) < 0.01;
      return {
        ...next, what: 'resultado', target: null, fit: 'contain',
        size: moving && !wide ? 'proyecto' : 'pantalla',
        format: moving ? firstOf(facts, 'resultado', ['mp4', 'webm', 'png']) : firstOf(facts, 'resultado', ['png', 'jpeg']),
      };
    }
  }
}

/** Frame rates offered for moving exports (the project's own first). */
export function fpsOptions(projectFps: number): number[] {
  const base = [12, 15, 24, 25, 30, 60];
  const own = Math.round(projectFps);
  return [...new Set([own, ...base])].filter(v => v > 0 && v <= 60).sort((a, b) => a - b);
}

/** Frames a stretch gives at a rate (the export loop's count: round((end − start)·fps), at least 1). */
export const frameCount = (start: number, end: number, fps: number) => Math.max(1, Math.round(Math.max(0, end - start) * fps));

/**
 * The instant a README's text version is written from: the last frame of a moving stretch (where an entry has
 * arrived, as the GIF ends), the chosen instant otherwise.
 */
export const readmeTextTime = (plan: Pick<Plan, 't' | 'start' | 'end' | 'fps'>, moving: boolean) =>
  moving && plan.end > plan.start ? Math.max(plan.start, plan.end - 1 / Math.max(1, plan.fps)) : plan.t;
