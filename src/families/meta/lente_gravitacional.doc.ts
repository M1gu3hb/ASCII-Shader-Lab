import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un agujero negro que curva la luz: su sombra, el disco que lo rodea y el cielo deformado detrás.',
  mechanism: 'Calculado: la trayectoria de la luz alrededor de un agujero negro sin giro (Schwarzschild), integrada paso a paso para cada celda; la luz que pasa demasiado cerca cae dentro y la que escapa lee el fondo en la dirección en que sale. Artístico: el brillo del disco, su textura y el refuerzo Doppler del lado que se acerca; no hay corrimiento al rojo ni transporte de radiación.',
  time: 'Una función del tiempo: la cámara orbita despacio y el disco gira más rápido por dentro que por fuera. Admite bucle perfecto.',
  limits: 'Hasta 96 pasos de integración (RK4) por celda; sin texturas ni catálogos de estrellas.',
  sources: [
    { label: 'Eric Bruneton: Real-time high-quality rendering of non-rotating black holes (artículo; código propio aquí)', url: 'https://arxiv.org/abs/2010.08735' },
    { label: 'Ecuación de la órbita de la luz en Schwarzschild (Binet)', url: 'https://en.wikipedia.org/wiki/Schwarzschild_geodesics#Bending_of_light_by_gravity' },
    { label: 'Luminet: An illustrated history of black hole imaging (su imagen de 1979 con disco fino)', url: 'https://arxiv.org/abs/1902.11196' },
  ],
  hints: {
    'dist': 'A qué distancia está la cámara, en radios de Schwarzschild.',
    'incl': 'Altura de la cámara sobre el plano del disco: de canto a casi desde arriba.',
    'orbit': 'Vueltas de la cámara por minuto.',
    'rout': 'Borde exterior del disco; el interior está en 3 r_s, la última órbita estable.',
    'disk': 'Con 0 no hay disco y sólo se ve la lente sobre el fondo.',
    'bg': 'Rejilla: meridianos y paralelos del cielo, para ver cómo se deforma.',
    'spin': 'Velocidad (y sentido) del giro del disco; dentro gira más rápido, como en una órbita de Kepler.',
  },
  presets: {
    'disco': 'El disco casi de canto: su cara de atrás se ve doblada por encima y por debajo de la sombra.',
    'rejilla': 'Sin disco: los meridianos del cielo se doblan en anillos alrededor de la sombra.',
    'canto': 'El disco exactamente de lado, como una línea, y su imagen doblada formando un anillo.',
  },
};
