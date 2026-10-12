import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una rejilla de puntos sobre un plano en perspectiva que ondula como agua; sin sol, sólo puntos.',
  mechanism: 'Una cámara a una altura fija mira el plano inclinada hacia abajo, avanza y se mece de lado. Cada punto de la rejilla sube y baja con dos ondas cruzadas y una onda circular que nace delante de la cámara. Para cada celda se busca dónde cortaría su rayo el plano y se prueban las nueve filas de la rejilla de alrededor: en cada una, el punto más cercano a esa profundidad, levantado por las ondas y proyectado; la celda se enciende con el punto proyectado más cercano, un disco que se encoge con la distancia. Las filas que en pantalla quedan más juntas que una celda se apagan (sin moiré) y una niebla atenúa lo lejano; los puntos en lo alto de una ola brillan más.',
  time: 'Una función del tiempo: las ondas tienen frecuencias sin proporción entre sí y la cámara avanza sin fin, así que sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Nueve filas probadas por celda (una ola muy alta en primer plano puede cortarse); los puntos lejanos se funden con la niebla.',
  sources: [
    { label: 'Vanta.js · Dots, de Teng Bao (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/tengbao/vanta' },
    { label: 'Proyección en perspectiva', url: 'https://es.wikipedia.org/wiki/Proyecci%C3%B3n_en_perspectiva' },
  ],
  hints: {
    spacing: 'Distancia entre puntos de la rejilla.',
    amp: 'Altura de las ondas que levantan los puntos.',
    wavelen: 'Largo de las ondas.',
    speed: 'Lo rápido que corren las ondas.',
    travel: 'La cámara avanza (o retrocede) sobre la rejilla.',
    tilt: 'Cuánto mira la cámara hacia abajo: con poco se ve el horizonte.',
    dot: 'Tamaño de los puntos.',
    fog: 'Cuánto se apagan los puntos lejanos.',
    ripple: 'Una onda circular que nace delante de la cámara.',
    sway: 'La cámara se mece de lado a lado.',
  },
  presets: {
    campo: 'Puntos azules que ondulan con olas cruzadas y una onda circular mientras la cámara avanza.',
    marejada: 'Rejilla apretada y verde con olas altas y largas, mirada casi hacia el horizonte.',
    gota: 'Cámara quieta mirando casi hacia abajo: una onda circular naranja se abre en la rejilla.',
    llanura: 'Puntos grandes y separados, casi quietos, que se alejan con mucha niebla violeta.',
  },
};
