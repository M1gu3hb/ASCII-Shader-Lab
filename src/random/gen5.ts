import { CHARSETS, FONTS, charsetById, fontById, nearestWeight, patternById, PATTERNS } from '../engine/catalog';
import { defaultRecipe, DEFAULT_LAYER, syncVersion, type Layer, type LetterAnimKind, type Recipe } from '../engine/recipe';
import { familyById } from '../families/registry';
import { families6 } from './families6';
import type { Archetype } from './archetypes';
import type { GenInput, Tables } from './generator';
import { LIBRARY_MSG_ANIMS, LIBRARY_TEXT_ANIMS } from './library';
import { expose5, sparse5 } from './exposure5';
import { copyGroup } from './locks';
import { galleryPalette } from './palette-gallery';
import { makePalette, type Palette, type PaletteStyle } from './palettes';
import { demud, makePalette5, PALETTE5_NAMES, soften5, tune5, type Palette5Style } from './palettes5';
import { Rng, round } from './prng';
import { sceneSeedsFor, type SceneSeed } from './scenes5';
import type { SpaceId } from './spaces';
import { drawXforms, MSG_ANIM_W, TEXT_ANIM_W } from './xforms';
import { isStudioWord, TIPO_WORDS_5 } from './words';

/*
 * Generator version 5. Same shape as versions 2–4 (one stream per group of decisions, so a lock changes only
 * its group), with its own styles (v5.ts), palettes (palettes5.ts), the pattern library (fields, solids,
 * particle motions, character sets, letter animations) and pieces that start from a composed scene (scenes5.ts).
 * Words: the brand word is GLYPHOS (no «MONOTRAMA» nor «SEÑAL»), and a word the studio wrote for Texto (the
 * dice's of any version, a recipe's, the brand's names) changes with the next roll while a word the person
 * wrote stays (words.ts, GenInput.ownText).
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const isSolid = (id: string) => patternById(id).family === 'solidos';
const isParticles = (id: string) => patternById(id).family === 'particulas';
const BACKDROP_SOLIDS = new Set(['voxeles', 'planeta']);
const PARTICLES = PATTERNS.filter(p => p.family === 'particulas').map(p => p.id);
/**
 * Character sets with enough ink in their middle glyphs: a sparse lead (particles, curves, a 3D object) drawn with
 * a long, thin ramp is a few hairlines in the dark.
 */
const BOLD_CS: Record<string, number> = { clasico: 1.2, puntos: 1, bloques: 0.8, medios: 0.8, simbolos: 0.8, barras_ascii: 0.8, estrellas: 0.6, geometria: 0.6, marcos: 0.6, cajas: 0.5 };
/** Character sets with little ink even in their densest glyph. */
const THIN_CS = new Set(['minimo', 'sismografo', 'tejido_fino', 'lineas', 'media_luna', 'puntuacion']);
/** Character sets a terminal can print (ASCII only), and how often the dice use each there. */
const ASCII_CS: Record<string, number> = { clasico: 1.4, detallado: 1.4, simbolos: 1, binario: 0.8, letras: 0.8, hex: 0.8, barras_ascii: 1, terminal_densa: 1, puntuacion: 0.9, numeros: 0.7 };

export { TIPO_WORDS_5 };
export const WORD_FILLS_5 = ['TEJE LUZ CON CARACTERES · ', 'GLYPHOS · ', '0101 GLYPHOS 1010 · ', 'EL RUIDO TAMBIÉN ES UN MENSAJE · ', 'HOLA MUNDO ', 'ASCII ASCII ASCII ', '* * * ', 'LUZ · SOMBRA · ', 'ONDA ONDA ', 'LOREM IPSUM DOLOR SIT AMET · '];
export const TERMINAL_LINES_5 = ['> hola, terminal', '$ ./tejer --luz', 'CONECTANDO...', '> sistema listo', 'MENSAJE RECIBIDO', 'ERROR 404: sueño no encontrado', '$ sudo apt install calma', '> compilando estrellas', '$ glyphos --tirar', '> buscando constelaciones...'];
const TIPO_MESSAGES_5 = ['teje luz con caracteres', 'hola, mundo', 'escribe aquí tu mensaje', 'algo está a punto de aparecer', 'una postal de movimiento'];
const TEXT_ANIM_W5: Partial<Record<LetterAnimKind, number>> = { ...TEXT_ANIM_W, ...LIBRARY_TEXT_ANIMS };
const MSG_ANIM_W5: Partial<Record<LetterAnimKind, number>> = { ...MSG_ANIM_W, ...LIBRARY_MSG_ANIMS };

/** The word the dice give a seed in Texto (its own stream: it can be told apart from a word the person wrote). */
export const diceWord5 = (seed: string) => new Rng('palabra5|' + seed).pick(TIPO_WORDS_5);

const isV5Palette = (s: string): s is Palette5Style => s in PALETTE5_NAMES;

function pickArch(rng: Rng, space: SpaceId, T: Tables, forced?: string): Archetype {
  const byId = (id?: string) => T.archs.find(a => a.id === id);
  return byId(forced) ?? byId(rng.weighted(T.spaces[space] ?? T.spaces.arte)) ?? T.archs[0];
}

export function generate5(inp: GenInput, T: Tables, gen: number): Recipe {
  const root = new Rng(`mt${gen}|${inp.space}|${inp.arch ?? '*'}|${inp.seed}`);
  const A = pickArch(root.fork('arch'), inp.space, T, inp.arch);
  // «Escenas» starts from one of the studio's composed scenes of this space (every group reads the same one)
  const scene = A.id === 'escena' ? root.fork('escena').pick(sceneSeedsFor(inp.space)) : undefined;
  const r = defaultRecipe();
  const light = color5(r, root.fork('color'), A, inp.space, scene);
  forma5(r, root.fork('forma'), A, inp.space, scene);
  // version 6: sometimes a visual family leads (its own stream: version 5 never reads it)
  const family = gen >= 6 && families6(r, root.fork('familia'), A, inp.space, !!scene);
  glifos5(r, root.fork('glifos'), A, inp.space, light, scene);
  movimiento5(r, root.fork('movimiento'), A, inp.space, scene);
  efectos5(r, root.fork('efectos'), A, inp.space, light, scene);
  fuente5(r, root.fork('fuente'), inp.space, inp.base, inp.seed, inp.ownText);
  creative5(r, root.fork('creativo'), A, inp.space);
  for (const g of inp.locks ?? []) copyGroup(r, inp.base, g);
  // exposed for the lead that stays (after the locks: a locked «Forma» brings the base's), unless the tone is locked
  // (Texto: only when the pattern fills the letters; lifting a pattern around them would drown the word)
  const aroundWord = r.source === 'text' && r.media.mix > 0 && r.media.blend === 'screen';
  // (a family lead keeps its own tonal range: version 5's exposure table knows only the catalogue's patterns)
  const familyLead = family && !inp.locks?.includes('forma');
  if (inp.space !== 'media' && !aroundWord && !inp.locks?.includes('glifos') && !familyLead) expose5(r, inp.space === 'fondos');
  // a family with memory has no perfect loop: unless the motion is locked, the roll does not ask for one
  if (gen >= 6 && !inp.locks?.includes('movimiento') && r.layers.some(l => l.on && l.fam && !familyById(l.pattern)?.caps.loop)) r.motion.loop = 0;
  syncVersion(r);
  r.meta = { seed: inp.seed, arch: A.id, space: inp.space, gen };
  return r;
}

/* ------------------------------------------------------------------ */

function palette5(rng: Rng, A: Archetype, scene?: SceneSeed): Palette {
  if (scene) {
    // half the time the scene's own palette, else another of its mood
    const own = rng.chance(0.5) ? galleryPalette(scene.palette) : undefined;
    if (own) return demud({ name: own.name, stops: own.stops.slice(), bg: own.bg, light: own.light });
    return makePalette5(`g-${scene.mood}` as Palette5Style, rng.fork('pal'));
  }
  const style = rng.weighted(A.palettes);
  // (every palette the dice use keeps out of the mud, those of versions 1–4 too: demud)
  return isV5Palette(style) ? makePalette5(style, rng.fork('pal')) : demud(makePalette(style as PaletteStyle, rng.fork('pal')));
}

function color5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene?: SceneSeed): boolean {
  let p = tune5(palette5(rng, A, scene));
  // a web background sits a little quieter, but keeps its colour
  if (space === 'fondos') p = soften5(p, round(rng.range(0.08, 0.3)));
  r.color.stops = p.stops;
  r.color.bg = p.bg;
  r.color.map = rng.weighted(A.colorMap);
  r.color.mode = space === 'media' && rng.chance(0.4) ? 'source' : 'ramp';
  r.color.shade = A.shade ? round(rng.range(A.shade[0], A.shade[1])) : rng.chance(0.12) ? round(rng.range(0.1, 0.4)) : 0;
  r.color.cycle = A.cycle && rng.chance(A.cycle[0]) ? round(rng.range(A.cycle[1], A.cycle[2]), 3) : 0;
  r.color.sat = rng.chance(0.2) ? round(rng.range(1.05, 1.25)) : 1;
  r.color.vivid = round(rng.range(0.4, 0.85));
  r.color.hue = 0;
  r.color.shift = 0;
  return p.light;
}

/* ------------------------------------------------------------------ */

function flat(w: Partial<Record<string, number>>, keep?: Set<string>, noParticles = false): Partial<Record<string, number>> {
  const out = Object.fromEntries(Object.entries(w).filter(([id]) => (!isSolid(id) || keep?.has(id)) && !(noParticles && isParticles(id))));
  return Object.keys(out).length ? out : w;
}

function layer5(rng: Rng, pattern: string, A: Archetype, first: boolean): Layer {
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

/** A scene's layer, varied a little (its knobs, size, speed and moment), sometimes another particle motion. */
function sceneLayer(rng: Rng, l: SceneSeed['layers'][number], i: number): Layer {
  let pattern = l.pattern;
  if (i > 0 && isParticles(pattern) && rng.chance(0.35)) pattern = rng.pick(PARTICLES.filter(p => p !== l.pattern));
  const j = (v: number | undefined, d: number, s: number) => round(clamp((v ?? d) + rng.range(-s, s), 0.05, 0.95));
  return {
    ...DEFAULT_LAYER,
    pattern,
    blend: i === 0 ? 'normal' : l.blend ?? 'screen',
    mix: round(clamp((l.mix ?? 1) * rng.range(0.85, 1.1), 0.2, 1)),
    scale: round((l.scale ?? 1) * rng.range(0.85, 1.2)),
    speed: round((l.speed ?? 1) * rng.range(0.8, 1.25)),
    a: j(l.a, 0.5, 0.15),
    b: j(l.b, 0.5, 0.15),
    phase: round(rng.range(0, 60), 1),
  };
}

function forma5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene?: SceneSeed) {
  r.motion.warpScale = round(rng.range(0.6, 1.6));
  if (scene) {
    r.layers = scene.layers.map((l, i) => sceneLayer(rng.fork('l' + i), l, i));
    r.motion.warp = rng.chance(A.warp[0]) ? round(rng.range(A.warp[1], A.warp[2])) : 0;
    return;
  }
  let n = rng.int(A.layers[0], A.layers[1]);
  if (space === 'fondos' || space === 'terminal') n = Math.min(n, 2);
  // a 3D object is the subject of a piece (never a second layer, not under a photo or in letters); letters are
  // not filled with loose particles (they would not read)
  // (Partículas in Texto: a field fills the letters and the particles move over them, the second layer)
  const tipoParticles = space === 'tipo' && A.id === 'particulas';
  const leadPool = space === 'media' ? flat(A.patterns) : tipoParticles ? flat(A.overlays ?? A.patterns, undefined, true)
    : space === 'tipo' ? flat(A.patterns, undefined, true) : space === 'fondos' ? flat(A.patterns, BACKDROP_SOLIDS) : A.patterns;
  const rest = flat(A.patterns);
  const first = rng.weighted(leadPool);
  const lead = layer5(rng.fork('l0'), first, A, true);
  if (isSolid(first)) {
    const sr = rng.fork('solid');
    lead.scale = round(sr.range(0.85, 1.2));
    lead.rot = sr.chance(0.3) ? Math.round(sr.range(-25, 25)) : 0;
  }
  const layers: Layer[] = [lead];
  let cost = patternById(first).cost;
  const pr = rng.fork('particulas');
  if (!isSolid(first) && !isParticles(first) && (tipoParticles || (space !== 'tipo' && pr.chance(A.particleOverlay ?? 0)))) {
    // a particle motion over the field, as the composed scenes do
    const own: Record<string, number> = Object.fromEntries(Object.entries(A.patterns).filter(([id]) => isParticles(id)).map(([id, v]) => [id, v ?? 0]));
    const id: string = Object.keys(own).length ? pr.weighted(own) : pr.pick(PARTICLES);
    layers.push({ ...layer5(pr.fork('l'), id, A, false), blend: pr.chance(0.75) ? 'screen' : 'add', mix: round(pr.range(0.6, 1)), scale: round(pr.range(0.9, 1.4)), speed: round(pr.range(0.5, 1.1)), invert: false });
    if (layers[0].scale > 1.5) layers[0].scale = 1.5;
  } else {
    for (let i = 1; i < n; i++) {
      const lr = rng.fork('l' + i);
      let id = lr.weighted(flat(A.overlays ?? A.patterns));
      if (id === first && lr.chance(0.6)) id = lr.weighted(rest);
      const c = patternById(id).cost;
      if (cost + c > 5) break;
      cost += c;
      const l = layer5(lr, id, A, false);
      // a mostly empty pattern multiplied over the lead would black it out: it goes on top as light instead
      if ((l.blend === 'multiply' || l.blend === 'darken' || l.blend === 'mask' || l.blend === 'cutout') && sparse5(id) && !l.invert) l.blend = lr.chance(0.6) ? 'screen' : 'lighten';
      // over loose particles, a field is a faint backdrop (it would bury them)
      if (isParticles(first)) { l.mix = round(lr.range(0.2, 0.45)); l.blend = lr.chance(0.7) ? 'screen' : 'lighten'; l.invert = false; }
      layers.push(l);
    }
  }
  r.layers = layers;
  r.motion.warp = rng.chance(A.warp[0]) ? round(rng.range(A.warp[1], A.warp[2])) : 0;
}

/* ------------------------------------------------------------------ */

function glifos5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, light: boolean, scene?: SceneSeed) {
  const g = r.glyph;
  let csId = scene && rng.chance(0.6) ? scene.charset : rng.weighted(A.charsets);
  const sparse = sparse5(r.layers[0]?.pattern ?? '');
  // a thin set (hairlines, dots) on a dark ground is half as bright as the palette promises: bolder, more often than not
  const thin = THIN_CS.has(csId) && !light && space !== 'fondos';
  if ((sparse || thin) && rng.fork('tinta').chance(0.65)) {
    const own = Object.fromEntries(Object.entries(BOLD_CS).filter(([id]) => id in A.charsets));
    csId = rng.fork('tinta').weighted(Object.keys(own).length >= 2 ? own : BOLD_CS);
  }
  if (space === 'terminal' && !charsetById(csId)?.ascii) csId = rng.weighted(ASCII_CS);
  g.charset = charsetById(csId)?.chars ?? CHARSETS[0].chars;
  let fontId = rng.weighted(A.fonts);
  if (!FONTS.some(f => f.id === fontId)) fontId = 'jetbrains';
  g.font = fontId;
  const w = A.weights ?? [400, 600];
  g.weight = nearestWeight(fontById(fontId), sparse ? Math.max(600, rng.range(w[0], w[1])) : rng.range(w[0], w[1]));
  const cellBoost = space === 'fondos' ? 2 : 0;
  g.cell = scene?.cell ? Math.round(scene.cell + rng.range(-1, 1.5) + cellBoost) : Math.round(rng.range(A.cell[0], A.cell[1]) + cellBoost);
  const asp = space === 'terminal' ? [1.8, 2.05] : A.aspect ?? [1.25, 1.6];
  g.aspect = round(rng.range(asp[0], asp[1]));
  g.mode = rng.weighted(A.glyphModes);
  if (space === 'terminal' && g.mode === 'words') g.mode = 'density';
  g.words = rng.pick(WORD_FILLS_5);
  g.scale = round(rng.range(0.92, 1.08));
  g.edge = A.edge && rng.chance(A.edge[0]) ? round(rng.range(A.edge[1], A.edge[2])) : 0;
  g.dither = A.dither && rng.chance(A.dither[0]) ? round(rng.range(A.dither[1], A.dither[2])) : 0;
  g.ditherKind = rng.chance(0.7) ? 'bayer' : 'noise';
  g.jitter = round(rng.range(0.2, 0.8));
  g.sort = true;
  const t = r.tone;
  t.contrast = scene?.contrast ? round(scene.contrast * rng.range(0.95, 1.08)) : round(rng.range(A.contrast[0], A.contrast[1]));
  t.gamma = scene?.gamma ? round(scene.gamma * rng.range(0.95, 1.05)) : round(rng.range(0.8, 1.12));
  t.bright = round(rng.range(-0.03, 0.06));
  t.levels = A.levels && rng.chance(A.levels[0]) ? Math.round(rng.range(A.levels[1], A.levels[2])) : 0;
  t.invert = !light && rng.chance(0.05);
}

function movimiento5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, scene?: SceneSeed) {
  const m = r.motion;
  const base = scene?.speed ? scene.speed * rng.range(0.85, 1.2) : rng.range(A.speed[0], A.speed[1]);
  m.speed = round(base * (space === 'fondos' ? 0.7 : 1));
  m.hold = A.hold && rng.chance(A.hold[0]) ? Math.round(rng.range(A.hold[1], A.hold[2])) : 0;
  m.pulse = A.pulse && rng.chance(A.pulse[0]) ? round(rng.range(A.pulse[1], A.pulse[2])) : 0;
  m.bpm = rng.pick([72, 90, 100, 110, 120, 128]);
  m.loop = 0;
  const it = r.interact;
  it.mode = scene?.interaction && rng.chance(0.7) ? scene.interaction : rng.weighted(A.interact);
  it.strength = round(rng.range(0.3, 0.8));
  it.radius = round(rng.range(0.1, 0.28));
  it.auto = false;
}

function efectos5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId, light: boolean, scene?: SceneSeed) {
  const fx = r.fx;
  for (const k of Object.keys(fx) as Array<keyof Recipe['fx']>) {
    const spec = A.fx[k];
    fx[k] = spec && rng.fork(k).chance(spec[0]) ? round(rng.fork(k + 'v').range(spec[1], spec[2])) : 0;
  }
  if (scene) {
    const s = rng.fork('escena');
    fx.glow = round((scene.glow ?? 0) * s.range(0.8, 1.2));
    fx.bloom = round((scene.bloom ?? 0) * s.range(0.8, 1.2));
    fx.grain = round((scene.grain ?? 0) * s.range(0.8, 1.2));
  }
  if (light) { fx.glow = 0; fx.bloom = 0; }
  if (space === 'fondos') { fx.chroma = 0; fx.flicker = 0; fx.curve = 0; fx.scan *= 0.5; fx.bloom *= 0.6; }
}

function fuente5(r: Recipe, rng: Rng, space: SpaceId, base: Recipe, seed: string, ownText?: boolean) {
  r.source = 'pattern';
  r.msg = { ...r.msg, on: false };
  if (space === 'media') {
    r.source = ['image', 'video', 'camera'].includes(base.source) ? base.source : 'image';
    r.media = { ...base.media };
    r.media.mix = rng.chance(0.45) ? round(rng.range(0.25, 0.7)) : 0;
    r.media.blend = rng.weighted({ multiply: 2, overlay: 1, screen: 1.4, difference: 0.6 });
    r.media.reveal = 0;
    if (r.glyph.cell > 12) r.glyph.cell = Math.round(rng.range(6, 11));
  } else if (space === 'tipo') {
    r.source = 'text';
    // the person's words stay; a word nobody typed (the dice's of any version, a recipe's, the brand's names)
    // changes with the next roll. The studio says which they are; without it, the word itself does
    const own = base.source === 'text' && !!base.text.content.trim() && (ownText ?? !isStudioWord(base.text.content));
    r.text.content = own ? base.text.content : diceWord5(seed);
    const f = rng.weighted({ martian: 2, serif: 1.5, sans: 1.5, pixel: 0.7, vt: 0.7, space: 1, jetbrains: 0.8, silk: 0.5 });
    r.text.font = f;
    r.text.weight = f === 'martian' || f === 'sans' ? rng.pick([700, 800, 900]) : nearestWeight(fontById(f), 700);
    r.text.italic = f === 'serif' ? rng.chance(0.5) : false;
    r.text.tracking = round(rng.range(-0.04, 0.12));
    r.text.size = round(rng.range(0.8, 1.02));
    r.text.leading = 1;
    r.text.align = 'center';
    r.text.morph = rng.chance(0.2) ? Math.round(rng.range(6, 14)) : 0;
    // the word must read: a mostly empty pattern (particles, curves) goes around whole letters (screen) or only
    // dims them a little; a full one fills them, and over the background it stays light
    const sparse = sparse5(r.layers[0]?.pattern ?? '');
    r.media.blend = sparse ? rng.weighted({ screen: 2.5, multiply: 1 }) : rng.weighted({ multiply: 3, overlay: 1, screen: 0.6, mask: 1 });
    const hi = r.media.blend === 'screen' ? (sparse ? 0.6 : 0.4) : sparse ? 0.45 : 1;
    r.media.mix = rng.chance(0.8) ? round(rng.range(r.media.blend === 'screen' ? 0.3 : 0.5, hi)) : 0;
    if (r.glyph.cell > 14) r.glyph.cell = Math.round(rng.range(7, 12));
    if (rng.chance(0.25)) r.msg = { ...r.msg, on: true, text: rng.pick(TIPO_MESSAGES_5), mode: rng.pick(['type', 'decode']), y: 0.85, box: 0.8 };
  } else if (space === 'terminal') {
    if (rng.chance(0.4)) r.msg = { ...r.msg, on: true, text: rng.pick(TERMINAL_LINES_5), mode: rng.pick(['type', 'type', 'decode']), x: 0.08, y: 0.85, align: 'left', box: 0.9 };
  }
}

function creative5(r: Recipe, rng: Rng, A: Archetype, space: SpaceId) {
  if (space === 'media' && rng.chance(0.6)) {
    const moving = r.source === 'video' || r.source === 'camera';
    r.media.xform = drawXforms(rng.fork('xf'), A, rng.chance(0.3) ? 2 : 1, moving);
  } else if (space === 'tipo') {
    const lr = rng.fork('letras');
    if (r.source === 'text' && lr.chance(0.55)) {
      r.text.anim = { kind: lr.weighted(TEXT_ANIM_W5), amount: round(lr.range(0.4, 0.9)), speed: round(lr.range(0.7, 1.3)) };
    }
    if (r.source === 'text' && rng.chance(0.25)) {
      r.media.xform = drawXforms(rng.fork('xf'), A, 1, !!r.text.anim, ['semitono', 'contorno', 'caleido', 'desplazar', 'arrastre', 'ondular', 'bandas', 'canales', 'estela']);
    }
  }
  if (r.msg.on && (space === 'tipo' || space === 'terminal')) {
    const mr = rng.fork('mensaje');
    if (mr.chance(0.45)) r.msg.anim = { kind: mr.weighted(MSG_ANIM_W5), amount: round(mr.range(0.5, 1)), speed: round(mr.range(0.7, 1.3)) };
    if (r.msg.mode === 'type' && mr.chance(0.2)) r.msg.mode = 'words';
  }
}
