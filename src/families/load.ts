import { registerAnalytic, registerModel, setFamilyLoader } from './models';
import type { AnalyticImpl, ModelFactory } from './types';

/**
 * The site's loader: each family's code is its own chunk, fetched the first time a piece uses it, so the
 * first view of a page never carries a model it does not show. Raster families export `create`, analytic
 * families their CPU twin `impl` (the GLSL is part of the pattern library).
 */
const CODE: Record<string, () => Promise<{ create?: ModelFactory; impl?: AnalyticImpl }>> = {
  reaccion_difusion: () => import('./sims/reaccion.ts'),
  sistema_l: () => import('./sims/lsystem.ts'),
  fractal_3d: () => import('./analytic/fractal3d.cpu.ts'),
};

/** Loads and registers a family's code now (tools and tests call it directly). */
export async function loadFamilyNow(id: string): Promise<void> {
  const load = CODE[id];
  if (!load) return;
  const m = await load();
  if (m.create) registerModel(id, m.create);
  if (m.impl) registerAnalytic(id, m.impl);
}

/** Every family with code (tests check none is missing). */
export const LOADABLE = Object.keys(CODE);

/** Installs the loader for this page (studio, viewer, landing, guides). */
export function installFamilyLoader() { setFamilyLoader(loadFamilyNow); }
