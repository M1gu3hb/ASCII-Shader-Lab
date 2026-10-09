import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'fluido',
  name: 'Fluido 2D',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Tinta, humo y remolinos en un fluido que no se comprime: chorros que se enroscan y chocan.',
  mechanism: 'Fluidos estables de Stam sobre una rejilla: la velocidad se transporta a sí misma, la viscosidad la difunde y una proyección de presión la deja sin compresión. El refuerzo de vorticidad devuelve los remolinos que la rejilla borra; la tinta viaja con la corriente y se desvanece.',
  time: 'Evoluciona con memoria: cada momento depende del anterior y los chorros recorren caminos que salen de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  extends: 'campo_flujo',
  params: [
    { key: 'jets', label: 'Emisores', type: 'int', min: 0, max: 8, def: 4, hint: 'Chorros que inyectan tinta y empuje. Con 0 sólo actúa tu pincel.' },
    { key: 'layout', label: 'Chorros', type: 'choice', def: 'libres', options: [
      { id: 'libres', label: 'Libres' }, { id: 'suelo', label: 'Desde el suelo' }, { id: 'arriba', label: 'Desde arriba' },
      { id: 'izquierda', label: 'Corriente desde la izquierda' },
    ], hint: 'Dónde nacen los chorros y hacia dónde apuntan. La corriente abre la caja por los lados: entra por la izquierda y sale por la derecha.' },
    { key: 'force', label: 'Fuerza', type: 'number', min: 0.3, max: 5, def: 2, step: 0.05, unit: 'celdas/paso', hint: 'Velocidad de salida de cada chorro.' },
    { key: 'motion', label: 'Movimiento', type: 'number', min: 0, max: 2, def: 0.4, step: 0.01, hint: 'Lo rápido que los chorros cambian de sitio y de dirección.' },
    { key: 'pulse', label: 'Pulsos', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'De chorro continuo a bocanadas sueltas, como gotas de tinta.' },
    { key: 'vort', label: 'Vorticidad', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01, hint: 'Refuerza los remolinos: de corriente lisa a tormenta.' },
    { key: 'visc', label: 'Viscosidad', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Espesa el fluido: los chorros se ensanchan y se frenan.' },
    { key: 'buoy', label: 'Flotación', type: 'number', min: -1, max: 1, def: 0, step: 0.01, hint: 'Positiva: la tinta pesa menos y sube como humo caliente. Negativa: pesa más y se hunde.' },
    { key: 'obst', label: 'Obstáculos', type: 'int', min: 0, max: 6, def: 0, hint: 'Pilares sólidos que la corriente rodea.' },
    { key: 'iters', label: 'Iteraciones de presión', type: 'int', min: 4, max: 40, def: 14, advanced: true, hint: 'Más: el fluido se comprime menos y los remolinos son más limpios.' },
    { key: 'dyeDiss', label: 'Disipación de la tinta', type: 'number', min: 0.02, max: 1.5, def: 0.25, step: 0.01, unit: '/s', hint: 'Lo rápido que la tinta se desvanece.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'tinta', options: [
      { id: 'tinta', label: 'Tinta' }, { id: 'velocidad', label: 'Velocidad' }, { id: 'vorticidad', label: 'Vorticidad' },
    ] },
  ],
  presets: [
    { id: 'tinta_agua', name: 'Tinta en agua', desc: 'Gotas de tinta más pesada que el agua caen despacio y se abren en hongos y hebras lisas.', params: { jets: 6, layout: 'arriba', force: 1, motion: 0.2, pulse: 0.75, vort: 0, visc: 0.05, buoy: -0.7, obst: 0, iters: 14, dyeDiss: 0.12, view: 'tinta' }, look: { stops: ['#070a12', '#cfe0ff'], bg: '#04060b', charset: ' .·:-=+*#' } },
    { id: 'humo_neon', name: 'Humo de neón', desc: 'Columnas continuas que suben desde el suelo por flotación y se deshilachan en lo alto.', params: { jets: 4, layout: 'suelo', force: 1.4, motion: 0.35, pulse: 0, vort: 0.4, visc: 0, buoy: 0.8, obst: 0, iters: 14, dyeDiss: 0.45, view: 'tinta' }, look: { stops: ['#0c0414', '#ff6ad5', '#ffe9fb'], bg: '#06020a', charset: ' .\'":;!|*' } },
    { id: 'tormenta', name: 'Tormenta de vórtices', desc: 'Ocho chorros veloces que giran por todo el campo con vorticidad alta: remolinos que se enroscan y chocan.', params: { jets: 8, layout: 'libres', force: 3.2, motion: 1.1, pulse: 0, vort: 0.95, visc: 0, buoy: 0, obst: 0, iters: 18, dyeDiss: 0.7, view: 'tinta' }, look: { stops: ['#04101a', '#4fd6ff', '#eafcff'], bg: '#020810', charset: ' .:-=+*%@' } },
    { id: 'pilares', name: 'Estela entre pilares', desc: 'Una corriente entra por la izquierda, rodea cuatro pilares y suelta remolinos detrás de cada uno (vista de vorticidad).', params: { jets: 5, layout: 'izquierda', force: 2.2, motion: 0.15, pulse: 0, vort: 0.3, visc: 0, buoy: 0, obst: 4, iters: 22, dyeDiss: 0.3, view: 'vorticidad' }, look: { stops: ['#0b0a06', '#ffd27a'], bg: '#060503', charset: ' .-~=≈#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'tinta', label: 'Tinta', hint: 'Echa tinta y empuja el fluido en la dirección del trazo.' }],
  },
  budget: {
    res: [48, 192, 128], rate: 30, warmup: 30,
    limits: 'Velocidad y presión en una rejilla de la mitad de filas que el raster (hasta 160 × 80 celdas, velocidades en las caras); tinta en otra de tres cuartos (hasta 256 × 128). Hasta 40 iteraciones de presión, 4 de viscosidad, 8 chorros y 6 obstáculos; velocidad limitada a 6 celdas por paso.',
  },
  sources: [
    { label: 'Stam (1999): Stable Fluids', url: 'https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf' },
    { label: 'GPU Gems, cap. 38: Fast Fluid Dynamics Simulation on the GPU', url: 'https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu' },
    { label: 'Fedkiw, Stam y Jensen (2001): Visual Simulation of Smoke', url: 'https://physbam.stanford.edu/~fedkiw/papers/stanford2001-01.pdf' },
    { label: 'Pavel Dobryakov: WebGL Fluid Simulation', url: 'https://github.com/PavelDoGreat/WebGL-Fluid-Simulation' },
  ],
  wrap: 'clamp',
};
