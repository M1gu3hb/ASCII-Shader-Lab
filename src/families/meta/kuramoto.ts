import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'kuramoto',
  name: 'Osciladores acoplados',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'K', label: 'Acoplamiento', type: 'number', min: 0, max: 6, def: 3, step: 0.05 },
    { key: 'spread', label: 'Diversidad', type: 'number', min: 0, max: 0.5, def: 0.02, step: 0.005, digits: 3, unit: 'Hz' },
    { key: 'freq', label: 'Frecuencia media', type: 'number', min: 0, max: 2, def: 0.45, step: 0.01, unit: 'Hz' },
    { key: 'neigh', label: 'Vecindad', type: 'choice', def: 'r2', options: [
      { id: 'n4', label: '4 vecinos' }, { id: 'n8', label: '8 vecinos' }, { id: 'r2', label: 'Radio 2' }, { id: 'r3', label: 'Radio 3' },
    ] },
    { key: 'lag', label: 'Desfase', type: 'number', min: 0, max: 1.5, def: 0.8, step: 0.01, unit: 'rad' },
    { key: 'noise', label: 'Ruido', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'init', label: 'Fase inicial', type: 'choice', def: 'espirales', rebuild: true, options: [
      { id: 'aleatoria', label: 'Aleatoria' }, { id: 'ondas', label: 'Ondas' }, { id: 'espirales', label: 'Espirales' },
    ] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'fase', options: [
      { id: 'fase', label: 'Fase' }, { id: 'sincronia', label: 'Sincronía' }, { id: 'vortices', label: 'Vórtices' }, { id: 'destellos', label: 'Destellos' },
    ] },
  ],
  presets: [
    { id: 'remolinos', name: 'Remolinos de fase', params: { K: 3, spread: 0.02, freq: 0.45, neigh: 'r2', lag: 0.8, noise: 0, init: 'espirales', view: 'fase' }, look: { stops: ['#060a14', '#cfe2ff'], bg: '#03050a', charset: ' .:-=+*#%@' } },
    { id: 'sincronizado', name: 'Campo sincronizado', params: { K: 3, spread: 0.02, freq: 0.4, neigh: 'r2', lag: 0.3, noise: 0, init: 'ondas', view: 'fase' }, look: { stops: ['#0a0c06', '#e8f0b0'], bg: '#050603', charset: ' .-~=≈#' } },
    { id: 'destellos', name: 'Destellos', params: { K: 4, spread: 0.06, freq: 0.6, neigh: 'r3', lag: 0.5, noise: 0, init: 'aleatoria', view: 'destellos' }, look: { stops: ['#0c0804', '#ffd890'], bg: '#060402', charset: ' .·:*#@' } },
    { id: 'turbulencia', name: 'Turbulencia', params: { K: 4, spread: 0.05, freq: 0.5, neigh: 'r3', lag: 1, noise: 0, init: 'aleatoria', view: 'vortices' }, look: { stops: ['#100608', '#ffb0c0'], bg: '#080304', charset: ' .:o@' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'empujar', label: 'Empujar fase', hint: 'Adelanta la fase donde tocas: lanza una onda o abre un remolino.' }],
  },
  budget: { res: [48, 192, 96], rate: 20, warmup: 200 },
  wrap: 'repeat',
};
