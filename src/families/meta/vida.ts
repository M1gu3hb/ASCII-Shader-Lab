import type { FamilyMeta } from '../types';
import { META as reaccion_difusion } from './reaccion_difusion';
import { META as dla } from './dla';
import { META as crecimiento } from './crecimiento';

/** Life and chemistry: fields and agents that organise themselves. */
export const VIDA: FamilyMeta[] = [reaccion_difusion, dla, crecimiento];
