import type { FamilyMeta } from '../types';
import { META as sistema_l } from './sistema_l';
import { META as hiperbolico } from './hiperbolico';
import { META as atractor } from './atractor';
import { META as wfc } from './wfc';

/** Form and geometry: grammars, constraints and chaos that build structures. */
export const FORMA: FamilyMeta[] = [sistema_l, atractor, wfc, hiperbolico];
