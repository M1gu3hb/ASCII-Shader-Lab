import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'atractor',
  name: 'Atractores extraños',
  group: 'forma',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'type', label: 'Sistema', type: 'choice', def: 'clifford', rebuild: true, options: [
      { id: 'clifford', label: 'Clifford' }, { id: 'dejong', label: 'De Jong' }, { id: 'lorenz', label: 'Lorenz 3D' },
    ] },
    { key: 'a', label: 'a', type: 'number', min: -3, max: 3, def: 1.53, step: 0.01 },
    { key: 'b', label: 'b', type: 'number', min: -3, max: 3, def: 2.91, step: 0.01 },
    { key: 'c', label: 'c', type: 'number', min: -3, max: 3, def: 1.63, step: 0.01 },
    { key: 'd', label: 'd', type: 'number', min: -3, max: 3, def: 0.33, step: 0.01 },
    { key: 'drift', label: 'Deriva', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01 },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'points', label: 'Puntos por paso', type: 'int', min: 2000, max: 60000, def: 6000 },
    { key: 'zoom', label: 'Encuadre', type: 'number', min: 0.5, max: 2, def: 1, step: 0.01 },
    { key: 'gain', label: 'Brillo', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
  ],
  presets: [
    { id: 'cintas', name: 'Cintas caóticas', params: { type: 'clifford', a: 1.53, b: 2.91, c: 1.63, d: 0.33, drift: 0.15, trail: 0.6, points: 10000, zoom: 1, gain: 1 }, look: { stops: ['#05070f', '#f3e3c2'], bg: '#020308', charset: ' .:-=+*#%@' } },
    { id: 'nube', name: 'Nube orbital', params: { type: 'dejong', a: 2.27, b: -2.54, c: 1.11, d: -1.58, drift: 0.1, trail: 0.5, points: 14000, zoom: 1, gain: 1.3 }, look: { stops: ['#0a0612', '#e3b9ff'], bg: '#05030a', charset: ' .·:;oO@' } },
    { id: 'lorenz', name: 'Mariposa de Lorenz', params: { type: 'lorenz', a: 0, b: 0, c: 0, d: 0, drift: 0.1, trail: 0.7, points: 20000, zoom: 1, gain: 1 }, look: { stops: ['#040d10', '#a6f3ff'], bg: '#02070a', charset: ' .,:;+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 30 },
  wrap: 'clamp',
  figure: true,
};
