import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, PATTERN_IDS, patternById, type Recipe } from '../../src/engine';
import { fingerprint, generate, genOf, GEN_VERSION, GEN_VERSIONS, roll, SPACES, type LockGroup, type SpaceId } from '../../src/random';

interface Case { seed: string; space: SpaceId; arch?: string; locks?: LockGroup[]; base?: 'prev' | 'media' | 'text'; fp: string; recipe: Recipe }
const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v1.json'), 'utf8')) as { gen: number; cases: Case[] };
const fixture2 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v2.json'), 'utf8')) as { gen: number; cases: Case[] };
/** Versions 3 and 4 as captured before version 5 existed (each case carries its version, and its base when it is not the default). */
const fixture34 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v3v4.json'), 'utf8')) as { gens: number[]; cases: Array<Omit<Case, 'base'> & { gen: number; base?: Recipe }> };
/** Version 5 as published (the studio and the landing's contact sheet, whose 19 draws are in it). */
const fixture5 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v5.json'), 'utf8')) as typeof fixture34;
const fixture6 = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v6.json'), 'utf8')) as typeof fixture34;
/** Recipes live as JSON (history, favourites, links): compare that form (it also folds -0 into 0). */
const json = (r: Recipe) => JSON.parse(JSON.stringify(r)) as Recipe;

/** The bases the fixture was captured with (tests/unit/fixtures/generator-v1.json, before version 2 existed). */
function baseOf(c: Case): Recipe {
  const base = defaultRecipe();
  if (c.base === 'prev') return generate({ seed: 'base', space: 'arte', base, gen: 1 });
  if (c.base === 'media') { base.source = 'image'; base.media.ref = { id: 'abc123', kind: 'image', name: 'foto.png', w: 800, h: 600 }; }
  if (c.base === 'text') { base.source = 'text'; base.text.content = 'HOLA'; }
  return base;
}

describe('generator versions', () => {
  it('version 1 still weaves exactly what it wove before version 2 (and the same fingerprints)', () => {
    expect(fixture.gen).toBe(1);
    expect(fixture.cases.length).toBeGreaterThan(30);
    for (const c of fixture.cases) {
      const r = generate({ seed: c.seed, space: c.space, arch: c.arch, locks: c.locks, base: baseOf(c), gen: 1 });
      expect(json(r), `${c.space}/${c.seed}`).toEqual(c.recipe);
      expect(fingerprint(r)).toBe(c.fp);
    }
  });

  it('version 2 still weaves exactly what it wove before version 3 (and the same fingerprints)', () => {
    expect(fixture2.gen).toBe(2);
    expect(fixture2.cases.length).toBeGreaterThan(50);
    const base2 = (c: Case): Recipe => {
      const base = defaultRecipe();
      // the default text when the fixture was captured (the studio was called Monotrama then)
      base.text.content = 'MONOTRAMA';
      if (c.base === 'prev') return generate({ seed: 'base', space: 'arte', base, gen: 2 });
      if (c.base === 'media') { base.source = 'image'; base.media.ref = { id: 'abc123', kind: 'image', name: 'foto.png', w: 800, h: 600 }; }
      if (c.base === 'text') { base.source = 'text'; base.text.content = 'HOLA'; }
      return base;
    };
    for (const c of fixture2.cases) {
      const r = generate({ seed: c.seed, space: c.space, arch: c.arch, locks: c.locks, base: base2(c), gen: 2 });
      expect(json(r), `${c.space}/${c.seed}`).toEqual(c.recipe);
      expect(fingerprint(r)).toBe(c.fp);
    }
  });

  it('versions 3 and 4 still weave exactly what they wove before version 5 (and the same fingerprints)', () => {
    expect(fixture34.gens).toEqual([3, 4]);
    expect(fixture34.cases.length).toBeGreaterThan(100);
    for (const c of fixture34.cases) {
      const base = c.base ? (JSON.parse(JSON.stringify(c.base)) as Recipe) : defaultRecipe();
      const r = generate({ seed: c.seed, space: c.space, arch: c.arch, locks: c.locks, base, gen: c.gen });
      expect(json(r), `v${c.gen} ${c.space}/${c.seed}`).toEqual(c.recipe);
      expect(fingerprint(r), `v${c.gen} ${c.space}/${c.seed}`).toBe(c.fp);
    }
  });

  it('version 5 keeps weaving exactly what it wove when it was published (and the landing\'s contact sheet)', () => {
    expect(fixture5.gens).toEqual([5]);
    expect(fixture5.cases.length).toBeGreaterThan(70);
    for (const c of fixture5.cases) {
      const base = c.base ? (JSON.parse(JSON.stringify(c.base)) as Recipe) : defaultRecipe();
      // its Texto bases stand for a word the person wrote («HOLA»): the studio says so (GenInput.ownText)
      const ownText = base.source === 'text' ? true : undefined;
      const r = generate({ seed: c.seed, space: c.space, arch: c.arch, locks: c.locks, base, gen: 5, ownText });
      expect(json(r), `v5 ${c.space}/${c.seed}`).toEqual(c.recipe);
      expect(fingerprint(r), `v5 ${c.space}/${c.seed}`).toBe(c.fp);
    }
  });

  it('version 6 keeps weaving exactly what it wove when it was published, families included', () => {
    expect(fixture6.gens).toEqual([6]);
    expect(fixture6.cases.length).toBeGreaterThan(100);
    expect(fixture6.cases.filter(c => c.recipe.layers[0].fam).length).toBeGreaterThan(5);
    for (const c of fixture6.cases) {
      const r = generate({ seed: c.seed, space: c.space, base: defaultRecipe(), gen: 6 });
      expect(json(r), `v6 ${c.space}/${c.seed}`).toEqual(c.recipe);
      expect(fingerprint(r), `v6 ${c.space}/${c.seed}`).toBe(c.fp);
    }
  });

  it('version 3 weaves what version 2 does, plus transformations and letters that move', () => {
    const strip = (r: Recipe) => {
      const o = json(r);
      delete o.media.xform; delete o.text.anim; delete o.msg.anim;
      if (o.msg.mode === 'words') o.msg.mode = 'type';
      o.meta.gen = 0;
      return o;
    };
    let xf = 0, anim = 0, stills = 0;
    for (const s of SPACES) for (let i = 0; i < 60; i++) {
      const base = defaultRecipe();
      const a = generate({ seed: `v3-${i}`, space: s.id, base, gen: 2 });
      const b = generate({ seed: `v3-${i}`, space: s.id, base, gen: 3 });
      expect(strip(b), `${s.id} v3-${i}`).toEqual(strip(a));
      expect(normalizeRecipe(b, PATTERN_IDS)).toEqual(b);
      if (s.id === 'media') {
        if (b.media.xform?.length) xf++;
        // a still photo never gets a trail (it would do nothing)
        if (b.media.xform?.some(x => x.kind === 'estela')) stills++;
      }
      if (s.id === 'tipo' && b.text.anim) anim++;
      if (s.id === 'fondos' || s.id === 'arte') expect(json(b).media.xform).toBeUndefined();
    }
    expect(xf).toBeGreaterThan(25);
    expect(xf).toBeLessThan(50);
    expect(stills).toBe(0);
    expect(anim).toBeGreaterThan(18);
  });

  it('an explicit seed with a version reproduces through roll(), whatever was seen or rolled recently', () => {
    const c = fixture.cases.find(x => x.space === 'arte' && !x.arch && !x.base)!;
    const recent = [generate({ seed: 'otra', space: 'arte', base: defaultRecipe() })];
    const a = roll({ space: 'arte', base: defaultRecipe(), seen: new Set([c.fp]), seed: c.seed, gen: 1, recent });
    expect(json(a.recipe)).toEqual(c.recipe);
    expect(a.repeated).toBe(true);
    const b = roll({ space: 'arte', base: defaultRecipe(), seen: new Set(), seed: c.seed, recent });
    expect(b.recipe).toEqual(generate({ seed: c.seed, space: 'arte', base: defaultRecipe() }));
    expect(b.recipe.meta.gen).toBe(GEN_VERSION);
  });

  it('every version is deterministic and records itself in the recipe', () => {
    for (const gen of GEN_VERSIONS) for (const s of SPACES) {
      const a = generate({ seed: 'faro-lunar-417', space: s.id, base: defaultRecipe(), gen });
      expect(generate({ seed: 'faro-lunar-417', space: s.id, base: defaultRecipe(), gen })).toEqual(a);
      expect(a.meta.gen).toBe(gen);
    }
  });

  it('the current version differs from version 1 for the same seed', () => {
    let same = 0;
    for (let i = 0; i < 40; i++) {
      const a = generate({ seed: `s-${i}`, space: 'arte', base: defaultRecipe(), gen: 1 });
      const b = generate({ seed: `s-${i}`, space: 'arte', base: defaultRecipe() });
      if (fingerprint(a) === fingerprint(b)) same++;
    }
    expect(same).toBeLessThan(2);
  });

  it('unknown or missing versions weave with the current one', () => {
    expect(genOf(undefined)).toBe(GEN_VERSION);
    expect(genOf('1')).toBe(1);
    expect(genOf(1)).toBe(1);
    expect(genOf('99')).toBe(GEN_VERSION);
    expect(genOf('abc')).toBe(GEN_VERSION);
    expect(generate({ seed: 'x', space: 'arte', base: defaultRecipe(), gen: 99 })).toEqual(generate({ seed: 'x', space: 'arte', base: defaultRecipe() }));
  });

  it('versions 2 and later: a 3D object is only ever the lead layer, and never under a photo or inside letters', () => {
    for (const gen of [2, 5]) for (const s of SPACES) for (let i = 0; i < 150; i++) {
      const r = generate({ seed: `v2-${i}`, space: s.id, base: defaultRecipe(), gen });
      // (a composed scene of the studio may keep an object turning behind its particles, as it was designed)
      if (r.meta.arch !== 'escena') r.layers.slice(1).forEach(l => expect(patternById(l.pattern).family, `${s.id} v2-${i}`).not.toBe('solidos'));
      if (s.id === 'media' || s.id === 'tipo') expect(patternById(r.layers[0].pattern).family).not.toBe('solidos');
      const n = normalizeRecipe(r, PATTERN_IDS);
      expect(n.layers).toEqual(r.layers);
    }
  });
});
