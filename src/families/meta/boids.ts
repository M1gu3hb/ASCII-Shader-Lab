import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'boids',
  name: 'Bandadas (boids)',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Cientos de agentes que se separan, se alinean y se juntan: bandadas, cardúmenes y grupos sueltos.',
  mechanism: 'Modelo de Reynolds: cada agente sólo mira a sus vecinos cercanos y combina tres reglas (separarse de los muy próximos, copiar su rumbo, ir hacia su centro). Nadie dirige: la bandada sale de esas reglas locales. Los depredadores persiguen al más cercano y la bandada huye de ellos.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  extends: 'cardumen_luz',
  params: [
    { key: 'count', label: 'Cantidad', type: 'int', min: 100, max: 3000, def: 400, rebuild: true, hint: 'Número de agentes.' },
    { key: 'vision', label: 'Radio de visión', type: 'number', min: 0.03, max: 0.2, def: 0.08, step: 0.005, digits: 3, hint: 'Hasta dónde ve cada agente a sus vecinos (en alturas del lienzo).' },
    { key: 'sep', label: 'Radio de separación', type: 'number', min: 0.005, max: 0.08, def: 0.03, step: 0.001, digits: 3, hint: 'Distancia por debajo de la cual se apartan.' },
    { key: 'wSep', label: 'Separación', type: 'number', min: 0, max: 4, def: 1.5, step: 0.05, hint: 'Peso de la regla que evita chocar.' },
    { key: 'wAli', label: 'Alineación', type: 'number', min: 0, max: 4, def: 1.5, step: 0.05, hint: 'Peso de la regla que copia el rumbo de los vecinos.' },
    { key: 'wCoh', label: 'Cohesión', type: 'number', min: 0, max: 4, def: 1, step: 0.05, hint: 'Peso de la regla que acerca al centro del grupo.' },
    { key: 'speed', label: 'Velocidad máxima', type: 'number', min: 0.05, max: 0.6, def: 0.3, step: 0.01, unit: 'alto/s', hint: 'Alturas del lienzo por segundo.' },
    { key: 'force', label: 'Agilidad', type: 'number', min: 0.2, max: 3, def: 1, step: 0.05, advanced: true, hint: 'Fuerza máxima de giro: poca, curvas amplias; mucha, giros bruscos.' },
    { key: 'predators', label: 'Depredadores', type: 'int', min: 0, max: 6, def: 0, hint: 'Persiguen al agente más cercano; la bandada huye.' },
    { key: 'obstacles', label: 'Obstáculos', type: 'int', min: 0, max: 6, def: 0, hint: 'Rocas circulares que la bandada rodea (su sitio sale de la semilla).' },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01, hint: 'Cuánto dura el rastro que deja cada agente.' },
  ],
  presets: [
    { id: 'murmuracion', name: 'Murmuración', desc: 'Una bandada enorme y muy alineada que se curva en eses y remolinos; un halcón le abre huecos.', params: { count: 1500, vision: 0.1, sep: 0.03, wSep: 1.5, wAli: 2.2, wCoh: 1, speed: 0.32, force: 1, predators: 1, obstacles: 0, trail: 0.35 }, look: { stops: ['#0a0c12', '#dfe6f2'], bg: '#05060a', charset: ' .`\'-~=+*#' } },
    { id: 'cardumen', name: 'Cardumen', desc: 'Bancos alargados y apretados que se parten y se cierran para esquivar a tres depredadores entre rocas.', params: { count: 1000, vision: 0.07, sep: 0.028, wSep: 1.8, wAli: 1.8, wCoh: 1.2, speed: 0.26, force: 1.6, predators: 3, obstacles: 2, trail: 0.2 }, look: { stops: ['#03121a', '#8fe3ff'], bg: '#020a0f', charset: ' .:-=+<>#' } },
    { id: 'dispersion', name: 'Dispersión', desc: 'Poca cohesión: muchos grupos pequeños que se cruzan y se deshacen.', params: { count: 800, vision: 0.045, sep: 0.025, wSep: 1, wAli: 1, wCoh: 0.35, speed: 0.2, force: 0.8, predators: 0, obstacles: 4, trail: 0.5 }, look: { stops: ['#120d06', '#f2cf8a'], bg: '#090603', charset: ' .,:;!|' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'espantar', label: 'Espantar', hint: 'Los agentes huyen de donde tocas, como de un depredador.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 45, limits: 'Hasta 3000 agentes, 6 depredadores y 6 obstáculos; vecinos por rejilla uniforme, como mucho 80 candidatos por agente y paso; un búfer de estela de 2 × filas × filas.' },
  sources: [
    { label: 'Craig Reynolds (1987): Flocks, Herds, and Schools', url: 'https://www.red3d.com/cwr/papers/1987/boids.html' },
    { label: 'Craig Reynolds: Boids', url: 'https://www.red3d.com/cwr/boids/' },
    { label: 'Craig Reynolds (1999): Steering Behaviors For Autonomous Characters', url: 'https://www.red3d.com/cwr/steer/gdc99/' },
  ],
  wrap: 'repeat',
};
