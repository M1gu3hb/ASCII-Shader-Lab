import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Anillos concéntricos e irregulares, como los de un tronco, que crecen y se acumulan.',
  mechanism: 'Cada «Año» se forma un anillo, y la madera de cada año ocupa la misma superficie: un anillo de cierta edad está a una distancia proporcional a la raíz de esa edad, así que cerca de la médula son anchos y hacia fuera cada vez más finos y apretados. En «Fluye» los anillos nacen en el centro y se alejan frenando y amontonándose; en «Crece» el tronco engorda anillo a anillo desde la médula, con la corteza en el borde, y se queda quieto cuando llena el lienzo. El radio de cada anillo se dobla con un ruido leído alrededor del círculo (sin costura) que cambia poco de un anillo al siguiente, y un lado puede crecer más que el otro. Dentro de cada año la madera temprana es pálida y la tardía forma la línea del anillo; cuando los anillos quedan más juntos que un par de celdas se funden en su tono medio. La cruzan radios finos y algunas grietas desde fuera.',
  time: '«Fluye» es continuo: los anillos no dejan de nacer y alejarse, sin reinicio. «Crece» es una construcción: el tronco engorda hasta pasar el borde del lienzo (con los valores por defecto, en un par de minutos) y luego se queda quieto.',
  limits: 'Hasta 5 grietas; los anillos más finos que una celda se funden en un tono medio en lugar de dibujarse.',
  sources: [
    { label: 'Vanta.js · Trunk, de Teng Bao, a partir de un efecto original de Kjetil Midtgarden Golid (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/tengbao/vanta' },
    { label: 'Anillo de crecimiento', url: 'https://es.wikipedia.org/wiki/Anillo_de_crecimiento' },
  ],
  hints: {
    mode: 'Si los anillos nacen en el centro y se alejan, o si el tronco engorda hasta llenar el lienzo.',
    year: 'Segundos que tarda en formarse cada anillo.',
    width: 'Anchura de los anillos (a media distancia del centro).',
    wobble: 'Cuánto se ondulan los anillos.',
    detail: 'Tamaño de las ondulaciones: suaves o menudas.',
    late: 'Contraste de la línea de madera tardía de cada anillo.',
    rays: 'Radios finos que cruzan los anillos desde el centro.',
    cracks: 'Grietas que entran desde el borde.',
    ecc: 'Un lado crece más que el otro: la médula queda descentrada.',
  },
  presets: {
    tronco: 'Anillos de madera que nacen en el centro y se alejan, más finos hacia fuera, con dos grietas.',
    rodaja: 'Un tronco que engorda anillo a anillo desde la médula, con corteza en el borde, hasta llenar el lienzo.',
    nudo: 'Anillos muy finos, ondulados y descentrados, de madera oscura.',
    ondas: 'Anillos anchos y regulares en verde, como ondas de savia, con muchos radios.',
  },
};
