import { describe, expect, it } from 'vitest';
import { defaultRecipe } from '../../src/engine/recipe';
import { generate } from '../../src/random/generator';
import { FAMILIES7_DATA } from '../../src/random/families7-data';
import type { SpaceId } from '../../src/random/spaces';
import { spaceAccepts } from '../../src/studio/presets';

/**
 * Generator version 7 (PR #10 review): visual families chosen by use and look in every space that has them,
 * never by mechanism; colour families in their colour; glass in front now and then. The exact rolls are kept by
 * the golden fixture (generator-versions.test.ts); these are the properties every roll keeps.
 */

const SPACES: SpaceId[] = ['fondos', 'arte', 'terminal', 'tipo', 'media'];
const N = 300;
const DATA = new Map(FAMILIES7_DATA.map(([id, , keys, presets]) => [id, { keys, presets }]));

/** The frozen preset a family layer was made from (its parameters, in key order). */
function presetOf(id: string, p: Record<string, unknown>) {
  const f = DATA.get(id)!;
  return f.presets.find(pr => f.keys.every((k, i) => pr[7 + i] === p[k]));
}

describe('azar, versión 7', () => {
  for (const space of SPACES) {
    it(`${space}: una familia que encabeza viene de un preset que la biblioteca ofrece en ese espacio`, () => {
      let families = 0, glass = 0;
      for (let i = 0; i < N; i++) {
        const r = generate({ seed: `v7-${space}-${i}`, space, base: defaultRecipe(), gen: 7 });
        expect(r.meta.gen).toBe(7);
        expect(spaceAccepts(space, r), `${space}/${i}`).toBe(true);
        if (r.optics) glass++;
        const lead = r.layers[0];
        if (!lead.fam || !DATA.has(lead.pattern)) continue;
        families++;
        const pr = presetOf(lead.pattern, lead.fam.p);
        expect(pr, `${space}/${i}: ${lead.pattern}`).toBeTruthy();
        expect(pr![5].split(','), `${space}/${i}: ${lead.pattern}:${pr![0]}`).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${space}/`))]));
        // a colour family keeps its colour (not over a photo: there the photo's colour leads)
        if (pr![6] > 0 && space !== 'media') expect(r.color.mode, `${space}/${i}`).toBe('source');
        // a texture inside the words keeps them: the text is still the source
        if (space === 'tipo') expect(['text', 'pattern']).toContain(r.source);
        if (space === 'media') expect(['image', 'video', 'camera']).toContain(r.source);
      }
      const offered = FAMILIES7_DATA.some(([, , , presets]) => presets.some(pr => pr[5].split(',').some(u => u.startsWith(space + '/'))));
      if (offered) expect(families, `${space}: alguna familia en ${N} tiradas`).toBeGreaterThan(0);
      else expect(families).toBe(0);
      // glass in front only where it reads (never inside words nor in a terminal)
      if (space === 'tipo' || space === 'terminal') expect(glass).toBe(0);
      else expect(glass, `${space}: algún vidrio en ${N} tiradas`).toBeGreaterThan(0);
    });
  }

  it('cada sección con familias de cada espacio sale alguna vez (ningún cajón por mecanismo)', () => {
    const seen = new Set<string>();
    for (const space of SPACES) for (let i = 0; i < N * 2; i++) {
      const r = generate({ seed: `sec-${space}-${i}`, space, base: defaultRecipe(), gen: 7 });
      const lead = r.layers[0];
      if (!lead.fam || !DATA.has(lead.pattern)) continue;
      for (const u of presetOf(lead.pattern, lead.fam.p)![5].split(',')) if (u.startsWith(space + '/')) seen.add(u);
    }
    const all = new Set(FAMILIES7_DATA.flatMap(([, , , presets]) => presets.flatMap(pr => pr[5].split(',').filter(Boolean))));
    const sections = new Set([...all].filter(u => SPACES.some(s => u.startsWith(s + '/'))));
    for (const u of sections) expect(seen, u).toContain(u);
    for (const u of sections) expect(u).not.toMatch(/ciencia|fam-/);
  });
});
