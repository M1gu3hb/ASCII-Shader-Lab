import type { FamilyMeta } from '../types';
import { META as corrientes } from './corrientes';
import { META as ecos } from './ecos';
import { META as membrana } from './membrana';
import { META as paneles } from './paneles';

/** Colour, matter and optics: fields with their own colour, surfaces, refraction and feedback. */
export const MATERIA: FamilyMeta[] = [corrientes, ecos, membrana, paneles];
