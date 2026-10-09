import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lenia',
  name: 'Lenia',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Vida artificial continua: criaturas blandas que nadan, giran y se dividen.',
  mechanism: 'Un autómata celular continuo de Bert Chan: cada celda mira a sus vecinas a través de un núcleo en forma de anillo y crece o se consume según lo cerca que esté esa suma de un valor ideal. Con el equilibrio justo aparecen organismos que se mueven solos.',
  time: 'Evoluciona con memoria: las criaturas nacen, se desplazan y chocan sin repetirse. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'mu', label: 'Crecimiento (μ)', type: 'number', min: 0.05, max: 0.45, def: 0.15, step: 0.001, digits: 3, hint: 'La densidad de vecinas con la que una celda crece mejor.' },
    { key: 'sigma', label: 'Tolerancia (σ)', type: 'number', min: 0.004, max: 0.08, def: 0.015, step: 0.0005, digits: 4, hint: 'Cuánto se puede apartar de ese ideal: poca tolerancia, criaturas frágiles; mucha, manchas que se expanden.' },
    { key: 'R', label: 'Radio', type: 'int', min: 6, max: 36, def: 13, unit: 'celdas', hint: 'Alcance del núcleo: el tamaño de las criaturas (como mucho, 0,4 de las filas).' },
    { key: 'dt', label: 'Paso de tiempo', type: 'number', min: 0.02, max: 0.5, def: 0.1, step: 0.01, hint: 'Cuánto cambia cada paso: pequeño es suave; grande, brusco e inestable.' },
    { key: 'rings', label: 'Núcleo', type: 'choice', def: 'uno', options: [
      { id: 'uno', label: 'Un anillo' }, { id: 'dos', label: 'Dos anillos (1, ½)' }, { id: 'tres', label: 'Tres anillos (½, 1, ⅔)' },
    ], hint: 'Anillos concéntricos del vecindario y su peso.' },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'manchas', rebuild: true, options: [
      { id: 'manchas', label: 'Manchas' }, { id: 'sopa', label: 'Sopa' }, { id: 'criaturas', label: 'Criaturas' },
    ], hint: 'Manchas de ruido, ruido en todo el campo o criaturas que se crían aparte con estas mismas reglas.' },
    { key: 'density', label: 'Densidad', type: 'number', min: 0.1, max: 1, def: 0.5, step: 0.01, rebuild: true, hint: 'Cuánta materia hay al empezar: manchas, densidad de la sopa o número de criaturas.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'materia', options: [
      { id: 'materia', label: 'Materia' }, { id: 'crecimiento', label: 'Crecimiento' }, { id: 'contorno', label: 'Contorno' },
    ], hint: 'Materia: cuánta hay en cada celda. Crecimiento: dónde crecería ahora. Contorno: sólo sus bordes.' },
  ],
  presets: [
    { id: 'orbium', name: 'Orbium', desc: 'Un banco de criaturas redondas que nadan juntas; si chocan, pueden deshacerse.', params: { mu: 0.15, sigma: 0.015, R: 18, dt: 0.1, rings: 'uno', seedShape: 'criaturas', density: 0.5, view: 'materia' }, look: { stops: ['#04100f', '#9ff2de'], bg: '#020807', charset: ' .:-=+*#%@' } },
    { id: 'colonia', name: 'Colonia', desc: 'Unas manchas crecen y se parten en células que acaban poblando todo el campo.', params: { mu: 0.12, sigma: 0.0145, R: 16, dt: 0.1, rings: 'uno', seedShape: 'manchas', density: 0.35, view: 'materia' }, look: { stops: ['#100a06', '#ffd8a0'], bg: '#080503', charset: ' .·:oO@' } },
    { id: 'anulares', name: 'Organismos anulares', desc: 'Un núcleo de tres anillos: criaturas con forma de aro que se desplazan despacio.', params: { mu: 0.19, sigma: 0.02, R: 24, dt: 0.1, rings: 'tres', seedShape: 'criaturas', density: 0.4, view: 'materia' }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .:;+*#' } },
    { id: 'sopa', name: 'Sopa primordial', desc: 'Ruido por todas partes que se ordena en gusanos que se empujan sin parar.', params: { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, rings: 'uno', seedShape: 'sopa', density: 0.5, view: 'contorno' }, look: { stops: ['#0e0a04', '#f0e0a0'], bg: '#070502', charset: ' .-~=+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'sembrar', label: 'Sembrar', hint: 'Echa una mancha de materia: a veces nace una criatura.' }, { id: 'borrar', label: 'Borrar', hint: 'Vacía la zona.' }],
  },
  budget: { res: [64, 256, 128], rate: 24, warmup: 48, limits: 'Rejilla en potencia de dos (64, 128 o 256 filas; las filas pedidas se redondean) con un campo en coma flotante y dos espectros de media rejilla; dos FFT por paso. Las criaturas se crían en un vivero de 64 × 64 con 1000 pasos como mucho, una vez por regla.' },
  sources: [
    { label: 'Chan (2019): Lenia — Biology of Artificial Life', url: 'https://arxiv.org/abs/1812.05433' },
    { label: 'Bert Chan: Lenia', url: 'https://chakazul.github.io/lenia.html' },
  ],
  wrap: 'repeat',
};
