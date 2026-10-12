import type { FamilyMeta } from '../types';
import { META as corrientes } from './corrientes';
import { META as cromado } from './cromado';
import { META as desgarro } from './desgarro';

/** Colour, matter and optics: fields with their own colour, surfaces, refraction and feedback. */
export const MATERIA: FamilyMeta[] = [corrientes, cromado, desgarro];
