import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cientos de agentes que se separan, se alinean y se juntan: bandadas, cardúmenes y grupos sueltos.',
  mechanism: 'Modelo de Reynolds: cada agente sólo mira a sus vecinos cercanos y combina tres reglas (separarse de los muy próximos, copiar su rumbo, ir hacia su centro). Nadie dirige: la bandada sale de esas reglas locales. Los depredadores persiguen al más cercano y la bandada huye de ellos.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Hasta 3000 agentes, 6 depredadores y 6 obstáculos; vecinos por rejilla uniforme, como mucho 80 candidatos por agente y paso; un búfer de estela de 2 × filas × filas.',
  sources: [
    { label: 'Craig Reynolds (1987): Flocks, Herds, and Schools', url: 'https://www.red3d.com/cwr/papers/1987/boids.html' },
    { label: 'Craig Reynolds: Boids', url: 'https://www.red3d.com/cwr/boids/' },
    { label: 'Craig Reynolds (1999): Steering Behaviors For Autonomous Characters', url: 'https://www.red3d.com/cwr/steer/gdc99/' },
  ],
  hints: {
    'count': 'Número de agentes.',
    'vision': 'Hasta dónde ve cada agente a sus vecinos (en alturas del lienzo).',
    'sep': 'Distancia por debajo de la cual se apartan.',
    'wSep': 'Peso de la regla que evita chocar.',
    'wAli': 'Peso de la regla que copia el rumbo de los vecinos.',
    'wCoh': 'Peso de la regla que acerca al centro del grupo.',
    'speed': 'Alturas del lienzo por segundo.',
    'force': 'Fuerza máxima de giro: poca, curvas amplias; mucha, giros bruscos.',
    'predators': 'Persiguen al agente más cercano; la bandada huye.',
    'obstacles': 'Rocas circulares que la bandada rodea (su sitio sale de la semilla).',
    'trail': 'Cuánto dura el rastro que deja cada agente.',
  },
  presets: {
    'murmuracion': 'Una bandada enorme y muy alineada que se curva en eses y remolinos; un halcón le abre huecos.',
    'cardumen': 'Bancos alargados y apretados que se parten y se cierran para esquivar a tres depredadores entre rocas.',
    'dispersion': 'Poca cohesión: muchos grupos pequeños que se cruzan y se deshacen.',
  },
};
