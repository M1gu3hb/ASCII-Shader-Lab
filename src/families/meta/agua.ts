import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'agua',
  name: 'Agua interactiva',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Una piscina vista desde arriba: gotas, ondas que rebotan y cáusticas de luz en el fondo.',
  mechanism: 'La superficie es una rejilla de alturas que sigue la ecuación de ondas con amortiguación; las paredes y los obstáculos reflejan las ondas. La luz atraviesa la superficie, se refracta y se concentra en el fondo: esas cáusticas se calculan proyectando la luz de cada punto de la superficie hasta el suelo de baldosas.',
  time: 'Evoluciona con memoria: cada onda sale de las anteriores y la lluvia cae donde dice la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  extends: 'causticas',
  params: [
    { key: 'rain', label: 'Lluvia', type: 'number', min: 0, max: 40, def: 4, step: 0.5, unit: 'gotas/s', hint: 'Gotas que caen cada segundo en sitios que salen de la semilla.' },
    { key: 'drop', label: 'Tamaño de gota', type: 'number', min: 0.7, max: 3, def: 1.2, step: 0.05, hint: 'Ancho del hoyuelo que deja cada gota: más grande, ondas más largas.' },
    { key: 'damp', label: 'Amortiguación', type: 'number', min: 0, max: 1, def: 0.25, step: 0.01, hint: 'Lo rápido que se calman las ondas; las cortas, antes que las largas.' },
    { key: 'speed', label: 'Velocidad de onda', type: 'number', min: 0.2, max: 0.7, def: 0.5, step: 0.01, unit: 'celdas/paso', hint: 'Lo rápido que viajan las ondas (dentro del margen estable).' },
    { key: 'paddle', label: 'Oleaje', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Una pala junto a la pared izquierda hace olas planas; los dos extremos se vuelven playas que las absorben.' },
    { key: 'obst', label: 'Obstáculos', type: 'choice', def: 'ninguno', options: [
      { id: 'ninguno', label: 'Ninguno' }, { id: 'rocas', label: 'Rocas' }, { id: 'rendijas', label: 'Muro con dos rendijas' },
    ], hint: 'Lo que hay en el agua y refleja las ondas.' },
    { key: 'depth', label: 'Profundidad', type: 'number', min: 0.1, max: 1, def: 0.5, step: 0.01, hint: 'Más hondo: el fondo se deforma más y las cáusticas se enfocan en hilos.' },
    { key: 'light', label: 'Luz', type: 'number', min: 0, max: 360, def: 135, step: 1, unit: '°', hint: 'De dónde viene la luz: mueve los brillos y las cáusticas.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'suelo', options: [
      { id: 'suelo', label: 'Suelo refractado' }, { id: 'causticas', label: 'Cáusticas' }, { id: 'superficie', label: 'Superficie' },
    ] },
  ],
  presets: [
    { id: 'piscina', name: 'Piscina con cáusticas', desc: 'Pocas gotas sobre agua honda: anillos de luz cruzan el fondo de baldosas y lo hacen ondular.', params: { rain: 5, drop: 2.2, damp: 0.55, speed: 0.5, paddle: 0, obst: 'ninguno', depth: 0.8, light: 135, view: 'suelo' }, look: { stops: ['#03141c', '#5fd3e6', '#f2fdff'], bg: '#020c11', charset: ' .:-=+*#%' } },
    { id: 'lluvia', name: 'Lluvia sobre el estanque', desc: 'Muchas gotas entre rocas: anillos que se cruzan, rebotan en las piedras y se calman deprisa (vista de la superficie).', params: { rain: 14, drop: 1.6, damp: 0.5, speed: 0.4, paddle: 0, obst: 'rocas', depth: 0.4, light: 120, view: 'superficie' }, look: { stops: ['#060a0c', '#b7d3dc'], bg: '#030607', charset: ' .·:;oO' } },
    { id: 'canal', name: 'Ondas en un canal', desc: 'Olas planas pasan por dos rendijas y se abren en franjas de interferencia (vista de las cáusticas).', params: { rain: 0, drop: 1.2, damp: 0.05, speed: 0.6, paddle: 0.55, obst: 'rendijas', depth: 0.6, light: 180, view: 'causticas' }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .-=+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'gota', label: 'Gota', hint: 'Deja caer gotas donde tocas; al arrastrar, un rastro de gotas pequeñas.' }],
  },
  budget: {
    res: [48, 128, 96], rate: 60, warmup: 360,
    limits: 'Rejilla de alturas de 2 × filas columnas (8 bytes por celda); hasta 8 gotas por paso y 48 por trazo. Al dibujar, 4 rayos de luz por celda para las cáusticas.',
  },
  sources: [
    { label: 'Evan Wallace: WebGL Water', url: 'https://madebyevan.com/webgl-water/' },
    { label: 'GPU Gems, cap. 2: Rendering Water Caustics', url: 'https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics' },
  ],
  wrap: 'clamp',
};
