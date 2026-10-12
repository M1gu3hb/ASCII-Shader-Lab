import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'nubes_vol',
  name: 'Nubes volumétricas',
  aka: ['nubes', 'nube volumétrica', 'Beer–Lambert', 'Henyey–Greenstein', 'nebulosa', 'cielo'],
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  extends: 'nube',
  params: [
    { key: 'cover', label: 'Cobertura', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.4, max: 3, def: 1, step: 0.01 },
    { key: 'erosion', label: 'Erosión', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 2, def: 0.4, step: 0.01 },
    { key: 'sun', label: 'Luz', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
    { key: 'absorb', label: 'Absorción', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
    { key: 'steps', label: 'Calidad', type: 'int', min: 12, max: 64, def: 40, unit: 'pasos', advanced: true },
    { key: 'camera', label: 'Cámara', type: 'choice', def: 'horizonte', options: [
      { id: 'dentro', label: 'Dentro' }, { id: 'horizonte', label: 'Sobre el mar de nubes' }, { id: 'haces', label: 'Haces de luz' },
      { id: 'nebulosa', label: 'Nebulosa' },
    ] },
  ],
  presets: [
    { id: 'banco', name: 'Mar de nubes', aka: ['Banco de nubes', 'nubes volumétricas'], uses: ['fondos/organicas'],
      params: { cover: 0.78, scale: 1.1, erosion: 0.45, wind: 0.35, sun: 0.55, absorb: 1, steps: 40, camera: 'horizonte' },
      look: { stops: ['#0b1220', '#6a7a90', '#f3f0e6'], bg: '#060a12', charset: ' .:-=+*#%@' } },
    { id: 'nebulosa', name: 'Nebulosa', aka: ['nebulosa de emisión', 'polvo interestelar'], uses: ['fondos/espacio', 'arte/figuras'],
      params: { cover: 0.6, scale: 0.8, erosion: 0.8, wind: 0.6, sun: 0.4, absorb: 1.6, steps: 40, camera: 'nebulosa' },
      look: { stops: ['#05020a', '#a0489a', '#ffd8f2'], bg: '#030106', charset: ' .·:;+*#@' } },
    { id: 'haces', name: 'Haces de luz', aka: ['rayos crepusculares', 'dispersión de Mie'], uses: ['fondos/organicas'],
      params: { cover: 0.84, scale: 1.6, erosion: 0.3, wind: 0.3, sun: 0.85, absorb: 2.6, steps: 40, camera: 'haces' },
      look: { stops: ['#100c06', '#a08050', '#fff0cc'], bg: '#080603', charset: ' .:;|!#' } },
    { id: 'dentro', name: 'Vuelo entre nubes', aka: ['Nebulosa (dentro de la nube)'], uses: ['fondos/organicas', 'tipo/texturas'],
      params: { cover: 0.34, scale: 1.1, erosion: 1, wind: 0.6, sun: 0.85, absorb: 2.2, steps: 36, camera: 'dentro' },
      look: { stops: ['#0c0414', '#a0609a', '#ffd0f0'], bg: '#05020a', charset: ' .·:;+*#@' } },
  ],
  // with no wind nothing moves (a loop of any length); with it the noise drifts on and never comes back
  caps: {
    loop: true, time: { param: 'wind', values: { '0': 'bucle' }, else: 'continuo' }, basic: 'reduced',
    basicNote: 'En el motor básico: como mucho 32 pasos de rayo (24 en la nebulosa), 3 hacia el sol y 10 en la bruma.', checkpoint: false,
  },
  budget: { },
};
