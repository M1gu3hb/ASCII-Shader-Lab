/**
 * Writes src/random/families8-data.ts: the families and presets version 8 of the dice draws from, frozen from
 * the registry at the closing of PR #10. Run once when version 8 is published; afterwards the file is history
 * (a later change to the families is version 9), and tests/unit/generator-versions.test.ts keeps its rolls.
 *
 *   npx esbuild scripts/azar8-data.ts --bundle --platform=node --format=esm --outfile=.cache/azar8-data.mjs && node .cache/azar8-data.mjs
 */
import { writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/all';
import { famFor, famReads } from '../src/families/params';
import { usesOf } from '../src/families/uses';

type V = number | string | boolean;
const rows = FAMILIES.map(f => {
  const keys = f.params.map(p => p.key);
  const presets = f.presets.map(pr => {
    const fam = famFor(f, 'x', pr.id);
    const uses = usesOf(f, pr).join(',');
    const colour = f.color && pr.look?.colorMode === 'source' ? pr.look.vivid ?? 0.8 : 0;
    const below = pr.below ? [pr.below.pattern, pr.below.preset ?? null, pr.below.mix ?? 1] : null;
    return [pr.id, pr.layer?.scale ?? 1, pr.layer?.speed ?? 1, fam.v, fam.res ?? null, uses, colour, pr.text?.size ?? null, below, ...keys.map(k => fam.p[k] as V)];
  });
  return [f.id, f.caps.loop ? 1 : 0, famReads(f, f.version, 'source') ? 1 : 0, keys, presets];
});

writeFileSync('src/random/families8-data.ts', `/**
 * The families and presets version 8 of the dice draws from, frozen as they were published (closing of PR #10):
 * per family whether it keeps «Bucle perfecto», whether it reads the photo or the words, its parameter keys and,
 * per preset, [id, layer scale, layer speed, algorithm version, rows or null, where the library offers it (its
 * uses, comma-separated), the strength of its own colour (0: by brightness), the size of the words in Texto or
 * null, the layer it shows under it ([pattern, preset or null, mix]) or null, ...parameter values in key order].
 * Generated once by scripts/azar8-data.ts from the registry of that moment: never edit by hand
 * (tests/unit/generator-versions.test.ts).
 */
type V = number | string | boolean;
type Below = [string, string | null, number] | null;
export const FAMILIES8_DATA: ReadonlyArray<[string, 0 | 1, 0 | 1, string[], Array<[string, number, number, number, number | null, string, number, number | null, Below, ...V[]]>]> = ${JSON.stringify(rows)};
`);
console.log(`${rows.length} familias, ${rows.reduce((a, r) => a + (r[4] as unknown[]).length, 0)} presets`);
