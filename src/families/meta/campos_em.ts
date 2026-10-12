import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'campos_em',
  name: 'Líneas de campo',
  group: 'ciencia',
  kind: 'geometry',
  aka: ['campo eléctrico', 'campo magnético', 'Coulomb', 'Biot–Savart', 'líneas de fuerza', 'electromagnetismo'],
  version: 1,
  params: [
    { key: 'config', label: 'Configuración', type: 'choice', def: 'dipolo', rebuild: true, options: [
      { id: 'dipolo', label: 'Dipolo' }, { id: 'cuadrupolo', label: 'Cuadrupolo' }, { id: 'iguales', label: 'Cargas iguales' },
      { id: 'espira', label: 'Espira magnética' }, { id: 'iman', label: 'Imán (dipolo magnético)' },
    ] },
    { key: 'sep', label: 'Separación', type: 'number', min: 0.3, max: 1.6, def: 0.9, step: 0.01, rebuild: true },
    { key: 'ratio', label: 'Intensidad relativa', type: 'number', min: 0, max: 3, def: 1, step: 0.01, rebuild: true },
    { key: 'lines', label: 'Líneas por fuente', type: 'int', min: 4, max: 24, def: 12, rebuild: true },
    { key: 'particles', label: 'Partículas', type: 'int', min: 0, max: 8, def: 3 },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.2, step: 0.01 },
    { key: 'tilt', label: 'Inclinación', type: 'number', min: -80, max: 80, def: 18, step: 1, unit: '°' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'lineas', options: [
      { id: 'lineas', label: 'Líneas' }, { id: 'flujo', label: 'Flujo' }, { id: 'potencial', label: 'Potencial' },
    ] },
    { key: 'move', label: 'Movimiento', type: 'number', min: 0, max: 1, def: 0, step: 0.01, rebuild: true },
  ],
  presets: [
    { id: 'dipolo', name: 'Arcos entre dos cargas', uses: ['arte/figuras'], aka: ['Dipolo eléctrico'], params: { config: 'dipolo', sep: 0.9, ratio: 1, lines: 16, particles: 3, turn: 0.2, tilt: 18, view: 'lineas' }, look: { stops: ['#05070f', '#bcd8ff'], bg: '#03040a', charset: ' .·:-=+*#' } },
    { id: 'repulsion', name: 'Cargas que se repelen', uses: ['arte/figuras'], aka: ['cargas iguales', 'equipotenciales'], params: { config: 'iguales', sep: 1.1, ratio: 2, lines: 10, particles: 4, turn: -0.15, tilt: 25, view: 'potencial' }, look: { stops: ['#100606', '#ffc6a8'], bg: '#080303', charset: ' .:;+=*#' } },
    { id: 'helmholtz', name: 'Dos anillos y su flujo', uses: ['arte/figuras'], aka: ['Espiras de Helmholtz', 'bobinas de Helmholtz'], params: { config: 'espira', sep: 0.45, ratio: 1, lines: 9, particles: 5, turn: 0.25, tilt: 12, view: 'flujo' }, look: { stops: ['#04100a', '#b4f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'cuadrupolo', name: 'Cuatro polos cruzados', uses: ['arte/figuras'], aka: ['Cuadrupolo'], params: { config: 'cuadrupolo', sep: 0.8, ratio: 1, lines: 10, particles: 2, turn: 0.1, tilt: 60, view: 'lineas' }, look: { stops: ['#0b0814', '#d2c4ff'], bg: '#05040c', charset: ' .:-=+#' } },
    { id: 'iman', name: 'Imán', uses: ['arte/figuras'], aka: ['dipolo magnético'], params: { config: 'iman', sep: 0.9, ratio: 0, lines: 16, particles: 3, turn: 0.2, tilt: 8, view: 'lineas' }, look: { stops: ['#0e0a04', '#ffe2a0'], bg: '#070502', charset: ' .\'`:;|+#' } },
    { id: 'dipolo_vivo', name: 'Cargas que giran', uses: ['arte/figuras', 'arte/curvas'], aka: ['dipolo eléctrico en movimiento', 'cargas en órbita'], params: { config: 'dipolo', sep: 0.9, ratio: 1, lines: 14, particles: 3, turn: 0.05, tilt: 30, view: 'lineas', move: 0.6 }, look: { stops: ['#05070f', '#bcd8ff'], bg: '#03040a', charset: ' .·:-=+*#' } },
    { id: 'espiras_vivas', name: 'Espiras que laten', uses: ['arte/figuras'], aka: ['espiras de Helmholtz', 'corriente que se invierte', 'anti-Helmholtz'], params: { config: 'espira', sep: 0.5, ratio: 1, lines: 8, particles: 4, turn: 0.1, tilt: 14, view: 'flujo', move: 0.5 }, look: { stops: ['#04100a', '#b4f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'imanes', name: 'Imanes que bailan', uses: ['arte/figuras', 'arte/curvas'], aka: ['dipolos magnéticos', 'reconexión de líneas'], params: { config: 'iman', sep: 0.9, ratio: 0.8, lines: 12, particles: 3, turn: 0, tilt: 10, view: 'lineas', move: 0.5 }, look: { stops: ['#0e0a04', '#ffe2a0'], bg: '#070502', charset: ' .\'`:;|+#' } },
  ],
  caps: { loop: false, time: { param: 'move', values: { '0': 'construccion' }, else: 'continuo' }, basic: 'full', checkpoint: true },
  budget: { res: [48, 192, 96], rate: 30, warmup: 0 },
  wrap: 'clamp',
  figure: true,
};
