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
    ] },
    { key: 'level', label: 'Nivel', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01 },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.3, step: 0.01 },
    { key: 'expo', label: 'Exposición', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
  ],
  presets: [
    { id: 'lobulos', name: 'Lóbulos 3d', params: { a: '3dz2', b: '3dz2', mix: 0, speed: 0, mode: 'fase', level: 0.45, turn: 0.4, expo: 1.2 }, look: { stops: ['#05070f', '#bfe0ff'], bg: '#03050a', charset: ' .:-=+*#%@' } },
    { id: 'dipolo', name: 'Superposición 1s+2p (dipolo que oscila)', params: { a: '1s', b: '2pz', mix: 0.55, speed: 1, mode: 'densidad', level: 0.12, turn: 0.15, expo: 2 }, look: { stops: ['#0b0612', '#ffd6a0'], bg: '#060309', charset: ' .·:;+*#@' } },
    { id: 'anillos', name: 'Anillos 4f', params: { a: '4fz3', b: '4fz3', mix: 0, speed: 0, mode: 'iso', level: 0.55, turn: -0.3, expo: 1.1 }, look: { stops: ['#041008', '#b6f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'hibrido', name: 'Híbrido sp (2s+2p)', params: { a: '2s', b: '2pz', mix: 0.5, speed: 1, mode: 'iso', level: 0.4, turn: 0.25, expo: 1 }, look: { stops: ['#100606', '#ffc2b0'], bg: '#080303', charset: ' .:;oO@' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { },
  figure: true,
};
