import type { FamilyMeta } from '../types';
import { META as boids } from './boids';
import { META as gravedad } from './gravedad';
import { META as tela } from './tela';
import { META as chladni } from './chladni';

/** Physics and motion: fluids, bodies, agents and surfaces that evolve by their model. */
export const FISICA: FamilyMeta[] = [boids, gravedad, tela, chladni];
