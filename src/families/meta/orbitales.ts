import type { FamilyMeta } from '../types';

const STATES = [
  { id: '1s', label: '1s' }, { id: '2s', label: '2s' }, { id: '2pz', label: '2pz' }, { id: '2px', label: '2px' },
  { id: '3s', label: '3s' }, { id: '3pz', label: '3pz' }, { id: '3dz2', label: '3dz²' }, { id: '3dxy', label: '3dxy' },
  { id: '3dxz', label: '3dxz' }, { id: '4s', label: '4s' }, { id: '4pz', label: '4pz' }, { id: '4dz2', label: '4dz²' },
  { id: '4fz3', label: '4fz³' }, { id: '4fxyz', label: '4fxyz' }, { id: '4fx3', label: '4fx(x²−3y²)' },
];

export const META: FamilyMeta = {
  id: 'orbitales',
  name: 'Orbitales y superposiciones',
  aka: ['orbital', 'orbitales atómicos', 'átomo de hidrógeno', 'función de onda', 'superposición cuántica'],
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  params: [
    { key: 'a', label: 'Estado A', type: 'choice', def: '2px', options: STATES },
    { key: 'b', label: 'Estado B', type: 'choice', def: '3dz2', options: STATES },
    { key: 'mix', label: 'Mezcla', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'speed', label: 'Velocidad de fase', type: 'number', min: 0, max: 4, def: 1, step: 0.01 },
    { key: 'mode', label: 'Modo', type: 'choice', def: 'iso', options: [
      { id: 'densidad', label: 'Densidad' }, { id: 'iso', label: 'Isosuperficie' }, { id: 'fase', label: 'Fase' },
      { id: 'capas', label: 'Capas' },
    ] },
    { key: 'level', label: 'Nivel', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01 },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.3, step: 0.01 },
    { key: 'expo', label: 'Exposición', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
  ],
  presets: [
    { id: 'lobulos', name: 'Lóbulos que laten', aka: ['Lóbulos 3d', 'orbital 3dz²', 'superposición 3d + 4f'], uses: ['arte/figuras', 'terminal/figuras'], period: 20,
      params: { a: '3dz2', b: '4fz3', mix: 0.25, speed: 3.231365, mode: 'fase', level: 0.45, turn: 0, expo: 1.2 },
      look: { stops: ['#05070f', '#4a6a8a', '#bfe0ff'], bg: '#03050a', charset: ' .:-=+*#%@' } },
    { id: 'dipolo', name: 'Nube pendular', aka: ['Superposición 1s+2p (dipolo que oscila)', 'dipolo', 'Lyman-alfa', 'superposición 1s + 2p'], uses: ['arte/figuras', 'terminal/figuras'], period: 4,
      params: { a: '1s', b: '2pz', mix: 0.55, speed: 1.047198, mode: 'densidad', level: 0.12, turn: 0, expo: 2 },
      look: { stops: ['#0b0612', '#8a5a3a', '#ffd6a0'], bg: '#060309', charset: ' .·:;+*#@' } },
    { id: 'anillos', name: 'Anillos de cristal', aka: ['Anillos 4f', 'orbital 4fz³', 'superposición 4f + 3p'], uses: ['arte/figuras'], period: 24,
      params: { a: '4fz3', b: '3pz', mix: 0.3, speed: 2.692804, mode: 'capas', level: 0.5, turn: 0, expo: 1.1 },
      look: { stops: ['#041008', '#3a7a4a', '#b6f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'hibrido', name: 'Faro', aka: ['Híbrido sp (2s+2p)', 'orbital híbrido sp'], uses: ['arte/figuras', 'terminal/figuras'],
      params: { a: '2s', b: '2px', mix: 0.5, speed: 1, mode: 'iso', level: 0.4, turn: 0.25, expo: 1 },
      look: { stops: ['#100606', '#8a4a3a', '#ffc2b0'], bg: '#080303', charset: ' .:;oO@' } },
    { id: 'estrella', name: 'Estrella de cristal', aka: ['orbital 4fxyz', 'superposición 4f + 3d'], uses: ['arte/figuras'],
      params: { a: '4fxyz', b: '3dz2', mix: 0.2, speed: 0.7, mode: 'capas', level: 0.45, turn: 0.5, expo: 1.2 },
      look: { stops: ['#0c0414', '#7a3a6a', '#ffb8e8'], bg: '#05020a', charset: ' .:-=+*#%@' } },
  ],
  // with the camera still it loops with the beat of its two states (or holds, when they share n); turning,
  // the camera and the beat never meet again
  caps: { loop: true, time: { param: 'turn', values: { '0': 'bucle' }, else: 'continuo' }, basic: 'full', checkpoint: false },
  budget: { },
  figure: true,
};
