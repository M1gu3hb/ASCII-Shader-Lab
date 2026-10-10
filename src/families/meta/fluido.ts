import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'fluido',
  name: 'Fluido 2D',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  extends: 'campo_flujo',
  params: [
    { key: 'jets', label: 'Emisores', type: 'int', min: 0, max: 8, def: 4 },
    { key: 'layout', label: 'Chorros', type: 'choice', def: 'libres', options: [
      { id: 'libres', label: 'Libres' }, { id: 'suelo', label: 'Desde el suelo' }, { id: 'arriba', label: 'Desde arriba' },
      { id: 'izquierda', label: 'Corriente desde la izquierda' },
    ] },
    { key: 'force', label: 'Fuerza', type: 'number', min: 0.3, max: 5, def: 2, step: 0.05, unit: 'celdas/paso' },
    { key: 'motion', label: 'Movimiento', type: 'number', min: 0, max: 2, def: 0.4, step: 0.01 },
    { key: 'pulse', label: 'Pulsos', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'vort', label: 'Vorticidad', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
    { key: 'visc', label: 'Viscosidad', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'buoy', label: 'Flotación', type: 'number', min: -1, max: 1, def: 0, step: 0.01 },
    { key: 'obst', label: 'Obstáculos', type: 'int', min: 0, max: 6, def: 0 },
    { key: 'iters', label: 'Iteraciones de presión', type: 'int', min: 4, max: 40, def: 14, advanced: true },
    { key: 'dyeDiss', label: 'Disipación de la tinta', type: 'number', min: 0.02, max: 1.5, def: 0.25, step: 0.01, unit: '/s' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'tinta', options: [
      { id: 'tinta', label: 'Tinta' }, { id: 'velocidad', label: 'Velocidad' }, { id: 'vorticidad', label: 'Vorticidad' },
    ] },
  ],
  presets: [
    { id: 'tinta_agua', name: 'Tinta en agua', params: { jets: 6, layout: 'arriba', force: 1, motion: 0.2, pulse: 0.75, vort: 0, visc: 0.05, buoy: -0.7, obst: 0, iters: 14, dyeDiss: 0.12, view: 'tinta' }, look: { stops: ['#070a12', '#cfe0ff'], bg: '#04060b', charset: ' .·:-=+*#' } },
    { id: 'humo_neon', name: 'Humo de neón', params: { jets: 4, layout: 'suelo', force: 1.4, motion: 0.35, pulse: 0, vort: 0.4, visc: 0, buoy: 0.8, obst: 0, iters: 14, dyeDiss: 0.45, view: 'tinta' }, look: { stops: ['#0c0414', '#ff6ad5', '#ffe9fb'], bg: '#06020a', charset: ' .\'":;!|*' } },
    { id: 'tormenta', name: 'Tormenta de vórtices', params: { jets: 8, layout: 'libres', force: 3.2, motion: 1.1, pulse: 0, vort: 0.95, visc: 0, buoy: 0, obst: 0, iters: 18, dyeDiss: 0.7, view: 'tinta' }, look: { stops: ['#04101a', '#4fd6ff', '#eafcff'], bg: '#020810', charset: ' .:-=+*%@' } },
    { id: 'pilares', name: 'Estela entre pilares', params: { jets: 5, layout: 'izquierda', force: 2.2, motion: 0.15, pulse: 0, vort: 0.3, visc: 0, buoy: 0, obst: 4, iters: 22, dyeDiss: 0.3, view: 'vorticidad' }, look: { stops: ['#0b0a06', '#ffd27a'], bg: '#060503', charset: ' .-~=≈#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'tinta', label: 'Tinta', hint: 'Echa tinta y empuja el fluido en la dirección del trazo.' }],
  },
  budget: {
    res: [48, 192, 128], rate: 30, warmup: 30,
  },
  wrap: 'clamp',
};
