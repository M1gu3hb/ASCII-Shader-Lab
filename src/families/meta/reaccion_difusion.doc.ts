import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Dos sustancias que se difunden y reaccionan: manchas que se dividen, laberintos y coral.',
  mechanism: 'Modelo de Gray–Scott sobre una rejilla: la sustancia A se alimenta, B la consume y se elimina; ambas se difunden a ritmos distintos. Las formas salen del equilibrio entre alimentación y eliminación, no de un dibujo.',
  time: 'Evoluciona con memoria: cada momento depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de 2 × filas columnas con dos sustancias en coma flotante (16 bytes por celda con el doble búfer); laplaciano de 9 puntos.',
  sources: [
    { label: 'Karl Sims: tutorial de reacción–difusión', url: 'https://www.karlsims.com/rd.html' },
    { label: 'Karl Sims: RD Tool', url: 'https://www.karlsims.com/rdtool.html' },
    { label: 'Pearson (1993): Complex Patterns in a Simple System', url: 'https://arxiv.org/abs/patt-sol/9304003' },
  ],
  hints: {
    'feed': 'Cuánta sustancia A entra en cada celda.',
    'kill': 'Cuánta sustancia B desaparece.',
    'diff': 'Lo que se extiende B frente a A: cambia el grosor de las formas.',
    'scale': 'Tamaño de las formas en la rejilla.',
    'edges': 'Continuos: lo que sale por un lado entra por el otro.',
  },
  presets: {
    'coral': 'Ramas que crecen desde sus puntas hasta cubrir el campo.',
    'mitosis': 'Manchas que se estiran y se dividen una y otra vez.',
    'laberinto': 'Franjas que se curvan como una huella dactilar y llenan el campo.',
    'caos': 'Manchas que nacen, chocan y se deshacen sin quedarse quietas nunca.',
  },
};
