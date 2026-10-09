import type { FamilyMeta } from '../types';
import { META as reaccion_difusion } from './reaccion_difusion';
import { META as physarum } from './physarum';
import { META as lenia } from './lenia';
import { META as automata } from './automata';
import { META as kuramoto } from './kuramoto';

/** Life and chemistry: fields and agents that organise themselves. */
export const VIDA: FamilyMeta[] = [reaccion_difusion, physarum, lenia, automata, kuramoto];
