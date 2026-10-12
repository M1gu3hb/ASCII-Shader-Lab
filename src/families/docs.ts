import type { FamilyDoc } from './types';

/**
 * The prose of each family (meta/<id>.doc.ts) is its own chunk: the first view of the lab carries the specs
 * the engines and the recipes need, and the words come when a panel, the recipe browser or the docs ask.
 */
const DOCS: Record<string, () => Promise<{ DOC: FamilyDoc }>> = {
  reaccion_difusion: () => import('./meta/reaccion_difusion.doc.ts'),
  physarum: () => import('./meta/physarum.doc.ts'),
  lenia: () => import('./meta/lenia.doc.ts'),
  automata: () => import('./meta/automata.doc.ts'),
  kuramoto: () => import('./meta/kuramoto.doc.ts'),
  dla: () => import('./meta/dla.doc.ts'),
  crecimiento: () => import('./meta/crecimiento.doc.ts'),
  fluido: () => import('./meta/fluido.doc.ts'),
  agua: () => import('./meta/agua.doc.ts'),
  erosion: () => import('./meta/erosion.doc.ts'),
  boids: () => import('./meta/boids.doc.ts'),
  gravedad: () => import('./meta/gravedad.doc.ts'),
  tela: () => import('./meta/tela.doc.ts'),
  chladni: () => import('./meta/chladni.doc.ts'),
  sistema_l: () => import('./meta/sistema_l.doc.ts'),
  atractor: () => import('./meta/atractor.doc.ts'),
  wfc: () => import('./meta/wfc.doc.ts'),
  hiperbolico: () => import('./meta/hiperbolico.doc.ts'),
  fractal_3d: () => import('./meta/fractal_3d.doc.ts'),
  nubes_vol: () => import('./meta/nubes_vol.doc.ts'),
  orbitales: () => import('./meta/orbitales.doc.ts'),
  lente_gravitacional: () => import('./meta/lente_gravitacional.doc.ts'),
  campos_em: () => import('./meta/campos_em.doc.ts'),
  corrientes: () => import('./meta/corrientes.doc.ts'),
  ecos: () => import('./meta/ecos.doc.ts'),
  humo: () => import('./meta/humo.doc.ts'),
  niebla: () => import('./meta/niebla.doc.ts'),
  orden_caos: () => import('./meta/orden_caos.doc.ts'),
  membrana: () => import('./meta/membrana.doc.ts'),
  paneles: () => import('./meta/paneles.doc.ts'),
  mosaico: () => import('./meta/mosaico.doc.ts'),
  laceria: () => import('./meta/laceria.doc.ts'),
  hipercubo: () => import('./meta/hipercubo.doc.ts'),
  cromado: () => import('./meta/cromado.doc.ts'),
  desgarro: () => import('./meta/desgarro.doc.ts'),
  descargas: () => import('./meta/descargas.doc.ts'),
  mar: () => import('./meta/mar.doc.ts'),
  osciloscopio: () => import('./meta/osciloscopio.doc.ts'),
  marco: () => import('./meta/marco.doc.ts'),
  metal_fundido: () => import('./meta/metal_fundido.doc.ts'),
  seda: () => import('./meta/seda.doc.ts'),
  grietas_oro: () => import('./meta/grietas_oro.doc.ts'),
  jade_ruido: () => import('./meta/jade_ruido.doc.ts'),
  cuerdas: () => import('./meta/cuerdas.doc.ts'),
  flujo_ruido: () => import('./meta/flujo_ruido.doc.ts'),
  lluvia_agua: () => import('./meta/lluvia_agua.doc.ts'),
  tejido_bandas: () => import('./meta/tejido_bandas.doc.ts'),
  estatica_vhs: () => import('./meta/estatica_vhs.doc.ts'),
  estratos: () => import('./meta/estratos.doc.ts'),
  puntos_orbita: () => import('./meta/puntos_orbita.doc.ts'),
  anillo_humo: () => import('./meta/anillo_humo.doc.ts'),
  rejilla_puntos: () => import('./meta/rejilla_puntos.doc.ts'),
  globo_puntos: () => import('./meta/globo_puntos.doc.ts'),
  arcos_parciales: () => import('./meta/arcos_parciales.doc.ts'),
  anillos_tronco: () => import('./meta/anillos_tronco.doc.ts'),
  grabado: () => import('./meta/grabado.doc.ts'),
  burbujas: () => import('./meta/burbujas.doc.ts'),
  haces_luz: () => import('./meta/haces_luz.doc.ts'),
  mandala_capas: () => import('./meta/mandala_capas.doc.ts'),
  eclipse_total: () => import('./meta/eclipse_total.doc.ts'),
  talla_diamante: () => import('./meta/talla_diamante.doc.ts'),
  calor_radiante: () => import('./meta/calor_radiante.doc.ts'),
  neon_tubos: () => import('./meta/neon_tubos.doc.ts'),
  vinilo: () => import('./meta/vinilo.doc.ts'),
};

const known = new Map<string, FamilyDoc>();
const loading = new Map<string, Promise<FamilyDoc | null>>();

/** Every family with prose (tests check none is missing). */
export const DOC_IDS = Object.keys(DOCS);

/** The prose of a family if it is here already (the panel draws without it until it arrives). */
export const familyDocNow = (id: string): FamilyDoc | undefined => known.get(id);

export function loadFamilyDoc(id: string): Promise<FamilyDoc | null> {
  const k = known.get(id);
  if (k) return Promise.resolve(k);
  let p = loading.get(id);
  if (!p) {
    const load = DOCS[id];
    p = load ? load().then(m => { known.set(id, m.DOC); return m.DOC; }).catch(() => { loading.delete(id); return null; }) : Promise.resolve(null);
    loading.set(id, p);
  }
  return p;
}

export const loadAllFamilyDocs = () => Promise.all(DOC_IDS.map(loadFamilyDoc));
