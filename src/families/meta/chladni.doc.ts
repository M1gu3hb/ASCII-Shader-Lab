import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Arena sobre una placa que vibra: se junta en las líneas que no se mueven y dibuja figuras de Chladni.',
  mechanism: 'La placa vibra en uno de sus modos de onda estacionaria (en la cuadrada, sumas de cosenos; en la circular, funciones de Bessel con el borde libre). Cada grano salta al azar con un paso proporcional a lo que se mueve la placa donde está: rebota en los vientres y se queda quieto en los nodos, así que la arena acaba dibujando las líneas nodales.',
  time: 'Evoluciona con memoria: la arena se mueve grano a grano y tarda en reunirse; al cambiar de modo, migra hacia las nuevas líneas. No escucha sonido ni mide nada: la secuencia de modos sale de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 40 000 granos con un salto por paso; campos de modo en una rejilla de 128 × 128 (como mucho 8 en caché); un búfer de densidad de 2 × filas × filas.',
  sources: [
    { label: 'Wikipedia: Ernst Chladni y sus figuras', url: 'https://es.wikipedia.org/wiki/Ernst_Chladni' },
    { label: 'Wikipedia: Cymatics', url: 'https://en.wikipedia.org/wiki/Cymatics' },
    { label: 'Paul Bourke: Chladni plate interference surfaces', url: 'https://paulbourke.net/geometry/chladni/' },
  ],
  hints: {
    'n': 'Cuadrada: ondas en un eje. Circular: número de diámetros nodales.',
    'm': 'Cuadrada: ondas en el otro eje. Circular: orden radial (más m, más anillos nodales).',
    'mix': 'Cuadrada: −1, figuras antisimétricas; +1, simétricas. Circular: añade el modo de anillos.',
    'seq': 'Cambia de modo cada pocos segundos, con un paso suave entre ellos.',
    'count': 'Granos de arena.',
    'agit': 'Tamaño de los saltos: más, la arena se reúne antes y queda más suelta.',
    'persist': 'Cuánto tarda en borrarse el rastro de los granos.',
  },
  presets: {
    'placa': 'Una placa cuadrada en un modo fijo: la arena traza su figura y la sostiene.',
    'flor': 'Una placa circular: diámetros y anillos nodales como pétalos.',
    'musical': 'Los modos cambian cada pocos segundos y la arena corre a dibujar la figura siguiente.',
  },
};
