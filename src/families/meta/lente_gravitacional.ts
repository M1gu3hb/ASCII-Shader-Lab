import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'lente_gravitacional',
  name: 'Agujero negro',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  blurb: 'Un agujero negro que curva la luz: su sombra, el disco que lo rodea y el cielo deformado detrás.',
  mechanism: 'Calculado: la trayectoria de la luz alrededor de un agujero negro sin giro (Schwarzschild), integrada paso a paso para cada celda; la luz que pasa demasiado cerca cae dentro y la que escapa lee el fondo en la dirección en que sale. Artístico: el brillo del disco, su textura y el refuerzo Doppler del lado que se acerca; no hay corrimiento al rojo ni transporte de radiación.',
  time: 'Una función del tiempo: la cámara orbita despacio y el disco gira más rápido por dentro que por fuera. Admite bucle perfecto.',
  params: [
    { key: 'dist', label: 'Distancia', type: 'number', min: 6, max: 30, def: 14, step: 0.1, unit: 'r_s', hint: 'A qué distancia está la cámara, en radios de Schwarzschild.' },
    { key: 'incl', label: 'Inclinación', type: 'number', min: 1.5, max: 80, def: 12, step: 0.5, unit: '°', hint: 'Altura de la cámara sobre el plano del disco: de canto a casi desde arriba.' },
    { key: 'orbit', label: 'Órbita', type: 'number', min: -1, max: 1, def: 0.25, step: 0.01, hint: 'Vueltas de la cámara por minuto.' },
    { key: 'rout', label: 'Radio del disco', type: 'number', min: 4, max: 20, def: 12, step: 0.1, unit: 'r_s', hint: 'Borde exterior del disco; el interior está en 3 r_s, la última órbita estable.' },
    { key: 'disk', label: 'Brillo del disco', type: 'number', min: 0, max: 2, def: 1, step: 0.01, hint: 'Con 0 no hay disco y sólo se ve la lente sobre el fondo.' },
    { key: 'bg', label: 'Fondo', type: 'choice', def: 'estrellas', options: [
      { id: 'estrellas', label: 'Estrellas' }, { id: 'rejilla', label: 'Rejilla' }, { id: 'ambos', label: 'Ambos' },
    ], hint: 'Rejilla: meridianos y paralelos del cielo, para ver cómo se deforma.' },
    { key: 'expo', label: 'Exposición', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
    { key: 'spin', label: 'Rotación del disco', type: 'number', min: -2, max: 2, def: 1, step: 0.01, hint: 'Velocidad (y sentido) del giro del disco; dentro gira más rápido, como en una órbita de Kepler.' },
  ],
  presets: [
    { id: 'disco', name: 'Disco de acreción', desc: 'El disco casi de canto: su cara de atrás se ve doblada por encima y por debajo de la sombra.', params: { dist: 20, incl: 9, orbit: 0.2, rout: 10, disk: 1, bg: 'estrellas', expo: 1.5, spin: 1 }, look: { stops: ['#0a0603', '#ffe0a8'], bg: '#050302', charset: ' .:-=+*#%@' } },
    { id: 'rejilla', name: 'Lente sobre la rejilla', desc: 'Sin disco: los meridianos del cielo se doblan en anillos alrededor de la sombra.', params: { dist: 16, incl: 24, orbit: 0.3, rout: 12, disk: 0, bg: 'rejilla', expo: 1.2, spin: 1 }, look: { stops: ['#03080f', '#b0dcff'], bg: '#02050a', charset: ' .·:;+=#' } },
    { id: 'canto', name: 'De canto', desc: 'El disco exactamente de lado, como una línea, y su imagen doblada formando un anillo.', params: { dist: 22, incl: 2, orbit: 0.15, rout: 13, disk: 1.3, bg: 'ambos', expo: 1.3, spin: -1.2 }, look: { stops: ['#0c0410', '#ffc0e0'], bg: '#060208', charset: ' .-=+*#' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { limits: 'Hasta 96 pasos de integración (RK4) por celda; sin texturas ni catálogos de estrellas.' },
  sources: [
    { label: 'Eric Bruneton: Real-time high-quality rendering of non-rotating black holes (artículo; código propio aquí)', url: 'https://arxiv.org/abs/2010.08735' },
    { label: 'Ecuación de la órbita de la luz en Schwarzschild (Binet)', url: 'https://en.wikipedia.org/wiki/Schwarzschild_geodesics#Bending_of_light_by_gravity' },
    { label: 'Luminet: An illustrated history of black hole imaging (su imagen de 1979 con disco fino)', url: 'https://arxiv.org/abs/1902.11196' },
  ],
  figure: true,
};
