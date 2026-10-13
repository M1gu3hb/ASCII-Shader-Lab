import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un disco negro delante del sol: la corona en rayos asimétricos que fluyen hacia fuera, protuberancias y un anillo de diamante.',
  mechanism: 'Alrededor del sol, la corona brilla según la altura sobre el borde (una ley de potencia que cae deprisa) y se estira a lo largo de un eje, como los grandes rayos del ecuador solar. La rompen en rayos un ruido fBm leído en coordenadas polares —en la dirección y en el logaritmo de la distancia—, de modo que los rayos son largos y finos, no tienen costura y se desplazan hacia fuera con el tiempo: el viento solar. El borde de la luna tiene montañas y valles; su centro se aparta un poco del sol y vuelve en un ciclo lento: cuando el borde del sol asoma por los valles se encienden las perlas de Baily y, si asoma más, el anillo de diamante con su cruz de rayos. En el borde, protuberancias rosadas que respiran; alrededor, estrellas que la luz de la corona tapa. Cada celda lleva su color: corona nacarada (más cálida o más fría con «Tinte»), protuberancias rosas, destellos blancos.',
  time: 'Una función del tiempo: la corona fluye hacia fuera sin repetirse y el contacto de la luna va y viene cada 16 segundos; sigue cambiando sin reinicio. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Una corona plana (sin profundidad) y cuatro protuberancias fijas en ángulo. El anillo de diamante aparece siempre en el mismo punto del borde, que gira con el eje.',
  sources: [
    { label: 'Radiant · Eclipse Glow, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Corona solar (estructura de rayos y brillo según la altura)', url: 'https://es.wikipedia.org/wiki/Corona_solar' },
    { label: 'Perlas de Baily y anillo de diamante', url: 'https://es.wikipedia.org/wiki/Perlas_de_Baily' },
  ],
  hints: {
    size: 'El tamaño del disco de la luna (y del sol detrás).',
    corona: 'Hasta dónde llega la corona.',
    streamers: 'Pocos rayos anchos o muchos rayos finos.',
    asym: 'Cuánto se estira la corona a lo largo de su eje.',
    axis: 'Hacia dónde apunta el eje de la corona (y dónde asoma el diamante).',
    wind: 'Lo deprisa que los rayos fluyen hacia fuera.',
    diamond: 'El destello del anillo de diamante cuando asoma el sol.',
    contact: 'Cuánto se aparta la luna del centro del sol en su vaivén: a cero, totalidad sin diamante.',
    beads: 'La hondura de los valles del borde de la luna: más perlas de luz.',
    prom: 'La altura de las protuberancias rosadas y el brillo de la cromosfera.',
    stars: 'Las estrellas del cielo oscuro.',
    tint: 'De una corona fría y azulada a una dorada.',
  },
  presets: {
    diamante: 'El momento del contacto: la corona nacarada y un anillo de diamante que se enciende y se apaga.',
    totalidad: 'Totalidad sin diamante: una corona larga y muy asimétrica, fría, con muchas estrellas.',
    tormenta: 'Una corona dorada y simétrica llena de rayos finos que fluyen deprisa, con grandes protuberancias.',
    perlas: 'Un disco grande con un borde muy accidentado: el sol asoma en perlas por sus valles.',
  },
};
