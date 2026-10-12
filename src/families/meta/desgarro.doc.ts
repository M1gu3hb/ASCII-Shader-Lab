import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una superficie que se rasga o se quema y deja ver una luz detrás; luego se recompone y se abre en otro sitio.',
  mechanism: 'Cada abertura vive en ciclos: en cada uno elige un punto de impacto y una inclinación. La línea del desgarro es la distancia con signo a una recta que pasa por el impacto, ondulada por ruido a lo largo de ella, y su borde se deshilacha con un fBm anisótropo (estirado a través de la línea: fibras). La abertura se propaga desde el impacto, más ancha cerca de él, se mantiene y se cierra. Detrás hay una luz propia (nebulosa de fBm deformado, venas crestadas y destellos lentos), una trama de líneas o corrientes de color de tu paleta. El borde lleva un filo incandescente, luz que se derrama sobre la superficie, un labio iluminado de un lado y sombra del otro; el grano de la superficie se separa con las dos mitades, bajo una luz lenta que lo recorre. «Se quema» abre agujeros con un frente de fBm que crece desde el impacto, con una línea de brasa y papel chamuscado, y luego los cierra. Desde la versión 2, detrás puede estar la pieza misma: tu foto o tus letras (quietas, mientras la superficie se abre sobre ellas, con sus propios colores) o las capas que hay debajo de esta, tal como se ven en esa celda.',
  time: 'Cada abertura repite su ciclo con otro impacto y otra inclinación cada vez, así que no hay dos ciclos iguales: sigue cambiando y no es periódica. Todo lo que dibuja una abertura vale cero al principio y al final de su ciclo, de modo que un ciclo pasa al siguiente sin saltos. Con «Calma» a cero y varias aberturas desfasadas, siempre hay alguna abierta (preset de fondo); con calma alta tiene pausas, como el original, en las que sólo se mueve la luz tenue de la superficie. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 3 aberturas a la vez. Detrás: una luz propia, una trama, corrientes de color, la foto o el texto de la pieza (una lectura por celda) o las capas de abajo en esa misma celda (no se desplazan con la abertura).',
  sources: [
    { label: 'Radiant · Torn Paper, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Radiant · Burning Film y Polaroid Burn (MIT; referencia de la variante quemada, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Movimiento browniano fraccional (fBm)', url: 'https://iquilezles.org/articles/fbm/' },
  ],
  hints: {
    kind: 'Si la superficie se rasga en una línea o se quema en agujeros.',
    behind: 'Lo que aparece en las aberturas: una luz propia, una trama de líneas, corrientes de color, tu foto o tu texto (sin ellos, la luz propia) o las capas que hay debajo de esta.',
    tears: 'Cuántas aberturas viven a la vez, desfasadas.',
    cycle: 'Segundos que dura cada abertura, de que se abre a que se cierra.',
    calm: 'Parte del ciclo con la superficie cerrada: 0 nunca descansa.',
    width: 'Lo que se abre cada desgarro o cada quemadura.',
    glow: 'Brillo del filo y de la luz que se derrama sobre la superficie.',
    fibres: 'Lo deshilachado del borde.',
  },
  presets: {
    grietas: 'Tres grietas desfasadas que nunca dejan quieta la superficie: un fondo.',
    rasgado: 'Un solo desgarro ancho, con pausas de calma entre uno y otro, como el papel original.',
    quemado: 'Agujeros que se queman con borde de brasa y se vuelven a cerrar.',
    trama: 'Los desgarros descubren una trama de líneas que se cruzan.',
    velo: 'Quemaduras amplias que dejan ver corrientes de color de tu paleta.',
    foto: 'Un papel cubre tu foto y se rasga por tres sitios desfasados: se ve tu imagen, con sus colores, por las aberturas.',
    palabras: 'Una película que arde por tres sitios y deja ver tus palabras debajo antes de cerrarse.',
    capas: 'La superficie se abre y deja ver la capa de abajo: corrientes de color de neón que siguen moviéndose detrás.',
  },
};
