import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'wfc',
  name: 'Arquitectura por restricciones',
  group: 'forma',
  kind: 'geometry',
  version: 1,
  params: [
    { key: 'set', label: 'Juego de piezas', type: 'choice', def: 'circuitos', rebuild: true, options: [{ id: 'circuitos', label: 'Circuitos' }, { id: 'muros', label: 'Muros' }, { id: 'acueducto', label: 'Acueducto' }] },
    { key: 'rows', label: 'Piezas en vertical', type: 'int', min: 8, max: 28, def: 12, rebuild: true },
    { key: 'density', label: 'Densidad', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'pace', label: 'Ritmo', type: 'number', min: 10, max: 600, def: 60, step: 1, unit: 'piezas/s' },
    { key: 'hold', label: 'Espera', type: 'number', min: 1, max: 30, def: 6, step: 0.5, unit: 's' },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'vacios', rebuild: true, options: [{ id: 'vacios', label: 'Vacíos' }, { id: 'libres', label: 'Libres' }] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'piezas', options: [
      { id: 'piezas', label: 'Piezas' }, { id: 'lineas', label: 'Sólo líneas' }, { id: 'entropia', label: 'Mapa de entropía' },
    ] },
  ],
  presets: [
    { id: 'placa', name: 'Placa base', params: { set: 'circuitos', rows: 12, density: 0.55, pace: 60, hold: 6, edges: 'vacios', view: 'piezas' }, look: { stops: ['#03110a', '#9dffc4'], bg: '#010804', charset: ' .:-=+*#' } },
    { id: 'plano', name: 'Plano de planta', params: { set: 'muros', rows: 12, density: 0.45, pace: 45, hold: 8, edges: 'vacios', view: 'piezas' }, look: { stops: ['#0c0a08', '#f1e6d0'], bg: '#060504', charset: ' .:-=#' } },
    { id: 'acueducto', name: 'Acueducto', params: { set: 'acueducto', rows: 12, density: 0.75, pace: 45, hold: 8, edges: 'vacios', view: 'piezas' }, look: { stops: ['#0d0905', '#ffd9a0'], bg: '#070402', charset: ' .:-=+#' } },
    { id: 'laberinto', name: 'Ciudad densa', params: { set: 'muros', rows: 22, density: 0.95, pace: 180, hold: 5, edges: 'libres', view: 'lineas' }, look: { stops: ['#0b0b12', '#c8d2ff'], bg: '#050509', charset: ' .-=+#' } },
    { id: 'onda', name: 'La onda que colapsa', params: { set: 'circuitos', rows: 14, density: 0.7, pace: 30, hold: 4, edges: 'libres', view: 'entropia' }, look: { stops: ['#120612', '#ffc2f0'], bg: '#090309', charset: ' .·:+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 30 },
  wrap: 'clamp',
};
