import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe, PATTERN_IDS, patternById, type Recipe } from '../../src/engine';
import { fingerprint, generate, genOf, GEN_VERSION, GEN_VERSIONS, roll, SPACES, type LockGroup, type SpaceId } from '../../src/random';

interface Case { seed: string; space: SpaceId; arch?: string; locks?: LockGroup[]; base?: 'prev' | 'media' | 'text'; fp: string; recipe: Recipe }
const fixture = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/generator-v1.json'), 'utf8')) as { gen: number; cases: Case[] };
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

  it('version 2: a 3D object is only ever the lead layer, and never under a photo or inside letters', () => {
    for (const s of SPACES) for (let i = 0; i < 150; i++) {
      const r = generate({ seed: `v2-${i}`, space: s.id, base: defaultRecipe() });
      r.layers.slice(1).forEach(l => expect(patternById(l.pattern).family, `${s.id} v2-${i}`).not.toBe('solidos'));
      if (s.id === 'media' || s.id === 'tipo') expect(patternById(r.layers[0].pattern).family).not.toBe('solidos');
      const n = normalizeRecipe(r, PATTERN_IDS);
      expect(n.layers).toEqual(r.layers);
    }
  });
});
