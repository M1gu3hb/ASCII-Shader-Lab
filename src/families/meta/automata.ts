import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'automata',
  name: 'Autómatas celulares',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'rule', label: 'Regla', type: 'choice', def: 'conway', options: [
      { id: 'conway', label: 'Vida de Conway (B3/S23)' }, { id: 'highlife', label: 'HighLife (B36/S23)' },
      { id: 'diaynoche', label: 'Día y noche (B3678/S34678)' }, { id: 'cerebro', label: 'Cerebro de Brian (B2/S/3)' },
      { id: 'starwars', label: 'Star Wars (B2/S345/4)' }, { id: 'coral', label: 'Coral (B3/S45678)' },
      { id: 'laberinto', label: 'Laberinto (B3/S12345)' }, { id: 'propia', label: 'Regla propia' },
    ] },
    { key: 'custom', label: 'Regla propia', type: 'text', def: 'B3/S23', max: 20, allowed: 'BSCbsc0123456789/', advanced: true },
    { key: 'neigh', label: 'Vecindad', type: 'choice', def: 'moore', options: [{ id: 'moore', label: 'Ocho vecinas' }, { id: 'vonneumann', label: 'Cuatro vecinas' }] },
    { key: 'density', label: 'Densidad inicial', type: 'number', min: 0.02, max: 0.9, def: 0.3, step: 0.01, rebuild: true },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'aleatoria', rebuild: true, options: [
      { id: 'aleatoria', label: 'Aleatoria' }, { id: 'centro', label: 'Centro' }, { id: 'simetrica', label: 'Simétrica' },
    ] },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'toro', options: [{ id: 'toro', label: 'Continuos' }, { id: 'cerrado', label: 'Cerrados' }] },
    { key: 'speed', label: 'Velocidad', type: 'int', min: 1, max: 30, def: 10, unit: 'gen/s' },
    { key: 'trail', label: 'Estela', type: 'choice', def: 'corta', options: [{ id: 'ninguna', label: 'Ninguna' }, { id: 'corta', label: 'Corta' }, { id: 'larga', label: 'Larga' }] },
  ],
  presets: [
    { id: 'vida', name: 'Vida clásica', params: { rule: 'conway', neigh: 'moore', density: 0.3, seedShape: 'aleatoria', edges: 'toro', speed: 10, trail: 'corta' }, look: { stops: ['#06100a', '#b8f5c0'], bg: '#030805', charset: ' .:+#@' } },
    { id: 'cerebro', name: 'Cerebro', params: { rule: 'cerebro', neigh: 'moore', density: 0.2, seedShape: 'aleatoria', edges: 'toro', speed: 12, trail: 'corta' }, look: { stops: ['#0a0614', '#d6b8ff'], bg: '#05030a', charset: ' .-+*#' } },
    { id: 'diaynoche', name: 'Día y noche', params: { rule: 'diaynoche', neigh: 'moore', density: 0.5, seedShape: 'aleatoria', edges: 'cerrado', speed: 10, trail: 'corta' }, look: { stops: ['#05080f', '#cfe0ff'], bg: '#020408', charset: ' .:=#' } },
    { id: 'pasadizos', name: 'Pasadizos', params: { rule: 'laberinto', neigh: 'moore', density: 0.4, seedShape: 'centro', edges: 'cerrado', speed: 12, trail: 'ninguna' }, look: { stops: ['#0c0c06', '#f0f0b0'], bg: '#060603', charset: ' .|+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'dibujar', label: 'Dibujar', hint: 'Enciende celdas al azar donde tocas.' }, { id: 'borrar', label: 'Borrar', hint: 'Apaga las celdas de la zona.' }],
  },
  budget: { res: [32, 192, 64], rate: 30, warmup: 90 },
  wrap: 'repeat',
};
