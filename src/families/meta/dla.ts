import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'dla',
  name: 'Agregación (DLA)',
  group: 'vida',
  kind: 'simulation',
  aka: ['DLA', 'agregación limitada por difusión', 'diffusion-limited aggregation', 'Witten–Sander', 'dendritas'],
  version: 2,
  params: [
    { key: 'seed', label: 'Semilla', type: 'choice', def: 'punto', rebuild: true, options: [
      { id: 'punto', label: 'Punto' }, { id: 'suelo', label: 'Línea inferior' }, { id: 'techo', label: 'Línea superior' },
      { id: 'anillo', label: 'Círculo' }, { id: 'varios', label: 'Varios puntos' },
    ] },
    { key: 'stick', label: 'Adherencia', type: 'number', min: 0.03, max: 1, def: 0.9, step: 0.01 },
    { key: 'bias', label: 'Deriva', type: 'number', min: 0, max: 1, def: 0.1, step: 0.01 },
    { key: 'dir', label: 'Crece hacia', type: 'choice', def: 'fuera', options: [
      { id: 'fuera', label: 'Fuera' }, { id: 'abajo', label: 'Abajo' }, { id: 'arriba', label: 'Arriba' },
      { id: 'izquierda', label: 'Izquierda' }, { id: 'derecha', label: 'Derecha' },
    ] },
    { key: 'walkers', label: 'Caminantes', type: 'int', min: 2, max: 400, def: 16 },
    { key: 'width', label: 'Grosor', type: 'number', min: 0, max: 3, def: 0.8, step: 0.05, unit: 'px' },
    { key: 'age', label: 'Brillo por edad', type: 'choice', def: 'nuevas', options: [
      { id: 'nuevas', label: 'Puntas brillantes' }, { id: 'antiguas', label: 'Núcleo brillante' }, { id: 'plano', label: 'Uniforme' },
    ] },
    { key: 'renew', label: 'Renovación', type: 'choice', def: 'no', rebuild: true, options: [
      { id: 'no', label: 'No: crece y se queda' }, { id: 'si', label: 'Sí: se funde y rebrota' },
    ] },
    { key: 'life', label: 'Vida', type: 'number', min: 4, max: 60, def: 18, step: 0.5, unit: 's' },
  ],
  presets: [
    { id: 'cristal', name: 'Cristalización', uses: ['arte/organicas'], params: { seed: 'punto', stick: 1, bias: 0.06, dir: 'fuera', walkers: 12, width: 0.9, age: 'nuevas' }, look: { stops: ['#06101a', '#d8f1ff'], bg: '#03080d', charset: ' .:+*#' } },
    { id: 'coral', name: 'Arrecife', uses: ['arte/organicas'], params: { seed: 'suelo', stick: 0.12, bias: 0, dir: 'arriba', walkers: 10, width: 1.1, age: 'antiguas' }, look: { stops: ['#140a08', '#ffc9a1'], bg: '#0a0504', charset: ' .,:;oO@' } },
    { id: 'raices', name: 'Raíces eléctricas', uses: ['arte/organicas'], params: { seed: 'techo', stick: 1, bias: 0.12, dir: 'abajo', walkers: 8, width: 0.7, age: 'plano' }, look: { stops: ['#05051a', '#c9c6ff'], bg: '#020210', charset: " .'`|/\\#" } },
    { id: 'corona', name: 'Corona', uses: ['arte/organicas'], params: { seed: 'anillo', stick: 0.7, bias: 0.05, dir: 'fuera', walkers: 12, width: 0.8, age: 'nuevas' }, look: { stops: ['#160b02', '#ffe2a8'], bg: '#0b0501', charset: ' .·:*#' } },
    { id: 'colonias', name: 'Colonias', uses: ['arte/organicas', 'tipo/texturas'], params: { seed: 'varios', stick: 0.5, bias: 0.15, dir: 'fuera', walkers: 10, width: 1, age: 'antiguas' }, look: { stops: ['#0c0f05', '#e6f59a'], bg: '#060802', charset: ' .:-=+#' } },
    { id: 'escarcha', name: 'Escarcha viva', uses: ['fondos/organicas', 'arte/organicas', 'tipo/texturas'], aka: ['DLA en baño', 'sublimación', 'nucleación'], params: { seed: 'punto', stick: 1, bias: 0.06, dir: 'fuera', walkers: 12, width: 0.9, age: 'nuevas', renew: 'si', life: 18 }, look: { stops: ['#06101a', '#d8f1ff'], bg: '#03080d', charset: ' .:+*#' } },
    { id: 'arrecife', name: 'Arrecife sin fin', uses: ['fondos/organicas', 'arte/organicas'], aka: ['DLA desde una línea', 'dominio que avanza'], params: { seed: 'suelo', stick: 0.3, bias: 0.04, dir: 'arriba', walkers: 30, width: 1.1, age: 'antiguas', renew: 'si' }, look: { stops: ['#140a08', '#ffc9a1'], bg: '#0a0504', charset: ' .,:;oO@' } },
    { id: 'corona_viva', name: 'Corona que respira', uses: ['arte/organicas'], aka: ['DLA en anillo', 'sublimación'], params: { seed: 'anillo', stick: 0.7, bias: 0.12, dir: 'fuera', walkers: 6, width: 0.8, age: 'nuevas', renew: 'si', life: 12 }, look: { stops: ['#160b02', '#ffe2a8'], bg: '#0b0501', charset: ' .·:*#' } },
  ],
  caps: {
    loop: false, time: { param: 'renew', values: { si: 'continuo' }, else: 'construccion' }, basic: 'full', checkpoint: true,
    brushes: [{ id: 'semilla', label: 'Semilla', hint: 'Añade agregado donde tocas: una rama nueva que sigue creciendo desde ahí, aunque la agregación se hubiera detenido.' }],
  },
  budget: { res: [48, 160, 64], rate: 30, warmup: 90 },
  wrap: 'clamp',
};
