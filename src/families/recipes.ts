import { DEFAULT_LAYER, cloneRecipe, defaultRecipe, normalizeRecipe, type Layer, type Recipe } from '../engine/recipe';
import { famFor } from './params';
import { familyById } from './registry';
import type { FamilyMeta, FamilyPreset } from './types';

/** A layer drawing a family, from one of its presets (default: the first). */
export function familyLayer(meta: FamilyMeta, seed: string, presetId?: string, base: Partial<Layer> = {}): Layer {
  const pr = presetId ? meta.presets.find(p => p.id === presetId) : meta.presets[0];
  return {
    ...DEFAULT_LAYER, ...base,
    pattern: meta.id,
    scale: pr?.layer?.scale ?? 1,
    speed: pr?.layer?.speed ?? 1,
    fam: famFor(meta, seed, pr?.id),
  };
}

/** Applies a preset's suggested look (palette, background, characters, cell) to a recipe. */
export function applyLook(r: Recipe, pr: FamilyPreset | undefined) {
  const L = pr?.look;
  if (!L) return;
  if (L.stops?.length) r.color.stops = L.stops.slice();
  if (L.bg) r.color.bg = L.bg;
  if (L.charset) { r.glyph.charset = L.charset; r.glyph.sort = true; }
  if (L.cell) r.glyph.cell = L.cell;
  if (L.glyphMode) r.glyph.mode = L.glyphMode;
  r.color.mode = 'ramp';
  r.color.map = 'luma';
}

/**
 * A whole piece showing a family preset: the family alone on a pattern source, with the preset's look.
 * A family with memory turns «Bucle perfecto» off (it could not keep it: see FamilyCaps.loop).
 */
export function familyRecipe(id: string, presetId?: string, base: Recipe = defaultRecipe(), seed = 'glyphos'): Recipe {
  const meta = familyById(id);
  if (!meta) throw new Error('Familia desconocida: ' + id);
  const r = cloneRecipe(base);
  const pr = presetId ? meta.presets.find(p => p.id === presetId) : meta.presets[0];
  r.source = 'pattern';
  r.layers = [familyLayer(meta, seed, pr?.id)];
  applyLook(r, pr);
  if (!meta.caps.loop) r.motion.loop = 0;
  r.motion.warp = 0;
  r.meta = { name: `${meta.name} · ${pr?.name ?? ''}`.trim() };
  return normalizeRecipe(r);
}

/** Puts a preset's parameters (and its rows) on an existing family layer, keeping its seed and brush. */
export function withPreset(l: Layer, presetId: string): Layer {
  const meta = familyById(l.pattern);
  if (!meta || !l.fam) return l;
  const fresh = famFor(meta, l.fam.seed, presetId);
  const pr = meta.presets.find(p => p.id === presetId);
  return {
    ...l,
    ...(pr?.layer?.scale !== undefined ? { scale: pr.layer.scale } : {}),
    ...(pr?.layer?.speed !== undefined ? { speed: pr.layer.speed } : {}),
    fam: { ...fresh, ...(l.fam.brush ? { brush: l.fam.brush } : {}) },
  };
}
