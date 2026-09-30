import { describe, expect, it } from 'vitest';
import { defaultRecipe, patternById, type Recipe } from '../../src/engine';
import {
  generate, keepChance, lookDistance, lookOf, meanPairwiseDistance, randomSeed, roll, Rng, type LockGroup, type SpaceId,
} from '../../src/random';

/** A person pressing the dice n times in a space, as the studio does (seeded, so the numbers are stable). */
function session(space: SpaceId, n: number, key: string, o: { recent?: boolean; gen?: number; locks?: LockGroup[] } = {}) {
  const stream = new Rng(key);
  const seen = new Set<string>();
  let base = defaultRecipe();
  const out: Array<{ recipe: Recipe; seed: string }> = [];
  for (let i = 0; i < n; i++) {
    const res = roll({
      space, base, seen, locks: o.locks, gen: o.gen, fresh: () => randomSeed(stream), rand: () => stream.next(),
      recent: o.recent === false ? undefined : out.slice(-10).map(x => x.recipe),
    });
    seen.add(res.fp);
    base = res.recipe;
    out.push({ recipe: res.recipe, seed: res.seed });
  }
  return out;
}
const lead = (r: Recipe) => r.layers[0].pattern;

describe('keepChance', () => {
  const a = generate({ seed: 'uno', space: 'arte', base: defaultRecipe() });
  const all = { lead: true, arch: true, look: true };
  it('is 1 with nothing recent, and holds back the lead and style just seen', () => {
    expect(keepChance(a, [], all)).toBe(1);
    const same = lookOf(a);
    expect(keepChance(a, [same], { lead: true, arch: false, look: false })).toBeCloseTo(0.04);
    expect(keepChance(a, [same], { lead: false, arch: true, look: false })).toBeCloseTo(0.3);
    // seen further back weighs less
    const other = lookOf(generate({ seed: 'dos', space: 'arte', base: defaultRecipe() }));
    const back = keepChance(a, [same, other, other, other], { lead: true, arch: false, look: false });
    expect(back).toBeGreaterThan(0.04);
    expect(back).toBeLessThan(1);
  });
  it('a look identical to one of the last five is rarely kept', () => {
    expect(lookDistance(lookOf(a), lookOf(a))).toBe(0);
    expect(keepChance(a, [lookOf(a)], { lead: false, arch: false, look: true })).toBeCloseTo(0.2);
  });
});

describe('roll with recent results', () => {
  it('whatever it keeps, its seed alone reproduces it', () => {
    for (const r of session('arte', 60, 'repro')) expect(generate({ seed: r.seed, space: 'arte', base: defaultRecipe() }).layers).toEqual(r.recipe.layers);
  });

  // (5 × 1000 rolls: a few seconds, more on a busy machine)
  it('never serves the same lead twice in a row often, in any space, and spreads the leads', { timeout: 30_000 }, () => {
    for (const space of ['arte', 'fondos', 'media', 'tipo', 'terminal'] as SpaceId[]) {
      const rs = session(space, 1000, 'dist-' + space).map(x => x.recipe);
      let sameLead = 0;
      const count = new Map<string, number>();
      rs.forEach((r, i) => {
        count.set(lead(r), (count.get(lead(r)) ?? 0) + 1);
        if (i && lead(rs[i - 1]) === lead(r)) sameLead++;
      });
      const top = Math.max(...count.values()) / rs.length;
      expect(sameLead / (rs.length - 1), space).toBeLessThanOrEqual(0.02);
      expect(top, space).toBeLessThanOrEqual(space === 'arte' ? 0.045 : 0.065);
    }
  });

  it('50 consecutive results look more varied than with the first dice (generator 1, no memory)', () => {
    for (const space of ['arte', 'fondos', 'terminal'] as SpaceId[]) {
      const now = session(space, 200, 'div-' + space).map(x => lookOf(x.recipe));
      const before = session(space, 200, 'div-' + space, { gen: 1, recent: false }).map(x => lookOf(x.recipe));
      const mean = (ls: ReturnType<typeof lookOf>[]) => [0, 50, 100, 150].reduce((s, i) => s + meanPairwiseDistance(ls.slice(i, i + 50)), 0) / 4;
      expect(mean(now), space).toBeGreaterThan(mean(before));
    }
  });

  it('3D objects: a real share of Arte and Terminal, none under photos or inside letters, few behind web content', () => {
    const share = (space: SpaceId) => session(space, 300, 'solid-' + space).filter(x => patternById(lead(x.recipe)).family === 'solidos').length / 300;
    expect(share('arte')).toBeGreaterThan(0.15);
    expect(share('arte')).toBeLessThan(0.35);
    expect(share('terminal')).toBeGreaterThan(0.15);
    expect(share('media')).toBe(0);
    expect(share('tipo')).toBe(0);
    expect(share('fondos')).toBeLessThan(0.08);
  });

  it('with «Forma» locked the lead stays the base\'s, and rolling still ends', () => {
    const rs = session('arte', 30, 'locked', { locks: ['forma'] });
    for (const r of rs.slice(1)) expect(lead(r.recipe)).toBe(lead(rs[0].recipe));
  });
});
