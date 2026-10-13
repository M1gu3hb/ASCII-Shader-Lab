import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Volúmenes fractales que giran: un bulbo de lóbulos, una caja de pliegues y conchas que cambian de forma.',
  mechanism: 'Cada celda lanza un rayo que avanza según una estimación de la distancia al fractal (ray marching). El Mandelbulb eleva un punto 3D a una potencia en coordenadas esféricas; el Mandelbox lo pliega y escala; el conjunto de Julia cuaterniónico eleva al cuadrado un número de cuatro componentes y le suma una constante que se mece despacio. Las formas «lisas» y la Julia se sombrean para glifos: normales tomadas en un paso ancho, un borde de luz en la silueta y niebla con la distancia, para que se lean las formas grandes y no el grano.',
  time: 'Una función del tiempo. Sin respiración sólo gira la cámara y es un bucle exacto: 6 / giro segundos por vuelta («Bulbo abierto», 50 s), y el Mandelbox, igual por los cuatro lados, cada cuarto de vuelta («Caja plegada», 10 s). Con respiración es continuo: la forma late (la potencia del bulbo, la constante de la Julia) a otro ritmo que la cámara y no vuelven a coincidir.',
  limits: 'Hasta 96 pasos de rayo por celda (sólo dentro de la esfera que lo contiene) y 12 iteraciones del fractal; sombra suave de 12 pasos.',
  sources: [
    { label: '4rknova: Mandelbulb, implementación y explicación', url: 'https://www.4rknova.com/blog/2025/09/01/mandelbulb' },
    { label: 'Artículo sobre fractales 3D por estimación de distancia', url: 'https://arxiv.org/abs/2102.01747' },
    { label: 'Hart, Sandin y Kauffman (1989): Ray tracing deterministic 3-D fractals (Julia cuaterniónicos)', url: 'https://doi.org/10.1145/74334.74363' },
  ],
  hints: {
    'form': 'Mandelbulb, Mandelbox, Julia cuaterniónica, o el bulbo y la caja «lisos»: sombreados para leerse con glifos.',
    'power': 'Mandelbulb: número de lóbulos. Mandelbox: escala del plegado (de 2 a 3). Julia: la forma de la concha.',
    'iters': 'Detalle de la superficie.',
    'cut': 'Un plano que abre el volumen para ver dentro.',
    'orbit': 'Vueltas de la cámara por minuto ×10.',
    'dist': 'Cerca para entrar en el detalle.',
    'breathe': 'La forma late con el tiempo (0: sólo gira, un bucle exacto).',
    'light': 'Ángulo de la luz: de frente a rasante.',
  },
  presets: {
    'bulbo': 'El Mandelbulb de potencia 8, de lóbulos grandes y borde iluminado, que late mientras gira.',
    'corte': 'Un plano abre el bulbo y deja ver sus cavidades; vuelve a su sitio cada 50 s.',
    'caja': 'El Mandelbox: una caja maciza grabada de pliegues que gira y se repite cada 10 s.',
    'concha': 'Una concha de anillos que se retuerce y cambia de forma sin repetirse.',
    'partida': 'Una concha más redonda, partida por un plano, que se abre y se cierra mientras gira al revés.',
  },
};
