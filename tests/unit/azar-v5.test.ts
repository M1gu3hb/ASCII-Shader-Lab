import { describe, expect, it } from 'vitest';
import { contrastRatio, defaultRecipe, hexToOklch, normalizeRecipe, PATTERN_IDS, PATTERNS, charsetById, fontById, type Recipe } from '../../src/engine';
import {
  ARCHETYPES, colourFamily, generate, GEN_VERSION, GEN_VERSIONS, isStudioWord, lookDistance, lookOf, makePalette5, PALETTE5_NAMES, randomSeed, roll, Rng, SCENE_SEEDS, SPACES, tune5,
  type LockGroup, type Palette5Style, type SpaceId,
} from '../../src/random';
import { diceWord5, TERMINAL_LINES_5, TIPO_WORDS_5, WORD_FILLS_5 } from '../../src/random/gen5';
import { EXPOSED5 } from '../../src/random/exposure5';
import { PALETTE_STYLE_NAMES } from '../../src/random/palettes';
import { galleryPalette } from '../../src/random/palette-gallery';
import { SCENES } from '../../src/studio/scenes';

/** A person pressing the dice n times in a space, as the studio does (seeded, so the numbers are stable). */
function session(space: SpaceId, n: number, key: string, locks: LockGroup[] = []) {
  const stream = new Rng(key);
  const seen = new Set<string>();
  let base = defaultRecipe();
  if (space === 'media') base.source = 'image';
  const out: Recipe[] = [];
  for (let i = 0; i < n; i++) {
    const res = roll({ space, base, seen, locks, fresh: () => randomSeed(stream), rand: () => stream.next(), recent: out.slice(-10) });
    seen.add(res.fp);
    base = res.recipe;
    out.push(res.recipe);
  }
  return out;
}

/** The colours of a piece as a person sees them first: its most colourful stop. */
function colourOf(r: Recipe) {
  let hue = 0, chroma = 0;
  for (const s of r.color.stops) { const [, C, h] = hexToOklch(s); if (C > chroma) { chroma = C; hue = h; } }
  return { hue, chroma: chroma * r.color.sat };
}

describe('generator version 5', () => {
  it('stays reproducible (version 6 is the current one, from the same styles), and every id its styles use exists', () => {
    expect(GEN_VERSION).toBe(6);
    expect(GEN_VERSIONS).toContain(5);
    const palettes = new Set([...Object.keys(PALETTE5_NAMES), ...Object.keys(PALETTE_STYLE_NAMES)]);
    for (const a of ARCHETYPES) {
      for (const id of [...Object.keys(a.patterns), ...Object.keys(a.overlays ?? {})]) expect(PATTERN_IDS.has(id), `${a.id}: ${id}`).toBe(true);
      for (const id of Object.keys(a.charsets)) expect(charsetById(id), `${a.id}: ${id}`).toBeTruthy();
      for (const id of Object.keys(a.fonts)) expect(fontById(id).id, `${a.id}: ${id}`).toBe(id);
      for (const id of Object.keys(a.palettes)) expect(palettes.has(id), `${a.id}: ${id}`).toBe(true);
      expect(a.name.length).toBeGreaterThan(2);
      expect(a.blurb.length).toBeGreaterThan(20);
    }
    expect(new Set(ARCHETYPES.map(a => a.id)).size).toBe(19);
    for (const s of SPACES) for (const id of Object.keys(s.archs)) expect(ARCHETYPES.some(a => a.id === id), `${s.id}: ${id}`).toBe(true);
    // the exposure table knows every pattern
    for (const p of PATTERNS) expect(EXPOSED5, p.id).toContain(p.id);
  });

  it('weaves valid recipes that reproduce from their seed', () => {
    for (const s of SPACES) for (let i = 0; i < 80; i++) {
      const r = generate({ seed: `v5-${i}`, space: s.id, base: defaultRecipe(), gen: 5 });
      expect(r.meta.gen).toBe(5);
      expect(normalizeRecipe(r, PATTERN_IDS)).toEqual(r);
      expect(generate({ seed: `v5-${i}`, space: s.id, base: defaultRecipe(), gen: 5 })).toEqual(r);
      expect(r.tone.contrast).toBeLessThanOrEqual(3);
      expect(Math.abs(r.tone.bright)).toBeLessThanOrEqual(1);
    }
  });

  it('never writes the old name (nor «SEÑAL») in the words of a new piece', () => {
    for (const list of [TIPO_WORDS_5, WORD_FILLS_5, TERMINAL_LINES_5]) for (const w of list) expect(w).not.toMatch(/MONOTRAMA|SEÑAL/i);
    for (const s of SPACES) for (let i = 0; i < 120; i++) {
      const r = generate({ seed: `palabra-${i}`, space: s.id, base: defaultRecipe() });
      for (const t of [r.glyph.words, r.text.content, r.msg.text]) expect(t, `${s.id} ${i}`).not.toMatch(/MONOTRAMA|SEÑAL/i);
    }
  });

  it('Texto: a word the dice chose changes with the next roll; a word the person wrote stays', () => {
    const first = generate({ seed: 'eco-feliz-001', space: 'tipo', base: defaultRecipe() });
    expect(first.text.content).toBe(diceWord5('eco-feliz-001'));
    let changed = 0;
    for (let i = 0; i < 30; i++) {
      const next = generate({ seed: `sigue-${i}`, space: 'tipo', base: first });
      expect(next.text.content).toBe(diceWord5(`sigue-${i}`));
      if (next.text.content !== first.text.content) changed++;
    }
    expect(changed).toBeGreaterThan(20);
    const mine = structuredClone(first);
    mine.text.content = 'MI PALABRA';
    for (let i = 0; i < 10; i++) expect(generate({ seed: `sigue-${i}`, space: 'tipo', base: mine }).text.content).toBe('MI PALABRA');
    // an earlier version's piece: its version keeps its word, as it did then; this one changes a word of its dice
    const old = generate({ seed: 'eco-feliz-001', space: 'tipo', base: defaultRecipe(), gen: 4 });
    expect(generate({ seed: 'otra', space: 'tipo', base: old, gen: 4 }).text.content).toBe(old.text.content);
    expect(generate({ seed: 'otra', space: 'tipo', base: old }).text.content).toBe(diceWord5('otra'));
  });

  it('Texto: a word nobody typed never stays (the dice\'s of any version, SEÑAL, MONOTRAMA); one the person typed does', () => {
    // an older version's piece whose word is SEÑAL (what a returning person may have on screen)
    const senal = Array.from({ length: 400 }, (_, i) => generate({ seed: 'x' + i, space: 'tipo', base: defaultRecipe(), gen: 4 })).find(r => r.text.content === 'SEÑAL')!;
    expect(senal).toBeDefined();
    // a Monotrama-era Texto piece (its default word), opened from an old link or session
    const mono = defaultRecipe(); mono.source = 'text'; mono.text.content = 'MONOTRAMA';
    // the Texto space's starting recipe («Trama»)
    const trama = defaultRecipe(); trama.source = 'text'; trama.text.content = 'TRAMA';
    for (const base of [senal, mono, trama]) {
      const words = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const res = roll({ space: 'tipo', base, seen: new Set(), fresh: () => 'fresh-' + i });
        // the dice's own word for each new seed (TRAMA too, when a seed draws it)
        expect(res.recipe.text.content, base.text.content).toBe(diceWord5(res.seed));
        words.add(res.recipe.text.content);
      }
      expect(words.size, base.text.content).toBeGreaterThan(8);
      for (const w of words) expect(w).not.toMatch(/MONOTRAMA|SEÑAL/);
    }
    for (const w of ['TRAMA', 'SEÑAL', 'MONOTRAMA', 'GLYPHOS', ' LUZ ', 'FARO']) expect(isStudioWord(w), w).toBe(true);
    for (const w of ['MI PALABRA', 'luz', 'Hola, mundo', 'GLYPHOS 2']) expect(isStudioWord(w), w).toBe(false);
    // the studio says the person typed it: it stays, whatever the word
    for (const base of [senal, trama]) expect(roll({ space: 'tipo', base, seen: new Set(), fresh: () => 'otra', ownText: true }).recipe.text.content).toBe(base.text.content);
    // and says a word is not theirs (a recipe's): it changes
    const receta = defaultRecipe(); receta.source = 'text'; receta.text.content = 'EN VIVO';
    expect(generate({ seed: 'otra', space: 'tipo', base: receta }).text.content).toBe('EN VIVO');
    expect(generate({ seed: 'otra', space: 'tipo', base: receta, ownText: false }).text.content).toBe(diceWord5('otra'));
    // with a seed too (a link to a seed reproduces it the same from any studio word on screen)
    const fromTrama = roll({ space: 'tipo', base: trama, seen: new Set(), seed: 'faro-1', gen: 5 }).recipe;
    expect(fromTrama.text.content).toBe(diceWord5('faro-1'));
    expect(roll({ space: 'tipo', base: mono, seen: new Set(), seed: 'faro-1', gen: 5 }).recipe).toEqual(fromTrama);
  });

  it('locks keep their group exactly, «fijar color» included, and change nothing else', () => {
    const base = generate({ seed: 'base-v5', space: 'arte', base: defaultRecipe() });
    for (let i = 0; i < 40; i++) {
      const seed = `candado-${i}`;
      const free = generate({ seed, space: 'arte', base });
      const color = generate({ seed, space: 'arte', base, locks: ['color'] });
      expect(color.color).toEqual(base.color);
      expect({ ...color, color: null }).toEqual({ ...free, color: null });
      const forma = generate({ seed, space: 'arte', base, locks: ['forma'] });
      expect(forma.layers).toEqual(base.layers);
      const glifos = generate({ seed, space: 'arte', base, locks: ['glifos'] });
      expect(glifos.glyph).toEqual(base.glyph);
      expect(glifos.tone).toEqual(base.tone);
      const all = generate({ seed, space: 'arte', base, locks: ['forma', 'color', 'glifos', 'movimiento', 'efectos', 'fuente'] });
      expect({ ...all, meta: null }).toEqual({ ...base, meta: null });
    }
  });

  it('starts from the studio\'s composed scenes (a faithful copy of their data)', () => {
    expect(SCENE_SEEDS.map(s => s.id)).toEqual(SCENES.map(s => s.id));
    for (const s of SCENES) {
      const c = SCENE_SEEDS.find(x => x.id === s.id)!;
      expect([c.space, c.mood, c.palette, c.charset, c.cell, c.speed, c.interaction], s.id).toEqual([s.space, s.mood, s.palette, s.charset, s.cell, s.speed, s.interaction]);
      expect(c.layers.map(l => l.pattern), s.id).toEqual(s.layers.map(l => l.pattern));
      expect(galleryPalette(c.palette), s.id).toBeTruthy();
    }
    let scenes = 0;
    for (let i = 0; i < 200; i++) {
      const r = generate({ seed: `escena-${i}`, space: 'arte', base: defaultRecipe() });
      if (r.meta.arch !== 'escena') continue;
      scenes++;
      expect(r.layers).toHaveLength(2);
      expect(r.layers[1].blend === 'screen' || r.layers[1].blend === 'add').toBe(true);
    }
    expect(scenes).toBeGreaterThan(5);
  });

  it('every palette family reads on its background: faint glyphs apart from it, strong ones legible', () => {
    for (const f of Object.keys(PALETTE5_NAMES) as Palette5Style[]) for (let i = 0; i < 40; i++) {
      const p = tune5(makePalette5(f, new Rng(`pal|${f}|${i}`)));
      const [bg] = hexToOklch(p.bg);
      const [l0] = hexToOklch(p.stops[0]);
      expect(Math.abs(l0 - bg), `${f} ${i}`).toBeGreaterThan(0.09);
      expect(contrastRatio(p.stops[p.stops.length - 1], p.bg), `${f} ${i}`).toBeGreaterThan(p.light ? 2.9 : 3.4);
      for (const s of [...p.stops, p.bg]) expect(s).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.stops.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('version 5 rolled like the studio: colour and variety', () => {
  for (const space of ['arte', 'fondos', 'media', 'tipo', 'terminal'] as SpaceId[]) {
    it(`${space}: vivid and varied palettes, few beige-brown or grey ones, no evident repeats in a row`, () => {
      const rs = session(space, 400, 'v5-color-' + space);
      const cols = rs.map(colourOf);
      const muddy = cols.filter(c => c.chroma >= 0.02 && c.chroma < 0.1 && c.hue >= 40 && c.hue <= 115).length / rs.length;
      const grey = cols.filter(c => c.chroma < 0.03).length / rs.length;
      const vivid = cols.filter(c => c.chroma >= 0.18).length / rs.length;
      expect(muddy, 'marrón/caqui').toBeLessThan(0.06);
      expect(grey, 'grises').toBeLessThan(0.08);
      expect(vivid, 'vivos').toBeGreaterThan(space === 'fondos' ? 0.2 : 0.3);
      // most hue families show up, and the next piece rarely has the colours of the one before
      const looks = rs.map(lookOf);
      expect(new Set(looks.map(colourFamily)).size).toBeGreaterThan(18);
      let sameFamily = 0, alike = 0, sameLead = 0;
      for (let i = 1; i < looks.length; i++) {
        if (colourFamily(looks[i]) === colourFamily(looks[i - 1])) sameFamily++;
        if (lookDistance(looks[i], looks[i - 1]) < 0.35) alike++;
        if (looks[i].lead === looks[i - 1].lead) sameLead++;
      }
      expect(sameFamily / (looks.length - 1), 'mismo color seguido').toBeLessThan(0.06);
      expect(alike / (looks.length - 1), 'parecida a la anterior').toBeLessThan(0.01);
      expect(sameLead / (looks.length - 1), 'mismo patrón seguido').toBeLessThan(0.01);
      // the styles and patterns of the space all come up
      expect(new Set(rs.map(r => r.meta.arch)).size).toBe(Object.keys(SPACES.find(s => s.id === space)!.archs).length);
      expect(new Set(rs.map(r => r.layers[0].pattern)).size).toBeGreaterThan(space === 'tipo' || space === 'fondos' ? 50 : 60);
    });
  }

  it('with «Color» locked the colours stay while everything else keeps changing', () => {
    const rs = session('arte', 40, 'v5-color-lock', ['color']);
    for (const r of rs.slice(1)) expect(r.color).toEqual(rs[0].color);
    expect(new Set(rs.map(r => r.layers[0].pattern)).size).toBeGreaterThan(30);
  });
});
