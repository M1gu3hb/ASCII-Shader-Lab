import type { FamilyMeta } from '../types';
import { META as fluido } from './fluido';
import { META as agua } from './agua';
import { META as erosion } from './erosion';

/** Physics and motion: fluids, bodies, agents and surfaces that evolve by their model. */
export const FISICA: FamilyMeta[] = [fluido, agua, erosion];
