import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'gravedad',
  name: 'Gravedad N-cuerpos',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Cientos de cuerpos que se atraen entre sí: galaxias que giran, cúmulos que chocan, nubes que se desploman.',
  mechanism: 'Cada cuerpo atrae a todos los demás con la ley de Newton, suavizada a distancias cortas (Plummer) para que dos cuerpos muy juntos no se disparen. Se suman todas las parejas y se avanza con un integrador de salto de rana (leapfrog), que conserva bien la energía. La simulación es en 3D; la cámara se inclina y gira despacio.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'bodies', label: 'Cuerpos', type: 'int', min: 100, max: 1200, def: 300, rebuild: true, hint: 'Más cuerpos: más detalle y más cálculo (crece con el cuadrado).' },
    { key: 'init', label: 'Condiciones iniciales', type: 'choice', def: 'disco', rebuild: true, options: [
      { id: 'disco', label: 'Disco galáctico' }, { id: 'choque', label: 'Dos cúmulos que chocan' },
      { id: 'colapso', label: 'Nube fría que colapsa' }, { id: 'binario', label: 'Estrella doble con anillo' },
    ] },
    { key: 'masses', label: 'Masas', type: 'choice', def: 'iguales', rebuild: true, options: [{ id: 'iguales', label: 'Iguales' }, { id: 'variadas', label: 'Variadas' }], hint: 'Variadas: unos pocos cuerpos pesados entre muchos ligeros.' },
    { key: 'G', label: 'Atracción', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01, hint: 'Constante de gravitación. Cambiarla en marcha desequilibra el sistema: se contrae o se dispersa.' },
    { key: 'soft', label: 'Suavizado', type: 'number', min: 0.005, max: 0.2, def: 0.04, step: 0.001, digits: 3, hint: 'Distancia por debajo de la cual la atracción deja de crecer (ε de Plummer).' },
    { key: 'dt', label: 'Paso temporal', type: 'number', min: 0.002, max: 0.03, def: 0.012, step: 0.001, digits: 3, hint: 'Tiempo del modelo por paso: más grande, más rápido y menos preciso.' },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Cuánto dura el rastro de cada cuerpo.' },
    { key: 'zoom', label: 'Zoom', type: 'number', min: 0.4, max: 3, def: 1, step: 0.01 },
    { key: 'tilt', label: 'Inclinación', type: 'number', min: 0, max: 85, def: 35, step: 1, unit: '°', hint: '0°: visto desde arriba; 85°: casi de canto.' },
    { key: 'spin', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01, hint: 'Vueltas de la cámara por minuto.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'masa', options: [{ id: 'masa', label: 'Brillo por masa' }, { id: 'velocidad', label: 'Brillo por velocidad' }] },
  ],
  presets: [
    { id: 'galaxia', name: 'Galaxia espiral', desc: 'Un disco frío alrededor de una masa central que se rompe en brazos y grumos al girar.', params: { bodies: 700, init: 'disco', masses: 'iguales', G: 1, soft: 0.03, dt: 0.012, trail: 0.55, zoom: 1.05, tilt: 40, spin: 0.15, view: 'velocidad' }, look: { stops: ['#05060f', '#c8d4ff'], bg: '#020309', charset: ' .·:*+#@' } },
    { id: 'choque', name: 'Choque de cúmulos', desc: 'Dos cúmulos esféricos se cruzan, se frenan y se funden dejando colas de marea.', params: { bodies: 700, init: 'choque', masses: 'variadas', G: 1, soft: 0.04, dt: 0.012, trail: 0.4, zoom: 1.2, tilt: 30, spin: 0.08, view: 'masa' }, look: { stops: ['#0f0805', '#ffd9a8'], bg: '#080402', charset: ' .:-=+*#' } },
    { id: 'colapso', name: 'Colapso frío', desc: 'Una nube en reposo cae sobre sí misma, rebota y queda como un núcleo con halo.', params: { bodies: 700, init: 'colapso', masses: 'iguales', G: 1, soft: 0.05, dt: 0.01, trail: 0.7, zoom: 1, tilt: 60, spin: 0.2, view: 'velocidad' }, look: { stops: ['#0a0410', '#f0b8ff'], bg: '#050208', charset: ' .`:;oO@' } },
    { id: 'binaria', name: 'Estrella doble con anillo', desc: 'Dos estrellas que se orbitan agitan un anillo de polvo y le abren ondas y huecos.', params: { bodies: 600, init: 'binario', masses: 'iguales', G: 1, soft: 0.03, dt: 0.01, trail: 0.85, zoom: 1, tilt: 25, spin: 0.05, view: 'masa' }, look: { stops: ['#03100c', '#a8ffd8'], bg: '#010805', charset: ' .-~=*#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'masa', label: 'Añadir masa', hint: 'Deja un cuerpo pesado en reposo donde tocas (hasta 12).' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 30, limits: 'Hasta 1200 cuerpos más 12 añadidos a mano; suma directa de todas las parejas (≈ 730 000 por paso como mucho); un búfer de estela de 2 × filas × filas.' },
  sources: [
    { label: 'Nyland, Harris y Prins: Fast N-Body Simulation with CUDA (GPU Gems 3, cap. 31)', url: 'https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-31-fast-n-body-simulation-cuda' },
    { label: 'Aarseth, Hénon y Wielen (1974): A comparison of numerical methods for the study of star cluster dynamics', url: 'https://ui.adsabs.harvard.edu/abs/1974A%26A....37..183A' },
    { label: 'Plummer (1911): On the problem of distribution in globular star clusters', url: 'https://ui.adsabs.harvard.edu/abs/1911MNRAS..71..460P' },
  ],
  wrap: 'clamp',
  figure: true,
};
