import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'hipercubo',
  name: 'Hipercubo',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  aka: ['teseracto', 'tesseract', '16 celdas', '24 celdas', 'politopo 4D', 'proyección 4D'],
  params: [
    { key: 'poly', label: 'Figura', type: 'choice', def: 'teseracto', options: [
      { id: 'teseracto', label: 'Teseracto' }, { id: 'celdas16', label: '16 celdas' }, { id: 'celdas24', label: '24 celdas' },
    ] },
    { key: 'xw', label: 'Giro xw', type: 'int', min: -3, max: 3, def: 1, unit: 'vueltas' },
    { key: 'yw', label: 'Giro yw', type: 'int', min: -3, max: 3, def: 1, unit: 'vueltas' },
    { key: 'zw', label: 'Giro zw', type: 'int', min: -3, max: 3, def: 0, unit: 'vueltas' },
    { key: 'cycle', label: 'Ciclo', type: 'number', min: 10, max: 120, def: 40, step: 1, unit: 's' },
    { key: 'dist4', label: 'Distancia 4D', type: 'number', min: 1.6, max: 5, def: 2.4, step: 0.01 },
    { key: 'width', label: 'Grosor', type: 'number', min: 0.6, max: 3, def: 1.4, step: 0.05 },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
  ],
  presets: [
    { id: 'teseracto', name: 'Teseracto', uses: ['arte/figuras', 'terminal/figuras'], period: 40, aka: ['hipercubo que gira'],
      params: { poly: 'teseracto', xw: 1, yw: 1, zw: 0, cycle: 40, dist4: 2.4, width: 1.4, trail: 0.35 },
      look: { stops: ['#05070d', '#1f3b66', '#7fb8ff', '#eef6ff'], bg: '#030409', charset: ' .:-=+*#%@' } },
    { id: 'reves', name: 'Del revés', uses: ['arte/figuras'], period: 20, aka: ['el cubo interior pasa afuera'],
      params: { poly: 'teseracto', xw: 1, yw: 0, zw: 0, cycle: 20, dist4: 1.9, width: 1.6, trail: 0.6 },
      look: { stops: ['#0c0507', '#5c1630', '#ff5c8a', '#ffe3ec'], bg: '#070204', charset: ' .·:;+=*#@' } },
    { id: 'celdas24', name: 'Veinticuatro celdas', uses: ['arte/figuras'], period: 60, aka: ['icositetracoro'],
      params: { poly: 'celdas24', xw: 1, yw: -1, zw: 1, cycle: 60, dist4: 3, width: 1, trail: 0.2 },
      look: { stops: ['#06080a', '#1c4a3c', '#5fe0b0', '#effff8'], bg: '#030504', charset: ' .`:-=+*#%' } },
    { id: 'celdas16', name: 'Dieciséis celdas', uses: ['arte/figuras', 'terminal/figuras'], period: 48, aka: ['hexadecacoro', 'ortoplex 4D'],
      params: { poly: 'celdas16', xw: 2, yw: 1, zw: -1, cycle: 48, dist4: 2.2, width: 1.6, trail: 0.5 },
      look: { stops: ['#0b0805', '#5a3b12', '#f2b552', '#fff6e2'], bg: '#060402', charset: ' .:-=+*#%@' } },
  ],
  caps: { loop: true, time: 'bucle', basic: 'full', checkpoint: false },
  budget: {},
  figure: true,
};
