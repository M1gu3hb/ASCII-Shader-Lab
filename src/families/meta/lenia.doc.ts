import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Vida artificial continua: criaturas blandas que nadan, giran y se dividen.',
  mechanism: 'Un autómata celular continuo de Bert Chan: cada celda mira a sus vecinas a través de un núcleo en forma de anillo y crece o se consume según lo cerca que esté esa suma de un valor ideal. Con el equilibrio justo aparecen organismos que se mueven solos.',
  time: 'Evoluciona con memoria. Sin «Repoblar» es una construcción: las criaturas chocan y mueren o estallan, y las colonias llenan el campo y se quedan casi quietas. Con «Repoblar» es continuo: cada dos segundos pesa la materia viva y, si ha caído a menos de la mitad de lo que llegó a haber, siembra una criatura nueva en el sitio más vacío. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de 256 × 128 celdas (512 × 256 si pides más de 181 filas) con un campo en coma flotante y dos espectros de media rejilla; dos FFT por paso. El radio se mide en la rejilla de 128 filas y crece con ella, así que una regla dibuja lo mismo a cualquier tamaño; pedir menos de 128 filas dibuja 128. Las criaturas se crían en un vivero de 64 × 64 con 1000 pasos como mucho, una vez por regla. Las recetas hechas con la versión 1 conservan su rejilla y su radio en celdas.',
  sources: [
    { label: 'Chan (2019): Lenia — Biology of Artificial Life', url: 'https://arxiv.org/abs/1812.05433' },
    { label: 'Bert Chan: Lenia', url: 'https://chakazul.github.io/lenia.html' },
  ],
  hints: {
    'mu': 'La densidad de vecinas con la que una celda crece mejor.',
    'sigma': 'Cuánto se puede apartar de ese ideal: poca tolerancia, criaturas frágiles; mucha, manchas que se expanden.',
    'R': 'Alcance del núcleo, en celdas de la rejilla de 128 filas: el tamaño de las criaturas.',
    'dt': 'Cuánto cambia cada paso: pequeño es suave; grande, brusco e inestable.',
    'rings': 'Anillos concéntricos del vecindario y su peso.',
    'seedShape': 'Manchas de ruido, ruido en todo el campo o criaturas que se crían aparte con estas mismas reglas.',
    'density': 'Cuánta materia hay al empezar: manchas, densidad de la sopa o parte de los puestos del banco de criaturas.',
    'view': 'Materia: cuánta hay en cada celda. Crecimiento: dónde crecería ahora. Contorno: sólo sus bordes.',
    'renew': 'Si la materia viva cae a menos de la mitad de su máximo, siembra una criatura (o una mancha) en el sitio más vacío.',
  },
  presets: {
    'orbium': 'Un banco de criaturas redondas que nadan en formación, todas hacia el mismo lado, sin chocar nunca.',
    'colonia': 'Unas manchas crecen y se parten en células que acaban poblando todo el campo y se quedan casi quietas.',
    'anulares': 'Un núcleo de tres anillos: criaturas con forma de aro que se desplazan despacio en formación.',
    'sopa': 'Ruido por todas partes que se ordena en gusanos que se empujan sin parar, dibujados sólo por su borde.',
    'enjambre': 'Bacilos y anillos pequeños que se arremolinan en corrientes por todo el campo sin quedarse quietos.',
  },
};
