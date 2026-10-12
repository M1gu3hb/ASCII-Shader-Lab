import type { FamilyMeta } from '../types';
import { META as corrientes } from './corrientes';
import { META as ecos } from './ecos';
import { META as membrana } from './membrana';
import { META as paneles } from './paneles';
import { META as cromado } from './cromado';
import { META as desgarro } from './desgarro';
import { META as metal_fundido } from './metal_fundido';
import { META as seda } from './seda';
import { META as grietas_oro } from './grietas_oro';

/** Colour, matter and optics: fields with their own colour, surfaces, refraction and feedback. */
export const MATERIA: FamilyMeta[] = [corrientes, ecos, membrana, paneles, cromado, desgarro, metal_fundido, seda, grietas_oro];
