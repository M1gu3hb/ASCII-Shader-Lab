import { CHARSETS, FONTS, PATTERNS, charsetById, charsetIdOf, fontById, nearestWeight, patternById } from '../engine/catalog';
import { cloneRecipe, defaultRecipe, DEFAULT_LAYER, type Layer, type Recipe, type Xform, type XformKind } from '../engine/recipe';
import { hexToOklch } from '../engine/color';
import { ARCHETYPES, type Archetype } from './archetypes';
import { generate5 } from './gen5';
import { ensureContrast, makePalette, rotateHue, soften, type PaletteStyle } from './palettes';
import { drawXforms, MSG_ANIM_W, TEXT_ANIM_W } from './xforms';
import { Rng, hash53, round } from './prng';
import { copyGroup } from './locks';
import type { LockGroup, SpaceId } from './spaces';
import { ARCHETYPES_V1, SPACE_ARCHS_V1 } from './v1';
import { ARCHETYPES_V2, SPACE_ARCHS_V2 } from './v2';
import { ARCHETYPES_V5, SPACE_ARCHS_V5 } from './v5';
import { TIPO_WORDS_1 } from './words';

export { copyGroup } from './locks';

/**
 * Bump when the generator changes: stored recipes stay exact, only seeds re-roll differently. The previous
 * versions stay reachable (a seed plus its version always gives the same piece): see GEN_VERSIONS.
 *   1 — the first dice (12 styles, 3 solids).
 *   2 — 13 solids spread over the styles, «Grabado 3D», flatter weights; 3D objects only as the lead
 *       layer, framed, and not under a photo or inside letters (unless the chosen style has nothing else).
 *   3 — the same pieces as 2 (same seed, same streams), plus: transformations of the photo or the letters
 *       (Imagen, sometimes Tipo), letters that move (Tipo) and animated messages (Tipo, Terminal).
 *   4 — the same pieces as 3; only the brand word a «words» fill may pick is the new name (GLYPHOS),
 *       so a seed noted with version 3 still gives «MONOTRAMA ·» there.
 *   5 — new pieces (gen5.ts): the pattern library (fields, solids, particle motions, character sets, letter
 *       animations), nineteen styles (v5.ts: Partículas, Curvas, Calma, Cartel and Escenas are new), palettes
 *       that keep their colour (palettes5.ts: the gallery's forty by mood, vivid, duotone, poster, pastel, greys
 *       with an accent…), pieces that start from a composed scene, and words without the old name.
 *   6 — version 5's pieces from their own streams, plus visual families (src/families) as the lead layer now
 *       and then in Arte, Fondos and Terminal, with one of their presets (families6.ts).
 */
export const GEN_VERSION = 6;
/** Every version generate() can still reproduce, oldest first. */
export const GEN_VERSIONS: readonly number[] = [1, 2, 3, 4, 5, 6];
/** A version asked for by a link or a person: a known one, else the current one. */
export const genOf = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && GEN_VERSIONS.includes(n) ? n : GEN_VERSION;
};

export interface GenInput {
  seed: string;
  space: SpaceId;
  /** force an archetype, otherwise it is drawn from the space's weights */
  arch?: string;
  base: Recipe;
  locks?: LockGroup[];
  /** generator version (default GEN_VERSION); unknown versions weave with the current one */
  gen?: number;
  /**
   * Texto, version 5: whether the base's text is the person's own words, which a roll keeps (a word the studio
   * wrote changes). The studio knows (studio/ownWords.ts: what the person typed, its recipes' words); left out,
   * any text but the studio's own words (STUDIO_WORDS) counts as theirs. Versions 1–4 ignore it.
   */
  ownText?: boolean;
}

/** What one generator version reads: its styles and each space's weights over them. */
export interface Tables { archs: readonly Archetype[]; spaces: Record<string, Record<string, number>> }
const TABLES: Record<number, Tables> = {
  1: { archs: ARCHETYPES_V1, spaces: SPACE_ARCHS_V1 },
  2: { archs: ARCHETYPES_V2, spaces: SPACE_ARCHS_V2 },
  3: { archs: ARCHETYPES_V2, spaces: SPACE_ARCHS_V2 },
  4: { archs: ARCHETYPES_V2, spaces: SPACE_ARCHS_V2 },
  5: { archs: ARCHETYPES_V5, spaces: SPACE_ARCHS_V5 },
  6: { archs: ARCHETYPES_V5, spaces: SPACE_ARCHS_V5 },
};

const TERMINAL_LINES = ['> hola, terminal', '$ ./tejer --luz', 'CONECTANDO...', '> sistema listo', 'SEÑAL RECIBIDA', 'ERROR 404: sueño no encontrado', '$ sudo apt install calma', '> compilando estrellas'];
const WORD_FILLS = ['TEJE LUZ CON CARACTERES · ', 'MONOTRAMA · ', '0101 SEÑAL 1010 · ', 'EL RUIDO TAMBIÉN ES UN MENSAJE · ', 'HOLA MUNDO ', 'ASCII ASCII ASCII ', '* * * ', 'LOREM IPSUM DOLOR SIT AMET · '];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Styles a generator can actually repeat; its historical tables stay unchanged. */
export const archesForGen = (gen: number) => TABLES[genOf(gen)].archs;

export function pickArch(rng: Rng, space: SpaceId, T: Tables, forced?: string): Archetype {
  const byId = (id?: string) => T.archs.find(a => a.id === id);
  const f = byId(forced);
  if (f) return f;
  const id = rng.weighted(T.spaces[space] ?? T.spaces.arte);
  return byId(id) ?? T.archs[0];
}

export function generate(inp: GenInput): Recipe {
  const gen = genOf(inp.gen ?? GEN_VERSION);
  const T = TABLES[gen];
  if (gen >= 5) return generate5(inp, T, gen);
  // version 3 adds to version 2's pieces: it weaves from the same streams (a seed noted with version 2
  // gives the same piece, now and then with a transformation or letters that move)
  const root = new Rng(`mt${gen >= 3 ? 2 : gen}|${inp.space}|${inp.arch ?? '*'}|${inp.seed}`);
  const A = pickArch(root.fork('arch'), inp.space, T, inp.arch);
  const base = inp.base;
  const r = defaultRecipe();
  // versions 1–3 started from the default text of their time: seeds noted with them weave the same recipe
  if (gen <= 3) r.text.content = 'MONOTRAMA';
  const light = genColor(r, root.fork('color'), A, inp.space);
  genForma(r, root.fork('forma'), A, inp.space, gen);
  genGlifos(r, root.fork('glifos'), A, inp.space, light, gen);
  genMovimiento(r, root.fork('movimiento'), A, inp.space);
  genEfectos(r, root.fork('efectos'), A, inp.space, light);
  genFuente(r, root.fork('fuente'), A, inp.space, base);
  if (gen >= 3) genCreative(r, root.fork('creativo'), A, inp.space, base);
  for (const g of inp.locks ?? []) copyGroup(r, base, g);
  r.meta = { seed: inp.seed, arch: A.id, space: inp.space, gen };
  return r;
}

/* ------------------------------------------------------------------ */

const isSolid = (id: string) => patternById(id).family === 'solidos';
/** The 3D objects that also work as a quiet web background (they fill the frame or sit low in it). */
const BACKDROP_SOLIDS = new Set(['voxeles', 'planeta']);
/** A pattern pool without the 3D objects, but `keep` (falls back to the whole pool if nothing else is in it). */
function flat(w: Partial<Record<string, number>>, keep?: Set<string>): Partial<Record<string, number>> {
  const out = Object.fromEntries(Object.entries(w).filter(([id]) => !isSolid(id) || keep?.has(id)));
  return Object.keys(out).length ? out : w;
}

function genForma(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, gen: number) {
  let n = rng.int(A.layers[0], A.layers[1]);
  if (space === 'fondos' || space === 'terminal') n = Math.min(n, 2);
  const layers: Layer[] = [];
  let cost = 0;
  // v2: a 3D object is the subject of a piece: never stamped as a second layer, not under a photo or inside
  // letters, and behind web content only when it can stay quiet (a style made only of objects keeps them)
  const v2 = gen >= 2;
  const leadPool = !v2 ? A.patterns
    : space === 'media' || space === 'tipo' ? flat(A.patterns)
    : space === 'fondos' ? flat(A.patterns, BACKDROP_SOLIDS) : A.patterns;
  const rest = v2 ? flat(A.patterns) : A.patterns;
  const first = rng.weighted(leadPool);
  const lead = makeLayer(rng.fork('l0'), first, A, true);
  if (v2 && isSolid(first)) {
    // framed: the object keeps to the canvas; a slight tilt at most
    const sr = rng.fork('solid');
    lead.scale = round(sr.range(0.85, 1.2));
    lead.rot = sr.chance(0.3) ? Math.round(sr.range(-25, 25)) : 0;
  }
  layers.push(lead);
  cost += patternById(first).cost;
  for (let i = 1; i < n; i++) {
    const lr = rng.fork('l' + i);
    let id = lr.weighted(v2 ? flat(A.overlays ?? A.patterns) : A.overlays ?? A.patterns);
    if (id === first && lr.chance(0.6)) id = lr.weighted(rest);
    const c = patternById(id).cost;
    if (cost + c > 5) break;
    cost += c;
    layers.push(makeLayer(lr, id, A, false));
  }
  r.layers = layers;
  r.motion.warp = rng.chance(A.warp[0]) ? round(rng.range(A.warp[1], A.warp[2])) : 0;
  r.motion.warpScale = round(rng.range(0.6, 1.6));
}

function makeLayer(rng: Rng, pattern: string, A: Archetype, first: boolean): Layer {
  return {
    ...DEFAULT_LAYER,
    pattern,
    blend: first ? 'normal' : rng.weighted(A.blends),
    mix: first ? 1 : round(rng.range(0.35, 0.95)),
    scale: round(first ? rng.range(A.scale[0], A.scale[1]) : rng.range(0.5, 1.8)),
    speed: round(first ? rng.range(0.8, 1.2) : rng.range(0.4, 1.6)),
    rot: rng.chance(0.3) ? Math.round(rng.range(0, 360)) : 0,
    x: 0, y: 0,
    a: round(rng.range(0.1, 0.9)),
    b: round(rng.range(0.1, 0.9)),
    invert: !first && rng.chance(0.15),
    phase: round(rng.range(0, 60), 1),
  };
}

function genColor(r: Recipe, rng: Rng, A: Archetype, space: SpaceId): boolean {
  let p = makePalette(rng.weighted(A.palettes) as PaletteStyle, rng.fork('pal'));
  p = ensureContrast(p, p.light ? 3 : 3.5);
  if (space === 'fondos') p = soften(p, round(rng.range(0.15, 0.45)));
  r.color.stops = p.stops;
  r.color.bg = p.bg;
  r.color.map = rng.weighted(A.colorMap);
  r.color.mode = space === 'media' && rng.chance(0.5) ? 'source' : 'ramp';
  r.color.shade = A.shade ? round(rng.range(A.shade[0], A.shade[1])) : rng.chance(0.3) ? round(rng.range(0.2, 0.7)) : 0;
  r.color.cycle = A.cycle && rng.chance(A.cycle[0]) ? round(rng.range(A.cycle[1], A.cycle[2]), 3) : 0;
  r.color.sat = rng.chance(0.15) ? round(rng.range(0.6, 1.3)) : 1;
  r.color.vivid = round(rng.range(0.3, 0.8));
  r.color.hue = 0;
  r.color.shift = 0;
  return p.light;
}

function genGlifos(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, light: boolean, gen: number) {
  const g = r.glyph;
  let csId = rng.weighted(A.charsets);
  if (space === 'terminal' && !charsetById(csId)?.ascii) csId = rng.pick(['clasico', 'detallado', 'simbolos', 'binario', 'letras', 'hex']);
  g.charset = charsetById(csId)?.chars ?? CHARSETS[0].chars;
  let fontId = rng.weighted(A.fonts);
  if (!FONTS.some(f => f.id === fontId)) fontId = 'jetbrains';
  g.font = fontId;
  const w = A.weights ?? [400, 600];
  g.weight = nearestWeight(fontById(fontId), rng.range(w[0], w[1]));
  const cellBoost = space === 'fondos' ? 2 : 0;
  g.cell = Math.round(rng.range(A.cell[0], A.cell[1]) + cellBoost);
  const asp = space === 'terminal' ? [1.8, 2.05] : A.aspect ?? [1.25, 1.6];
  g.aspect = round(rng.range(asp[0], asp[1]));
  g.mode = rng.weighted(A.glyphModes);
  if (space === 'terminal' && g.mode === 'words') g.mode = 'density';
  const words = rng.pick(WORD_FILLS);
  // the brand word follows the name (version 4); the pick, and so the rest of the piece, is the same
  g.words = gen >= 4 && words === 'MONOTRAMA · ' ? 'GLYPHOS · ' : words;
  g.scale = round(rng.range(0.92, 1.08));
  g.edge = A.edge && rng.chance(A.edge[0]) ? round(rng.range(A.edge[1], A.edge[2])) : 0;
  g.dither = A.dither && rng.chance(A.dither[0]) ? round(rng.range(A.dither[1], A.dither[2])) : 0;
  g.ditherKind = rng.chance(0.7) ? 'bayer' : 'noise';
  g.jitter = round(rng.range(0.2, 0.8));
  g.sort = true;
  const t = r.tone;
  t.contrast = round(rng.range(A.contrast[0], A.contrast[1]));
  t.gamma = round(rng.range(0.85, 1.2));
  t.bright = round(rng.range(-0.05, 0.05));
  t.levels = A.levels && rng.chance(A.levels[0]) ? Math.round(rng.range(A.levels[1], A.levels[2])) : 0;
  t.invert = !light && rng.chance(0.06);
}

function genMovimiento(r: Recipe, rng: Rng, A: Archetype, space: SpaceId) {
  const m = r.motion;
  m.speed = round(rng.range(A.speed[0], A.speed[1]) * (space === 'fondos' ? 0.7 : 1));
  m.hold = A.hold && rng.chance(A.hold[0]) ? Math.round(rng.range(A.hold[1], A.hold[2])) : 0;
  m.pulse = A.pulse && rng.chance(A.pulse[0]) ? round(rng.range(A.pulse[1], A.pulse[2])) : 0;
  m.bpm = rng.pick([72, 90, 100, 110, 120, 128]);
  m.loop = 0;
  const it = r.interact;
  it.mode = rng.weighted(A.interact);
  it.strength = round(rng.range(0.3, 0.8));
  it.radius = round(rng.range(0.1, 0.28));
  it.auto = false;
}

function genEfectos(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, light: boolean) {
  const fx = r.fx;
  for (const k of Object.keys(fx) as Array<keyof Recipe['fx']>) {
    const spec = A.fx[k];
    fx[k] = spec && rng.fork(k).chance(spec[0]) ? round(rng.fork(k + 'v').range(spec[1], spec[2])) : 0;
  }
  if (light) { fx.glow = 0; fx.bloom = 0; }
  if (space === 'fondos') { fx.chroma = 0; fx.flicker = 0; fx.curve = 0; fx.scan *= 0.5; fx.bloom *= 0.6; }
}

function genFuente(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, base: Recipe) {
  r.source = 'pattern';
  r.msg = { ...r.msg, on: false };
  if (space === 'media') {
    r.source = ['image', 'video', 'camera'].includes(base.source) ? base.source : 'image';
    r.media = { ...base.media };
    r.media.mix = rng.chance(0.45) ? round(rng.range(0.25, 0.7)) : 0;
    r.media.blend = rng.weighted({ multiply: 2, overlay: 1, screen: 1, difference: 0.6 });
    r.media.reveal = 0;
    if (r.glyph.cell > 12) r.glyph.cell = Math.round(rng.range(6, 11));
  } else if (space === 'tipo') {
    r.source = 'text';
    const keep = base.source === 'text' && base.text.content.trim() && base.text.content !== defaultRecipe().text.content;
    r.text.content = keep ? base.text.content : rng.pick(TIPO_WORDS_1);
    const f = rng.weighted({ martian: 2, serif: 1.5, sans: 1.5, pixel: 0.7, vt: 0.7, space: 1, jetbrains: 0.8 });
    r.text.font = f;
    r.text.weight = f === 'martian' || f === 'sans' ? rng.pick([700, 800, 900]) : nearestWeight(fontById(f), 700);
    r.text.italic = f === 'serif' ? rng.chance(0.5) : false;
    r.text.tracking = round(rng.range(-0.04, 0.12));
    r.text.size = round(rng.range(0.78, 1.02));
    r.text.leading = 1;
    r.text.align = 'center';
    r.text.morph = rng.chance(0.2) ? Math.round(rng.range(6, 14)) : 0;
    r.media.mix = rng.chance(0.75) ? round(rng.range(0.5, 1)) : 0;
    r.media.blend = rng.weighted({ multiply: 3, overlay: 1, screen: 1, mask: 1 });
    if (r.glyph.cell > 14) r.glyph.cell = Math.round(rng.range(7, 12));
    if (rng.chance(0.25)) r.msg = { ...r.msg, on: true, text: rng.pick(['teje luz con caracteres', 'hola, mundo', 'escribe aquí tu mensaje']), mode: rng.pick(['type', 'decode']), y: 0.85, box: 0.8 };
  } else if (space === 'terminal') {
    if (rng.chance(0.4)) r.msg = { ...r.msg, on: true, text: rng.pick(TERMINAL_LINES), mode: rng.pick(['type', 'type', 'decode']), x: 0.08, y: 0.85, align: 'left', box: 0.9 };
  }
  void A;
}

/* ------------------------------------------------------------------ */
/* Version 3: transformations and letters that move                     */
/* ------------------------------------------------------------------ */

/**
 * One to three transformations drawn like the dice draw them, for «Otra combinación» (the style: the piece's,
 * or any). `moving`: the source moves (video, camera, letters that move), so Estela may come up.
 */
export function randomXforms(seed: string, arch: string | undefined, moving: boolean, pool?: XformKind[]): Xform[] {
  const rng = new Rng('xf|' + seed);
  const A = ARCHETYPES.find(a => a.id === arch) ?? rng.pick(ARCHETYPES);
  return drawXforms(rng, A, Number(rng.weighted({ 1: 3, 2: 4, 3: 1.5 })), moving, pool);
}

function genCreative(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, base: Recipe) {
  if (space === 'media' && rng.chance(0.6)) {
    const moving = r.source === 'video' || r.source === 'camera';
    r.media.xform = drawXforms(rng.fork('xf'), A, rng.chance(0.3) ? 2 : 1, moving);
  } else if (space === 'tipo') {
    const lr = rng.fork('letras');
    if (r.source === 'text' && lr.chance(0.5)) {
      r.text.anim = { kind: lr.weighted(TEXT_ANIM_W), amount: round(lr.range(0.4, 0.9)), speed: round(lr.range(0.7, 1.3)) };
    }
    if (r.source === 'text' && rng.chance(0.25)) {
      r.media.xform = drawXforms(rng.fork('xf'), A, 1, !!r.text.anim, ['semitono', 'contorno', 'caleido', 'desplazar', 'arrastre', 'ondular', 'bandas', 'canales', 'estela']);
    }
  }
  if (r.msg.on && (space === 'tipo' || space === 'terminal')) {
    const mr = rng.fork('mensaje');
    if (mr.chance(0.4)) r.msg.anim = { kind: mr.weighted(MSG_ANIM_W), amount: round(mr.range(0.5, 1)), speed: round(mr.range(0.7, 1.3)) };
    if (r.msg.mode === 'type' && mr.chance(0.2)) r.msg.mode = 'words';
  }
  void base;
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Mutation                                                            */
/* ------------------------------------------------------------------ */

/** Patterns a variation may put on a layer above the first (no 3D object stamped over a piece). */
const OVERLAY_POOL = PATTERNS.filter(p => p.family !== 'solidos');

export function mutate(r: Recipe, amount: number, seed: string, locks: LockGroup[] = []): Recipe {
  const rng = new Rng(`mut${GEN_VERSION}|${seed}`);
  const k = clamp(amount, 0.02, 1);
  const out = cloneRecipe(r);
  const L = new Set(locks);
  const j = (v: number, min: number, max: number, s = 1) => round(clamp(v + rng.gauss(0, (max - min) * 0.13 * k * s), min, max));

  if (!L.has('forma')) {
    out.layers = out.layers.map((l, i) => {
      const n = { ...l, scale: j(l.scale, 0.3, 3), a: j(l.a, 0, 1, 1.5), b: j(l.b, 0, 1, 1.5), speed: j(l.speed, 0.1, 2.5) };
      if (i > 0) n.mix = j(l.mix, 0.15, 1);
      if (l.rot !== 0 || rng.chance(k * 0.2)) n.rot = Math.round(j(l.rot, 0, 360, 1.5));
      if (rng.chance(k * 0.3)) {
        const fam = patternById(l.pattern).family;
        const pool = PATTERNS.filter(p => p.family === fam && p.id !== l.pattern);
        n.pattern = (rng.chance(0.65) && pool.length ? rng.pick(pool) : rng.pick(i === 0 ? PATTERNS : OVERLAY_POOL)).id;
      }
      if (i > 0 && rng.chance(k * 0.25)) n.blend = rng.pick(['multiply', 'screen', 'overlay', 'difference', 'add', 'lighten', 'mask'] as const);
      return n;
    });
    if (out.layers.length < 3 && rng.chance(k * 0.18)) {
      out.layers.push({ ...DEFAULT_LAYER, pattern: rng.pick(OVERLAY_POOL).id, blend: rng.pick(['multiply', 'screen', 'overlay'] as const), mix: round(rng.range(0.3, 0.7)), scale: round(rng.range(0.6, 1.6)), phase: round(rng.range(0, 50)) });
    } else if (out.layers.length > 1 && rng.chance(k * 0.12)) {
      out.layers.splice(1 + rng.int(0, out.layers.length - 2), 1);
    }
    if (out.motion.warp > 0 || rng.chance(k * 0.2)) out.motion.warp = j(out.motion.warp, 0, 1.2);
  }
  if (!L.has('color')) {
    if (rng.chance(0.35 + k * 0.4)) {
      const rot = rotateHue(out.color.stops, out.color.bg, rng.gauss(0, 55 * k));
      out.color.stops = rot.stops; out.color.bg = rot.bg;
    }
    if (rng.chance(k * 0.15)) out.color.map = rng.pick(['luma', 'luma', 'x', 'y', 'radial', 'noise'] as const);
    out.color.shade = j(out.color.shade, 0, 1);
    if (out.color.cycle !== 0) out.color.cycle = round(j(out.color.cycle, -0.2, 0.2), 3);
  }
  if (!L.has('glifos')) {
    out.glyph.cell = Math.round(j(out.glyph.cell, 4, 40, 0.8));
    if (rng.chance(k * 0.25)) {
      const cur = charsetIdOf(out.glyph.charset);
      const pool = CHARSETS.filter(c => c.id !== cur);
      out.glyph.charset = rng.pick(pool).chars;
    }
    if (rng.chance(k * 0.08)) out.glyph.mode = rng.pick(['density', 'density', 'lines', 'scramble'] as const);
    out.tone.contrast = j(out.tone.contrast, 0.6, 2.2);
    out.tone.gamma = j(out.tone.gamma, 0.5, 1.8);
    if (out.glyph.edge > 0) out.glyph.edge = j(out.glyph.edge, 0, 1);
  }
  if (!L.has('movimiento')) {
    out.motion.speed = j(out.motion.speed, 0.1, 2.5);
    if (rng.chance(k * 0.2)) out.interact.mode = rng.pick(['light', 'ripple', 'lens', 'repel', 'swirl', 'scramble'] as const);
  }
  if (!L.has('efectos')) {
    for (const key of Object.keys(out.fx) as Array<keyof Recipe['fx']>) {
      if (out.fx[key] > 0) out.fx[key] = j(out.fx[key], 0, 1.2);
    }
  }
  if (!L.has('fuente')) {
    // (a stream of its own: the draws above stay what they were for pieces without these)
    const xr = rng.fork('fuente');
    for (const x of out.media.xform ?? []) { x.amount = round(clamp(x.amount + xr.gauss(0, 0.12 * k), 0.05, 1)); x.p = round(clamp(x.p + xr.gauss(0, 0.12 * k), 0, 1)); }
    for (const a of [out.text.anim, out.msg.anim]) if (a) a.amount = round(clamp(a.amount + xr.gauss(0, 0.12 * k), 0.1, 1));
  }
  out.meta = { ...r.meta, name: undefined };
  return out;
}

/* ------------------------------------------------------------------ */
/* Fingerprints: two recipes that look alike share a fingerprint.      */
/* ------------------------------------------------------------------ */

export function fingerprint(r: Recipe): string {
  const q = (v: number, s: number) => Math.round(v / s);
  const colour = (hex: string) => { const [L, C, h] = hexToOklch(hex); return C < 0.03 ? `n${q(L, 0.2)}` : `${q(h, 30) % 12}.${q(L, 0.25)}`; };
  const parts = [
    r.source,
    r.layers.filter(l => l.on).map(l => `${l.pattern}:${l.blend}:${q(l.a, 0.34)}${q(l.b, 0.34)}:${q(Math.log2(l.scale), 0.5)}`).join('+'),
    charsetIdOf(r.glyph.charset), r.glyph.font, r.glyph.mode, q(r.glyph.cell, 3), q(r.glyph.aspect, 0.3),
    r.color.stops.map(colour).join('/'), colour(r.color.bg), r.color.map, r.color.mode,
    Object.entries(r.fx).filter(([, v]) => v > 0.2).map(([k]) => k).join(','),
    r.interact.mode, r.motion.hold > 0 ? 'h' : '', r.msg.on ? 'm' : '', r.tone.levels > 0 ? 'L' : '', r.glyph.edge > 0.2 ? 'e' : '',
  ];
  // a different local image or video makes a different piece (appended only then: other fingerprints stay as they were)
  if ((r.source === 'image' || r.source === 'video') && r.media.ref?.id) parts.push(r.media.ref.id);
  // transformations and letters that move change a piece as much as its effects (appended only when used)
  const xf = r.source !== 'pattern' ? (r.media.xform ?? []).filter(x => x.on && x.amount > 0) : [];
  if (xf.length) parts.push('x:' + xf.map(x => `${x.kind}${q(x.p, 0.34)}`).join('+'));
  if (r.source === 'text' && r.text.anim) parts.push('t:' + r.text.anim.kind);
  if (r.msg.on && (r.msg.anim || r.msg.mode === 'words')) parts.push('m:' + (r.msg.anim?.kind ?? '') + r.msg.mode);
  return hash53(parts.join('|')).toString(36);
}
