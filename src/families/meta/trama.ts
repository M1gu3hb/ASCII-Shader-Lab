import type { FamilyMeta } from '../types';
import { META as lluvia_agua } from './lluvia_agua';
import { META as tejido_bandas } from './tejido_bandas';
import { META as estatica_vhs } from './estatica_vhs';
import { META as estratos } from './estratos';
import { META as puntos_orbita } from './puntos_orbita';
import { META as anillo_humo } from './anillo_humo';
import { META as rejilla_puntos } from './rejilla_puntos';
import { META as globo_puntos } from './globo_puntos';
import { META as arcos_parciales } from './arcos_parciales';
import { META as anillos_tronco } from './anillos_tronco';

/**
 * Close-out of PR #10, group «trama» (rows I-15, I-17, I-19, I-23, I-25, I-26, I-28, I-29, I-30, I-32 of the
 * inventory): compositions that needed a mechanism of their own. Each family keeps its library group.
 */
export const TRAMA: FamilyMeta[] = [lluvia_agua, tejido_bandas, estatica_vhs, estratos, puntos_orbita, anillo_humo, rejilla_puntos, globo_puntos, arcos_parciales, anillos_tronco];
