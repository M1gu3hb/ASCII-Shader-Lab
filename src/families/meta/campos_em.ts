import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'campos_em',
  name: 'Líneas de campo',
  group: 'ciencia',
  kind: 'geometry',
  version: 1,
  blurb: 'Cargas, espiras e imanes con sus líneas de campo en 3D, y partículas que viajan por ellas.',
  mechanism: 'Las líneas se trazan siguiendo el campo paso a paso (Runge–Kutta) desde puntos alrededor de cada fuente, tantos como su intensidad: el campo eléctrico de Coulomb sale de las cargas positivas y entra en las negativas; el magnético de una espira se suma tramo a tramo (Biot–Savart) y el de un imán es el de un dipolo. Las líneas magnéticas se cierran sobre sí mismas.',
  time: 'Las líneas crecen desde las fuentes durante los primeros segundos; la cámara gira y las partículas fluyen, más rápido donde el campo es más fuerte. El crecimiento no es un bucle.',
  params: [
    { key: 'config', label: 'Configuración', type: 'choice', def: 'dipolo', rebuild: true, options: [
      { id: 'dipolo', label: 'Dipolo' }, { id: 'cuadrupolo', label: 'Cuadrupolo' }, { id: 'iguales', label: 'Cargas iguales' },
      { id: 'espira', label: 'Espira magnética' }, { id: 'iman', label: 'Imán (dipolo magnético)' },
    ], hint: 'Cada configuración tiene una segunda fuente según la intensidad relativa: la otra carga, otra espira en el mismo eje u otro imán al lado.' },
    { key: 'sep', label: 'Separación', type: 'number', min: 0.3, max: 1.6, def: 0.9, step: 0.01, rebuild: true, hint: 'Distancia entre las fuentes.' },
    { key: 'ratio', label: 'Intensidad relativa', type: 'number', min: 0, max: 3, def: 1, step: 0.01, rebuild: true, hint: 'La segunda fuente frente a la primera: carga, corriente o imán. Con 0 queda una sola.' },
    { key: 'lines', label: 'Líneas por fuente', type: 'int', min: 4, max: 24, def: 12, rebuild: true, hint: 'Por unidad de intensidad: una fuente el doble de fuerte tiene el doble.' },
    { key: 'particles', label: 'Partículas', type: 'int', min: 0, max: 8, def: 3, hint: 'Partículas de prueba en cada línea.' },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.2, step: 0.01, hint: 'Vueltas por minuto.' },
    { key: 'tilt', label: 'Inclinación', type: 'number', min: -80, max: 80, def: 18, step: 1, unit: '°', hint: 'La cámara por encima o por debajo del plano de las fuentes.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'lineas', options: [
      { id: 'lineas', label: 'Líneas' }, { id: 'flujo', label: 'Flujo' }, { id: 'potencial', label: 'Potencial' },
    ], hint: 'Flujo: las partículas mandan. Potencial: bandas equipotenciales (|B| en las espiras) en el plano que mira a la cámara.' },
  ],
  presets: [
    { id: 'dipolo', name: 'Dipolo eléctrico', desc: 'Una carga positiva y otra negativa: las líneas salen de una y se curvan hasta la otra.', params: { config: 'dipolo', sep: 0.9, ratio: 1, lines: 16, particles: 3, turn: 0.2, tilt: 18, view: 'lineas' }, look: { stops: ['#05070f', '#bcd8ff'], bg: '#03040a', charset: ' .·:-=+*#' } },
    { id: 'repulsion', name: 'Cargas que se repelen', desc: 'Dos cargas positivas, una el doble que la otra: las líneas se apartan y dejan un punto sin campo.', params: { config: 'iguales', sep: 1.1, ratio: 2, lines: 10, particles: 4, turn: -0.15, tilt: 25, view: 'potencial' }, look: { stops: ['#100606', '#ffc6a8'], bg: '#080303', charset: ' .:;+=*#' } },
    { id: 'helmholtz', name: 'Espiras de Helmholtz', desc: 'Dos espiras iguales separadas un radio: entre ellas el campo es casi uniforme.', params: { config: 'espira', sep: 0.45, ratio: 1, lines: 9, particles: 5, turn: 0.25, tilt: 12, view: 'flujo' }, look: { stops: ['#04100a', '#b4f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'cuadrupolo', name: 'Cuadrupolo', desc: 'Cuatro cargas alternas: las líneas saltan a la vecina y el centro queda vacío.', params: { config: 'cuadrupolo', sep: 0.8, ratio: 1, lines: 10, particles: 2, turn: 0.1, tilt: 60, view: 'lineas' }, look: { stops: ['#0b0814', '#d2c4ff'], bg: '#05040c', charset: ' .:-=+#' } },
    { id: 'iman', name: 'Imán', desc: 'Un dipolo magnético solo: líneas cerradas que salen del norte y vuelven por el sur.', params: { config: 'iman', sep: 0.9, ratio: 0, lines: 16, particles: 3, turn: 0.2, tilt: 8, view: 'lineas' }, look: { stops: ['#0e0a04', '#ffe2a0'], bg: '#070502', charset: ' .\'`:;|+#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 192, 96], rate: 30, warmup: 0, limits: 'Hasta 120 líneas de 420 pasos de RK4 cada una, trazadas una vez por configuración; espiras de 32 tramos; partículas ≤ 8 por línea.' },
  sources: [
    { label: 'Ley de Biot–Savart', url: 'https://en.wikipedia.org/wiki/Biot%E2%80%93Savart_law' },
    { label: 'Líneas de campo como curvas integrales del campo', url: 'https://en.wikipedia.org/wiki/Field_line' },
    { label: 'Paul Falstad: applets de campos (sólo la física)', url: 'https://www.falstad.com/vector3de/' },
  ],
  wrap: 'clamp',
  figure: true,
};
