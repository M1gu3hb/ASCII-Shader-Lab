import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una sombra negra rodeada de un disco de luz doblado, y el cielo curvado detrás.',
  mechanism: 'Calculado: la trayectoria de la luz alrededor de un agujero negro sin giro (Schwarzschild), integrada paso a paso para cada celda; la luz que pasa demasiado cerca cae dentro y la que escapa lee el fondo en la dirección en que sale. Artístico: el brillo del disco, su textura y el refuerzo Doppler del lado que se acerca; no hay corrimiento al rojo ni transporte de radiación.',
  time: 'Una función del tiempo. Con el disco girando es continuo: cada anillo va a su ritmo (más rápido por dentro, como en una órbita de Kepler) y nada se repite; desde la versión 2, la diferencia de giro entre anillos sólo se acumula durante ciclos de 40 s (dos texturas que se relevan con un fundido), así que las vetas nunca se enrollan más que en 40 s y a los diez minutos el disco sigue leyéndose como vetas, no como grano (las piezas de la versión 1 siguen como eran: allí, en unos minutos, el disco se ve liso y con grano fino). Con la rotación del disco a 0 es un bucle: sólo se mueve la cámara, que vuelve a su sitio en 60 / órbita segundos (con la rejilla sola, cada 15° de vuelta: «Rejilla curvada», 10 s).',
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
    'spin': 'Velocidad (y sentido) del giro del disco; dentro gira más rápido, como en una órbita de Kepler. Con 0, un bucle de la cámara.',
  },
  presets: {
    'disco': 'El disco casi de canto, ancho como el cuadro: su cara de atrás se ve doblada por encima y por debajo de la sombra.',
    'rejilla': 'Sin disco: los meridianos del cielo se doblan en anillos alrededor de la sombra, en un bucle de 10 s.',
    'canto': 'El disco exactamente de lado, como una línea, y su imagen doblada formando un anillo sobre estrellas y rejilla.',
    'remolino': 'Desde arriba: el disco es un remolino de vetas alrededor del agujero, más brillante del lado que se acerca.',
    'cerca': 'Muy cerca: la sombra y el disco llenan el cuadro y las estrellas se arremolinan en el borde.',
  },
};
