/**
 * GLSL chunks of the analytic families, each defining `float F_<id>(vec2 p, float t, vec4 k0, vec4 k1)`
 * (p in screen heights, y up; t the layer's time; k0/k1 the first eight parameters, see params.ts
 * packParams). The field shader includes only the ones a piece uses. Each chunk is its own module, fetched
 * with the family (FamilyHost.ready): a first view whose piece has no analytic family never carries them.
 */
const LOAD: Record<string, () => Promise<string>> = {
  fractal_3d: () => import('./fractal3d').then(m => m.FRACTAL3D_GLSL),
  hiperbolico: () => import('./hiperbolico').then(m => m.HIPERBOLICO_GLSL),
  nubes_vol: () => import('./nubes_vol').then(m => m.NUBES_VOL_GLSL),
  orbitales: () => import('./orbitales').then(m => m.ORBITALES_GLSL),
  lente_gravitacional: () => import('./lente').then(m => m.LENTE_GLSL),
};

const known = new Map<string, string>();
const loading = new Map<string, Promise<void>>();

/** The analytic families with a GLSL chunk (tests check every analytic family has one). */
export const FAMILY_GLSL_IDS = Object.keys(LOAD);

/** The chunk of a family if it is here already. */
export const familyGlsl = (id: string): string | undefined => known.get(id);

export function loadFamilyGlsl(id: string): Promise<void> {
  if (known.has(id)) return Promise.resolve();
  let p = loading.get(id);
  if (!p) {
    const load = LOAD[id];
    p = load ? load().then(c => { known.set(id, c); }).catch(() => { loading.delete(id); }) : Promise.resolve();
    loading.set(id, p);
  }
  return p;
}
