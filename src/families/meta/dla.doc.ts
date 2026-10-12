import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Partículas que vagan al azar y se pegan al tocar el agregado: dendritas, cristales y raíces, que se quedan o se renuevan sin fin.',
  mechanism: 'Agregación limitada por difusión (Witten y Sander): cada caminante da pasos al azar por una rejilla y, cuando queda junto al agregado, se pega con cierta probabilidad. Las puntas atrapan a casi todos los caminantes antes de que entren en los huecos, y por eso salen ramas. Con «Renovación», los caminantes salen de cualquier parte con sitio libre y cada cristal vive unos segundos: cuando el campo se llena, el más viejo se funde grano a grano y nacen cristales nuevos donde hay hueco; desde una línea, el campo avanza con el frente y las ramas viejas salen por el otro lado.',
  time: 'Sin renovación es una construcción: crece partícula a partícula y, cuando llega al borde lejano o cubre un 35 % del campo, se detiene y queda quieta. Con «Renovación: sí» es continua: los cristales nacen, crecen y se funden (en el anillo, los rayos brotan y se van), o el campo avanza con el frente; no se detiene ni se reinicia, y no repite un bucle.',
  limits: 'Rejilla de 2 × filas columnas (9 bytes por celda); hasta 400 caminantes con 24 movimientos cada uno por paso (con renovación, más movimientos en rejillas finas); se detiene al 35 % de celdas sin renovación; hasta 255 cristales vivos con renovación.',
  sources: [
    { label: 'Witten y Sander (1981): Diffusion-Limited Aggregation', url: 'https://doi.org/10.1103/PhysRevLett.47.1400' },
    { label: 'Paul Bourke: DLA', url: 'https://paulbourke.net/fractals/dla/' },
    { label: 'Jason Webb: experimentos de DLA (sólo el algoritmo)', url: 'https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments' },
  ],
  hints: {
    'seed': 'Dónde empieza el agregado y de dónde llegan los caminantes.',
    'stick': 'Probabilidad de pegarse al tocar: baja, ramas gruesas y compactas; alta, finas.',
    'bias': 'Cuánto empuja una corriente a los caminantes (con renovación y «Fuera», sólo hacia el anillo).',
    'dir': 'La corriente lleva a los caminantes en sentido contrario.',
    'walkers': 'Caminantes a la vez, cada uno con 24 movimientos por paso: la velocidad de crecimiento.',
    'width': 'Engrosa cada partícula al dibujarla.',
    'age': 'Qué brilla más: las puntas recientes, el núcleo antiguo o todo igual.',
    'renew': 'Sí: no se detiene. Los cristales viejos se funden y nacen otros; desde una línea, el campo avanza con el frente.',
    'life': 'Con renovación: segundos que vive cada cristal como mucho (si el campo se llena, el más viejo se funde antes).',
  },
  presets: {
    'cristal': 'Un copo dendrítico desde un punto: ramas finas que se abren hacia los lados.',
    'coral': 'Desde el suelo, con poca adherencia: ramas gruesas y apretadas que compiten por subir.',
    'raices': 'Desde arriba, con una corriente leve: pocas descargas largas que bajan en zigzag.',
    'corona': 'Un anillo del que brotan rayos ramificados hacia fuera; el interior queda vacío.',
    'colonias': 'Varias semillas que crecen a la vez y se cierran el paso.',
    'escarcha': 'Escarcha que cubre todo el campo: cristales que nacen en los huecos, se ramifican y se funden mientras otros ocupan su sitio.',
    'arrecife': 'Un bosque de ramas gruesas que sube sin fin: el campo acompaña al frente y las ramas viejas salen por abajo.',
    'corona_viva': 'Un anillo fijo que suelta rayos: cada uno brota, se abre y se funde, y otros nacen en su lugar.',
  },
};
