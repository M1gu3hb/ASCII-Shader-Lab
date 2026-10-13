import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un cristal de glifos que un frente funde en corrientes y que vuelve a ordenarse en su red, una y otra vez.',
  mechanism: 'Partículas con su sitio en una red cuadrada o hexagonal y un estado de fusión que se acerca al calor del frente en su sitio. Ordenadas, un muelle amortiguado las devuelve a su sitio con un leve temblor térmico; fundidas, las arrastra un flujo sin divergencia (el rotacional 2D de un ruido de gradiente que cambia en el tiempo y corre paralelo a las paredes), integrado con paso de punto medio para que no se amontonen. El brillo sale de la velocidad (cristal frío y tenue, flujo caliente y brillante) y los enlaces entre vecinos ordenados y cercanos dibujan la red: se rompen al fundirse y se cierran al recristalizar.',
  time: 'Continuo: el frente recorre su ciclo sin parar y el flujo fundido no se repite, así que cada ciclo deja la red de otra manera mientras vuelve a su sitio. No tiene bucle perfecto. Calentamiento de 1 s; se puede guardar su estado.',
  limits: 'Hasta 4096 sitios de red (con la separación mínima, unos 66 × 38 en hexagonal), dos evaluaciones de ruido por partícula fundida y paso, velocidad limitada a 3 alturas por segundo. Sólo luminancia: la paleta de la pieza pone el color.',
  sources: [
    { label: 'Radiant · Phase Transition (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Bridson, Hourihan y Nordenstam (2007): Curl-Noise for Procedural Fluid Flow (flujo sin divergencia y paredes)', url: 'https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf' },
  ],
  hints: {
    lattice: 'La forma del cristal: cuadrícula o panal.',
    spacing: 'Distancia entre sitios de la red: más pequeña, más partículas y una trama más fina.',
    front: 'Cómo avanza el calor: un frente que va y vuelve, un cristal que crece desde el centro y se funde hacia él, o una banda caliente que cruza.',
    period: 'Segundos que dura un ciclo completo de fusión y cristalización.',
    angle: 'Dirección en la que avanza el frente o la onda.',
    width: 'Lo ancha que es la zona de transición (o la banda caliente).',
    turb: 'Velocidad del flujo fundido.',
    stiff: 'Fuerza con la que el cristal devuelve cada partícula a su sitio.',
    jitter: 'Temblor térmico del cristal ordenado.',
    bonds: 'Brillo de los enlaces de la red entre vecinos ordenados.',
    glow: 'Cuánto brillan las partículas por su velocidad.',
  },
  presets: {
    fusion: 'Una red cuadrada que un frente recto funde de izquierda a derecha y vuelve a ordenar de vuelta.',
    radial: 'Un panal que cristaliza desde el centro hacia fuera y se funde de nuevo hacia el centro.',
    onda: 'Una banda caliente en diagonal cruza una red cuadrada fina y la deja entera detrás.',
  },
};
