import { describe, expect, it } from 'vitest';
import { defaultRecipe, normalizeRecipe } from '../../src/engine/recipe';
import { generate } from '../../src/random/generator';
import { FAMILIES8_DATA } from '../../src/random/families8-data';
import { FAMILIES7_DATA } from '../../src/random/families7-data';
import type { SpaceId } from '../../src/random/spaces';
import { spaceAccepts } from '../../src/studio/presets';

/**
 * Generator version 8 (closing of PR #10): version 7's way of choosing over the families of the closing; those
 * that read the photo or the words are made of them; a preset that shows the layer under it brings it; solids of
 * glass; now and then the shape of an effect. The exact rolls are kept by the golden fixture
 * (generator-versions.test.ts); these are the properties every roll keeps.
 */

const SPACES: SpaceId[] = ['fondos', 'arte', 'terminal', 'tipo', 'media'];
const N = 300;
const DATA = new Map(FAMILIES8_DATA.map(([id, , reads, keys, presets]) => [id, { reads: reads === 1, keys, presets }]));
const VALUES = 9;

/** The frozen preset a family layer was made from (its parameters, in key order). */
function presetOf(id: string, p: Record<string, unknown>) {
  const f = DATA.get(id)!;
  return f.presets.find(pr => f.keys.every((k, i) => pr[VALUES + i] === p[k]));
}

describe('azar, versión 8', () => {
  it('congela las familias del cierre: todas las de la versión 7 y las nuevas, sin sección «ciencia»', () => {
    const v7 = new Set(FAMILIES7_DATA.map(([id]) => id));
    const v8 = new Set(FAMILIES8_DATA.map(([id]) => id));
    for (const id of v7) expect(v8, id).toContain(id);
    expect(v8.size).toBeGreaterThan(v7.size);
    for (const [, , , , presets] of FAMILIES8_DATA) for (const pr of presets) expect(pr[5]).not.toMatch(/ciencia|fam-/);
    // the families that read the piece are frozen as such
    for (const id of ['ecos', 'cromado', 'desgarro', 'grabado']) expect(DATA.get(id)?.reads, id).toBe(true);
  });

  for (const space of SPACES) {
    it(`${space}: la familia viene de un preset ofrecido en ese espacio; si lee la pieza, se hace con ella`, () => {
      let families = 0, reading = 0, glass = 0;
      for (let i = 0; i < N; i++) {
        const r = generate({ seed: `v8-${space}-${i}`, space, base: defaultRecipe(), gen: 8 });
        expect(r.meta.gen).toBe(8);
        expect(spaceAccepts(space, r), `${space}/${i}`).toBe(true);
        // the recipe is already what a save writes (optional keys in their one order)
        expect(JSON.stringify(normalizeRecipe(r)), `${space}/${i}`).toBe(JSON.stringify(r));
        if (r.optics) glass++;
        const lead = [...r.layers].reverse().find(l => l.fam && DATA.has(l.pattern));
        if (!lead) continue;
        families++;
        const pr = presetOf(lead.pattern, lead.fam!.p);
        expect(pr, `${space}/${i}: ${lead.pattern}`).toBeTruthy();
        expect(pr![5].split(','), `${space}/${i}: ${lead.pattern}:${pr![0]}`).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${space}/`))]));
        if (pr![6] > 0 && space !== 'media') expect(r.color.mode, `${space}/${i}`).toBe('source');
        const reads = DATA.get(lead.pattern)!.reads;
        if (reads && (space === 'media' || space === 'tipo')) {
          reading++;
          // made of the photo or the words: drawn alone, not mixed over them
          expect(r.media.mix, `${space}/${i}`).toBe(1);
          expect(r.media.blend, `${space}/${i}`).toBe('normal');
          if (space === 'tipo' && pr![7] !== null) expect(r.text.size).toBe(pr![7]);
        } else if (space === 'media') {
          expect([r.media.mix, r.media.blend]).toEqual([0.5, 'screen']);
        }
        // a preset that shows the layer under it brings that layer, under it
        if (pr![8]) {
          expect(r.layers.length).toBe(2);
          expect(r.layers[1]).toBe(lead);
          expect(r.layers[0].pattern).toBe(pr![8][0]);
          expect(r.layers[0].mix).toBe(pr![8][2]);
        }
        if (space === 'tipo') expect(r.source).toBe('text');
        if (space === 'media') expect(['image', 'video', 'camera']).toContain(r.source);
      }
      expect(families, `${space}: alguna familia en ${N} tiradas`).toBeGreaterThan(0);
      if (space === 'media' || space === 'tipo') expect(reading, `${space}: alguna familia que lee la pieza`).toBeGreaterThan(0);
      if (space === 'tipo' || space === 'terminal') expect(glass).toBe(0);
      else expect(glass, `${space}: algún vidrio en ${N} tiradas`).toBeGreaterThan(0);
    });
  }

  it('el vidrio puede ser lluvia, acanalado, una bola o una gema; el destello sólo donde hay brillo y el papel sobre una paleta clara', () => {
    const kinds = new Set<string>();
    let flare = 0, paper = 0;
    for (const space of ['fondos', 'arte', 'media', 'tipo', 'terminal'] as SpaceId[]) for (let i = 0; i < 600; i++) {
      const r = generate({ seed: `acab-${space}-${i}`, space, base: defaultRecipe(), gen: 8 });
      if (r.optics) kinds.add(r.optics.kind);
      if (r.optics && (r.optics.kind === 'esfera' || r.optics.kind === 'poliedro')) {
        expect(Math.abs(r.optics.x!)).toBeLessThanOrEqual(0.25);
        expect(r.optics.ior).toBeGreaterThan(1.3);
      }
      if (r.fxKind?.bloom) { flare++; expect(r.fx.bloom).toBeGreaterThanOrEqual(0.25); expect(space).not.toBe('terminal'); }
      if (r.fxKind?.grain) { paper++; expect(r.fx.grain).toBeGreaterThanOrEqual(0.2); expect(['arte', 'media', 'tipo']).toContain(space); }
      if (r.fxKind?.fold) expect(r.fxKind.grain).toBe('papel');
    }
    expect([...kinds].sort()).toEqual(['acanalado', 'esfera', 'lluvia', 'poliedro']);
    expect(flare).toBeGreaterThan(10);
    expect(paper).toBeGreaterThan(0);
  });

  it('con «Efectos» bloqueado, la tirada conserva el vidrio y la forma de los efectos de la base (y no inventa otros)', () => {
    const base = normalizeRecipe({ ...defaultRecipe(), optics: { kind: 'esfera' }, fxKind: { bloom: 'anamorfico', grain: 'papel', fold: 'carta' } });
    const plain = defaultRecipe();
    for (let i = 0; i < 200; i++) {
      const kept = generate({ seed: `candado-${i}`, space: 'arte', base, gen: 8, locks: ['efectos'] });
      expect(kept.optics).toEqual(base.optics);
      expect(kept.fxKind).toEqual(base.fxKind);
      const none = generate({ seed: `candado-${i}`, space: 'arte', base: plain, gen: 8, locks: ['efectos'] });
      expect(none.optics).toBeUndefined();
      expect(none.fxKind).toBeUndefined();
    }
  });

  it('cada sección con familias de cada espacio sale alguna vez', () => {
    const seen = new Set<string>();
    for (const space of SPACES) for (let i = 0; i < N * 2; i++) {
      const r = generate({ seed: `sec-${space}-${i}`, space, base: defaultRecipe(), gen: 8 });
      const lead = [...r.layers].reverse().find(l => l.fam && DATA.has(l.pattern));
      if (!lead) continue;
      for (const u of presetOf(lead.pattern, lead.fam!.p)![5].split(',')) if (u.startsWith(space + '/')) seen.add(u);
    }
    const all = new Set(FAMILIES8_DATA.flatMap(([, , , , presets]) => presets.flatMap(pr => pr[5].split(',').filter(Boolean))));
    for (const u of [...all].filter(u => SPACES.some(s => u.startsWith(s + '/')))) expect(seen, u).toContain(u);
  });
});
