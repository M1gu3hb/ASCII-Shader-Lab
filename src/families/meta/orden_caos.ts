import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'orden_caos',
  name: 'Orden y caos',
  group: 'forma',
  kind: 'simulation',
  version: 1,
  aka: ['transición de fase', 'fusión y cristalización', 'red cristalina', 'phase transition'],
  params: [
    { key: 'lattice', label: 'Red', type: 'choice', def: 'cuadrada', rebuild: true, options: [
      { id: 'cuadrada', label: 'Cuadrada' }, { id: 'hex', label: 'Hexagonal' },
    ] },
    { key: 'spacing', label: 'Separación', type: 'number', min: 0.03, max: 0.09, def: 0.05, step: 0.001, digits: 3, rebuild: true },
    { key: 'front', label: 'Frente', type: 'choice', def: 'barrido', options: [
      { id: 'barrido', label: 'Barrido de ida y vuelta' }, { id: 'radial', label: 'Radial' }, { id: 'onda', label: 'Onda de calor' },
    ] },
    { key: 'period', label: 'Ciclo', type: 'number', min: 4, max: 60, def: 16, step: 0.5, unit: 's' },
    { key: 'angle', label: 'Dirección', type: 'number', min: 0, max: 180, def: 0, step: 1, unit: '°' },
    { key: 'width', label: 'Ancho del frente', type: 'number', min: 0.03, max: 0.6, def: 0.25, step: 0.01 },
    { key: 'turb', label: 'Turbulencia', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'stiff', label: 'Rigidez', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'jitter', label: 'Temblor', type: 'number', min: 0, max: 1, def: 0.2, step: 0.01 },
    { key: 'bonds', label: 'Enlaces', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'glow', label: 'Brillo por velocidad', type: 'number', min: 0, max: 1, def: 0.7, step: 0.01, advanced: true },
  ],
  presets: [
    { id: 'fusion', name: 'Fusión', uses: ['arte/geometricas', 'fondos/geometricas'], aka: ['frente de fusión'],
      params: { lattice: 'cuadrada', spacing: 0.05, front: 'barrido', period: 16, angle: 0, width: 0.25, turb: 0.6, stiff: 0.6, jitter: 0.2, bonds: 0.7, glow: 0.7 },
      look: { stops: ['#05070c', '#1e3456', '#7fb8ff', '#fff2e0'], bg: '#03050a', charset: ' .·:-+=*#%' } },
    { id: 'radial', name: 'Cristalización radial', uses: ['arte/geometricas', 'fondos/geometricas'], aka: ['nucleación', 'crecimiento de cristal'],
      params: { lattice: 'hex', spacing: 0.048, front: 'radial', period: 20, angle: 0, width: 0.18, turb: 0.5, stiff: 0.5, jitter: 0.25, bonds: 0.6, glow: 0.7 },
      look: { stops: ['#070509', '#3a2050', '#c07aff', '#fff0ff'], bg: '#040306', charset: ' .`\'-~+*#%' } },
    { id: 'onda', name: 'Onda de calor', uses: ['arte/geometricas', 'fondos/geometricas'], aka: ['banda de fusión'],
      params: { lattice: 'cuadrada', spacing: 0.045, front: 'onda', period: 9, angle: 30, width: 0.35, turb: 0.85, stiff: 0.75, jitter: 0.15, bonds: 0.55, glow: 0.8 },
      look: { stops: ['#0a0503', '#4a1c0a', '#ff7a2a', '#fff2c0'], bg: '#060302', charset: ' .:-=+*#%@' } },
  ],
  caps: {
    loop: false, time: 'continuo', basic: 'full', checkpoint: true,
    brushes: [{ id: 'calor', label: 'Calor', hint: 'Funde la red donde tocas: las partículas saltan y luego vuelven a su sitio.' }],
  },
  budget: { res: [48, 160, 80], rate: 30, warmup: 30 },
  wrap: 'clamp',
};
