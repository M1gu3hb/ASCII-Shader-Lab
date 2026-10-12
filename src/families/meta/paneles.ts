import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'paneles',
  name: 'Paneles prismáticos',
  group: 'materia',
  kind: 'analytic',
  version: 1,
  color: true,
  aka: ['paneles de color', 'láminas translúcidas', 'composición alfa de atrás adelante', 'color panels'],
  params: [
    { key: 'count', label: 'Paneles', type: 'int', min: 2, max: 10, def: 6 },
    { key: 'turns', label: 'Giro', type: 'int', min: 1, max: 8, def: 2, unit: 'vueltas/min' },
    { key: 'opacity', label: 'Opacidad', type: 'number', min: 0.1, max: 0.95, def: 0.5, step: 0.01 },
    { key: 'length', label: 'Largo', type: 'number', min: 0.4, max: 1.6, def: 1, step: 0.01 },
    { key: 'sets', label: 'Juegos', type: 'choice', def: 'dos', options: [
      { id: 'uno', label: 'Uno' }, { id: 'dos', label: 'Dos, en sentidos contrarios' },
    ] },
    { key: 'tilt', label: 'Inclinación del eje', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01 },
    { key: 'edges', label: 'Bordes', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'width', label: 'Ancho', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
  ],
  presets: [
    { id: 'vidrieras', name: 'Vidrieras que giran', uses: ['fondos/color', 'fondos/materia'], period: 60,
      params: { count: 7, turns: 2, opacity: 0.4, length: 1.6, sets: 'dos', tilt: 0.9, edges: 0.7, width: 1.1 },
      look: { stops: ['#07060f', '#3b2b8f', '#d6407a', '#f2b33d', '#3fc7d9'], bg: '#04030a', charset: ' .:-=+*#%@', colorMode: 'source', vivid: 0.6 } },
    { id: 'abanico', name: 'Abanico de cristal', uses: ['arte/geometricas', 'arte/figuras'], period: 60,
      params: { count: 10, turns: 1, opacity: 0.4, length: 1.4, sets: 'uno', tilt: 0.35, edges: 0.9, width: 0.5 },
      look: { stops: ['#05080c', '#16505e', '#43c2b0', '#e8f7f2'], bg: '#030508', charset: ' .`:;+=*#%', colorMode: 'source', vivid: 0.5 } },
    { id: 'noria', name: 'Noria de color', uses: ['fondos/color'], period: 60,
      params: { count: 8, turns: 3, opacity: 0.6, length: 0.7, sets: 'dos', tilt: -0.25, edges: 0.5, width: 1.4 },
      look: { stops: ['#0d0606', '#7a1f2b', '#ff6a3d', '#ffd166', '#fff6e0'], bg: '#080303', charset: ' .,:;=+*#@', colorMode: 'source', vivid: 0.35 } },
    { id: 'puerta', name: 'Puerta giratoria', uses: ['fondos/color', 'arte/geometricas'], period: 60,
      params: { count: 3, turns: 3, opacity: 0.55, length: 1.25, sets: 'dos', tilt: 1, edges: 0.75, width: 0.75 },
      look: { stops: ['#05050a', '#2d3a8c', '#7d5cff', '#ff7ad9', '#f4f1ff'], bg: '#030306', charset: ' .:-=+*#%@', colorMode: 'source', vivid: 0.5 } },
  ],
  caps: { loop: true, time: 'bucle', basic: 'full', checkpoint: false },
  budget: {},
};
