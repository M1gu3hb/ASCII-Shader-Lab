import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'laceria',
  name: 'Lacería',
  group: 'forma',
  kind: 'analytic',
  version: 1,
  aka: ['estrellas entrelazadas', 'rosetas', 'girih', 'polígono estrellado', 'entrelazado alterno', 'tracería'],
  params: [
    { key: 'sym', label: 'Simetría', type: 'choice', def: '8', options: [
      { id: '6', label: '6 puntas' }, { id: '8', label: '8 puntas' }, { id: '10', label: '10 puntas' }, { id: '12', label: '12 puntas' },
    ] },
    { key: 'grid', label: 'Rejilla', type: 'choice', def: 'cuadrada', options: [
      { id: 'cuadrada', label: 'Cuadrada' }, { id: 'hex', label: 'Hexagonal' }, { id: 'roseton', label: 'Rosetón (una sola)' },
    ] },
    { key: 'depth', label: 'Profundidad', type: 'int', min: 2, max: 5, def: 3 },
    { key: 'layers', label: 'Capas', type: 'int', min: 1, max: 3, def: 2 },
    { key: 'width', label: 'Trazo', type: 'number', min: 0.8, max: 4, def: 1.6, step: 0.05 },
    { key: 'spin', label: 'Giro', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
    { key: 'reveal', label: 'Revelado', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'cycle', label: 'Tiempo', type: 'choice', def: 'bucle', options: [
      { id: 'bucle', label: 'Bucle de 32 s' }, { id: 'continuo', label: 'Continuo' },
    ] },
  ],
  presets: [
    { id: 'nazari', name: 'Azulejo de ocho', uses: ['arte/geometricas', 'fondos/geometricas'], period: 32, aka: ['estrella de ocho puntas', 'dos cuadrados entrelazados'],
      params: { sym: '8', grid: 'cuadrada', depth: 2, layers: 2, width: 1.6, spin: 0.35, reveal: 0.5, cycle: 'bucle' },
      look: { stops: ['#0a0d12', '#1d4e6e', '#5fb7c9', '#f2ead2'], bg: '#06080b', charset: ' .:-=+*#%@' } },
    { id: 'roseton', name: 'Rosetón', uses: ['arte/geometricas'], period: 32, aka: ['rosa de doce'],
      params: { sym: '12', grid: 'roseton', depth: 4, layers: 2, width: 1.7, spin: 0.6, reveal: 0.6, cycle: 'bucle' },
      look: { stops: ['#0c0806', '#5a2a12', '#d98a3a', '#ffeccc'], bg: '#070403', charset: ' .·:;+=*#@' } },
    { id: 'traceria', name: 'Tracería', uses: ['fondos/geometricas', 'arte/geometricas'], aka: ['hexagrama entrelazado'],
      params: { sym: '6', grid: 'hex', depth: 2, layers: 2, width: 2, spin: 0.3, reveal: 0.7, cycle: 'continuo' },
      look: { stops: ['#080a06', '#2f4a1c', '#a7c96a', '#f4f8e6'], bg: '#040502', charset: ' .`:-=+*#%' } },
    { id: 'diez', name: 'Estrella de diez', uses: ['arte/geometricas'], aka: ['decágono estrellado'],
      params: { sym: '10', grid: 'roseton', depth: 3, layers: 2, width: 1.8, spin: 0.45, reveal: 0.4, cycle: 'continuo' },
      look: { stops: ['#07060c', '#2f2370', '#9a8bff', '#f1eeff'], bg: '#040308', charset: ' .:-=+*#%@' } },
  ],
  caps: { loop: true, time: { param: 'cycle', values: { bucle: 'bucle' }, else: 'continuo' }, basic: 'full', checkpoint: false },
  budget: {},
};
