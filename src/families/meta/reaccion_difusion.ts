import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'reaccion_difusion',
  name: 'Reacción–difusión',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'feed', label: 'Alimentación', type: 'number', min: 0.01, max: 0.1, def: 0.0545, step: 0.0005, digits: 4 },
    { key: 'kill', label: 'Eliminación', type: 'number', min: 0.04, max: 0.075, def: 0.062, step: 0.0005, digits: 4 },
    { key: 'diff', label: 'Difusión de B', type: 'number', min: 0.25, max: 0.75, def: 0.5, step: 0.01 },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.6, max: 1.6, def: 1, step: 0.01 },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'manchas', rebuild: true, options: [
      { id: 'manchas', label: 'Manchas' }, { id: 'centro', label: 'Centro' }, { id: 'anillo', label: 'Anillo' },
      { id: 'lineas', label: 'Líneas' }, { id: 'ruido', label: 'Ruido' },
    ] },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'toro', options: [{ id: 'toro', label: 'Continuos' }, { id: 'cerrado', label: 'Cerrados' }] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'concentracion', options: [
      { id: 'concentracion', label: 'Concentración' }, { id: 'relieve', label: 'Relieve' }, { id: 'contorno', label: 'Contorno' },
    ] },
  ],
  presets: [
    { id: 'coral', name: 'Coral químico', params: { feed: 0.0545, kill: 0.062, diff: 0.5, scale: 1, seedShape: 'centro', view: 'concentracion' }, look: { stops: ['#0c1416', '#e9d8b4'], bg: '#070b0c', charset: ' .:-=+*#%@' } },
    { id: 'mitosis', name: 'Mitosis', params: { feed: 0.0367, kill: 0.0649, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'concentracion' }, look: { stops: ['#100a14', '#f0b6d4'], bg: '#08050a', charset: ' .·:oO@' } },
    { id: 'laberinto', name: 'Laberinto', params: { feed: 0.029, kill: 0.057, diff: 0.5, scale: 1, seedShape: 'ruido', view: 'relieve' }, look: { stops: ['#0b0f08', '#d9f0a2'], bg: '#060805', charset: ' .-~=≈#' } },
    { id: 'caos', name: 'Caos que respira', params: { feed: 0.018, kill: 0.051, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'contorno' }, look: { stops: ['#04101c', '#7fd0ff'], bg: '#020810', charset: ' .:+*#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'sembrar', label: 'Sembrar', hint: 'Añade sustancia B donde tocas.' }, { id: 'borrar', label: 'Borrar', hint: 'Devuelve la zona al estado vacío.' }],
  },
  budget: { res: [64, 256, 96], rate: 600, warmup: 1200 },
  wrap: 'repeat',
};
