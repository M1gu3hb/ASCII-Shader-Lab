import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lente_gravitacional',
  name: 'Agujero negro',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  params: [
    { key: 'dist', label: 'Distancia', type: 'number', min: 6, max: 30, def: 14, step: 0.1, unit: 'r_s' },
    { key: 'incl', label: 'Inclinación', type: 'number', min: 1.5, max: 80, def: 12, step: 0.5, unit: '°' },
    { key: 'orbit', label: 'Órbita', type: 'number', min: -1, max: 1, def: 0.25, step: 0.01 },
    { key: 'rout', label: 'Radio del disco', type: 'number', min: 4, max: 20, def: 12, step: 0.1, unit: 'r_s' },
    { key: 'disk', label: 'Brillo del disco', type: 'number', min: 0, max: 2, def: 1, step: 0.01 },
    { key: 'bg', label: 'Fondo', type: 'choice', def: 'estrellas', options: [
      { id: 'estrellas', label: 'Estrellas' }, { id: 'rejilla', label: 'Rejilla' }, { id: 'ambos', label: 'Ambos' },
    ] },
    { key: 'expo', label: 'Exposición', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
    { key: 'spin', label: 'Rotación del disco', type: 'number', min: -2, max: 2, def: 1, step: 0.01 },
  ],
  presets: [
    { id: 'disco', name: 'Disco de acreción', params: { dist: 20, incl: 9, orbit: 0.2, rout: 10, disk: 1, bg: 'estrellas', expo: 1.5, spin: 1 }, look: { stops: ['#0a0603', '#ffe0a8'], bg: '#050302', charset: ' .:-=+*#%@' } },
    { id: 'rejilla', name: 'Lente sobre la rejilla', params: { dist: 16, incl: 24, orbit: 0.3, rout: 12, disk: 0, bg: 'rejilla', expo: 1.2, spin: 1 }, look: { stops: ['#03080f', '#b0dcff'], bg: '#02050a', charset: ' .·:;+=#' } },
    { id: 'canto', name: 'De canto', params: { dist: 22, incl: 2, orbit: 0.15, rout: 13, disk: 1.3, bg: 'ambos', expo: 1.3, spin: -1.2 }, look: { stops: ['#0c0410', '#ffc0e0'], bg: '#060208', charset: ' .-=+*#' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { },
  figure: true,
};
