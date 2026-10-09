import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'wfc',
  name: 'Arquitectura por restricciones',
  group: 'forma',
  kind: 'geometry',
  version: 1,
  blurb: 'Piezas que sólo encajan si sus bordes coinciden: placas de circuitos, planos de planta y acueductos que se construyen solos.',
  mechanism: 'Generación por restricciones (Wave Function Collapse, modelo de piezas): cada casilla empieza pudiendo ser cualquier pieza. Se decide la más restringida, al azar según el peso de cada pieza, y se descartan en las vecinas las piezas cuyos bordes ya no encajan, en cadena. Es un algoritmo de restricciones: no simula nada cuántico.',
  time: 'Se construye casilla a casilla. Al terminar espera unos segundos y se reconstruye con la siguiente variante de la semilla: una reconstrucción, no un bucle.',
  params: [
    { key: 'set', label: 'Juego de piezas', type: 'choice', def: 'circuitos', rebuild: true, options: [{ id: 'circuitos', label: 'Circuitos' }, { id: 'muros', label: 'Muros' }, { id: 'acueducto', label: 'Acueducto' }] },
    { key: 'rows', label: 'Piezas en vertical', type: 'int', min: 8, max: 28, def: 12, rebuild: true, hint: 'Tamaño de pieza: más piezas, más pequeñas.' },
    { key: 'density', label: 'Densidad', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Peso de las piezas vacías frente a las que llevan trazos o muros.' },
    { key: 'pace', label: 'Ritmo', type: 'number', min: 10, max: 600, def: 60, step: 1, unit: 'piezas/s', hint: 'Casillas que se deciden por segundo.' },
    { key: 'hold', label: 'Espera', type: 'number', min: 1, max: 30, def: 6, step: 0.5, unit: 's', hint: 'Tiempo que se muestra terminada antes de reconstruirse.' },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'vacios', rebuild: true, hint: 'Vacíos: nada sale del marco (en el acueducto, cielo arriba y tierra abajo).', options: [{ id: 'vacios', label: 'Vacíos' }, { id: 'libres', label: 'Libres' }] },
    { key: 'view', label: 'Vista', type: 'choice', def: 'piezas', options: [
      { id: 'piezas', label: 'Piezas' }, { id: 'lineas', label: 'Sólo líneas' }, { id: 'entropia', label: 'Mapa de entropía' },
    ] },
  ],
  presets: [
    { id: 'placa', name: 'Placa base', desc: 'Pistas, vías y chips que se conectan sin dejar cabos sueltos en el marco.', params: { set: 'circuitos', rows: 12, density: 0.55, pace: 60, hold: 6, edges: 'vacios', view: 'piezas' }, look: { stops: ['#03110a', '#9dffc4'], bg: '#010804', charset: ' .:-=+*#' } },
    { id: 'plano', name: 'Plano de planta', desc: 'Habitaciones, puertas, ventanas y patios que se cierran sobre sí mismos.', params: { set: 'muros', rows: 12, density: 0.45, pace: 45, hold: 8, edges: 'vacios', view: 'piezas' }, look: { stops: ['#0c0a08', '#f1e6d0'], bg: '#060504', charset: ' .:-=#' } },
    { id: 'acueducto', name: 'Acueducto', desc: 'Vista lateral con gravedad: arcadas sobre pilares que tienen que llegar al suelo.', params: { set: 'acueducto', rows: 12, density: 0.75, pace: 45, hold: 8, edges: 'vacios', view: 'piezas' }, look: { stops: ['#0d0905', '#ffd9a0'], bg: '#070402', charset: ' .:-=+#' } },
    { id: 'laberinto', name: 'Ciudad densa', desc: 'Muros pequeños y muy densos que salen del marco, sólo en líneas: un laberinto de calles.', params: { set: 'muros', rows: 22, density: 0.95, pace: 180, hold: 5, edges: 'libres', view: 'lineas' }, look: { stops: ['#0b0b12', '#c8d2ff'], bg: '#050509', charset: ' .-=+#' } },
    { id: 'onda', name: 'La onda que colapsa', desc: 'El mapa de entropía mientras se construye: lo indeciso brilla más cuanto menos opciones le quedan.', params: { set: 'circuitos', rows: 14, density: 0.7, pace: 30, hold: 4, edges: 'libres', view: 'entropia' }, look: { stops: ['#120612', '#ffc2f0'], bg: '#090309', charset: ' .·:+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 30, limits: 'Hasta 28 × 56 casillas con hasta 64 piezas (onda y soportes: 5 bytes por casilla y pieza); 6 reparaciones locales y 3 reinicios por tablero.' },
  sources: [
    { label: 'Maxim Gumin: WaveFunctionCollapse (modelo de piezas)', url: 'https://github.com/mxgmn/WaveFunctionCollapse' },
    { label: 'Karth y Smith (2017): WaveFunctionCollapse is Constraint Solving in the Wild', url: 'https://doi.org/10.1145/3102071.3110566' },
  ],
  wrap: 'clamp',
};
