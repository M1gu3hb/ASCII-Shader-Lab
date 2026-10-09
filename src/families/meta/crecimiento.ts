import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'crecimiento',
  name: 'Crecimiento diferencial',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Una curva que se alarga y se pliega sin cruzarse: coral, corteza y bordes de hoja.',
  mechanism: 'La curva es una cadena de nodos. Cada nodo se acerca a sus vecinos de la cadena, se alinea con ellos y se aparta de cualquier nodo demasiado cercano. Cuando un tramo se estira más de la cuenta se parte en dos: la curva gana longitud, no le cabe y se pliega.',
  time: 'Crece con memoria: cada paso parte del anterior. Cuando la curva ya cubre su límite (o llega a 6000 nodos) deja de crecer, se asienta unos segundos y queda quieta. No repite un bucle.',
  params: [
    { key: 'sep', label: 'Separación', type: 'number', min: 0.03, max: 0.12, def: 0.07, step: 0.001, digits: 3, hint: 'Distancia a la que los nodos se repelen: el ancho de cada pliegue.' },
    { key: 'att', label: 'Atracción', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Lo que tira cada nodo de sus vecinos de cadena.' },
    { key: 'ali', label: 'Alineación', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Suaviza la curva: baja, borde rizado; alta, ondas amplias.' },
    { key: 'edge', label: 'Arista máxima', type: 'number', min: 0.3, max: 1, def: 0.55, step: 0.01, hint: 'Largo, en proporción a la separación, a partir del cual un tramo se parte.' },
    { key: 'sprout', label: 'Brotes', type: 'number', min: 0, max: 3, def: 0.5, step: 0.05, hint: 'Nodos nuevos al azar en cada paso: rompen la simetría y aceleran el plegado.' },
    { key: 'shape', label: 'Forma inicial', type: 'choice', def: 'circulo', rebuild: true, options: [
      { id: 'circulo', label: 'Círculo' }, { id: 'linea', label: 'Línea' }, { id: 'varias', label: 'Varias semillas' }, { id: 'estrella', label: 'Estrella' },
    ] },
    { key: 'bound', label: 'Límite', type: 'choice', def: 'circulo', hint: 'Dónde se contiene la curva.', options: [{ id: 'circulo', label: 'Círculo' }, { id: 'rect', label: 'Marco' }] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'trazo', options: [
      { id: 'trazo', label: 'Trazo' }, { id: 'relleno', label: 'Relleno' }, { id: 'historia', label: 'Historia' },
    ] },
  ],
  presets: [
    { id: 'coral', name: 'Coral plegado', desc: 'Un círculo que se pliega hasta llenar su disco, con el interior relleno.', params: { sep: 0.07, att: 0.5, ali: 0.5, edge: 0.55, sprout: 0.5, shape: 'circulo', bound: 'circulo', view: 'relleno' }, look: { stops: ['#160807', '#ffb3a0'], bg: '#0b0403', charset: ' .:-=+*#' } },
    { id: 'corteza', name: 'Corteza', desc: 'Una línea anclada de lado a lado que se arruga despacio en meandros y deja la estela de sus pliegues.', params: { sep: 0.07, att: 0.8, ali: 0.6, edge: 0.55, sprout: 0.3, shape: 'linea', bound: 'rect', view: 'historia' }, look: { stops: ['#0d0a05', '#e9d3a5'], bg: '#070502', charset: ' .,:;!|' } },
    { id: 'colonia', name: 'Colonia', desc: 'Varias semillas que crecen, se encuentran y se empujan sin cruzarse.', params: { sep: 0.075, att: 0.6, ali: 0.7, edge: 0.5, sprout: 0.4, shape: 'varias', bound: 'rect', view: 'trazo' }, look: { stops: ['#04100a', '#a8f0c6'], bg: '#020805', charset: ' .·:oO@' } },
    { id: 'medusa', name: 'Medusa', desc: 'Una estrella que se expande deprisa: los pliegues salen del centro en rayos hasta el borde.', params: { sep: 0.085, att: 0.6, ali: 0.4, edge: 0.4, sprout: 0.3, shape: 'estrella', bound: 'circulo', view: 'trazo' }, look: { stops: ['#0a0716', '#d3c4ff'], bg: '#05030c', charset: ' .:-=+#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 150, limits: 'Hasta 6000 nodos en 12 curvas; vecinos por rejilla espacial; un búfer de historia de 2 × filas × filas en coma flotante.' },
  sources: [
    { label: 'Anders Hoff (inconvergent): Differential Line', url: 'https://inconvergent.net/generative/differential-line/' },
    { label: 'Jason Webb: experimentos de crecimiento diferencial (sólo el algoritmo)', url: 'https://github.com/jasonwebb/2d-differential-growth-experiments' },
  ],
  wrap: 'clamp',
};
