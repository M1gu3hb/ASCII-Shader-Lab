import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cuerpos que se atraen: galaxias con brazos que giran, cúmulos que chocan, nubes que se desploman.',
  mechanism: 'Cada cuerpo atrae a todos los demás con la ley de Newton, suavizada a distancias cortas (Plummer) para que dos cuerpos muy juntos no se disparen. Se suman todas las parejas y se avanza con un integrador de salto de rana (leapfrog), que conserva bien la energía. La simulación es en 3D; la cámara se inclina y gira despacio. La galaxia de brazos no suma parejas: cada estrella recorre su órbita en el potencial de la galaxia, un óvalo que, visto desde los brazos, se cierra (la aproximación de epiciclos de Lindblad). Los óvalos giran un poco más cuanto más lejos están y se apiñan en brazos espirales, una onda de densidad que gira como un dibujo mientras las estrellas entran y salen de ella; las jóvenes se encienden al cruzarla.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. La galaxia de brazos, el disco y la estrella doble son continuos: siguen girando, los brazos se aprietan y se abren despacio y las estrellas jóvenes se encienden y se apagan. El choque de cúmulos y el colapso son construcciones: los cuerpos se juntan, rebotan y acaban en una sola bola que vibra casi quieta; míralos formarse. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 1200 cuerpos más 12 añadidos a mano; suma directa de todas las parejas (≈ 730 000 por paso como mucho); la galaxia de brazos, hasta 9600 estrellas (8 por cuerpo) sin suma de parejas; un búfer de estela de 2 × filas × filas.',
  sources: [
    { label: 'Nyland, Harris y Prins: Fast N-Body Simulation with CUDA (GPU Gems 3, cap. 31)', url: 'https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-31-fast-n-body-simulation-cuda' },
    { label: 'Aarseth, Hénon y Wielen (1974): A comparison of numerical methods for the study of star cluster dynamics', url: 'https://ui.adsabs.harvard.edu/abs/1974A%26A....37..183A' },
    { label: 'Plummer (1911): On the problem of distribution in globular star clusters', url: 'https://ui.adsabs.harvard.edu/abs/1911MNRAS..71..460P' },
    { label: 'Lin y Shu (1964): On the spiral structure of disk galaxies', url: 'https://ui.adsabs.harvard.edu/abs/1964ApJ...140..646L' },
    { label: 'Ingo Berg: Rendering a galaxy with the density wave theory', url: 'https://beltoforion.de/en/spiral_galaxy_renderer/' },
  ],
  hints: {
    'bodies': 'Más cuerpos: más detalle y más cálculo (crece con el cuadrado). En la galaxia de brazos, ocho estrellas por cuerpo.',
    'init': 'De dónde parte: un disco, dos cúmulos, una nube fría, una estrella doble o una galaxia de brazos (órbitas en el potencial de la galaxia).',
    'arms': 'Número de brazos de la galaxia de brazos.',
    'masses': 'Variadas: unos pocos cuerpos pesados entre muchos ligeros.',
    'G': 'Constante de gravitación. Cambiarla en marcha desequilibra el sistema: se contrae o se dispersa (la galaxia de brazos gira más deprisa o más despacio).',
    'soft': 'Distancia por debajo de la cual la atracción deja de crecer (ε de Plummer).',
    'dt': 'Tiempo del modelo por paso: más grande, más rápido y menos preciso.',
    'trail': 'Cuánto dura el rastro de cada cuerpo.',
    'zoom': 'Acerca o aleja la cámara.',
    'tilt': '0°: visto desde arriba; 85°: casi de canto.',
    'spin': 'Vueltas de la cámara por minuto.',
    'view': 'El brillo de cada cuerpo según su masa o su velocidad.',
  },
  presets: {
    'galaxia': 'Dos brazos espirales nítidos que giran sin deshacerse; las estrellas los atraviesan y las jóvenes se encienden en ellos.',
    'remolino': 'Una galaxia de tres brazos vista casi de frente y muy de cerca: sus brazos llenan el lienzo y giran despacio.',
    'choque': 'Dos cúmulos esféricos se cruzan, se frenan y se funden dejando colas de marea.',
    'colapso': 'Una nube en reposo que llena el lienzo cae sobre sí misma, rebota y queda como un núcleo con halo.',
    'binaria': 'Dos estrellas que se orbitan agitan un anillo de polvo y le abren ondas y huecos.',
  },
};
