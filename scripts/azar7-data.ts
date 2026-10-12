/**
 * Writes src/random/families7-data.ts: the families and presets version 7 of the dice draws from, frozen from
 * the registry at publication (PR #10). Run once when version 7 is published; afterwards the file is history
 * (a later change to the families is version 8), and tests/unit/generator-versions.test.ts keeps its rolls.
 *
 *   npx esbuild scripts/azar7-data.ts --bundle --platform=node --format=esm --outfile=.cache/azar7-data.mjs && node .cache/azar7-data.mjs
 */
import { writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/registry';
import { famFor } from '../src/families/params';
import { usesOf } from '../src/families/uses';

type V = number | string | boolean;
const rows = FAMILIES.map(f => {
  const keys = f.params.map(p => p.key);
  const presets = f.presets.map(pr => {
    const fam = famFor(f, 'x', pr.id);
    const uses = usesOf(f, pr).join(',');
    const colour = f.color && pr.look?.colorMode === 'source' ? pr.look.vivid ?? 0.8 : 0;
    return [pr.id, pr.layer?.scale ?? 1, pr.layer?.speed ?? 1, fam.v, fam.res ?? null, uses, colour, ...keys.map(k => fam.p[k] as V)];
  });
  return [f.id, f.caps.loop ? 1 : 0, keys, presets];
});

writeFileSync('src/random/families7-data.ts', `/**
 * The families and presets version 7 of the dice draws from, frozen as they were published (PR #10): per
 * family whether it keeps «Bucle perfecto», its parameter keys and, per preset, [id, layer scale, layer speed,
 * algorithm version, rows or null, where the library offers it (its uses, comma-separated), the strength of its
 * own colour (0: by brightness), ...parameter values in key order]. Generated once by scripts/azar7-data.ts from
 * the registry of that moment: never edit by hand (tests/unit/generator-versions.test.ts).
 */
type V = number | string | boolean;
export const FAMILIES7_DATA: ReadonlyArray<[string, 0 | 1, string[], Array<[string, number, number, number, number | null, string, number, ...V[]]>]> = ${JSON.stringify(rows)};
`);
console.log(`${rows.length} familias, ${rows.reduce((a, r) => a + (r[3] as unknown[]).length, 0)} presets`);
