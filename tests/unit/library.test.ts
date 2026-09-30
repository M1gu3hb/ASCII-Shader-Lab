import { describe, expect, it } from 'vitest';
import { CHARSETS, FAMILY_NAMES, LETTER_ANIMS, PATTERNS, PATTERN_IDS, charsetById, patternById } from '../../src/engine/catalog';
import { BASIC_PATTERNS, evalPattern } from '../../src/engine/basic/patterns';
import { PATTERN_GLSL } from '../../src/engine/glsl/patterns';
import { PARTICLE_IDS } from '../../src/engine/glsl/particles';
import { animateMessage, letterPose, movedCell, msgAnimPeriod, textAnimPeriod } from '../../src/engine/letters';
import { MSG_ANIMS, TEXT_ANIMS, defaultRecipe, normalizeRecipe, type LetterAnim, type Recipe } from '../../src/engine/recipe';
import { layoutMessage } from '../../src/engine/text';
import { ARCHETYPES } from '../../src/random/archetypes';
import { GEN_VERSION, GEN_VERSIONS, generate } from '../../src/random/generator';
import { LIBRARY_CHARSETS, LIBRARY_MSG_ANIMS, LIBRARY_PALETTES, LIBRARY_PATTERNS, LIBRARY_TEXT_ANIMS, libraryArchetypes } from '../../src/random/library';
import { PALETTE_GALLERY, PALETTE_MOODS, galleryPalette, pickGallery } from '../../src/random/palette-gallery';
import { CURATED, makePalette } from '../../src/random/palettes';
import { contrastRatio } from '../../src/engine/color';
import { Rng } from '../../src/random/prng';
import { SPACES } from '../../src/random/spaces';
import { PRESETS } from '../../src/studio/presets';
import { SCENES, SCENE_PRESETS, makeScene, scenesFor } from '../../src/studio/scenes';

/**
 * The library ported from the Codex branch (patterns, particle motions, charsets, letter animations,
 * palettes, recipes and scenes): every id is unique and known to both engines, the content opens as valid
 * recipes in its space, and none of it reaches generator versions 1–4 (their fixtures are in
 * generator-versions.test.ts).
 */
const FIELDS = ['mandelbrot', 'sierpinski', 'filotaxis', 'quasicristal', 'topografia', 'espirografo', 'circuitos', 'dunas', 'entrelazado',
  'mareas_lentas', 'jardin_zen', 'bruma_lejana', 'luciernagas', 'lluvia_mansa', 'bambu', 'respiracion', 'estuario', 'lemniscata',
  'superformula', 'armonografo', 'catenaria', 'apolonio', 'campo_flujo', 'flor_armonica', 'estrella_mar'];
const SOLIDS = ['obelisco', 'prisma', 'reloj_arena', 'simbiosis', 'pendulos', 'cinta_ola', 'jade_vivo', 'caliz', 'medusa', 'esferas_orbita'];
const PATTERN_LIB = [...FIELDS, ...SOLIDS];
const NEW_IDS = [...PATTERN_LIB, ...PARTICLE_IDS];
const CHARSET_LIB = ['barras_ascii', 'terminal_densa', 'puntuacion', 'numeros', 'tejido_fino', 'diagonales', 'media_luna', 'marcos', 'sismografo', 'pincel'];
const ANIMS = ['orbita', 'enjambre', 'cascada'] as const;
const RECIPES: Record<string, string[]> = {
  fondos: ['ondas-sismografo', 'luna-de-lago', 'mareas-de-seda', 'arena-zen', 'niebla-en-capas', 'luciernagas-noche', 'lluvia-estanque', 'bambu-tinta',
    'aire-respira', 'estuarios', 'corrientes-de-aire', 'curvas-terreno', 'dunas-de-viento', 'tela-quieta', 'placa-electronica'],
  arte: ['infinito-de-bern', 'gielis', 'pendulo-de-tinta', 'cadenas-suspendidas', 'circulos-anidados', 'flor-harmonica', 'estrella-de-mar',
    'simbiosis-viva', 'pendulos-cineticos', 'cinta-luminosa', 'jade-palpitante', 'caliz-ceramico', 'medusa-biologica', 'orbitales-pacificas',
    'espiral-semillas', 'mandelbrot-azul', 'tapiz-infinito', 'cinco-ejes', 'curvas-de-tinta', 'obelisco-de-tinta', 'prisma-de-luz', 'arena-en-suspension'],
  tipo: ['tipo-orbita', 'tipo-enjambre', 'tipo-cascada'],
  terminal: ['terminal-teletipo', 'terminal-cifras', 'terminal-prisma', 'terminal-obelisco', 'terminal-espirografo'],
};
const json = (r: Recipe) => JSON.parse(JSON.stringify(r)) as Recipe;
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

describe('library: patterns and particle motions', () => {
  it('has 35 patterns (10 of them solids) and 12 particle motions, each once, in the catalog and both engines', () => {
    expect(PATTERN_LIB).toHaveLength(35);
    expect(PARTICLE_IDS).toHaveLength(12);
    expect(new Set(NEW_IDS).size).toBe(47);
    expect(new Set(PATTERNS.map(p => p.id)).size).toBe(PATTERNS.length);
    for (const id of NEW_IDS) {
      expect(PATTERN_IDS.has(id), id).toBe(true);
      expect(PATTERN_GLSL[id], id).toContain(`float P_${id}(`);
      expect(BASIC_PATTERNS[id], id).toBeTruthy();
    }
    for (const id of SOLIDS) expect(patternById(id).family, id).toBe('solidos');
    for (const id of PARTICLE_IDS) expect(patternById(id).family, id).toBe('particulas');
    expect(FAMILY_NAMES.particulas).toBe('Partículas');
    // the fallback pattern and the order of the existing ones do not move
    expect(PATTERNS[0].id).toBe('nube');
  });

  it('names every pattern and its two settings in Spanish', () => {
    for (const id of NEW_IDS) {
      const p = patternById(id);
      expect(p.name.length, id).toBeGreaterThan(3);
      expect(p.a.length * p.b.length, id).toBeGreaterThan(0);
      expect(p.a, id).not.toBe(p.b);
      expect(p.cost, id).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(NEW_IDS.map(id => patternById(id).name)).size).toBe(NEW_IDS.length);
  });

  it('draws something with every pattern, and both settings do something', { timeout: 60_000 }, () => {
    for (const id of NEW_IDS) {
      const grid = (t: number, a: number, b: number) => {
        const out: number[] = [];
        for (let y = -0.45; y <= 0.45; y += 0.045) for (let x = -0.8; x <= 0.8; x += 0.045) out.push(evalPattern(id, x, y, t, a, b, 0.012));
        return out;
      };
      const diff = (p: number[], q: number[]) => p.reduce((s, v, i) => s + Math.abs(v - q[i]), 0);
      const g = grid(2.3, 0.5, 0.5);
      expect(Math.max(...g), id).toBeGreaterThan(0.3);
      expect(g.reduce((s, v) => s + v, 0), id).toBeGreaterThan(2);
      // (some settings act on a beat or a wing stroke: three moments)
      const da = [2.3, 3.1, 4.7].reduce((s, t) => s + diff(grid(t, 0.1, 0.5), grid(t, 0.9, 0.5)), 0);
      const db = [2.3, 3.1, 4.7].reduce((s, t) => s + diff(grid(t, 0.5, 0.1), grid(t, 0.5, 0.9)), 0);
      expect(da, `${id}: a`).toBeGreaterThan(1);
      expect(db, `${id}: b`).toBeGreaterThan(1);
    }
  });

  it('moves: every solid and particle motion changes over time', () => {
    for (const id of [...SOLIDS, ...PARTICLE_IDS]) {
      let delta = 0;
      for (let y = -0.4; y <= 0.4; y += 0.05) for (let x = -0.6; x <= 0.6; x += 0.05) {
        delta += Math.abs(evalPattern(id, x, y, 0.2, 0.5, 0.5) - evalPattern(id, x, y, 4.1, 0.5, 0.5));
      }
      expect(delta, id).toBeGreaterThan(1);
    }
  });
});

describe('library: character sets and letter animations', () => {
  it('adds 10 character sets with their own ids and glyphs; the ASCII ones are plain ASCII', () => {
    expect(new Set(CHARSETS.map(c => c.id)).size).toBe(CHARSETS.length);
    expect(new Set(CHARSETS.map(c => c.chars)).size).toBe(CHARSETS.length);
    expect(CHARSETS[0].id).toBe('clasico');
    for (const id of CHARSET_LIB) {
      const c = charsetById(id)!;
      expect(c, id).toBeTruthy();
      expect(c.chars[0], id).toBe(' ');
      expect(c.chars.length, id).toBeGreaterThanOrEqual(5);
      expect(new Set(c.chars).size, id).toBe([...c.chars].length);
      expect(c.ascii, id).toBe(ascii(c.chars));
      const r = defaultRecipe(); r.glyph.charset = c.chars;
      expect(normalizeRecipe(r).glyph.charset, id).toBe(c.chars);
    }
    expect(CHARSET_LIB.filter(id => charsetById(id)!.ascii)).toHaveLength(4);
  });

  it('loops Órbita, Enjambre and Cascada on the big text, and they move the letters', () => {
    const slot = { k: 3, n: 8, word: 1, words: 2, cx: 40, cy: -10 };
    for (const kind of ANIMS) {
      expect(TEXT_ANIMS).toContain(kind);
      expect(MSG_ANIMS).toContain(kind);
      expect(LETTER_ANIMS[kind].desc.length, kind).toBeGreaterThan(20);
      const a: LetterAnim = { kind, amount: 0.8, speed: 1.1 };
      expect(textAnimPeriod(a, 2)).toBeGreaterThan(0);
      expect(msgAnimPeriod(a, 8)).toBeGreaterThan(0);
      const p = letterPose(a, 2.1, slot, 100, 300);
      expect([p.dx, p.dy, p.rot, p.scale, p.grey].every(Number.isFinite), kind).toBe(true);
      expect(p, kind).not.toEqual(letterPose(a, 0.4, slot, 100, 300));
      // one full cycle later the letter is where it was
      const P = textAnimPeriod(a, 2);
      for (const t of [0.37, 1.15, 3.4]) {
        const q = letterPose(a, t + P, slot, 100, 300), r = letterPose(a, t, slot, 100, 300);
        for (const k of ['dx', 'dy', 'rot', 'scale', 'grey'] as const) expect(q[k], `${kind} ${k}`).toBeCloseTo(r[k], 6);
      }
      // with a perfect loop too
      for (const t of [0.37, 1.15, 3.4]) expect(letterPose(a, t + 6, slot, 100, 300, 6)).toEqual(letterPose(a, t, slot, 100, 300, 6));
    }
  });

  it('moves message letters on the shared grid, and the cursor with them', () => {
    const lay = layoutMessage('GLYPHOS VIVE', 48, 14, 0.5, 0.5, 'center', false, c => 1 + c.charCodeAt(0) % 9);
    for (const kind of ANIMS) {
      const a: LetterAnim = { kind, amount: 0.8, speed: 1 };
      expect(Array.from(animateMessage(lay, a, 0.1, 14, 12)), kind).not.toEqual(Array.from(animateMessage(lay, a, 2, 14, 12)));
      expect(animateMessage(lay, a, 2, 14, 12).some(v => v > 0), kind).toBe(true);
      const cursor = movedCell(lay, a, 2, 14, [15, 6], 3);
      expect(cursor.every(Number.isInteger), kind).toBe(true);
      for (const t of [0.2, 1.1, 2.7]) expect(animateMessage(lay, a, t + 6, 14, 12, 6)).toEqual(animateMessage(lay, a, t, 14, 12, 6));
    }
  });
});

describe('library: palettes', () => {
  it('has 40 palettes, eight per mood, with their own ids and names', () => {
    expect(PALETTE_GALLERY).toHaveLength(40);
    for (const m of Object.keys(PALETTE_MOODS)) expect(PALETTE_GALLERY.filter(p => p.mood === m), m).toHaveLength(8);
    expect(new Set(PALETTE_GALLERY.map(p => p.id)).size).toBe(40);
    const names = [...CURATED, ...PALETTE_GALLERY].map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PALETTE_GALLERY) {
      expect(p.id, p.name).toMatch(/^[a-z0-9-]+$/);
      expect(galleryPalette(p.id)).toBe(p);
      expect(p.stops.length, p.name).toBeGreaterThanOrEqual(3);
      expect([p.bg, ...p.stops].every(c => /^#[0-9a-f]{6}$/.test(c)), p.name).toBe(true);
      // the densest glyphs read on the background
      expect(contrastRatio(p.stops[p.stops.length - 1], p.bg), p.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves the curated selection of versions 1–4 as it was', () => {
    expect(CURATED).toHaveLength(24);
    expect(CURATED[0].name).toBe('Fósforo');
    expect(CURATED[23].name).toBe('Terracota');
    const a = makePalette('curado', new Rng('x')), b = makePalette('curado', new Rng('x'));
    expect(a).toEqual(b);
    expect(CURATED.some(p => p.name === a.name)).toBe(true);
    const g = makePalette('galeria', new Rng('y'));
    expect(PALETTE_GALLERY.some(p => p.name === g.name)).toBe(true);
    // a copy: changing it does not change the gallery
    g.stops[0] = '#000000';
    expect(PALETTE_GALLERY.every(p => p.stops[0] !== '#000000')).toBe(true);
    for (let i = 0; i < 20; i++) {
      const t = pickGallery(new Rng('tinta' + i), ['tinta']);
      expect(PALETTE_GALLERY.find(p => p.name === t.name)?.mood).toBe('tinta');
    }
  });
});

describe('library: recipes and scenes', () => {
  it('adds the 45 recipes at the end of their spaces, as valid recipes of that space', () => {
    expect(Object.values(RECIPES).flat()).toHaveLength(45);
    for (const [space, ids] of Object.entries(RECIPES)) {
      const list = PRESETS[space as keyof typeof PRESETS];
      expect(new Set(list.map(p => p.id)).size, space).toBe(list.length);
      // the first recipes of each space (the ones the studio opens with) stay first
      expect(list.slice(-ids.length).map(p => p.id), space).toEqual(ids);
      for (const id of ids) {
        const r = list.find(p => p.id === id)!.make();
        expect(normalizeRecipe(r, PATTERN_IDS), id).toEqual(r);
        expect(r.layers.every(l => PATTERN_IDS.has(l.pattern)), id).toBe(true);
        if (space === 'tipo') expect(r.source, id).toBe('text');
        else expect(r.source, id).toBe('pattern');
        if (space === 'terminal') { expect(ascii(r.glyph.charset), id).toBe(true); expect(r.glyph.aspect, id).toBe(2); }
      }
    }
    // a Tipo recipe keeps the person's words
    const base = defaultRecipe(); base.source = 'text'; base.text.content = 'HOLA';
    expect(PRESETS.tipo.find(p => p.id === 'tipo-cascada')!.make(base).text.content).toBe('HOLA');
  });

  it('has 28 composed scenes that open as editable recipes of their space', () => {
    expect(SCENES).toHaveLength(28);
    expect(new Set(SCENES.map(s => s.id)).size).toBe(28);
    for (const s of SCENES) {
      expect(SPACES.some(x => x.id === s.space), s.id).toBe(true);
      // a scene and a recipe of the same space never share an id (one browser can list both)
      expect(PRESETS[s.space].some(p => p.id === s.id), s.id).toBe(false);
      expect(galleryPalette(s.palette), s.id).toBeTruthy();
      expect(charsetById(s.charset), s.id).toBeTruthy();
      const r = makeScene(s);
      expect(r.layers.length, s.id).toBeGreaterThanOrEqual(2);
      expect(r.layers.every(l => PATTERN_IDS.has(l.pattern)), s.id).toBe(true);
      expect(json(normalizeRecipe(r, PATTERN_IDS)), s.id).toEqual(json(r));
      expect(r.color.stops, s.id).toEqual(galleryPalette(s.palette)!.stops);
      if (s.space === 'terminal') expect(ascii(r.glyph.charset), s.id).toBe(true);
      if (s.space === 'tipo') expect(r.source, s.id).toBe('text');
      if (s.space === 'media') expect(r.source, s.id).toBe('image');
      if (s.space === 'fondos' || s.space === 'arte') expect(r.source, s.id).toBe('pattern');
    }
    expect(Object.values(SCENE_PRESETS).flat()).toHaveLength(28);
    expect(scenesFor('componentes')).toEqual(scenesFor('fondos'));
  });

  it('keeps the person\'s photo in Imagen scenes and their words in Tipo scenes', () => {
    const photo = defaultRecipe();
    photo.source = 'video';
    photo.media.ref = { kind: 'video', id: 'abcdef1234567890', w: 800, h: 600 };
    photo.media.zoom = 1.4;
    for (const s of scenesFor('media')) {
      const r = makeScene(s, photo);
      expect(r.source, s.id).toBe('video');
      expect(r.media.ref?.id, s.id).toBe('abcdef1234567890');
      expect(r.media.zoom, s.id).toBe(1.4);
    }
    const words = defaultRecipe(); words.source = 'text'; words.text.content = 'MI NOMBRE';
    for (const s of scenesFor('tipo')) expect(makeScene(s, words).text.content, s.id).toBe('MI NOMBRE');
  });
});

describe('library: the generator', () => {
  it('stays at version 4: the library is data for the next version', () => {
    expect(GEN_VERSION).toBe(4);
    expect(GEN_VERSIONS).toEqual([1, 2, 3, 4]);
    const lib = new Set<string>([...NEW_IDS]);
    const libCharsets = new Set(CHARSET_LIB.map(id => charsetById(id)!.chars));
    const galleryNames = new Set(PALETTE_GALLERY.map(p => p.name));
    for (const gen of [1, 2, 3, 4]) for (const s of SPACES) for (let i = 0; i < 25; i++) {
      const r = generate({ seed: `biblioteca-${i}`, space: s.id, base: defaultRecipe(), gen });
      expect(r.layers.some(l => lib.has(l.pattern)), `${gen}/${s.id}/${i}`).toBe(false);
      expect(libCharsets.has(r.glyph.charset), `${gen}/${s.id}/${i}`).toBe(false);
      expect(ANIMS.some(k => r.text.anim?.kind === k || r.msg.anim?.kind === k)).toBe(false);
      expect(galleryNames.has(r.meta.name ?? '')).toBe(false);
    }
  });

  it('keeps Codex\'s weights as tables whose every id exists', () => {
    const archs = ARCHETYPES.map(a => a.id);
    expect(Object.keys(LIBRARY_PATTERNS).sort()).toEqual([...archs].sort());
    for (const [arch, w] of Object.entries(LIBRARY_PATTERNS)) for (const [id, v] of Object.entries(w)) {
      expect(PATTERN_IDS.has(id), `${arch}: ${id}`).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    // every new pattern and particle motion has a place in some style
    for (const id of NEW_IDS) expect(Object.values(LIBRARY_PATTERNS).some(w => id in w), id).toBe(true);
    for (const [arch, w] of Object.entries(LIBRARY_CHARSETS)) {
      expect(archs, arch).toContain(arch);
      for (const id of Object.keys(w)) expect(charsetById(id), `${arch}: ${id}`).toBeTruthy();
    }
    for (const w of Object.values(LIBRARY_PALETTES)) expect(Object.keys(w)).toEqual(['galeria']);
    for (const k of [...Object.keys(LIBRARY_TEXT_ANIMS), ...Object.keys(LIBRARY_MSG_ANIMS)]) expect(ANIMS as readonly string[]).toContain(k);
    const before = JSON.stringify(ARCHETYPES);
    const next = libraryArchetypes();
    expect(JSON.stringify(ARCHETYPES)).toBe(before);
    const solidos = next.find(a => a.id === 'solidos')!;
    expect(solidos.patterns.medusa).toBe(1.1);
    expect(solidos.patterns.dona).toBe(ARCHETYPES.find(a => a.id === 'solidos')!.patterns.dona);
    expect(next.every(a => a.palettes.galeria === 0.75)).toBe(true);
  });
});
