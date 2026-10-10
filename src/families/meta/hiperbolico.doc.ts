import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Polígonos regulares que caben infinitas veces en un disco: el plano hiperbólico de Poincaré.',
  mechanism: 'Teselación regular {p,q}: polígonos de p lados, q en cada vértice. Cada punto del disco se refleja en dos espejos rectos y en un círculo perpendicular al borde hasta caer en el triángulo fundamental; la paridad de los reflejos alterna los colores y la distancia al espejo circular dibuja las aristas.',
  time: 'Una función del tiempo: el disco gira y se desliza por una traslación hiperbólica que vuelve a coincidir consigo misma. Admite bucle perfecto.',
  limits: 'Hasta 40 reflejos por celda; sin memoria ni texturas.',
  sources: [
    { label: 'Malin Christersson: teselación hiperbólica en el disco de Poincaré (sólo las matemáticas)', url: 'https://www.malinc.se/noneuclidean/en/poincaretiling.php' },
    { label: 'Teselaciones uniformes del plano hiperbólico (símbolos de Schläfli y grupos de triángulos)', url: 'https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane' },
  ],
  hints: {
    'p': 'Lados de cada polígono.',
    'q': 'Polígonos que se juntan en cada vértice. Si {p,q} no es hiperbólico ((p−2)(q−2) ≤ 4), q sube al primer valor que sí lo es.',
    'motif': 'Teselas alternas: cada polígono se parte en 2p triángulos y el tono cambia con cada reflejo.',
    'width': 'Ancho de las aristas: menguan hacia el borde como los polígonos.',
    'drift': 'Velocidad de la traslación hiperbólica: con 1, un polígono cada 8 s.',
    'turn': 'Vueltas del disco por minuto.',
    'rim': 'Oscurece el disco hacia el borde, donde los polígonos se vuelven diminutos.',
    'outside': 'Fuera del disco, el reflejo de la teselación en el borde, con este brillo.',
  },
  presets: {
    'triangulos': 'Cada heptágono partido en 14 triángulos de tono alterno: el grupo de reflexiones (2,3,7).',
    'cuadrados': 'Cinco cuadrados por vértice: sólo aristas, que se estrechan hacia el borde.',
    'estrellas': 'Una estrella de seis puntas en cada hexágono; cuatro se tocan en cada vértice.',
    'espejo': 'Cuatro pentágonos por vértice; fuera del disco, la misma teselación reflejada en el borde.',
  },
};
