import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'boids',
  name: 'Bandadas (boids)',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  extends: 'cardumen_luz',
  params: [
    { key: 'count', label: 'Cantidad', type: 'int', min: 100, max: 3000, def: 400, rebuild: true },
    { key: 'vision', label: 'Radio de visión', type: 'number', min: 0.03, max: 0.2, def: 0.08, step: 0.005, digits: 3 },
    { key: 'sep', label: 'Radio de separación', type: 'number', min: 0.005, max: 0.08, def: 0.03, step: 0.001, digits: 3 },
    { key: 'wSep', label: 'Separación', type: 'number', min: 0, max: 4, def: 1.5, step: 0.05 },
    { key: 'wAli', label: 'Alineación', type: 'number', min: 0, max: 4, def: 1.5, step: 0.05 },
    { key: 'wCoh', label: 'Cohesión', type: 'number', min: 0, max: 4, def: 1, step: 0.05 },
    { key: 'speed', label: 'Velocidad máxima', type: 'number', min: 0.05, max: 0.6, def: 0.3, step: 0.01, unit: 'alto/s' },
    { key: 'force', label: 'Agilidad', type: 'number', min: 0.2, max: 3, def: 1, step: 0.05, advanced: true },
    { key: 'predators', label: 'Depredadores', type: 'int', min: 0, max: 6, def: 0 },
    { key: 'obstacles', label: 'Obstáculos', type: 'int', min: 0, max: 6, def: 0 },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01 },
  ],
  presets: [
    { id: 'murmuracion', name: 'Murmuración', params: { count: 1500, vision: 0.1, sep: 0.03, wSep: 1.5, wAli: 2.2, wCoh: 1, speed: 0.32, force: 1, predators: 1, obstacles: 0, trail: 0.35 }, look: { stops: ['#0a0c12', '#dfe6f2'], bg: '#05060a', charset: ' .`\'-~=+*#' } },
    { id: 'cardumen', name: 'Cardumen', params: { count: 1000, vision: 0.07, sep: 0.028, wSep: 1.8, wAli: 1.8, wCoh: 1.2, speed: 0.26, force: 1.6, predators: 3, obstacles: 2, trail: 0.2 }, look: { stops: ['#03121a', '#8fe3ff'], bg: '#020a0f', charset: ' .:-=+<>#' } },
    { id: 'dispersion', name: 'Dispersión', params: { count: 800, vision: 0.045, sep: 0.025, wSep: 1, wAli: 1, wCoh: 0.35, speed: 0.2, force: 0.8, predators: 0, obstacles: 4, trail: 0.5 }, look: { stops: ['#120d06', '#f2cf8a'], bg: '#090603', charset: ' .,:;!|' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'espantar', label: 'Espantar', hint: 'Los agentes huyen de donde tocas, como de un depredador.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 45 },
  wrap: 'repeat',
};
