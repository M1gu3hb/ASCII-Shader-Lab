import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Arcos incompletos de distinto radio y grosor que giran cada uno a su ritmo en un plano inclinado.',
  mechanism: 'Los anillos están en un mismo plano inclinado hacia atrás (con un leve balanceo), así que en pantalla son elipses. Cada anillo tiene su grosor, el largo de su arco, cuántas copias del arco reparte alrededor, un punto de partida y un número entero de vueltas por ciclo, en un sentido o en el otro: giran a ritmos distintos y el conjunto vuelve exactamente a su inicio. A lo largo de cada arco el brillo sube de la cola a la cabeza (en el sentido en que gira), los extremos se redondean y la mitad cercana del plano brilla un poco más. Cada anillo tiene su propio brillo, así que la paleta le da su tono.',
  time: 'Un bucle exacto de «Ciclo» segundos: cada anillo da un número entero de vueltas en ese tiempo.',
  limits: 'Hasta 14 anillos y 3 arcos por anillo; proyección ortográfica (sin perspectiva).',
  sources: [
    { label: 'Vanta.js · Rings, de Teng Bao (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/tengbao/vanta' },
  ],
  hints: {
    rings: 'Cuántos anillos hay del centro hacia fuera.',
    opening: 'Tamaño del hueco del centro.',
    thick: 'Grosor de los arcos.',
    vary: 'Cuánto cambia el grosor de un anillo a otro.',
    span: 'Qué parte de la vuelta ocupa cada arco.',
    tilt: 'Cuánto se inclina el plano: de frente a casi de canto.',
    cycle: 'Duración del bucle.',
    rates: 'Cuántas vueltas por ciclo puede dar un anillo: más, más ritmos distintos.',
    tail: 'El arco se apaga de la cabeza a la cola.',
    balance: 'El plano se balancea un poco una vez por ciclo.',
    per: 'Cuántas copias del arco tiene cada anillo.',
    size: 'Radio del anillo exterior.',
  },
  presets: {
    orbitas: 'Seis arcos azules y naranjas en un plano inclinado, cada uno a su ritmo.',
    barrido: 'Plano de frente, nueve anillos finos con dos arcos cada uno y colas largas, en verde.',
    saturnal: 'Pocos anillos anchos casi de canto, arcos largos que giran despacio en ocre.',
    engranaje: 'Siete anillos con tres arcos cada uno que giran a cuatro ritmos, en violeta.',
  },
};
