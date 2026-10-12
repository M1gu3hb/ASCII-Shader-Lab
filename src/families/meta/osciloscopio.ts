import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'osciloscopio',
  name: 'Osciloscopio que se degrada',
  group: 'forma',
  kind: 'analytic',
  version: 1,
  aka: ['osciloscopio', 'forma de onda', 'bit crush', 'recorte', 'modulación de frecuencia', 'traza de fósforo'],
  params: [
    { key: 'harmonics', label: 'Armónicos', type: 'int', min: 1, max: 6, def: 3 },
    { key: 'degrade', label: 'Degradación', type: 'number', min: 0, max: 1, def: 0.65, step: 0.01 },
    { key: 'cycle', label: 'Ciclo', type: 'number', min: 3, max: 20, def: 8, step: 0.5, unit: 's' },
    { key: 'noise', label: 'Ruido', type: 'number', min: 0, max: 1, def: 0.2, step: 0.01 },
    { key: 'grid', label: 'Retícula', type: 'choice', def: 'reticula', options: [
      { id: 'no', label: 'Sin retícula' }, { id: 'reticula', label: 'Retícula' }, { id: 'ejes', label: 'Sólo ejes' },
    ] },
    { key: 'persist', label: 'Persistencia', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'gain', label: 'Amplitud', type: 'number', min: 0.2, max: 1.2, def: 0.75, step: 0.01 },
    { key: 'freq', label: 'Frecuencia', type: 'number', min: 0.5, max: 6, def: 1.6, step: 0.05 },
  ],
  presets: [
    { id: 'limpia', name: 'Señal limpia', aka: ['seno con deriva'], uses: ['terminal/consola', 'arte/curvas'],
      params: { harmonics: 1, degrade: 0.1, cycle: 12, noise: 0.05, grid: 'reticula', persist: 0.6, gain: 0.7, freq: 1.2 },
      look: { stops: ['#020604', '#0b3a1c', '#2fd36a', '#c8ffd9'], bg: '#010402', charset: ' ._~∿≈≋≡' } },
    { id: 'interferencia', name: 'Interferencia', aka: ['ruido y reducción de bits'], uses: ['terminal/consola', 'arte/curvas'],
      params: { harmonics: 4, degrade: 0.8, cycle: 6, noise: 0.55, grid: 'ejes', persist: 0.35, gain: 0.8, freq: 2.2 },
      look: { stops: ['#05060a', '#16304a', '#38a3d9', '#e0f4ff'], bg: '#03040a', charset: ' .:-=+*#%@' } },
    { id: 'grito', name: 'Grito', aka: ['distorsión extrema'], uses: ['arte/curvas'],
      params: { harmonics: 3, degrade: 1, cycle: 7, noise: 0.3, grid: 'no', persist: 0.85, gain: 1.15, freq: 2.8 },
      look: { stops: ['#070203', '#4a0b12', '#ff3b3b', '#ffd2c2', '#ffffff'], bg: '#050102', charset: ' .:-=+*#%@' } },
    { id: 'fosforo', name: 'Fósforo lento', aka: ['persistencia de fósforo'], uses: ['terminal/consola'],
      params: { harmonics: 2, degrade: 0.45, cycle: 16, noise: 0.15, grid: 'reticula', persist: 1, gain: 0.6, freq: 0.8 },
      look: { stops: ['#060402', '#3a2306', '#ffb02e', '#fff0c8'], bg: '#040301', charset: ' .:-=+*#%@' } },
  ],
  caps: { loop: true, time: 'continuo', basic: 'full', checkpoint: false },
  budget: {},
};
