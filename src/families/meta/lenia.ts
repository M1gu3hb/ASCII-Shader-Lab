import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lenia',
  name: 'Lenia',
  group: 'vida',
  kind: 'simulation',
  // 2: R scales with the grid and the grid is 128 rows at least (A-05); version-1 recipes keep their path
  version: 2,
  aka: ['Lenia', 'Bert Chan', 'autómata celular continuo', 'continuous cellular automaton', 'vida artificial'],
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
    { key: 'renew', label: 'Repoblar', type: 'bool', def: false },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
  ],
  presets: [
    { id: 'orbium', name: 'Nadadores', params: { mu: 0.15, sigma: 0.0145, R: 13, dt: 0.1, rings: 'uno', seedShape: 'criaturas', density: 1, view: 'materia', renew: true, trail: 0.3 }, layer: { scale: 0.8 }, uses: ['arte/organicas'], aka: ['Orbium', 'banco de criaturas'], look: { stops: ['#04100f', '#9ff2de'], bg: '#020807', charset: ' .:-=+*#%@' } },
    { id: 'colonia', name: 'Colonia', params: { mu: 0.12, sigma: 0.0145, R: 16, dt: 0.1, rings: 'uno', seedShape: 'manchas', density: 0.35, view: 'materia' }, uses: ['arte/organicas'], look: { stops: ['#100a06', '#ffd8a0'], bg: '#080503', charset: ' .·:oO@' } },
    { id: 'anulares', name: 'Anillos que nadan', params: { mu: 0.19, sigma: 0.02, R: 12, dt: 0.1, rings: 'tres', seedShape: 'criaturas', density: 1, view: 'materia', renew: true, trail: 1 }, layer: { scale: 0.75 }, uses: ['arte/organicas'], aka: ['Organismos anulares'], look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .:;+*#' } },
    { id: 'sopa', name: 'Sopa primordial', params: { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, rings: 'uno', seedShape: 'sopa', density: 0.5, view: 'contorno', renew: true }, uses: ['fondos/organicas', 'tipo/texturas'], aka: ['gusanos'], look: { stops: ['#0e0a04', '#f0e0a0'], bg: '#070502', charset: ' .-~=+#' } },
    { id: 'enjambre', name: 'Enjambre', params: { mu: 0.12, sigma: 0.012, R: 13, dt: 0.1, rings: 'uno', seedShape: 'manchas', density: 0.6, view: 'materia', renew: true }, uses: ['fondos/vivas', 'fondos/organicas'], aka: ['bacilos', 'bacterias'], look: { stops: ['#06100a', '#c4f7c8'], bg: '#030805', charset: ' .:-=+*#' } },
  ],
  caps: {
    loop: false,
    // creatures collide and die, colonies fill the field and settle: «Repoblar» keeps a run alive
    time: { param: 'renew', values: { true: 'continuo' }, else: 'construccion' },
    basic: 'full', checkpoint: true,
    brushes: [{ id: 'sembrar', label: 'Sembrar', hint: 'Echa una mancha de materia: a veces nace una criatura.' }, { id: 'borrar', label: 'Borrar', hint: 'Vacía la zona.' }],
  },
  budget: { res: [64, 256, 128], rate: 24, warmup: 48, resNote: 'El radio de las criaturas crece con la rejilla (versión 2): más filas, el mismo dibujo con más detalle y más trabajo; por debajo de 128 filas se usan 128.' },
  wrap: 'repeat',
};
