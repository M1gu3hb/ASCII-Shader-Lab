import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Arena sobre una placa que vibra: se junta en las líneas que no se mueven y dibuja figuras que cambian con cada nota.',
  mechanism: 'La placa vibra en uno de sus modos de onda estacionaria (en la cuadrada y en la que ocupa todo el lienzo, sumas de cosenos; en la circular, funciones de Bessel con el borde libre). Cada grano salta al azar con un paso proporcional a lo que se mueve la placa donde está: rebota en los vientres y se queda quieto en los nodos, así que la arena acaba dibujando las líneas nodales. La arena repartida por igual queda oscura y sólo se enciende la que se junta, y las líneas nodales se dibujan por su distancia al cero del campo: donde la placa apenas vibra (el centro de algunos modos altos) no aparece un disco gris (versión 2; las piezas de la versión 1 se dibujan como antes).',
  time: 'Evoluciona con memoria: la arena se mueve grano a grano y tarda en reunirse. Con un modo fijo es una construcción: la arena dibuja su figura en unos segundos y la sostiene, temblando apenas. Con un ciclo de modos es continuo: al cambiar de modo, la arena se desordena y migra hacia las nuevas líneas, una figura tras otra sin repetir el orden. No escucha sonido ni mide nada: la secuencia de modos sale de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 40 000 granos con un salto por paso; campos de modo en una rejilla de 128 × 128 (256 × 128 en todo el lienzo; como mucho 8 en caché); un búfer de densidad de 2 × filas × filas.',
  sources: [
    { label: 'Wikipedia: Ernst Chladni y sus figuras', url: 'https://es.wikipedia.org/wiki/Ernst_Chladni' },
    { label: 'Wikipedia: Cymatics', url: 'https://en.wikipedia.org/wiki/Cymatics' },
    { label: 'Paul Bourke: Chladni plate interference surfaces', url: 'https://paulbourke.net/geometry/chladni/' },
  ],
  hints: {
    'plate': 'Cuadrada o circular en el centro, o una placa rectangular que ocupa todo el lienzo.',
    'n': 'Cuadrada: ondas en un eje. Circular: número de diámetros nodales.',
    'm': 'Cuadrada: ondas en el otro eje. Circular: orden radial (más m, más anillos nodales).',
    'mix': 'Cuadrada: −1, figuras antisimétricas; +1, simétricas. Circular: añade el modo de anillos.',
    'seq': 'Cambia de modo cada pocos segundos, con un paso suave entre ellos.',
    'count': 'Granos de arena.',
    'agit': 'Tamaño de los saltos: más, la arena se reúne antes y queda más suelta.',
    'persist': 'Cuánto tarda en borrarse el rastro de los granos.',
  },
  presets: {
    'arena': 'Una placa que ocupa todo el lienzo y cambia de modo despacio: la arena se deshace y se rehace en celosías y rombos.',
    'placa': 'Una placa cuadrada en un modo fijo: la arena traza su figura y la sostiene.',
    'flor': 'Una placa circular en un modo fijo: diámetros y anillos nodales como pétalos.',
    'mandala': 'La placa circular cambiando de modo despacio: pétalos, anillos y radios que se deshacen y se rehacen.',
    'musical': 'Los modos cambian cada pocos segundos y la arena corre a dibujar la figura siguiente.',
  },
};
