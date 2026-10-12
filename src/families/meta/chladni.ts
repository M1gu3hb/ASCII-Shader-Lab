import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'chladni',
  name: 'Chladni y cimática',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  aka: ['Figuras de Chladni', 'Cimática', 'Modos de vibración', 'Ondas estacionarias'],
  params: [
    { key: 'plate', label: 'Forma de placa', type: 'choice', def: 'cuadrada', options: [
      { id: 'cuadrada', label: 'Cuadrada' }, { id: 'circular', label: 'Circular' }, { id: 'lienzo', label: 'Todo el lienzo' },
    ] },
    { key: 'n', label: 'Modo n', type: 'int', min: 0, max: 10, def: 3 },
    { key: 'm', label: 'Modo m', type: 'int', min: 1, max: 10, def: 5 },
    { key: 'mix', label: 'Mezcla', type: 'number', min: -1, max: 1, def: -1, step: 0.01 },
    { key: 'seq', label: 'Secuencia', type: 'choice', def: 'fijo', options: [
      { id: 'fijo', label: 'Modo fijo' }, { id: 'lento', label: 'Ciclo lento' }, { id: 'rapido', label: 'Ciclo rápido' },
    ] },
    { key: 'count', label: 'Partículas', type: 'int', min: 2000, max: 40000, def: 5000, rebuild: true },
    { key: 'agit', label: 'Agitación', type: 'number', min: 0.1, max: 2.5, def: 1, step: 0.01 },
    { key: 'persist', label: 'Persistencia', type: 'number', min: 0, max: 0.97, def: 0.85, step: 0.01 },
    { key: 'view', label: 'Vista', type: 'choice', def: 'arena', options: [
      { id: 'arena', label: 'Arena' }, { id: 'campo', label: 'Líneas nodales' }, { id: 'ambos', label: 'Arena y líneas' },
    ] },
  ],
  presets: [
    {
      id: 'arena', name: 'Arena en todo el lienzo', aka: ['Placa rectangular', 'Figuras de Chladni'], uses: ['fondos/geometricas', 'tipo/texturas'],
      params: { plate: 'lienzo', n: 3, m: 5, mix: -1, seq: 'lento', count: 24000, agit: 1.1, persist: 0.85, view: 'arena' },
      look: { stops: ['#0c0a07', '#f2e2c0'], bg: '#060504', charset: ' .:-=+*#%@' },
    },
    {
      id: 'placa', name: 'Placa resonante', aka: ['Placa cuadrada', 'Modo fijo'], uses: ['arte/geometricas'],
      params: { plate: 'cuadrada', n: 3, m: 5, mix: -1, seq: 'fijo', count: 20000, agit: 1, persist: 0.85, view: 'arena' },
      look: { stops: ['#0c0a07', '#f2e2c0'], bg: '#060504', charset: ' .:-=+*#%@' },
    },
    {
      id: 'flor', name: 'Flor nodal', aka: ['Placa circular', 'Funciones de Bessel'], uses: ['arte/geometricas'],
      params: { plate: 'circular', n: 4, m: 3, mix: -1, seq: 'fijo', count: 20000, agit: 1.1, persist: 0.88, view: 'ambos' },
      look: { stops: ['#0a0612', '#e8c8ff'], bg: '#05030a', charset: ' .·:+*#' },
    },
    {
      id: 'mandala', name: 'Mandala de arena', aka: ['Placa circular con secuencia de modos'], uses: ['arte/geometricas'],
      params: { plate: 'circular', n: 4, m: 3, mix: -1, seq: 'lento', count: 24000, agit: 1.2, persist: 0.85, view: 'ambos' },
      look: { stops: ['#100806', '#ffd6a8'], bg: '#080403', charset: ' .·:+*#@' },
    },
    {
      id: 'musical', name: 'Arena musical', aka: ['Secuencia rápida de modos'], uses: ['arte/geometricas'],
      params: { plate: 'cuadrada', n: 2, m: 7, mix: -1, seq: 'rapido', count: 24000, agit: 1.6, persist: 0.75, view: 'arena' },
      look: { stops: ['#04100f', '#bff7ec'], bg: '#020807', charset: ' .`:;+=#' },
    },
  ],
  caps: {
    loop: false, time: { param: 'seq', values: { fijo: 'construccion' }, else: 'continuo' }, basic: 'full', checkpoint: true,
    brushes: [{ id: 'golpe', label: 'Golpe', hint: 'Esparce la arena donde tocas.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 60 },
  wrap: 'clamp',
  figure: true,
};
