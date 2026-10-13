import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Polígonos que caben infinitas veces en un disco y menguan hacia el borde: rosetones, redes curvas y azulejos en relieve.',
  mechanism: 'Teselación regular {p,q}: polígonos de p lados, q en cada vértice. Cada punto del disco se refleja en dos espejos rectos y en un círculo perpendicular al borde hasta caer en el triángulo fundamental; la paridad de los reflejos alterna los colores y la distancia al espejo circular dibuja las aristas. En «Relieve», cada pliegue gira o refleja la dirección de la pantalla; seguirla deja iluminar el bisel de cada azulejo desde el mismo lado, por mucho que se haya plegado.',
  time: 'Una función del tiempo: el disco se desliza por una traslación hiperbólica que, al cabo de 8 / deriva segundos, coincide consigo misma. Sin giro es un bucle exacto de ese periodo («Red curva», 32 s; «Disco y su reflejo», 20 s; «Mosaico que fluye», 32 s); con giro es continuo: la vuelta y el deslizamiento no vuelven a coincidir.',
  limits: 'Hasta 40 reflejos por celda; sin memoria ni texturas.',
  sources: [
    { label: 'Malin Christersson: teselación hiperbólica en el disco de Poincaré (sólo las matemáticas)', url: 'https://www.malinc.se/noneuclidean/en/poincaretiling.php' },
    { label: 'Teselaciones uniformes del plano hiperbólico (símbolos de Schläfli y grupos de triángulos)', url: 'https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane' },
  ],
  hints: {
    'p': 'Lados de cada polígono.',
    'q': 'Polígonos que se juntan en cada vértice. Si {p,q} no es hiperbólico ((p−2)(q−2) ≤ 4), q sube al primer valor que sí lo es.',
    'motif': 'Teselas alternas: cada polígono se parte en 2p triángulos y el tono cambia con cada reflejo. Relieve: azulejos con bisel, iluminados desde arriba a la izquierda.',
    'width': 'Ancho de las aristas (en «Relieve», del bisel): menguan hacia el borde como los polígonos.',
    'drift': 'Velocidad de la traslación hiperbólica: con 1, un polígono cada 8 s.',
    'turn': 'Vueltas del disco por minuto (0: un bucle exacto del deslizamiento).',
    'rim': 'Oscurece el disco hacia el borde, donde los polígonos se vuelven diminutos.',
    'outside': 'Fuera del disco, el reflejo de la teselación en el borde, con este brillo.',
  },
  presets: {
    'triangulos': 'Heptágonos partidos en 14 gajos de tono alterno, como rosetones, que giran y se deslizan hacia el borde.',
    'cuadrados': 'Una red de cuadrados curvos, cinco por vértice, cuyas aristas se estrechan hacia el borde; un bucle de 32 s.',
    'estrellas': 'Una estrella de seis puntas en cada hexágono, cada vez más pequeñas hacia el borde.',
    'espejo': 'Pentágonos dentro del disco y, fuera, su reflejo en el borde, que llena el cuadro; un bucle de 20 s.',
    'relieve': 'Hexágonos como azulejos con bisel, iluminados desde un lado, que giran despacio dentro del disco.',
    'mosaico': 'De cerca, sin borde: azulejos en relieve que pasan por todo el cuadro y vuelven a su sitio cada 32 s.',
  },
};
