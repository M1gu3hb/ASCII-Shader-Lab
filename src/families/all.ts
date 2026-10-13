import type { FamilyMeta } from './types';
import { VIDA } from './meta/vida';
import { FISICA } from './meta/fisica';
import { FORMA } from './meta/forma';
import { CIENCIA } from './meta/ciencia';
import { MATERIA } from './meta/materia';
import { TRAMA } from './meta/trama';
import { registerFamilies } from './registry';

/**
 * Every visual family's spec (parameters, presets, texts' keys, budgets), in library order: its own chunk, which
 * the registry loads when a piece, the library or the dice need it (registry.ts loadFamilyMetas). Importing it
 * registers them: the dice, the QA pages, the scripts and the tests import it directly.
 */
export const FAMILIES: readonly FamilyMeta[] = [...VIDA, ...FISICA, ...FORMA, ...CIENCIA, ...MATERIA, ...TRAMA];
registerFamilies(FAMILIES);
