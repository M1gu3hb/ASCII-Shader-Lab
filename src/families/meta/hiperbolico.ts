import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'hiperbolico',
  name: 'Teselación hiperbólica',
  group: 'forma',
  kind: 'analytic',
  version: 1,
  blurb: 'Polígonos regulares que caben infinitas veces en un disco: el plano hiperbólico de Poincaré.',
  mechanism: 'Teselación regular {p,q}: polígonos de p lados, q en cada vértice. Cada punto del disco se refleja en dos espejos rectos y en un círculo perpendicular al borde hasta caer en el triángulo fundamental; la paridad de los reflejos alterna los colores y la distancia al espejo circular dibuja las aristas.',
  time: 'Una función del tiempo: el disco gira y se desliza por una traslación hiperbólica que vuelve a coincidir consigo misma. Admite bucle perfecto.',
  params: [
    { key: 'p', label: 'Lados (p)', type: 'int', min: 3, max: 12, def: 7, hint: 'Lados de cada polígono.' },
    { key: 'q', label: 'Por vértice (q)', type: 'int', min: 3, max: 12, def: 3, hint: 'Polígonos que se juntan en cada vértice. Si {p,q} no es hiperbólico ((p−2)(q−2) ≤ 4), q sube al primer valor que sí lo es.' },
    { key: 'motif', label: 'Motivo', type: 'choice', def: 'aristas', options: [
      { id: 'aristas', label: 'Aristas' }, { id: 'alternas', label: 'Teselas alternas' }, { id: 'estrella', label: 'Estrella' },
    ], hint: 'Teselas alternas: cada polígono se parte en 2p triángulos y el tono cambia con cada reflejo.' },
    { key: 'width', label: 'Grosor', type: 'number', min: 0.3, max: 3, def: 1, step: 0.05, hint: 'Ancho de las aristas: menguan hacia el borde como los polígonos.' },
    { key: 'drift', label: 'Deriva', type: 'number', min: -1, max: 1, def: 0.3, step: 0.01, hint: 'Velocidad de la traslación hiperbólica: con 1, un polígono cada 8 s.' },
    { key: 'turn', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01, hint: 'Vueltas del disco por minuto.' },
    { key: 'rim', label: 'Borde', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01, hint: 'Oscurece el disco hacia el borde, donde los polígonos se vuelven diminutos.' },
    { key: 'outside', label: 'Exterior', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Fuera del disco, el reflejo de la teselación en el borde, con este brillo.' },
  ],
  presets: [
    { id: 'triangulos', name: 'Triángulos {7,3}', desc: 'Cada heptágono partido en 14 triángulos de tono alterno: el grupo de reflexiones (2,3,7).', params: { p: 7, q: 3, motif: 'alternas', width: 0.8, drift: 0.3, turn: 0.1, rim: 0.4, outside: 0 }, look: { stops: ['#0a0710', '#f3e4c4'], bg: '#05040a', charset: ' .:-=+*#%@' } },
    { id: 'cuadrados', name: 'Cuadrados {4,5}', desc: 'Cinco cuadrados por vértice: sólo aristas, que se estrechan hacia el borde.', params: { p: 4, q: 5, motif: 'aristas', width: 1.2, drift: -0.25, turn: 0.15, rim: 0.3, outside: 0 }, look: { stops: ['#04100f', '#a6f0e0'], bg: '#020807', charset: ' .·:;+=#' } },
    { id: 'estrellas', name: 'Estrellas {6,4}', desc: 'Una estrella de seis puntas en cada hexágono; cuatro se tocan en cada vértice.', params: { p: 6, q: 4, motif: 'estrella', width: 0.7, drift: 0.2, turn: -0.12, rim: 0.35, outside: 0 }, look: { stops: ['#100a04', '#ffd38a'], bg: '#080502', charset: ' .-=+*#@' } },
    { id: 'espejo', name: 'Pentágonos y su reflejo {5,4}', desc: 'Cuatro pentágonos por vértice; fuera del disco, la misma teselación reflejada en el borde.', params: { p: 5, q: 4, motif: 'aristas', width: 1, drift: 0.3, turn: 0, rim: 0.2, outside: 0.6 }, look: { stops: ['#0b0814', '#c9b8ff'], bg: '#05040c', charset: ' .:;+*#' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { limits: 'Hasta 40 reflejos por celda; sin memoria ni texturas.' },
  sources: [
    { label: 'Malin Christersson: teselación hiperbólica en el disco de Poincaré (sólo las matemáticas)', url: 'https://www.malinc.se/noneuclidean/en/poincaretiling.php' },
    { label: 'Teselaciones uniformes del plano hiperbólico (símbolos de Schläfli y grupos de triángulos)', url: 'https://en.wikipedia.org/wiki/Uniform_tilings_in_hyperbolic_plane' },
  ],
  figure: true,
};
