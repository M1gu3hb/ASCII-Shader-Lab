import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lenia',
  name: 'Lenia',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'mu', label: 'Crecimiento (μ)', type: 'number', min: 0.05, max: 0.45, def: 0.15, step: 0.001, digits: 3 },
    { key: 'sigma', label: 'Tolerancia (σ)', type: 'number', min: 0.004, max: 0.08, def: 0.015, step: 0.0005, digits: 4 },
    { key: 'R', label: 'Radio', type: 'int', min: 6, max: 36, def: 13, unit: 'celdas' },
    { key: 'dt', label: 'Paso de tiempo', type: 'number', min: 0.02, max: 0.5, def: 0.1, step: 0.01 },
    { key: 'rings', label: 'Núcleo', type: 'choice', def: 'uno', options: [
      { id: 'uno', label: 'Un anillo' }, { id: 'dos', label: 'Dos anillos (1, ½)' }, { id: 'tres', label: 'Tres anillos (½, 1, ⅔)' },
    ] },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'manchas', rebuild: true, options: [
      { id: 'manchas', label: 'Manchas' }, { id: 'sopa', label: 'Sopa' }, { id: 'criaturas', label: 'Criaturas' },
    ] },
    { key: 'density', label: 'Densidad', type: 'number', min: 0.1, max: 1, def: 0.5, step: 0.01, rebuild: true },
    { key: 'view', label: 'Vista', type: 'choice', def: 'materia', options: [
      { id: 'materia', label: 'Materia' }, { id: 'crecimiento', label: 'Crecimiento' }, { id: 'contorno', label: 'Contorno' },
    ] },
  ],
  presets: [
    { id: 'orbium', name: 'Orbium', params: { mu: 0.15, sigma: 0.015, R: 18, dt: 0.1, rings: 'uno', seedShape: 'criaturas', density: 0.5, view: 'materia' }, look: { stops: ['#04100f', '#9ff2de'], bg: '#020807', charset: ' .:-=+*#%@' } },
    { id: 'colonia', name: 'Colonia', params: { mu: 0.12, sigma: 0.0145, R: 16, dt: 0.1, rings: 'uno', seedShape: 'manchas', density: 0.35, view: 'materia' }, look: { stops: ['#100a06', '#ffd8a0'], bg: '#080503', charset: ' .·:oO@' } },
    { id: 'anulares', name: 'Organismos anulares', params: { mu: 0.19, sigma: 0.02, R: 24, dt: 0.1, rings: 'tres', seedShape: 'criaturas', density: 0.4, view: 'materia' }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .:;+*#' } },
    { id: 'sopa', name: 'Sopa primordial', params: { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, rings: 'uno', seedShape: 'sopa', density: 0.5, view: 'contorno' }, look: { stops: ['#0e0a04', '#f0e0a0'], bg: '#070502', charset: ' .-~=+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'sembrar', label: 'Sembrar', hint: 'Echa una mancha de materia: a veces nace una criatura.' }, { id: 'borrar', label: 'Borrar', hint: 'Vacía la zona.' }],
  },
  budget: { res: [64, 256, 128], rate: 24, warmup: 48 },
  wrap: 'repeat',
};
