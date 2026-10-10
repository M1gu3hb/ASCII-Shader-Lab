import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Mandelbulb y Mandelbox: volúmenes fractales recorridos con una cámara.',
  mechanism: 'Cada celda lanza un rayo que avanza según una estimación de la distancia al fractal (ray marching). El Mandelbulb eleva un punto 3D a una potencia en coordenadas esféricas; el Mandelbox lo pliega y escala.',
  time: 'Una función del tiempo: la cámara gira y la potencia puede respirar. Admite bucle perfecto.',
  limits: 'Hasta 96 pasos de rayo por celda (sólo dentro de la esfera que lo contiene) y 12 iteraciones del fractal; sombra suave de 12 pasos.',
  sources: [
    { label: '4rknova: Mandelbulb, implementación y explicación', url: 'https://www.4rknova.com/blog/2025/09/01/mandelbulb' },
    { label: 'Artículo sobre fractales 3D por estimación de distancia', url: 'https://arxiv.org/abs/2102.01747' },
  ],
  hints: {
    'power': 'Mandelbulb: número de lóbulos. Mandelbox: escala del plegado (de 2 a 3).',
    'iters': 'Detalle de la superficie.',
    'cut': 'Un plano que abre el volumen para ver dentro.',
    'orbit': 'Vueltas de la cámara por minuto ×10.',
    'dist': 'Cerca para entrar en el detalle.',
    'breathe': 'La potencia oscila con el tiempo.',
    'light': 'Ángulo de la luz: de frente a rasante.',
  },
  presets: {
    'bulbo': 'El Mandelbulb de potencia 8 visto entero.',
    'corte': 'Un plano abre el volumen y deja ver sus cavidades.',
    'caja': 'El Mandelbox: arquitectura de pliegues cúbicos.',
  },
};
