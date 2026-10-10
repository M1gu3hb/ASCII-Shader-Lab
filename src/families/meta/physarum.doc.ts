import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Miles de agentes que siguen su propio rastro y tejen venas, redes y membranas.',
  mechanism: 'Modelo de Jeff Jones del moho mucilaginoso: cada agente mira con tres sensores hacia delante, gira hacia donde hay más rastro y avanza si la celda está libre, dejando más rastro. El rastro se difunde y se evapora, así que los caminos usados se refuerzan y los demás se borran: la red sale de esa realimentación.',
  time: 'Evoluciona con memoria: la red se reorganiza sin parar a partir de lo que hubo antes. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 60 000 agentes (posición y rumbo en coma flotante) y un mapa de rastro de 2 × filas columnas con doble búfer; tres lecturas por agente y paso.',
  sources: [
    { label: 'Jones (2010): Characteristics of pattern formation and evolution in approximations of Physarum transport networks', url: 'https://doi.org/10.1162/artl.2010.16.2.16202' },
    { label: 'Sage Jenson: Physarum', url: 'https://cargocollective.com/sagejenson/physarum' },
  ],
  hints: {
    'sensorAngle': 'Apertura de los sensores laterales: cerrada forma celdas cerradas; abierta, venas sueltas y sinuosas.',
    'sensorDist': 'Lo lejos que mira cada agente: más alcance, mallas más grandes.',
    'turn': 'Cuánto gira un agente en cada paso hacia el rastro.',
    'stepSize': 'Lo que avanza cada agente por paso.',
    'density': 'Agentes por cada cien celdas (hasta 60 000). Cada celda admite un solo agente.',
    'deposit': 'Rastro que deja cada agente: más depósito, venas más anchas y brillantes.',
    'decay': 'Parte del rastro que se pierde en cada paso: poca evaporación deja caminos largos y estables.',
    'diffuse': 'Cuánto se reparte el rastro con sus vecinas: más difusión, venas más suaves.',
    'layout': 'Dónde empiezan los agentes.',
  },
  presets: {
    'venacion': 'Un disco de agentes que se recoge en un nudo central y extiende venas que se ramifican y se unen.',
    'membrana': 'Celdas cerradas como una espuma de paredes brillantes que se reacomoda.',
    'red': 'Pocos agentes que miran lejos y tienden hilos largos entre grandes celdas vacías.',
    'meandros': 'Venas finas y sinuosas con puntas sueltas, como un laberinto que no se cierra.',
  },
};
