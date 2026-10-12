import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Piezas que sólo encajan si sus bordes coinciden: placas de circuitos, planos de planta y acueductos que se construyen solos, tablero a tablero o sin fin.',
  mechanism: 'Generación por restricciones (Wave Function Collapse, modelo de piezas): cada casilla empieza pudiendo ser cualquier pieza. Se decide la más restringida, al azar según el peso de cada pieza, y se descartan en las vecinas las piezas cuyos bordes ya no encajan, en cadena. Es un algoritmo de restricciones: no simula nada cuántico. «Avanza sin fin» desliza la vista y decide cada columna que entra con las restricciones de la anterior; «Se rehace por zonas» disuelve una mancha del tablero y la vuelve a decidir con lo que la rodea.',
  time: '«Tablero a tablero» es una construcción: se construye casilla a casilla, al terminar espera unos segundos y se reconstruye con la siguiente variante de la semilla (una reconstrucción, no un bucle). «Avanza sin fin» y «Se rehace por zonas» son continuos: empiezan con el tablero completo y no esperan ni empiezan de nuevo; las contradicciones se reparan en su sitio.',
  limits: 'Hasta 28 × 57 casillas con hasta 64 piezas (onda y soportes: 5 bytes por casilla y pieza); 6 reparaciones locales y 3 reinicios por tablero en «Tablero a tablero»; en los modos continuos, reparaciones de hasta 6 casillas de radio.',
  sources: [
    { label: 'Maxim Gumin: WaveFunctionCollapse (modelo de piezas)', url: 'https://github.com/mxgmn/WaveFunctionCollapse' },
    { label: 'Karth y Smith (2017): WaveFunctionCollapse is Constraint Solving in the Wild', url: 'https://doi.org/10.1145/3102071.3110566' },
  ],
  hints: {
    'rows': 'Tamaño de pieza: más piezas, más pequeñas.',
    'density': 'Peso de las piezas vacías frente a las que llevan trazos o muros.',
    'pace': 'Casillas que se deciden por segundo (al avanzar, las que entran se deciden a su paso).',
    'hold': 'Tiempo que se muestra terminada antes de reconstruirse; por zonas, segundos entre una zona y la siguiente.',
    'edges': 'Vacíos: nada sale del marco (en el acueducto, cielo arriba y tierra abajo; al avanzar, sólo arriba y abajo).',
    'flow': 'Tablero a tablero (construye, espera y empieza otro), avanza sin fin hacia la izquierda o se rehace por zonas.',
    'drift': 'Sólo al avanzar: columnas de piezas que entran por segundo.',
  },
  presets: {
    'placa': 'Pistas, vías y chips que se conectan sin dejar cabos sueltos en el marco.',
    'plano': 'Habitaciones, puertas, ventanas y patios que se cierran sobre sí mismos.',
    'acueducto': 'Vista lateral con gravedad: arcadas sobre pilares que tienen que llegar al suelo.',
    'laberinto': 'Muros pequeños y muy densos que salen del marco, sólo en líneas: un laberinto de calles.',
    'onda': 'El mapa de entropía mientras se construye: lo indeciso brilla más cuanto menos opciones le quedan.',
    'placa_sin_fin': 'Una placa de circuitos que se desliza sin fin: las pistas nuevas se deciden al entrar por la derecha.',
    'viaducto': 'Un paisaje lateral en marcha: arcadas a varios niveles sobre pilares que siempre llegan al suelo.',
    'ciudad_viva': 'Un plano de planta denso que nunca está quieto: manchas que se apagan y se vuelven a construir desde su centro.',
  },
};
