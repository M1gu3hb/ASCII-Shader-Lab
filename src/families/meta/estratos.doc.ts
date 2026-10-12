import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Capas de roca vistas de lado, plegadas por la tectónica y cortadas por fallas: un color por capa sobre grano de papel.',
  mechanism: 'Las capas son las curvas de nivel de una profundidad: la altura, más unos pliegues largos que se desplazan despacio y cambian con la profundidad (anticlinales y sinclinales), más una deformación suave de ruido, más el salto de cada falla. Una falla es una línea empinada: al cruzarla la profundidad salta (las capas no casan) y junto a ella se doblan, arrastradas. Las capas tienen grosores desiguales; cada una lleva un color de tu paleta (todos menos el primero, el más oscuro), el mismo en toda la capa (las vecinas nunca repiten dentro de cada tanda), y un brillo propio. El carácter sale de ese brillo con un grano de papel y una línea oscura en cada frontera.',
  time: 'Una función del tiempo: los pliegues avanzan, los saltos de las fallas respiran y la sedimentación sube o baja las capas sin fin, así que sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 4 fallas y 30 capas por alto de lienzo; los colores son los de la paleta (hasta 6).',
  sources: [
    { label: 'Radiant · Painted Strata, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Pliegue (geología): anticlinal y sinclinal', url: 'https://es.wikipedia.org/wiki/Pliegue' },
    { label: 'Falla geológica', url: 'https://es.wikipedia.org/wiki/Falla_geol%C3%B3gica' },
  ],
  hints: {
    layers: 'Cuántas capas caben en el alto del lienzo.',
    fold: 'Altura de los pliegues.',
    foldlen: 'Largo de cada pliegue: apretados o abiertos.',
    warp: 'Deformación irregular de las capas.',
    faults: 'Cuántas fallas cortan las capas.',
    throw: 'Cuánto se desplazan las capas al cruzar una falla.',
    grain: 'Textura de papel dentro de cada capa.',
    drift: 'Las capas suben o bajan despacio sin fin.',
    lines: 'Oscurece las fronteras entre capas.',
    tect: 'Lo rápido que se mueven los pliegues y las fallas.',
  },
  presets: {
    canon: 'Areniscas rojas y ocres, pliegues suaves y dos fallas, como la pared de un cañón.',
    plegado: 'Muchas capas finas en pliegues apretados y sin fallas, en grises y arena.',
    fallas: 'Pocas capas gruesas cortadas por cuatro fallas con mucho salto: bloques en escalera.',
    acuarela: 'Pocas capas anchas de colores vivos, muy deformadas, con mucho grano de papel.',
  },
};
