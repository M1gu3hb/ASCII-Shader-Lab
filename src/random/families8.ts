import { patternById } from '../engine/catalog';
import { DEFAULT_LAYER, FOLD_KINDS, normFxKind, normOptics, POLY_SHAPES, type Layer, type Recipe } from '../engine/recipe';
import type { Archetype } from './archetypes';
import { FAMILIES8_DATA } from './families8-data';
import { round, type Rng } from './prng';
import type { SpaceId } from './spaces';

/*
 * Generator version 8 (closing of PR #10): version 7's way of choosing (a section of the space by use and
 * look, then one of its presets, with its own seed) over the families and presets of the closing, frozen in
 * families8-data.ts, plus what they can now do:
 *  - a family that reads the piece (FamilyMeta.reads) makes the whole picture from the photo or the words:
 *    over a photo or inside the words it is drawn alone (mix 1, normal), as its recipe in the library, and the
 *    words are set at the size its preset asks for;
 *  - a preset that shows the layer under it (FamilyPreset.below) brings that layer;
 *  - the glass in front can also be a solid: a ball or a gem of glass (Fondos, Arte, Imagen);
 *  - now and then the shape of an effect: the glow as an anamorphic flare, the grain as a sheet of paper on a
 *    light palette (its own stream, 'acabado');
 *  - a locked «Efectos» keeps the base's glass and effect shapes.
 * Their own streams ('familia', 'vidrio', 'acabado'), so every other decision of a roll is the same kind as in
 * version 5. Frozen once published (families8-data.ts): a later change is version 9.
 */

/** How often a roll of each space starts from a family. */
export const FAMILY_CHANCE8: Record<SpaceId, number> = { arte: 0.24, fondos: 0.2, terminal: 0.12, tipo: 0.14, media: 0.14, componentes: 0 };
/** How often a roll puts glass in front of the piece. */
export const GLASS_CHANCE8: Partial<Record<SpaceId, number>> = { fondos: 0.06, arte: 0.06, media: 0.09 };
/** How often a glow becomes an anamorphic flare, and a grain a sheet of paper. */
const FLARE_CHANCE8: Partial<Record<SpaceId, number>> = { fondos: 0.12, arte: 0.18, media: 0.2, tipo: 0.12 };
const PAPER_CHANCE8: Partial<Record<SpaceId, number>> = { arte: 0.25, media: 0.3, tipo: 0.3 };

type Preset8 = (typeof FAMILIES8_DATA)[number][4][number];
interface Fam8 { id: string; loop: boolean; reads: boolean; keys: string[]; presets: Preset8[] }
const FAMILIES8: ReadonlyMap<string, Fam8> = new Map(FAMILIES8_DATA.map(([id, loop, reads, keys, presets]) => [id, { id, loop: loop === 1, reads: reads === 1, keys, presets }]));
/** Where a preset's parameter values start (after id, scale, speed, version, rows, uses, colour, size, below). */
const VALUES8 = 9;

/** Per space, its sections (in a fixed order) and the [family, preset] pairs each offers. */
const SECTIONS8: ReadonlyMap<string, ReadonlyArray<[string, ReadonlyArray<[Fam8, Preset8]>]>> = (() => {
  const by = new Map<string, Map<string, Array<[Fam8, Preset8]>>>();
  for (const f of FAMILIES8.values()) for (const pr of f.presets) {
    for (const use of pr[5].split(',').filter(Boolean)) {
      const [space, section] = use.split('/');
      const secs = by.get(space) ?? new Map<string, Array<[Fam8, Preset8]>>();
      by.set(space, secs);
      const list = secs.get(section) ?? [];
      secs.set(section, list);
      list.push([f, pr]);
    }
  }
  return new Map([...by].map(([space, secs]) => [space, [...secs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]));
})();

/** Whether a family of version 8 keeps «Bucle perfecto» (its frozen word, not the live registry's; undefined if unknown). */
export const familyLoops8 = (id: string): boolean | undefined => FAMILIES8.get(id)?.loop;

/** What the lead family of a version-8 roll asks of the rest of the roll (settleFamily8). */
export interface Lead8 { colour: number; reads: boolean; size: number | null }

/**
 * Makes a family the lead layer of a version-8 roll: a section of the space, then one of its presets. A preset
 * that shows the layer under it brings that layer; otherwise a light second layer of the roll may stay with it,
 * fainter (not over a photo or inside words). Never with a composed scene. Returns what the family asks of the
 * rest of the roll when it did, else null.
 */
export function families8(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene: boolean): Lead8 | null {
  const chance = FAMILY_CHANCE8[space] ?? 0;
  const sections = SECTIONS8.get(space);
  if (!chance || !sections?.length || scene || A.id === 'escena' || !rng.chance(chance)) return null;
  const [, offered] = rng.pick(sections);
  const [fam, pr] = rng.pick(offered);
  const seed = `azar-${Math.floor(rng.next() * 1e6)}`;
  const lead = layer8(fam, pr, seed);
  const below = pr[8];
  if (below) {
    const [pattern, preset, mix] = below;
    const bf = FAMILIES8.get(pattern), bp = bf && bf.presets.find(p => p[0] === preset);
    const under = bf && bp ? layer8(bf, bp, `${seed}-abajo`) : { ...DEFAULT_LAYER, pattern };
    r.layers = [{ ...under, mix }, lead];
  } else {
    const second = r.layers[1];
    const under = space !== 'tipo' && space !== 'media';
    const keep = under && second && second.on && !FAMILIES8.has(second.pattern) && patternById(second.pattern).cost <= 2 && rng.chance(0.4);
    r.layers = keep ? [lead, { ...second, mix: Math.round(second.mix * 0.6 * 100) / 100 }] : [lead];
  }
  if (!fam.loop) r.motion.loop = 0;
  r.motion.warp = 0;
  return { colour: pr[6], reads: fam.reads, size: pr[7] };
}

/**
 * After the source is chosen: a family that leads keeps its colour (colour families), fills the words (Texto)
 * or lies over the picture (Imagen) in a way that keeps them legible; one that reads them is drawn alone, made
 * of them.
 */
export function settleFamily8(r: Recipe, space: SpaceId, lead: Lead8) {
  if (lead.colour > 0 && space !== 'media') { r.color.mode = 'source'; r.color.vivid = lead.colour; }
  if (space === 'tipo' && r.source === 'text') {
    if (lead.reads) {
      r.media.mix = 1; r.media.blend = 'normal';
      if (lead.size !== null) r.text.size = lead.size;
    } else { r.media.mix = Math.max(r.media.mix, 0.55); r.media.blend = 'multiply'; }
  }
  if (space === 'media') { r.media.mix = lead.reads ? 1 : 0.5; r.media.blend = lead.reads ? 'normal' : 'screen'; }
}

/**
 * Glass in front of the piece now and then (Fondos, Arte, Imagen): rain on the window, fluted glass, or a solid
 * (a ball or a gem of glass) floating near the middle.
 */
export function glass8(r: Recipe, rng: Rng, space: SpaceId) {
  const chance = GLASS_CHANCE8[space] ?? 0;
  if (!chance || !rng.chance(chance)) return;
  const kind = rng.weighted({ lluvia: 4, acanalado: 3, esfera: 1.6, poliedro: 1.4 });
  if (kind === 'lluvia') {
    r.optics = normOptics({ kind, amount: round(rng.range(0.55, 0.85)), scale: round(rng.range(0.8, 1.4)), speed: round(rng.range(0.4, 0.8)), profile: round(rng.range(0.3, 0.7)), shine: round(rng.range(0.4, 0.7)), fog: round(rng.range(0.3, 0.6)) });
  } else if (kind === 'acanalado') {
    r.optics = normOptics({ kind, amount: round(rng.range(0.6, 0.95)), scale: round(rng.range(0.7, 1.5)), speed: round(rng.range(0.15, 0.45)), profile: Math.floor(rng.range(0, 5)), shine: round(rng.range(0.3, 0.6)), angle: rng.chance(0.25) ? 90 : 0 });
  } else {
    const gem = kind === 'poliedro';
    r.optics = normOptics({
      kind, amount: 1,
      scale: round(rng.range(0.9, 1.35)),
      speed: round(rng.range(0.3, 0.8)),
      angle: gem ? Math.round(rng.range(-30, 30)) : 0,
      profile: gem ? Math.floor(rng.range(0, POLY_SHAPES.length)) : 0,
      shine: round(rng.range(0.6, 0.9)),
      fog: gem ? round(rng.range(0, 0.3)) : 0,
      x: round(rng.range(-0.25, 0.25)), y: round(rng.range(-0.1, 0.1)),
      ior: round(gem ? rng.range(1.45, 1.8) : rng.range(1.35, 1.6)),
      thick: gem ? 1 : round(rng.range(0.6, 1)),
      disp: round(rng.range(gem ? 0.2 : 0.1, gem ? 0.9 : 0.5)),
      tint: '#ffffff',
    });
  }
}

/**
 * The shape of an effect now and then: a glow the roll already has becomes an anamorphic flare; a grain on a
 * light palette becomes a still sheet of paper, sometimes folded. Never in a terminal.
 */
export function acabado8(r: Recipe, rng: Rng, space: SpaceId, light: boolean) {
  const flare = r.fx.bloom >= 0.25 && rng.chance(FLARE_CHANCE8[space] ?? 0);
  const paper = light && r.fx.grain >= 0.2 && rng.chance(PAPER_CHANCE8[space] ?? 0);
  const fold = paper && rng.chance(0.5) ? rng.pick(FOLD_KINDS) : undefined;
  r.fxKind = normFxKind({ ...(flare ? { bloom: 'anamorfico' } : {}), ...(paper ? { grain: 'papel', fold } : {}) });
  if (!r.fxKind) delete r.fxKind;
}

/** A family layer exactly as version 8 makes it. */
function layer8(f: Fam8, pr: Preset8, seed: string): Layer {
  const [, scale, speed, v, res] = pr;
  const values = pr.slice(VALUES8) as Array<number | string | boolean>;
  return {
    ...DEFAULT_LAYER,
    pattern: f.id,
    scale, speed,
    fam: { v, seed, ...(res !== null ? { res } : {}), p: Object.fromEntries(f.keys.map((k, i) => [k, values[i]])) },
  };
}
