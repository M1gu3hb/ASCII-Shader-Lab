/**
 * Writes src/families/index-data.ts: what every page needs to know of each visual family without loading its
 * spec (id, name, group, kind, algorithm version, loop, colour). The specs (parameters, presets, budgets) are
 * their own chunk (registry.ts). tests/unit/families-index.test.ts fails when this file is out of date.
 *
 *   npx esbuild scripts/families-index.ts --bundle --platform=node --format=esm --outfile=.cache/families-index.mjs && node .cache/families-index.mjs
 */
import { writeFileSync } from 'node:fs';
import { FAMILIES } from '../src/families/all';
import { indexSource } from '../src/families/index-source';

writeFileSync('src/families/index-data.ts', indexSource(FAMILIES));
console.log(`${FAMILIES.length} familias en el índice`);
