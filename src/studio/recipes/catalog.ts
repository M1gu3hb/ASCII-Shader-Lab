import { FAMILY_NAMES, charsetById, charsetIdOf, patternById, type PatternFamily } from '../../engine/catalog';
import type { Recipe } from '../../engine/recipe';
import { PALETTE_MOODS, galleryPalette } from '../../random/palette-gallery';
import { SPACES, spaceById, type SpaceId } from '../../random/spaces';
import { normalizeRecipe } from '../../engine/recipe';
import { PRESETS, keepMedia, keepText } from '../presets';
import { SCENES, makeScene, type SceneSpace, type SceneSpec } from '../scenes';
import { fold } from './search';
import { FAMILIES, familiesGen } from '../../families/registry';
import { familyRecipe } from '../../families/recipes';
import type { FamilyMeta, FamilyPreset } from '../../families/types';
import { usesOf } from '../../families/uses';
import { famReads } from '../../families/params';

/**
 * Every starting point of the lab in one catalogue: the recipes of each space (presets.ts), the composed
 * scenes (scenes.ts) and the presets of the visual families (src/families), each with the section it is listed under in its space, the moods it belongs to, the
 * words it is found by and its own colours (while its picture is on its way). Pure data: the browser
 * (Browser.tsx) shows it, the tests check it.
 *
 * Sections come from what a recipe draws (the family of its first layer's pattern, the kind of text or
 * photo treatment), so a new recipe finds its place by itself; SECTION_OF names the few whose pattern says
 * less than the picture does. A family preset is listed where its `uses` say (by use and look, never by
 * mechanism: there is no «science» section), under one id in every space it is offered. The lists in presets.ts and scenes.ts keep their order (the first recipe of a
 * space is the one a space opens with; the landing page uses their ids): only the listing order is decided
 * here.
 */

export type ItemKind = 'receta' | 'escena' | 'familia';

export interface RecipeItem {
  /**
   * Unique in the whole catalogue: `${space}/${id}` for recipes, `${space}/escena:${id}` for scenes,
   * `${space}/familia:${family}:${preset}` for family presets (whose `id`, `${family}:${preset}`, is the same in every space).
   */
  key: string;
  id: string;
  name: string;
  space: SceneSpace;
  kind: ItemKind;
  /** The section it is listed under in its space (a CATEGORY id). */
  section: string;
  /** Every category it belongs to: its section and its moods. */
  cats: string[];
  /** The recipe; `base` (the piece on screen) lends the person's photo, video, camera or words where the space keeps them. */
  make: (base?: Recipe) => Recipe;
  /** What a list says under its name. */
  line: string;
  /** Folded words it is found by (name, section, patterns, characters, mood, palette, space). */
  words: string;
  /** Folded name (search ranks it first). */
  folded: string;
  /** Its background, ink and a few of its characters, shown until its picture arrives. */
  look: Look;
  /** Position in its space's list (Todas: by section, then this). */
  order: number;
}

export interface Category {
  id: string;
  label: string;
  /** One line: what is in it (tooltips, screen readers). */
  hint: string;
  /** Extra words that find its recipes («3d» finds Figuras 3D). */
  words?: string;
}

/** The sections and moods, with the words that find them. */
export const CATEGORIES: Record<string, Category> = {
  figuras: { id: 'figuras', label: 'Figuras 3D y espacio', hint: 'Objetos que giran, planetas y agujeros negros, dibujados con caracteres.', words: '3d tres dimensiones objeto objetos solido solidos volumen figura gira espacio planeta saturno agujero negro cosmos' },
  curvas: { id: 'curvas', label: 'Curvas y fractales', hint: 'Matemáticas que se dibujan solas: curvas, espirales y fractales.', words: 'matematicas matematica fractal fractales curva espiral geometria' },
  organicas: { id: 'organicas', label: 'Orgánicas', hint: 'Nubes, fuego, tinta, moho, agua: formas de la naturaleza que se mueven.', words: 'organico naturaleza natural vida tinta' },
  ondas: { id: 'ondas', label: 'Ondas y mareas', hint: 'Superficies que ondulan despacio: agua, aire, relieves.', words: 'ondas agua mar marea ola' },
  color: { id: 'color', label: 'Color que fluye', hint: 'Corrientes, velos y membranas con un color propio en cada celda.', words: 'color colores degradado gradiente corriente corrientes iridiscente arcoiris neon' },
  vivas: { id: 'vivas', label: 'Vivas', hint: 'Fondos que se organizan solos y no se detienen: tinta, células, moho, bandadas.', words: 'vida viva vivo organismo celula celulas moho tinta crecimiento bandada simulacion' },
  materia: { id: 'materia', label: 'Materia y vidrio', hint: 'Relieves, metal, vidrio y superficies que se abren.', words: 'materia vidrio cromo metal relieve superficie textura lluvia' },
  geometricas: { id: 'geometricas', label: 'Geométricas', hint: 'Tramas, retículas, mosaicos, tejidos y circuitos.', words: 'geometria patron trama reticula mosaico teselacion' },
  espacio: { id: 'espacio', label: 'Espacio', hint: 'Estrellas, planetas y órbitas.', words: 'cosmos estrellas cielo planeta galaxia' },
  optica: { id: 'optica', label: 'Óptica', hint: 'Moiré, túneles de estrellas, rejillas retro, prismas y glitch.', words: 'optica moire glitch retro tunel hiperespacio prisma ilusion' },
  consola: { id: 'consola', label: 'Clásicos de consola', hint: 'Lluvia de código, radar, ecualizador y fósforo.', words: 'consola terminal codigo retro fosforo' },
  clasicas: { id: 'clasicas', label: 'Clásicas', hint: 'Tu foto en caracteres, sin transformarla.', words: 'foto retrato imagen clasico' },
  efectos: { id: 'efectos', label: 'Con efectos', hint: 'Tu foto transformada: serigrafía, neón, caleidoscopio, vidrio…', words: 'efecto efectos transformar foto imagen' },
  letras: { id: 'letras', label: 'Letras animadas', hint: 'Tus palabras se mueven: olas, estallidos, órbitas, cascadas.', words: 'letras animadas animacion palabras texto movimiento' },
  texturas: { id: 'texturas', label: 'Letras con textura', hint: 'Tus palabras rellenas de un patrón que se mueve.', words: 'letras textura relleno texto palabras' },
  mensajes: { id: 'mensajes', label: 'Mensajes', hint: 'Un mensaje que se escribe o se descifra sobre la pieza.', words: 'mensaje escribir maquina descifrar texto' },
  escenas: { id: 'escenas', label: 'Escenas compuestas', hint: 'Varias capas que se mueven a su ritmo; después puedes cambiar cada una.', words: 'escena escenas compuesta compuestas capas' },
  tranquilas: { id: 'tranquilas', label: 'Tranquilas', hint: 'Lentas y suaves: buenas de fondo o para mirar un rato.', words: 'tranquila tranquilo calma calmada lenta suave relajante' },
  expresivas: { id: 'expresivas', label: 'Expresivas', hint: 'Rápidas, brillantes, con mucho carácter.', words: 'expresiva energia energica rapida intensa brillante vibrante' },
};

/** The order sections are listed in, per space (a section not listed goes after these). */
const SECTION_ORDER: Record<SceneSpace, string[]> = {
  fondos: ['ondas', 'organicas', 'color', 'vivas', 'materia', 'geometricas', 'espacio', 'escenas'],
  arte: ['figuras', 'organicas', 'curvas', 'geometricas', 'optica', 'escenas'],
  media: ['clasicas', 'efectos', 'escenas'],
  tipo: ['letras', 'texturas', 'mensajes', 'escenas'],
  terminal: ['figuras', 'consola', 'curvas', 'escenas'],
};

/** Moods are offered where the pace of a recipe says something (not on a photo or on words: those are the person's). */
const MOOD_SPACES: SceneSpace[] = ['fondos', 'arte', 'terminal'];

/** Recipes whose first pattern says less than the picture does (`${space}/${id}` → section). */
const SECTION_OF: Record<string, string> = {
  'fondos/orbita': 'espacio',
  'fondos/relieve': 'geometricas',
  // Saturn goes with the black hole and the 3D figures
  'arte/saturno': 'figuras',
  'arte/optica': 'optica', 'arte/cinco-ejes': 'optica', 'arte/hiperespacio': 'optica', 'arte/vapor': 'optica',
  'terminal/consola': 'consola', 'terminal/radar': 'consola', 'terminal/ecualizador': 'consola', 'terminal/ambar': 'consola',
};

const BY_FAMILY: Record<PatternFamily, string> = {
  solidos: 'figuras', matematico: 'curvas', organico: 'organicas', ondas: 'ondas', geometrico: 'geometricas', formas: 'geometricas',
  espacio: 'espacio', señal: 'optica', particulas: 'escenas',
};

/** The section of a recipe of a space, from what it draws. */
export function sectionOf(space: SceneSpace, id: string, r: Recipe): string {
  const named = SECTION_OF[`${space}/${id}`];
  if (named) return named;
  if (space === 'media') return r.media.xform?.some(x => x.on) || r.optics ? 'efectos' : 'clasicas';
  // glass in front of a background (recipe.optics): rain on the window, fluted glass
  if (space === 'fondos' && r.optics) return 'materia';
  if (space === 'tipo') {
    if (r.source === 'text' && r.text.anim) return 'letras';
    if (r.msg.on) return 'mensajes';
    return 'texturas';
  }
  const lead = r.layers.find(l => l.on !== false) ?? r.layers[0];
  const sec = BY_FAMILY[patternById(lead?.pattern ?? '').family] ?? 'geometricas';
  // a space that has no such section lists it with its patterns' kin
  if (space === 'terminal' && (sec === 'ondas' || sec === 'optica')) return 'consola';
  if (space === 'arte' && sec === 'espacio') return 'figuras';
  return sec;
}

export { usesOf };

const ASCII_ONLY = /^[\x20-\x7e]*$/;
const TERMINAL_CHARS = ' .:-=+*#%@';

/**
 * A family preset as a recipe of a space: alone on the pattern source with its look (Fondos, Arte; Terminal at
 * the terminal's proportion and in plain ASCII), as the texture inside the person's words (Texto) or over their
 * photo, video or camera (Imagen). The seed is the preset's, so the same entry gives the same piece everywhere.
 */
function familyMake(space: SceneSpace, f: FamilyMeta, pr: FamilyPreset) {
  // a family that reads the piece (FamilyMeta.reads) makes the whole picture from the photo or the words: the
  // pattern is all there is on stage, not a layer mixed over the source
  const reads = famReads(f, f.version, 'source');
  return (base?: Recipe): Recipe => {
    const r = familyRecipe(f.id, pr.id, undefined, `${f.id}-${pr.id}`);
    if (space === 'terminal') {
      r.glyph.aspect = 2;
      if (!ASCII_ONLY.test(r.glyph.charset)) { r.glyph.charset = TERMINAL_CHARS; r.glyph.sort = true; }
    } else if (space === 'tipo') {
      r.source = 'text';
      // (a preset can ask for its words at another size: a tunnel of words leaves room around them)
      r.text = { ...r.text, content: 'GLYPHOS', font: 'martian', weight: 800, size: pr.text?.size ?? 0.95 };
      r.media = { ...r.media, mix: reads ? 1 : 0.6, blend: reads ? 'normal' : 'multiply' };
      r.tone.contrast = Math.max(r.tone.contrast, 1.3);
      if (base) keepText(base, r);
    } else if (space === 'media') {
      r.source = 'image';
      r.media = { ...r.media, mix: reads ? 1 : 0.5, blend: reads ? 'normal' : 'screen' };
      if (base) keepMedia(base, r);
    }
    return normalizeRecipe(r);
  };
}

const GLITCH = new Set(['glitch', 'ruido']);

/** Calm or lively, from the pace and the glow of a recipe (null: neither says much). */
export function moodOf(r: Recipe, scene?: SceneSpec): 'tranquilas' | 'expresivas' | null {
  if (scene?.mood === 'calma') return 'tranquilas';
  if (scene?.mood === 'energia') return 'expresivas';
  const speed = r.motion.speed, bloom = r.fx.bloom;
  if (r.layers.some(l => l.on !== false && GLITCH.has(l.pattern))) return 'expresivas';
  if (speed >= 0.75 || bloom >= 0.5) return 'expresivas';
  if (speed <= 0.42 && bloom < 0.3 && r.motion.pulse < 0.2) return 'tranquilas';
  return null;
}

/** What a picture shows while its render is on its way: the recipe's background, its ink and a few of its characters. */
export interface Look { bg: string; ink: string; chars: string }

/** A recipe's look before its render: its background, its brightest colour and three of its densest characters. */
export function lookOf(r: Recipe): Look {
  const s = r.color.stops;
  const solid = [...new Set([...r.glyph.charset])].filter(c => c.trim());
  const pick = solid.length ? [solid[Math.floor((solid.length - 1) * 0.45)], solid[Math.floor((solid.length - 1) * 0.75)], solid[solid.length - 1]] : ['#'];
  return { bg: r.color.bg, ink: s[s.length - 1] ?? '#ede6da', chars: pick.join('') };
}

function wordsOf(space: SceneSpace, r: Recipe, cats: string[], extra: string[]): string {
  const parts = [...extra, spaceById(space).name, space === 'tipo' ? 'texto' : '', space === 'media' ? 'foto imagen retrato' : ''];
  for (const c of cats) parts.push(CATEGORIES[c]?.label ?? '', CATEGORIES[c]?.words ?? '');
  for (const l of r.layers) {
    if (l.on === false) continue;
    const p = patternById(l.pattern);
    parts.push(p.name, FAMILY_NAMES[p.family]);
  }
  const cs = charsetById(charsetIdOf(r.glyph.charset));
  if (cs) parts.push(cs.name);
  if (r.text.anim) parts.push(r.text.anim.kind);
  if (r.msg.on) parts.push('mensaje');
  return fold(parts.join(' '));
}

function build(): RecipeItem[] {
  const out: RecipeItem[] = [];
  for (const sp of SPACES) {
    if (sp.id === 'componentes') continue;
    const space = sp.id as SceneSpace;
    let order = 0;
    for (const p of PRESETS[space]) {
      const r = p.make();
      const section = sectionOf(space, p.id, r);
      const mood = MOOD_SPACES.includes(space) ? moodOf(r) : null;
      const cats = mood ? [section, mood] : [section];
      out.push({
        key: `${space}/${p.id}`, id: p.id, name: p.name, space, kind: 'receta', section, cats, make: p.make,
        line: CATEGORIES[section].label, words: wordsOf(space, r, cats, [p.name]), folded: fold(p.name), look: lookOf(r), order: order++,
      });
    }
    // the presets of the visual families, where their uses say (after the space's own recipes; moods say nothing of them)
    for (const f of FAMILIES) for (const pr of f.presets) {
      const here = usesOf(f, pr).filter(u => u.startsWith(space + '/')).map(u => u.slice(space.length + 1));
      if (!here.length) continue;
      const make = familyMake(space, f, pr);
      const section = here[0];
      out.push({
        key: `${space}/familia:${f.id}:${pr.id}`, id: `${f.id}:${pr.id}`, name: pr.name, space, kind: 'familia', section, cats: [...new Set(here)], make,
        line: f.name,
        words: fold([pr.name, f.name, ...(pr.aka ?? []), ...(f.aka ?? []), ...here.flatMap(c => [CATEGORIES[c].label, CATEGORIES[c].words ?? ''])].join(' ')),
        folded: fold(pr.name), look: lookOf(make()), order: order++,
      });
    }
    for (const s of SCENES.filter(x => x.space === space)) {
      const r = makeScene(s);
      const mood = MOOD_SPACES.includes(space) ? moodOf(r, s) : null;
      const cats = mood ? ['escenas', mood] : ['escenas'];
      const pal = galleryPalette(s.palette);
      out.push({
        key: `${space}/escena:${s.id}`, id: s.id, name: s.name, space, kind: 'escena', section: 'escenas', cats,
        make: base => makeScene(s, base),
        line: `Escena · ${PALETTE_MOODS[s.mood]}`,
        words: wordsOf(space, r, cats, [s.name, PALETTE_MOODS[s.mood], pal?.name ?? '', 'escena']), folded: fold(s.name), look: lookOf(r), order: order++,
      });
    }
  }
  return out;
}

let all: RecipeItem[] | null = null;
let builtWith = -1;
/**
 * The whole catalogue (built on first use, and again when the families' specs arrive: until then it lists the
 * recipes and scenes, and the browser asks for the specs when it opens).
 */
export function allItems(): RecipeItem[] {
  if (!all || builtWith !== familiesGen()) { builtWith = familiesGen(); all = build(); }
  return all;
}

/** The recipes and scenes of a space, by section and then in their own order (Componentes shows those of Fondos). */
export function itemsOf(space: SpaceId): RecipeItem[] {
  const sp: SceneSpace = space === 'componentes' ? 'fondos' : space;
  const rank = sectionRank(sp);
  return allItems().filter(i => i.space === sp).sort((a, b) => rank(a.section) - rank(b.section) || a.order - b.order);
}

function sectionRank(space: SceneSpace) {
  const list = SECTION_ORDER[space];
  return (id: string) => { const i = list.indexOf(id); return i < 0 ? list.length : i; };
}

/** The sections of a space, in order, with their items. */
export function sectionsOf(space: SpaceId): Array<{ cat: Category; items: RecipeItem[] }> {
  const items = itemsOf(space);
  const out: Array<{ cat: Category; items: RecipeItem[] }> = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.cat.id === it.section) last.items.push(it);
    else out.push({ cat: CATEGORIES[it.section], items: [it] });
  }
  return out;
}

/**
 * The filters a space offers besides «Todas»: its sections, then the moods. A filter shows when it tells
 * something apart: at least two items, and not (nearly) all of them.
 */
export function filtersOf(space: SpaceId): Array<{ cat: Category; count: number }> {
  const items = itemsOf(space);
  const count = new Map<string, number>();
  for (const it of items) for (const c of it.cats) count.set(c, (count.get(c) ?? 0) + 1);
  const sp: SceneSpace = space === 'componentes' ? 'fondos' : space;
  const ids = [...SECTION_ORDER[sp], ...[...count.keys()].filter(c => !SECTION_ORDER[sp].includes(c) && c !== 'tranquilas' && c !== 'expresivas'), 'tranquilas', 'expresivas'];
  const out: Array<{ cat: Category; count: number }> = [];
  for (const id of ids) {
    const n = count.get(id) ?? 0;
    if (n < 2 || n > items.length * 0.8) continue;
    out.push({ cat: CATEGORIES[id], count: n });
  }
  return out;
}

export const itemByKey = (key: string) => allItems().find(i => i.key === key);

/** The item a history entry comes from: the same name in the same space. */
export const itemNamed = (space: SpaceId, name: string | undefined) =>
  name ? allItems().find(i => i.space === (space === 'componentes' ? 'fondos' : space) && i.name === name) : undefined;
