/**
 * Writes tests/unit/fixtures/generator-v8.json: the golden rolls of version 8, once, when it is published (never
 * regenerated to accept a change: a change that breaks them is version 9).
 *
 *   npx tsx scripts/azar8-fixture.ts
 */
import { writeFileSync } from 'node:fs';
import '../src/families/all';
import { defaultRecipe, type Recipe } from '../src/engine/recipe';
import { famReads } from '../src/families/params';
import { familyById } from '../src/families/registry';
import { fingerprint, generate } from '../src/random/generator';
import type { LockGroup } from '../src/random/spaces';
const spaces = ['fondos', 'arte', 'media', 'tipo', 'terminal'] as const;
type Case = { gen: 8; seed: string; space: string; baseSeed?: string; locks?: LockGroup[]; fp: string; recipe: unknown };
const cases: Case[] = [];
const add = (seed: string, space: typeof spaces[number], baseSeed?: string, locks?: LockGroup[]) => {
  const base = baseSeed ? generate({ seed: baseSeed, space, base: defaultRecipe(), gen: 8 }) : defaultRecipe();
  const r = generate({ seed, space, base, gen: 8, ...(locks ? { locks } : {}) });
  cases.push({ gen: 8, seed, space, ...(baseSeed ? { baseSeed, locks } : {}), fp: fingerprint(r), recipe: JSON.parse(JSON.stringify(r)) });
  return r;
};
for (const space of spaces) for (let i = 0; i < 30; i++) add(`faro-v8-${space}-${i}`, space);
// what is new in version 8, a few rolls of each (the first seeds of a fixed series that show it)
const reads = (r: Recipe) => r.layers.some(l => l.fam && famReads(familyById(l.pattern)!, l.fam.v, 'source'));
const below = (r: Recipe) => r.layers.length > 1 && !!r.layers[1].fam && famReads(familyById(r.layers[1].pattern)!, r.layers[1].fam!.v, 'below');
const want: Array<[string, (typeof spaces)[number][], (r: Recipe) => boolean]> = [
  ['lee la foto', ['media'], reads],
  ['lee las palabras', ['tipo'], reads],
  ['capa de abajo', ['fondos', 'arte'], below],
  ['esfera', ['fondos', 'arte', 'media'], r => r.optics?.kind === 'esfera'],
  ['poliedro', ['fondos', 'arte', 'media'], r => r.optics?.kind === 'poliedro'],
  ['destello', ['arte', 'media', 'tipo'], r => r.fxKind?.bloom === 'anamorfico'],
  ['papel', ['arte', 'media', 'tipo'], r => r.fxKind?.grain === 'papel'],
];
const extra: Record<string, number> = {};
for (const [name, sp, ok] of want) {
  let n = 0;
  for (const space of sp) for (let i = 0; i < 4000 && n < 3 * sp.length; i++) {
    const seed = `faro-v8x-${space}-${i}`;
    const r = generate({ seed, space, base: defaultRecipe(), gen: 8 });
    if (!ok(r) || cases.some(c => c.seed === seed && c.space === space)) continue;
    add(seed, space); n++;
    if (n % 3 === 0) break;
  }
  extra[name] = n;
}
// a locked «Efectos» keeps the base's glass and effect shapes (and drops what the base does not have)
let locked = 0;
for (let i = 0; i < 4000 && locked < 4; i++) {
  const baseSeed = `faro-v8x-media-${i}`;
  const b = generate({ seed: baseSeed, space: 'media', base: defaultRecipe(), gen: 8 });
  if (!b.fxKind && !b.optics) continue;
  add(`faro-v8-candado-${i}`, 'media', baseSeed, ['efectos']); locked++;
}
writeFileSync('tests/unit/fixtures/generator-v8.json', JSON.stringify({ gens: [8], note: 'Versión 8 del generador tal como se publicó en el cierre del PR #10 (las familias del cierre, las que leen tu foto o tus palabras hechas con ellas, la capa de abajo, vidrio sólido, destello y papel): 30 tiradas por espacio con la receta por defecto como base, más las primeras semillas de una serie fija que muestran cada novedad y cuatro tiradas con «Efectos» bloqueado sobre una base de la versión 8. No se regenera: un cambio que la rompe es la versión 9.', cases }, null, 1));
console.log(cases.length, JSON.stringify(extra), 'candados', locked);
