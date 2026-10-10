import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Vida artificial continua: criaturas blandas que nadan, giran y se dividen.',
  mechanism: 'Un autómata celular continuo de Bert Chan: cada celda mira a sus vecinas a través de un núcleo en forma de anillo y crece o se consume según lo cerca que esté esa suma de un valor ideal. Con el equilibrio justo aparecen organismos que se mueven solos.',
  time: 'Evoluciona con memoria: las criaturas nacen, se desplazan y chocan sin repetirse. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla en potencia de dos (64, 128 o 256 filas; las filas pedidas se redondean) con un campo en coma flotante y dos espectros de media rejilla; dos FFT por paso. Las criaturas se crían en un vivero de 64 × 64 con 1000 pasos como mucho, una vez por regla.',
  sources: [
    { label: 'Chan (2019): Lenia — Biology of Artificial Life', url: 'https://arxiv.org/abs/1812.05433' },
    { label: 'Bert Chan: Lenia', url: 'https://chakazul.github.io/lenia.html' },
  ],
  hints: {
    'mu': 'La densidad de vecinas con la que una celda crece mejor.',
    'sigma': 'Cuánto se puede apartar de ese ideal: poca tolerancia, criaturas frágiles; mucha, manchas que se expanden.',
    'R': 'Alcance del núcleo: el tamaño de las criaturas (como mucho, 0,4 de las filas).',
    'dt': 'Cuánto cambia cada paso: pequeño es suave; grande, brusco e inestable.',
    'rings': 'Anillos concéntricos del vecindario y su peso.',
    'seedShape': 'Manchas de ruido, ruido en todo el campo o criaturas que se crían aparte con estas mismas reglas.',
    'density': 'Cuánta materia hay al empezar: manchas, densidad de la sopa o número de criaturas.',
    'view': 'Materia: cuánta hay en cada celda. Crecimiento: dónde crecería ahora. Contorno: sólo sus bordes.',
  },
  presets: {
    'orbium': 'Un banco de criaturas redondas que nadan juntas; si chocan, pueden deshacerse.',
    'colonia': 'Unas manchas crecen y se parten en células que acaban poblando todo el campo.',
    'anulares': 'Un núcleo de tres anillos: criaturas con forma de aro que se desplazan despacio.',
    'sopa': 'Ruido por todas partes que se ordena en gusanos que se empujan sin parar.',
  },
};
