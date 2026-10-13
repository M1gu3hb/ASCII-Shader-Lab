import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'descargas',
  name: 'Descargas eléctricas',
  group: 'fisica',
  kind: 'analytic',
  version: 1,
  aka: ['arcos eléctricos', 'arco voltaico', 'rayos', 'tormenta eléctrica', 'descarga de plasma'],
  params: [
    { key: 'layout', label: 'Disposición', type: 'choice', def: 'anillo', options: [
      { id: 'anillo', label: 'Anillo de conductores' }, { id: 'estrella', label: 'Desde el centro' }, { id: 'tormenta', label: 'Tormenta' },
    ] },
    { key: 'count', label: 'Conductores', type: 'int', min: 2, max: 6, def: 4 },
    { key: 'jag', label: 'Deformación', type: 'number', min: 0, max: 1, def: 0.55, step: 0.01 },
    { key: 'branches', label: 'Ramas', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01 },
    { key: 'crackle', label: 'Chisporroteo', type: 'number', min: 0, max: 1, def: 0.3, step: 0.01 },
    { key: 'glow', label: 'Brillo', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'flicker', label: 'Parpadeo', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01 },
    { key: 'motion', label: 'Movimiento', type: 'number', min: 0, max: 1, def: 0.3, step: 0.01 },
  ],
  presets: [
    { id: 'anillo', name: 'Anillo de arcos', aka: ['arco voltaico'], uses: ['arte/optica', 'arte/figuras'],
      params: { layout: 'anillo', count: 4, jag: 0.55, branches: 0.45, crackle: 0.3, glow: 0.5, flicker: 0.15, motion: 0.3 },
      look: { stops: ['#03040a', '#1b2a6b', '#5b8cff', '#c8dcff', '#ffffff'], bg: '#020309', charset: ' .:-=+*#%@' } },
    { id: 'plasma', name: 'Esfera de plasma', aka: ['globo de plasma'], uses: ['arte/optica', 'arte/figuras'],
      params: { layout: 'estrella', count: 6, jag: 0.75, branches: 0.6, crackle: 0.45, glow: 0.65, flicker: 0.1, motion: 0.45 },
      look: { stops: ['#06020c', '#3b0f6b', '#b14dff', '#f0c6ff', '#ffffff'], bg: '#040108', charset: ' .:-=+*#%@' } },
    { id: 'tormenta', name: 'Tormenta seca', aka: ['rayos cielo-tierra'], uses: ['fondos/vivas', 'arte/organicas'],
      params: { layout: 'tormenta', count: 6, jag: 0.6, branches: 0.8, crackle: 0.2, glow: 0.45, flicker: 0.35, motion: 0.6 },
      look: { stops: ['#04050a', '#1a1f33', '#56608a', '#d6dcff', '#ffffff'], bg: '#030408', charset: ' .:-=+*#%@' } },
    { id: 'chispa', name: 'Chispa entre dos', aka: ['arco entre electrodos'], uses: ['terminal/figuras', 'arte/optica'],
      params: { layout: 'anillo', count: 2, jag: 0.8, branches: 0.3, crackle: 0.6, glow: 0.35, flicker: 0.05, motion: 0.15 },
      look: { stops: ['#050403', '#4a2a06', '#ff9d2e', '#ffe6b0', '#ffffff'], bg: '#040302', charset: ' .:-=+*#%@' } },
  ],
  caps: { loop: true, time: 'continuo', basic: 'full', checkpoint: false },
  budget: {},
  // a ring of conductors or a spark from the centre is a figure; the storm fills the sky
  figure: p => p.layout !== 'tormenta',
};
