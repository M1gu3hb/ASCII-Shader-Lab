import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Manchas de los colores de tu paleta que se mezclan y viajan por el lienzo, cada una por su camino.',
  mechanism: 'Cada corriente es un punto de color que recorre su propia trayectoria. Cada celda mezcla los colores según lo cerca que está de cada corriente (pesos de distancia inversa: con más contraste, zonas más planas y bordes más definidos), sobre un espacio que dos ondas cruzadas y un remolino deforman. La celda lleva ese color; el carácter sale de su brillo dentro de la paleta, o de los bordes entre corrientes.',
  time: 'Una función del tiempo con frecuencias que no se repiten juntas: sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 8 corrientes; los colores son los de la paleta (hasta 6, que se repiten si hay más corrientes que colores).',
  sources: [
    { label: 'Paper Shaders: Mesh Gradient (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/mesh-gradient' },
    { label: 'Interpolación de Shepard (distancia inversa)', url: 'https://en.wikipedia.org/wiki/Inverse_distance_weighting' },
  ],
  hints: {
    spots: 'Cuántas manchas de color viajan a la vez.',
    swirl: 'Cuánto gira el espacio alrededor del centro.',
    warp: 'Ondas que estiran y doblan las corrientes.',
    speed: 'Lo rápido que viajan las corrientes.',
    scale: 'Tamaño de las manchas en el lienzo.',
    contrast: 'Bajo: degradados suaves. Alto: zonas planas con bordes nítidos.',
    grain: 'Bordes tramados y una textura fina que fluye dentro de cada corriente.',
    glyph: 'De dónde sale el carácter: del brillo del color, de los bordes entre corrientes, o de los dos.',
  },
  presets: {
    neon: 'Cian, rosa y violeta que se cruzan sobre un fondo oscuro.',
    atardecer: 'Masas cálidas y anchas que se estiran despacio, con grano.',
    marmolada: 'Corrientes de borde nítido que se pliegan como tinta en agua; el carácter dibuja los bordes.',
    boreal: 'Tres velos grandes y lentos, verde y violeta.',
    remolino: 'Colores vivos que giran alrededor del centro.',
  },
};
