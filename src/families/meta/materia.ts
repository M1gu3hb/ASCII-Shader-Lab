import type { FamilyMeta } from '../types';
import { META as corrientes } from './corrientes';
import { META as ecos } from './ecos';

/** Colour, matter and optics: fields with their own colour, surfaces, refraction and feedback. */
export const MATERIA: FamilyMeta[] = [corrientes, ecos];
