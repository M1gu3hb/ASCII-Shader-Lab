import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una esfera viva cuya piel sube y baja con un ruido que se retuerce, respira y cambia de color con el relieve.',
  mechanism: 'Es la esfera de «Jade vivo», pero su superficie se empuja a lo largo de la normal con un ruido 3D en lugar de ondas. El espacio del ruido se retuerce alrededor del eje vertical con un ángulo que ondula con la altura (a·sin(y·f + fase): la torsión), el radio respira, y el color sale de una paleta de cosenos (a + b·cos(2π(c·x + d))) indexada por el desplazamiento: crestas y valles toman colores distintos. «Los de la paleta» usa la paleta de la pieza. Se dibuja trazando la distancia con signo dentro de una esfera envolvente (como mucho 44 pasos), con una normal de cuatro muestras, luz difusa envolvente (el jade deja pasar la luz), un brillo de Phong y un borde de Fresnel.',
  time: 'Bucle exacto de «Ciclo» segundos: todo depende de la fase del ciclo dando vueltas enteras. Las dos octavas del ruido recorren círculos en el espacio del ruido (un ruido periódico en el tiempo), la onda de torsión y la respiración giran con la fase y la figura da «Giro» vueltas completas por ciclo.',
  limits: 'Como mucho 44 pasos por rayo dentro de la esfera envolvente; el desplazamiento no es una distancia exacta, así que el paso se acorta (0,6). Con mucho relieve y grano fino pueden faltar detalles en el borde. Es una figura: no llena el lienzo.',
  sources: [
    { label: 'Codrops WebGLBlobs · scripts/gl/shaders/vertex.glsl y fragment.glsl, de Mario Carrillo (MIT, «Copyright (c) 2009 - 2020 Codrops»; package.json dice ISC; referencia de la idea, no se copió código ni la fuente Typekit ni img/noise.png)', url: 'https://github.com/codrops/WebGLBlobs' },
    { label: 'ShaderGradient · src/shaders/defaults/sphere, de ruucm y stone-skipper (MIT según README y package.json, sin archivo LICENSE; referencia de la idea, no se copió código)', url: 'https://github.com/ruucm/shadergradient' },
    { label: 'Inigo Quilez · Palettes (paleta de cosenos a + b·cos(2π(c·t + d)))', url: 'https://iquilezles.org/articles/palettes/' },
  ],
  hints: {
    radius: 'Tamaño de la esfera.',
    amp: 'Cuánto sube y baja la piel con el ruido.',
    freq: 'Tamaño de los bultos: pocos y grandes o muchos y pequeños.',
    twist: 'Cuánto se retuerce el ruido alrededor del eje vertical.',
    twistF: 'Cuántas ondas de torsión hay de abajo arriba.',
    breath: 'Cuánto se hincha y se deshincha la esfera.',
    period: 'Duración del bucle: el ruido, la torsión y el giro vuelven a su inicio.',
    palette: 'Paleta de colores que recorre el relieve.',
    shift: 'Desplaza los colores a lo largo de la paleta.',
    spread: 'Cuánto cambia el color entre crestas y valles; a cero, un solo color.',
    spin: 'Vueltas que da la figura en cada ciclo.',
    shine: 'Brillo de la luz sobre la piel.',
  },
  presets: {
    jade: 'Una piedra de jade que respira despacio con una torsión suave y una vuelta por ciclo.',
    iris: 'Una burbuja iridiscente con mucho grano y torsión: el color cambia en cada bulto.',
    magma: 'Una esfera de lava muy deformada que late y no gira.',
    oceano: 'Una gota azul muy retorcida que da dos vueltas por ciclo.',
  },
};
