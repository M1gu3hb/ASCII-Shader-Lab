import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'agua',
  name: 'Agua interactiva',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  extends: 'causticas',
  params: [
    { key: 'rain', label: 'Lluvia', type: 'number', min: 0, max: 40, def: 4, step: 0.5, unit: 'gotas/s' },
    { key: 'drop', label: 'Tamaño de gota', type: 'number', min: 0.7, max: 3, def: 1.2, step: 0.05 },
    { key: 'damp', label: 'Amortiguación', type: 'number', min: 0, max: 1, def: 0.25, step: 0.01 },
    { key: 'speed', label: 'Velocidad de onda', type: 'number', min: 0.2, max: 0.7, def: 0.5, step: 0.01, unit: 'celdas/paso' },
    { key: 'paddle', label: 'Oleaje', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'obst', label: 'Obstáculos', type: 'choice', def: 'ninguno', options: [
      { id: 'ninguno', label: 'Ninguno' }, { id: 'rocas', label: 'Rocas' }, { id: 'rendijas', label: 'Muro con dos rendijas' },
    ] },
    { key: 'depth', label: 'Profundidad', type: 'number', min: 0.1, max: 1, def: 0.5, step: 0.01 },
    { key: 'light', label: 'Luz', type: 'number', min: 0, max: 360, def: 135, step: 1, unit: '°' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'suelo', options: [
      { id: 'suelo', label: 'Suelo refractado' }, { id: 'causticas', label: 'Cáusticas' }, { id: 'superficie', label: 'Superficie' },
    ] },
  ],
  presets: [
    { id: 'piscina', name: 'Piscina con cáusticas', params: { rain: 5, drop: 2.2, damp: 0.55, speed: 0.5, paddle: 0, obst: 'ninguno', depth: 0.8, light: 135, view: 'suelo' }, look: { stops: ['#03141c', '#5fd3e6', '#f2fdff'], bg: '#020c11', charset: ' .:-=+*#%' } },
    { id: 'lluvia', name: 'Lluvia sobre el estanque', params: { rain: 14, drop: 1.6, damp: 0.5, speed: 0.4, paddle: 0, obst: 'rocas', depth: 0.4, light: 120, view: 'superficie' }, look: { stops: ['#060a0c', '#b7d3dc'], bg: '#030607', charset: ' .·:;oO' } },
    { id: 'canal', name: 'Ondas en un canal', params: { rain: 0, drop: 1.2, damp: 0.05, speed: 0.6, paddle: 0.55, obst: 'rendijas', depth: 0.6, light: 180, view: 'causticas' }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .-=+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'gota', label: 'Gota', hint: 'Deja caer gotas donde tocas; al arrastrar, un rastro de gotas pequeñas.' }],
  },
  budget: {
    res: [48, 128, 96], rate: 60, warmup: 360,
  },
  wrap: 'clamp',
};
