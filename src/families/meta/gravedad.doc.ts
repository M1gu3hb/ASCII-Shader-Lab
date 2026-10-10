import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cientos de cuerpos que se atraen entre sí: galaxias que giran, cúmulos que chocan, nubes que se desploman.',
  mechanism: 'Cada cuerpo atrae a todos los demás con la ley de Newton, suavizada a distancias cortas (Plummer) para que dos cuerpos muy juntos no se disparen. Se suman todas las parejas y se avanza con un integrador de salto de rana (leapfrog), que conserva bien la energía. La simulación es en 3D; la cámara se inclina y gira despacio.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 1200 cuerpos más 12 añadidos a mano; suma directa de todas las parejas (≈ 730 000 por paso como mucho); un búfer de estela de 2 × filas × filas.',
  sources: [
    { label: 'Nyland, Harris y Prins: Fast N-Body Simulation with CUDA (GPU Gems 3, cap. 31)', url: 'https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-31-fast-n-body-simulation-cuda' },
    { label: 'Aarseth, Hénon y Wielen (1974): A comparison of numerical methods for the study of star cluster dynamics', url: 'https://ui.adsabs.harvard.edu/abs/1974A%26A....37..183A' },
    { label: 'Plummer (1911): On the problem of distribution in globular star clusters', url: 'https://ui.adsabs.harvard.edu/abs/1911MNRAS..71..460P' },
  ],
  hints: {
    'bodies': 'Más cuerpos: más detalle y más cálculo (crece con el cuadrado).',
    'masses': 'Variadas: unos pocos cuerpos pesados entre muchos ligeros.',
    'G': 'Constante de gravitación. Cambiarla en marcha desequilibra el sistema: se contrae o se dispersa.',
    'soft': 'Distancia por debajo de la cual la atracción deja de crecer (ε de Plummer).',
    'dt': 'Tiempo del modelo por paso: más grande, más rápido y menos preciso.',
    'trail': 'Cuánto dura el rastro de cada cuerpo.',
    'tilt': '0°: visto desde arriba; 85°: casi de canto.',
    'spin': 'Vueltas de la cámara por minuto.',
  },
  presets: {
    'galaxia': 'Un disco frío alrededor de una masa central que se rompe en brazos y grumos al girar.',
    'choque': 'Dos cúmulos esféricos se cruzan, se frenan y se funden dejando colas de marea.',
    'colapso': 'Una nube en reposo cae sobre sí misma, rebota y queda como un núcleo con halo.',
    'binaria': 'Dos estrellas que se orbitan agitan un anillo de polvo y le abren ondas y huecos.',
  },
};
