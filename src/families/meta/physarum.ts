import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'physarum',
  name: 'Physarum',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'sensorAngle', label: 'Ángulo de los sensores', type: 'number', min: 5, max: 90, def: 22.5, step: 0.5, unit: '°' },
    { key: 'sensorDist', label: 'Alcance', type: 'number', min: 1, max: 20, def: 5, step: 0.5, unit: 'celdas' },
    { key: 'turn', label: 'Giro', type: 'number', min: 5, max: 90, def: 45, step: 0.5, unit: '°' },
    { key: 'stepSize', label: 'Paso', type: 'number', min: 0.3, max: 3, def: 1, step: 0.05, unit: 'celdas' },
    { key: 'density', label: 'Población', type: 'number', min: 2, max: 50, def: 6, step: 0.5, unit: '%', rebuild: true },
    { key: 'deposit', label: 'Depósito', type: 'number', min: 0.2, max: 4, def: 1, step: 0.05 },
    { key: 'decay', label: 'Evaporación', type: 'number', min: 0.01, max: 0.4, def: 0.1, step: 0.005, digits: 3 },
    { key: 'diffuse', label: 'Difusión', type: 'number', min: 0, max: 1, def: 1, step: 0.01 },
    { key: 'layout', label: 'Inicio', type: 'choice', def: 'disco', rebuild: true, options: [
      { id: 'disco', label: 'Disco' }, { id: 'centro', label: 'Centro' }, { id: 'anillo', label: 'Anillo' }, { id: 'aleatorio', label: 'Aleatorio' },
    ] },
  ],
  presets: [
    { id: 'venacion', name: 'Venación', params: { sensorAngle: 22.5, sensorDist: 5, turn: 45, stepSize: 1, density: 6, deposit: 1, decay: 0.1, diffuse: 1, layout: 'disco' }, look: { stops: ['#0b0e06', '#e8f2a0'], bg: '#060804', charset: ' .:-=+*#%@' } },
    { id: 'membrana', name: 'Membrana', params: { sensorAngle: 10, sensorDist: 4, turn: 60, stepSize: 1, density: 20, deposit: 1, decay: 0.1, diffuse: 1, layout: 'aleatorio' }, look: { stops: ['#120608', '#ffb8a8'], bg: '#090304', charset: ' .·:oO@' } },
    { id: 'red', name: 'Red eléctrica', params: { sensorAngle: 20, sensorDist: 12, turn: 40, stepSize: 2, density: 4, deposit: 1.5, decay: 0.04, diffuse: 0.4, layout: 'aleatorio' }, look: { stops: ['#04081a', '#9fd8ff'], bg: '#020410', charset: ' .-:=+#' } },
    { id: 'meandros', name: 'Meandros', params: { sensorAngle: 45, sensorDist: 3, turn: 45, stepSize: 0.7, density: 5, deposit: 1, decay: 0.1, diffuse: 1, layout: 'aleatorio' }, look: { stops: ['#100a14', '#e2c4ff'], bg: '#08050a', charset: ' .:;+*#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [
      { id: 'atraer', label: 'Atraer', hint: 'Deja rastro donde tocas: los agentes acuden y la red se desvía hacia ahí.' },
      { id: 'dispersar', label: 'Dispersar', hint: 'Borra el rastro y empuja a los agentes fuera de la zona.' },
    ],
  },
  budget: { res: [48, 192, 96], rate: 50, warmup: 250 },
  wrap: 'repeat',
};
