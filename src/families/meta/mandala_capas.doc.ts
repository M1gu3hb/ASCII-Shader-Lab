import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un mandala de tres capas concéntricas —flor de la vida, espirales áureas y un rosetón— que giran en sentidos opuestos.',
  mechanism: 'Tres capas alrededor de un punto, cada una con su propia repetición: en el centro, una flor de la vida (círculos iguales apoyados en un anillo, con pétalos donde se solapan); en medio, espirales áureas, que crecen en la proporción áurea cada cuarto de vuelta, en los dos sentidos, de modo que sus cruces forman una red como la de un girasol; fuera, un rosetón de lóbulos con una cuenta en cada uno, anillos y una corona de marcas. La flor y el rosetón giran en un sentido y las espirales y la corona en el contrario, cada capa un número entero de sus propios pasos por ciclo: al cabo del ciclo todo vuelve exactamente a su inicio. El conjunto respira (crece y mengua un poco) con el mismo ciclo.',
  time: 'Un bucle exacto: cada capa gira un número entero de pasos de su simetría por ciclo, así que a los segundos de «Ciclo» el mandala vuelve a ser el mismo.',
  limits: 'Tres capas fijas (se puede apagar cualquiera). La flor es la «semilla de la vida»: un círculo central y un anillo de círculos; las espirales comparten el mismo número de brazos en los dos sentidos.',
  sources: [
    { label: 'Radiant · Golden Throne, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Espiral logarítmica y espiral áurea', url: 'https://es.wikipedia.org/wiki/Espiral_logar%C3%ADtmica' },
    { label: 'Flor de la vida (patrón de círculos solapados)', url: 'https://es.wikipedia.org/wiki/Flor_de_la_vida' },
  ],
  hints: {
    petals: 'La simetría de la flor del centro y de los lóbulos del rosetón.',
    spirals: 'Cuántos brazos de espiral áurea hay en cada sentido.',
    rings: 'Cuántos anillos rodean el rosetón por dentro.',
    cycle: 'Los segundos que tarda el mandala en volver exactamente a su inicio.',
    turns: 'Cuántos pasos de su simetría gira la flor (y, más deprisa, el rosetón) en cada ciclo.',
    counter: 'Cuántos pasos giran las espirales en sentido contrario en cada ciclo.',
    line: 'El grosor de los trazos.',
    fill: 'El relleno de los pétalos, de las celdas de la red y de los lóbulos.',
    glow: 'El resplandor alrededor de los trazos y del borde.',
    breathe: 'Cuánto crece y mengua el mandala a lo largo del ciclo.',
    flower: 'La fuerza de la flor de la vida del centro (a cero, desaparece).',
    spiral: 'La fuerza de las espirales áureas de en medio.',
    outer: 'La fuerza del rosetón y la corona de fuera.',
    center: 'El punto del centro, con su foso oscuro y una pequeña estrella.',
  },
  presets: {
    trono: 'Flor de seis, cinco espirales y un rosetón de doce lóbulos en oro, girando despacio en sentidos opuestos.',
    roseton: 'Simetría de doce, trazo fino y mucho relleno: una vidriera violeta de ocho espirales y cuatro anillos.',
    loto: 'Cinco pétalos de trazo grueso y mucho resplandor que respiran deprisa en un ciclo corto.',
    girasol: 'Ocho espirales que dominan el conjunto y giran deprisa contra la flor: una red de girasol.',
  },
};
