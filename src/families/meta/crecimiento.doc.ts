import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una curva que se alarga y se pliega sin cruzarse: coral, corteza y bordes de hoja.',
  mechanism: 'La curva es una cadena de nodos. Cada nodo se acerca a sus vecinos de la cadena, se alinea con ellos y se aparta de cualquier nodo demasiado cercano. Cuando un tramo se estira más de la cuenta se parte en dos: la curva gana longitud, no le cabe y se pliega.',
  time: 'Crece con memoria: cada paso parte del anterior. Cuando la curva ya cubre su límite (o llega a 6000 nodos) deja de crecer, se asienta unos segundos y queda quieta. No repite un bucle.',
  limits: 'Hasta 6000 nodos en 12 curvas; vecinos por rejilla espacial; un búfer de historia de 2 × filas × filas en coma flotante.',
  sources: [
    { label: 'Anders Hoff (inconvergent): Differential Line', url: 'https://inconvergent.net/generative/differential-line/' },
    { label: 'Jason Webb: experimentos de crecimiento diferencial (sólo el algoritmo)', url: 'https://github.com/jasonwebb/2d-differential-growth-experiments' },
  ],
  hints: {
    'sep': 'Distancia a la que los nodos se repelen: el ancho de cada pliegue.',
    'att': 'Lo que tira cada nodo de sus vecinos de cadena.',
    'ali': 'Suaviza la curva: baja, borde rizado; alta, ondas amplias.',
    'edge': 'Largo, en proporción a la separación, a partir del cual un tramo se parte.',
    'sprout': 'Nodos nuevos al azar en cada paso: rompen la simetría y aceleran el plegado.',
    'bound': 'Dónde se contiene la curva.',
  },
  presets: {
    'coral': 'Un círculo que se pliega hasta llenar su disco, con el interior relleno.',
    'corteza': 'Una línea anclada de lado a lado que se arruga despacio en meandros y deja la estela de sus pliegues.',
    'colonia': 'Varias semillas que crecen, se encuentran y se empujan sin cruzarse.',
    'medusa': 'Una estrella que se expande deprisa: los pliegues salen del centro en rayos hasta el borde.',
  },
};
