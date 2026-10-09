import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'physarum',
  name: 'Physarum',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Miles de agentes que siguen su propio rastro y tejen venas, redes y membranas.',
  mechanism: 'Modelo de Jeff Jones del moho mucilaginoso: cada agente mira con tres sensores hacia delante, gira hacia donde hay más rastro y avanza si la celda está libre, dejando más rastro. El rastro se difunde y se evapora, así que los caminos usados se refuerzan y los demás se borran: la red sale de esa realimentación.',
  time: 'Evoluciona con memoria: la red se reorganiza sin parar a partir de lo que hubo antes. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'sensorAngle', label: 'Ángulo de los sensores', type: 'number', min: 5, max: 90, def: 22.5, step: 0.5, unit: '°', hint: 'Apertura de los sensores laterales: cerrada forma celdas cerradas; abierta, venas sueltas y sinuosas.' },
    { key: 'sensorDist', label: 'Alcance', type: 'number', min: 1, max: 20, def: 5, step: 0.5, unit: 'celdas', hint: 'Lo lejos que mira cada agente: más alcance, mallas más grandes.' },
    { key: 'turn', label: 'Giro', type: 'number', min: 5, max: 90, def: 45, step: 0.5, unit: '°', hint: 'Cuánto gira un agente en cada paso hacia el rastro.' },
    { key: 'stepSize', label: 'Paso', type: 'number', min: 0.3, max: 3, def: 1, step: 0.05, unit: 'celdas', hint: 'Lo que avanza cada agente por paso.' },
    { key: 'density', label: 'Población', type: 'number', min: 2, max: 50, def: 6, step: 0.5, unit: '%', rebuild: true, hint: 'Agentes por cada cien celdas (hasta 60 000). Cada celda admite un solo agente.' },
    { key: 'deposit', label: 'Depósito', type: 'number', min: 0.2, max: 4, def: 1, step: 0.05, hint: 'Rastro que deja cada agente: más depósito, venas más anchas y brillantes.' },
    { key: 'decay', label: 'Evaporación', type: 'number', min: 0.01, max: 0.4, def: 0.1, step: 0.005, digits: 3, hint: 'Parte del rastro que se pierde en cada paso: poca evaporación deja caminos largos y estables.' },
    { key: 'diffuse', label: 'Difusión', type: 'number', min: 0, max: 1, def: 1, step: 0.01, hint: 'Cuánto se reparte el rastro con sus vecinas: más difusión, venas más suaves.' },
    { key: 'layout', label: 'Inicio', type: 'choice', def: 'disco', rebuild: true, options: [
      { id: 'disco', label: 'Disco' }, { id: 'centro', label: 'Centro' }, { id: 'anillo', label: 'Anillo' }, { id: 'aleatorio', label: 'Aleatorio' },
    ], hint: 'Dónde empiezan los agentes.' },
  ],
  presets: [
    { id: 'venacion', name: 'Venación', desc: 'Un disco de agentes que se recoge en un nudo central y extiende venas que se ramifican y se unen.', params: { sensorAngle: 22.5, sensorDist: 5, turn: 45, stepSize: 1, density: 6, deposit: 1, decay: 0.1, diffuse: 1, layout: 'disco' }, look: { stops: ['#0b0e06', '#e8f2a0'], bg: '#060804', charset: ' .:-=+*#%@' } },
    { id: 'membrana', name: 'Membrana', desc: 'Celdas cerradas como una espuma de paredes brillantes que se reacomoda.', params: { sensorAngle: 10, sensorDist: 4, turn: 60, stepSize: 1, density: 20, deposit: 1, decay: 0.1, diffuse: 1, layout: 'aleatorio' }, look: { stops: ['#120608', '#ffb8a8'], bg: '#090304', charset: ' .·:oO@' } },
    { id: 'red', name: 'Red eléctrica', desc: 'Pocos agentes que miran lejos y tienden hilos largos entre grandes celdas vacías.', params: { sensorAngle: 20, sensorDist: 12, turn: 40, stepSize: 2, density: 4, deposit: 1.5, decay: 0.04, diffuse: 0.4, layout: 'aleatorio' }, look: { stops: ['#04081a', '#9fd8ff'], bg: '#020410', charset: ' .-:=+#' } },
    { id: 'meandros', name: 'Meandros', desc: 'Venas finas y sinuosas con puntas sueltas, como un laberinto que no se cierra.', params: { sensorAngle: 45, sensorDist: 3, turn: 45, stepSize: 0.7, density: 5, deposit: 1, decay: 0.1, diffuse: 1, layout: 'aleatorio' }, look: { stops: ['#100a14', '#e2c4ff'], bg: '#08050a', charset: ' .:;+*#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [
      { id: 'atraer', label: 'Atraer', hint: 'Deja rastro donde tocas: los agentes acuden y la red se desvía hacia ahí.' },
      { id: 'dispersar', label: 'Dispersar', hint: 'Borra el rastro y empuja a los agentes fuera de la zona.' },
    ],
  },
  budget: { res: [48, 192, 96], rate: 50, warmup: 250, limits: 'Hasta 60 000 agentes (posición y rumbo en coma flotante) y un mapa de rastro de 2 × filas columnas con doble búfer; tres lecturas por agente y paso.' },
  sources: [
    { label: 'Jones (2010): Characteristics of pattern formation and evolution in approximations of Physarum transport networks', url: 'https://doi.org/10.1162/artl.2010.16.2.16202' },
    { label: 'Sage Jenson: Physarum', url: 'https://cargocollective.com/sagejenson/physarum' },
  ],
  wrap: 'repeat',
};
