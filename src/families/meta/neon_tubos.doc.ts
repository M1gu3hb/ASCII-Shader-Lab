import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Tubos de neón doblados en un corazón, una estrella, arcos o una palabra: se encienden tubo a tubo, zumban, gotean luz y se reflejan en el suelo.',
  mechanism: 'Cada tubo es el contorno de una forma trazado por su campo de distancia: el corazón como una poligonal de la curva clásica del corazón, la estrella como un polígono de diez lados, las letras de LUZ con segmentos y arcos. Cada tubo tiene su color, su momento de encendido y sus fallos: al empezar el ciclo se encienden uno tras otro tartamudeando medio segundo antes de quedarse; mientras lucen, zumban y se apagan un instante de vez en cuando; uno puede estar averiado; al final del ciclo el letrero se apaga y vuelve a empezar. El tubo es un núcleo casi blanco dentro de un resplandor de su color, y un tubo apagado se ve como vidrio. De los puntos más bajos de los tubos encendidos gotea luz que cae. Detrás, una pared de ladrillo que sólo se ve donde el neón la ilumina, y abajo el reflejo del letrero en el suelo mojado, justo bajo el tubo más bajo, con una ondulación. Cada celda lleva su color.',
  time: 'Un bucle exacto: el encendido, el zumbido, los fallos y el goteo se repiten cada «Ciclo» segundos (el goteo y el zumbido caben un número entero de veces en el ciclo).',
  limits: 'Cinco formas fijas (la palabra es LUZ); como mucho siete tubos en el letrero completo. El reflejo es un espejo con ondulación, no un trazado de rayos.',
  sources: [
    { label: 'Radiant · Neon Revival, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Curva del corazón (x = 16 sen³t, y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t)', url: 'https://mathworld.wolfram.com/HeartCurve.html' },
    { label: 'Lámpara de neón', url: 'https://es.wikipedia.org/wiki/L%C3%A1mpara_de_ne%C3%B3n' },
  ],
  hints: {
    shape: 'Qué dibujan los tubos: un corazón, una estrella, arcos, la palabra LUZ o un letrero con todo.',
    hue: 'El color de los tubos principales.',
    hue2: 'El color de los tubos que se alternan con ellos.',
    thick: 'El grosor del tubo.',
    glow: 'El resplandor de color alrededor de cada tubo.',
    flicker: 'El zumbido y los apagones breves mientras luce.',
    cycle: 'Los segundos que dura la secuencia de encendido y apagado.',
    seq: 'Lo separados en el tiempo que se encienden los tubos.',
    drip: 'La luz que gotea de los puntos bajos de los tubos.',
    reflect: 'El reflejo del letrero en el suelo mojado.',
    wall: 'La pared de ladrillo que ilumina el neón.',
    fault: 'Cuánto falla el tubo averiado (el segundo; en un corazón o una estrella, el único).',
    size: 'El tamaño del letrero.',
  },
  presets: {
    letrero: 'Un letrero completo: la palabra, dos arcos, un corazón y una estrella, que se encienden uno tras otro.',
    corazon: 'Un corazón rosa grueso que zumba mucho, gotea y se refleja en el suelo.',
    estrella: 'Una estrella amarilla de motel sobre la pared de ladrillo, con un tubo que falla.',
    arcos: 'Tres arcos turquesa y rojo que se encienden despacio, con el arco del medio averiado.',
    luz: 'La palabra LUZ en verde y azul, grande y nerviosa, con un tubo que falla.',
  },
};
