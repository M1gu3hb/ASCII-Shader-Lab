import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../../src/families/all';
import { indexSource } from '../../src/families/index-source';
import { FAMILY_IDS, familyEntry, isAnalytic, isColorFamily, isRaster, layerColours } from '../../src/families/registry';

/**
 * The index every page carries instead of the families' specs (registry.ts): generated from the specs, never
 * out of date (scripts/families-index.ts rewrites it), and saying of each family what its spec says.
 */
describe('índice de familias', () => {
  it('está al día con las fichas (si no, node .cache/families-index.mjs lo regenera)', () => {
    const file = readFileSync(join(import.meta.dirname, '../../src/families/index-data.ts'), 'utf8');
    expect(file).toBe(indexSource(FAMILIES));
  });

  it('dice de cada familia lo mismo que su ficha', () => {
    expect([...FAMILY_IDS]).toEqual(FAMILIES.map(f => f.id));
    for (const f of FAMILIES) {
      const e = familyEntry(f.id)!;
      expect([e.name, e.group, e.kind, e.v, e.loop], f.id).toEqual([f.name, f.group, f.kind, f.version, f.caps.loop]);
      expect(isRaster(f.id), f.id).toBe(f.kind !== 'analytic');
      expect(isAnalytic(f.id), f.id).toBe(f.kind === 'analytic');
      // a family that may draw its own colour (raster ones from the version in colorSince, PR #10 close-out)
      expect(isColorFamily(f.id), f.id).toBe(!!f.color);
      if (f.color && f.kind !== 'analytic') expect(e.colorSince, f.id).toBe(f.colorSince ?? 1);
    }
  });

  it('una capa de una familia raster de color sólo da color desde la versión que lo trae', () => {
    for (const f of FAMILIES.filter(x => x.color && x.kind !== 'analytic')) {
      const since = f.colorSince ?? 1;
      expect(layerColours({ pattern: f.id, fam: { v: since } }), f.id).toBe(true);
      if (since > 1) expect(layerColours({ pattern: f.id, fam: { v: since - 1 } }), f.id).toBe(false);
    }
    // analytic colour families always; a pattern never
    const analytic = FAMILIES.find(x => x.color && x.kind === 'analytic')!;
    expect(layerColours({ pattern: analytic.id, fam: { v: 1 } })).toBe(true);
    expect(layerColours({ pattern: 'ondas' })).toBe(false);
  });
});
