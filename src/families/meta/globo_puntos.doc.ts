import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una esfera de puntos que gira, con sus vecinos unidos por segmentos y arcos que vuelan de un punto a otro.',
  mechanism: 'Los puntos salen de una rejilla de latitudes y longitudes, cada uno desplazado dentro de su casilla y más escasos cerca de los polos; cada punto puede unirse con su vecino del este y del norte. Para cada celda dentro del disco se toma el punto de la esfera que hay delante (y, más tenue, el de detrás), se deshace el giro del globo y su latitud y longitud dicen en qué casilla está; se dibujan los puntos y los enlaces de las nueve casillas de alrededor, proyectados con el giro. Los arcos unen pares de direcciones al azar con una curva que se levanta sobre la superficie; un pulso de luz los recorre, y lo que pasa por detrás del globo se apaga como la cara oculta.',
  time: 'Un bucle exacto: el globo da una vuelta en «Vuelta» segundos y los pulsos recorren los arcos un número entero de veces por vuelta.',
  limits: 'Hasta 18 paralelos (36 meridianos), seis arcos de ocho tramos; proyección ortográfica.',
  sources: [
    { label: 'Vanta.js · Globe, de Teng Bao (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/tengbao/vanta' },
    { label: 'Curva de Bézier cuadrática', url: 'https://es.wikipedia.org/wiki/Curva_de_B%C3%A9zier' },
  ],
  hints: {
    size: 'Radio del globo en el lienzo.',
    bands: 'Cuántas franjas de latitud tiene la rejilla de puntos.',
    jitter: 'Cuánto se desordenan los puntos dentro de su casilla.',
    links: 'Qué parte de los vecinos se unen con un segmento.',
    dot: 'Tamaño de los puntos.',
    lines: 'Brillo de los segmentos y los arcos.',
    arcs: 'Cuántos arcos vuelan entre puntos lejanos.',
    lift: 'Cuánto se levantan los arcos sobre la superficie.',
    cycle: 'Segundos que tarda el globo en dar una vuelta.',
    tilt: 'Inclinación del eje hacia ti o hacia atrás.',
    back: 'Cuánto se ve la cara de atrás del globo a través de él.',
    pulses: 'Cuántas veces recorre cada arco su pulso de luz en una vuelta.',
  },
  presets: {
    red: 'Globo azul de puntos enlazados con tres arcos y la cara oculta tenue.',
    nodos: 'Muchos puntos grandes y ordenados, pocos enlaces y sin arcos: una esfera de nodos.',
    rutas: 'Globo pequeño con seis arcos altos y anaranjados que vuelan con sus pulsos.',
    malla: 'Red densa y desordenada, todos los vecinos unidos, en violeta.',
  },
};
