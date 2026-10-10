import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Tinta, humo y remolinos en un fluido que no se comprime: chorros que se enroscan y chocan.',
  mechanism: 'Fluidos estables de Stam sobre una rejilla: la velocidad se transporta a sí misma, la viscosidad la difunde y una proyección de presión la deja sin compresión. El refuerzo de vorticidad devuelve los remolinos que la rejilla borra; la tinta viaja con la corriente y se desvanece.',
  time: 'Evoluciona con memoria: cada momento depende del anterior y los chorros recorren caminos que salen de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Velocidad y presión en una rejilla de la mitad de filas que el raster (hasta 160 × 80 celdas, velocidades en las caras); tinta en otra de tres cuartos (hasta 256 × 128). Hasta 40 iteraciones de presión, 4 de viscosidad, 8 chorros y 6 obstáculos; velocidad limitada a 6 celdas por paso.',
  sources: [
    { label: 'Stam (1999): Stable Fluids', url: 'https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf' },
    { label: 'GPU Gems, cap. 38: Fast Fluid Dynamics Simulation on the GPU', url: 'https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu' },
    { label: 'Fedkiw, Stam y Jensen (2001): Visual Simulation of Smoke', url: 'https://physbam.stanford.edu/~fedkiw/papers/stanford2001-01.pdf' },
    { label: 'Pavel Dobryakov: WebGL Fluid Simulation', url: 'https://github.com/PavelDoGreat/WebGL-Fluid-Simulation' },
  ],
  hints: {
    'jets': 'Chorros que inyectan tinta y empuje. Con 0 sólo actúa tu pincel.',
    'layout': 'Dónde nacen los chorros y hacia dónde apuntan. La corriente abre la caja por los lados: entra por la izquierda y sale por la derecha.',
    'force': 'Velocidad de salida de cada chorro.',
    'motion': 'Lo rápido que los chorros cambian de sitio y de dirección.',
    'pulse': 'De chorro continuo a bocanadas sueltas, como gotas de tinta.',
    'vort': 'Refuerza los remolinos: de corriente lisa a tormenta.',
    'visc': 'Espesa el fluido: los chorros se ensanchan y se frenan.',
    'buoy': 'Positiva: la tinta pesa menos y sube como humo caliente. Negativa: pesa más y se hunde.',
    'obst': 'Pilares sólidos que la corriente rodea.',
    'iters': 'Más: el fluido se comprime menos y los remolinos son más limpios.',
    'dyeDiss': 'Lo rápido que la tinta se desvanece.',
  },
  presets: {
    'tinta_agua': 'Gotas de tinta más pesada que el agua caen despacio y se abren en hongos y hebras lisas.',
    'humo_neon': 'Columnas continuas que suben desde el suelo por flotación y se deshilachan en lo alto.',
    'tormenta': 'Ocho chorros veloces que giran por todo el campo con vorticidad alta: remolinos que se enroscan y chocan.',
    'pilares': 'Una corriente entra por la izquierda, rodea cuatro pilares y suelta remolinos detrás de cada uno (vista de vorticidad).',
  },
};
