import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Piezas que sólo encajan si sus bordes coinciden: placas de circuitos, planos de planta y acueductos que se construyen solos.',
  mechanism: 'Generación por restricciones (Wave Function Collapse, modelo de piezas): cada casilla empieza pudiendo ser cualquier pieza. Se decide la más restringida, al azar según el peso de cada pieza, y se descartan en las vecinas las piezas cuyos bordes ya no encajan, en cadena. Es un algoritmo de restricciones: no simula nada cuántico.',
  time: 'Se construye casilla a casilla. Al terminar espera unos segundos y se reconstruye con la siguiente variante de la semilla: una reconstrucción, no un bucle.',
  limits: 'Hasta 28 × 56 casillas con hasta 64 piezas (onda y soportes: 5 bytes por casilla y pieza); 6 reparaciones locales y 3 reinicios por tablero.',
  sources: [
    { label: 'Maxim Gumin: WaveFunctionCollapse (modelo de piezas)', url: 'https://github.com/mxgmn/WaveFunctionCollapse' },
    { label: 'Karth y Smith (2017): WaveFunctionCollapse is Constraint Solving in the Wild', url: 'https://doi.org/10.1145/3102071.3110566' },
  ],
  hints: {
    'rows': 'Tamaño de pieza: más piezas, más pequeñas.',
    'density': 'Peso de las piezas vacías frente a las que llevan trazos o muros.',
    'pace': 'Casillas que se deciden por segundo.',
    'hold': 'Tiempo que se muestra terminada antes de reconstruirse.',
    'edges': 'Vacíos: nada sale del marco (en el acueducto, cielo arriba y tierra abajo).',
  },
  presets: {
    'placa': 'Pistas, vías y chips que se conectan sin dejar cabos sueltos en el marco.',
    'plano': 'Habitaciones, puertas, ventanas y patios que se cierran sobre sí mismos.',
    'acueducto': 'Vista lateral con gravedad: arcadas sobre pilares que tienen que llegar al suelo.',
    'laberinto': 'Muros pequeños y muy densos que salen del marco, sólo en líneas: un laberinto de calles.',
    'onda': 'El mapa de entropía mientras se construye: lo indeciso brilla más cuanto menos opciones le quedan.',
  },
};
