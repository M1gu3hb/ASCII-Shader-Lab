import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'membrana',
  name: 'Membrana iridiscente',
  group: 'materia',
  kind: 'analytic',
  version: 1,
  color: true,
  aka: ['película delgada', 'interferencia de película delgada', 'thin-film interference', 'pompa de jabón', 'iridiscencia', 'colores de Newton'],
  params: [
    { key: 'form', label: 'Forma', type: 'choice', def: 'lamina', options: [
      { id: 'lamina', label: 'Lámina' }, { id: 'burbuja', label: 'Burbuja' }, { id: 'mancha', label: 'Mancha de aceite' },
    ] },
    { key: 'thick', label: 'Espesor', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'flow', label: 'Remolinos', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'waves', label: 'Ondulación', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01 },
    { key: 'speed', label: 'Velocidad', type: 'number', min: 0.05, max: 1, def: 0.3, step: 0.01 },
    { key: 'shine', label: 'Brillo', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.5, max: 2.5, def: 1, step: 0.01 },
    { key: 'tint', label: 'Color de', type: 'choice', def: 'pelicula', options: [
      { id: 'pelicula', label: 'La película' }, { id: 'paleta', label: 'La paleta' },
    ] },
  ],
  presets: [
    { id: 'jabon', name: 'Lámina de jabón', uses: ['fondos/materia', 'fondos/color'], aka: ['película de jabón que drena'],
      params: { form: 'lamina', thick: 0.55, flow: 0.75, waves: 0.3, speed: 0.28, shine: 0.45, scale: 1, tint: 'pelicula' },
      look: { stops: ['#05060a', '#3a3f58', '#c9c3e8', '#fbf7ff'], bg: '#030306', charset: ' .,:;=+*#%@', colorMode: 'source', vivid: 0.6 } },
    { id: 'pompa', name: 'Pompa flotante', uses: ['arte/figuras'], aka: ['burbuja de jabón'],
      params: { form: 'burbuja', thick: 0.62, flow: 0.85, waves: 0.25, speed: 0.3, shine: 0.8, scale: 1, tint: 'pelicula' },
      look: { stops: ['#04050a', '#2c3550', '#d8e2ff', '#ffffff'], bg: '#020309', charset: ' .·:;+=*#%@', colorMode: 'source', vivid: 0.55 } },
    { id: 'aceite', name: 'Aceite en el asfalto', uses: ['fondos/materia'], aka: ['mancha de aceite sobre agua'],
      params: { form: 'mancha', thick: 0.32, flow: 0.7, waves: 0.55, speed: 0.22, shine: 0.35, scale: 1.1, tint: 'pelicula' },
      look: { stops: ['#040506', '#1d2328', '#8d96a0', '#eef2f5'], bg: '#020304', charset: ' .`:-~=+*#%', colorMode: 'source', vivid: 0.65 } },
    { id: 'pliegues', name: 'Pliegues de seda', uses: ['fondos/materia', 'fondos/color'],
      params: { form: 'lamina', thick: 0.3, flow: 0.35, waves: 1, speed: 0.2, shine: 0.75, scale: 0.75, tint: 'pelicula' },
      look: { stops: ['#060508', '#40384a', '#e6dcef', '#ffffff'], bg: '#040305', charset: ' .-:=+*#%@', colorMode: 'source', vivid: 0.5 } },
    { id: 'nacar', name: 'Nácar en tus colores', uses: ['fondos/color'], aka: ['interferencia sobre la paleta'],
      params: { form: 'lamina', thick: 0.95, flow: 0.9, waves: 0.45, speed: 0.24, shine: 0.4, scale: 1.5, tint: 'paleta' },
      look: { stops: ['#0b0716', '#5b2a86', '#e2489a', '#ffb35c', '#7fe0d6'], bg: '#06040c', charset: ' .:-=+*#%@', colorMode: 'source', vivid: 0.5 } },
  ],
  caps: { loop: true, time: 'continuo', basic: 'full', checkpoint: false },
  budget: {},
};
