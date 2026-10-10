import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Partículas que vagan al azar y se pegan al tocar el agregado: dendritas, cristales y raíces.',
  mechanism: 'Agregación limitada por difusión (Witten y Sander): cada caminante da pasos al azar por una rejilla y, cuando queda junto al agregado, se pega con cierta probabilidad. Las puntas atrapan a casi todos los caminantes antes de que entren en los huecos, y por eso salen ramas.',
  time: 'Crece con memoria, partícula a partícula. Cuando llega al borde lejano o cubre un 35 % del campo deja de crecer y queda quieta. No repite un bucle.',
  limits: 'Rejilla de 2 × filas columnas (9 bytes por celda); hasta 400 caminantes con 24 movimientos cada uno por paso; se detiene al 35 % de celdas.',
  sources: [
    { label: 'Witten y Sander (1981): Diffusion-Limited Aggregation', url: 'https://doi.org/10.1103/PhysRevLett.47.1400' },
    { label: 'Paul Bourke: DLA', url: 'https://paulbourke.net/fractals/dla/' },
    { label: 'Jason Webb: experimentos de DLA (sólo el algoritmo)', url: 'https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments' },
  ],
  hints: {
    'seed': 'Dónde empieza el agregado y de dónde llegan los caminantes.',
    'stick': 'Probabilidad de pegarse al tocar: baja, ramas gruesas y compactas; alta, finas.',
    'bias': 'Cuánto empuja una corriente a los caminantes.',
    'dir': 'La corriente lleva a los caminantes en sentido contrario.',
    'walkers': 'Caminantes a la vez, cada uno con 24 movimientos por paso: la velocidad de crecimiento.',
    'width': 'Engrosa cada partícula al dibujarla.',
  },
  presets: {
    'cristal': 'Un copo dendrítico desde un punto: ramas finas que se abren hacia los lados.',
    'coral': 'Desde el suelo, con poca adherencia: ramas gruesas y apretadas que compiten por subir.',
    'raices': 'Desde arriba, con una corriente leve: pocas descargas largas que bajan en zigzag.',
    'corona': 'Un anillo del que brotan rayos ramificados hacia fuera; el interior queda vacío.',
    'colonias': 'Varias semillas que crecen a la vez y se cierran el paso.',
  },
};
