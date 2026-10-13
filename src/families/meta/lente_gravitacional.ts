import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lente_gravitacional',
  name: 'Agujero negro',
  aka: ['lente gravitacional', 'Schwarzschild', 'disco de acreción', 'horizonte de sucesos', 'Gargantua'],
  group: 'ciencia',
  kind: 'analytic',
  // 2: the shear between the disk's rings is bounded (after ten minutes it still reads as streaks, not grain)
  version: 2,
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
    { id: 'disco', name: 'Disco doblado', aka: ['Disco de acreción', 'Gargantua'], uses: ['arte/figuras', 'terminal/figuras'],
      params: { dist: 15, incl: 7, orbit: 0.2, rout: 10, disk: 1.1, bg: 'estrellas', expo: 1.8, spin: 0.6 },
      look: { stops: ['#0a0603', '#b0702a', '#fff0d0'], bg: '#050302', charset: ' .:-=+*#%@' } },
    { id: 'rejilla', name: 'Rejilla curvada', aka: ['Lente sobre la rejilla', 'lente gravitacional', 'anillo de Einstein'], uses: ['arte/figuras', 'arte/optica'], period: 10,
      params: { dist: 16, incl: 24, orbit: 0.25, rout: 12, disk: 0, bg: 'rejilla', expo: 2, spin: 0 },
      look: { stops: ['#03080f', '#b0dcff'], bg: '#02050a', charset: ' .·:;+=#' } },
    { id: 'canto', name: 'Disco de canto', aka: ['De canto'], uses: ['arte/figuras', 'arte/optica'],
      params: { dist: 22, incl: 2, orbit: 0.15, rout: 13, disk: 1.3, bg: 'ambos', expo: 1.7, spin: -0.8 },
      look: { stops: ['#0c0410', '#7a3a5a', '#ffc0e0'], bg: '#060208', charset: ' .-=+*#' } },
    { id: 'remolino', name: 'Remolino', aka: ['disco de acreción visto desde arriba'], uses: ['arte/figuras'],
      params: { dist: 24, incl: 42, orbit: 0.12, rout: 12, disk: 1, bg: 'estrellas', expo: 1.8, spin: 0.5 },
      look: { stops: ['#04060c', '#5078b0', '#eef4ff'], bg: '#020308', charset: ' .:-=+*#%@' } },
    { id: 'cerca', name: 'Al borde de la sombra', aka: ['primer plano del horizonte', 'esfera de fotones'], uses: ['arte/figuras'],
      params: { dist: 8, incl: 18, orbit: 0.15, rout: 7, disk: 0.8, bg: 'estrellas', expo: 1.7, spin: 0.5 },
      look: { stops: ['#080402', '#a8501a', '#ffe0b0'], bg: '#040201', charset: ' .:-=+*#%@' } },
  ],
  // with the disk still, only the camera moves and it comes back (the grid alone, every 15° of its turn);
  // turning, each ring of the disk keeps its own pace and nothing repeats
  caps: { loop: true, time: { param: 'spin', values: { '0': 'bucle' }, else: 'continuo' }, basic: 'full', checkpoint: false },
  budget: { },
  figure: true,
};
