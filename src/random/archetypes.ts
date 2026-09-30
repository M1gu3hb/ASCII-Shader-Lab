import type { BlendMode, ColorMap, GlyphMode, InteractMode, Recipe } from '../engine/recipe';
import type { PaletteStyle } from './palettes';
import type { Palette5Style } from './palettes5';
import { ARCHETYPES_V2 } from './v2';
import { ARCHETYPES_V5 } from './v5';

type W<T extends string> = Partial<Record<T, number>>;
/** [probability, min, max] */
type Maybe = [number, number, number];

/**
 * An archetype is an art direction: coherent distributions for every decision the dice make.
 * Results stay surprising but never incoherent (no bloom on paper, no 5-layer 3D stacks, etc.).
 */
export interface Archetype {
  id: string;
  name: string;
  blurb: string;
  patterns: W<string>;
  /** optional secondary pool for extra layers */
  overlays?: W<string>;
  layers: [number, number];
  blends: W<BlendMode>;
  /** palette families: those of palettes.ts (every version) and, from version 5, those of palettes5.ts */
  palettes: W<PaletteStyle | Palette5Style>;
  charsets: W<string>;
  fonts: W<string>;
  weights?: [number, number];
  cell: [number, number];
  aspect?: [number, number];
  glyphModes: W<GlyphMode>;
  speed: [number, number];
  scale: [number, number];
  warp: Maybe;
  fx: Partial<Record<keyof Recipe['fx'], Maybe>>;
  interact: W<InteractMode>;
  colorMap: W<ColorMap>;
  contrast: [number, number];
  edge?: Maybe;
  dither?: Maybe;
  levels?: Maybe;
  hold?: Maybe;
  pulse?: Maybe;
  shade?: [number, number];
  cycle?: Maybe;
  /** version 5: the chance a field in the lead gets a particle motion over it (a second layer) */
  particleOverlay?: number;
}

/** The styles of versions 2–4 (frozen, v2.ts) and of the current version (5: v5.ts). */
export { ARCHETYPES_V2 } from './v2';
/** The dice's styles today (generator version 5): what the studio lists and names. */
export const ARCHETYPES: readonly Archetype[] = ARCHETYPES_V5;

/** A style by id: today's, else one of an earlier version (for names of older pieces). */
export const archById = (id?: string) => ARCHETYPES.find(a => a.id === id) ?? ARCHETYPES_V2.find(a => a.id === id);
