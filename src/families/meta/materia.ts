import type { FamilyMeta } from '../types';
import { META as corrientes } from './corrientes';
import { META as ecos } from './ecos';
import { META as membrana } from './membrana';
import { META as paneles } from './paneles';
import { META as cromado } from './cromado';
import { META as desgarro } from './desgarro';
import { META as haces_luz } from './haces_luz';
import { META as talla_diamante } from './talla_diamante';
import { META as neon_tubos } from './neon_tubos';

/** Colour, matter and optics: fields with their own colour, surfaces, refraction and feedback. */
export const MATERIA: FamilyMeta[] = [corrientes, ecos, membrana, paneles, cromado, desgarro, haces_luz, talla_diamante, neon_tubos];
