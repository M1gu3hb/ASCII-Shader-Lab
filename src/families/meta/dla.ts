import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'dla',
  name: 'Agregación (DLA)',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Partículas que vagan al azar y se pegan al tocar el agregado: dendritas, cristales y raíces.',
  mechanism: 'Agregación limitada por difusión (Witten y Sander): cada caminante da pasos al azar por una rejilla y, cuando queda junto al agregado, se pega con cierta probabilidad. Las puntas atrapan a casi todos los caminantes antes de que entren en los huecos, y por eso salen ramas.',
  time: 'Crece con memoria, partícula a partícula. Cuando llega al borde lejano o cubre un 35 % del campo deja de crecer y queda quieta. No repite un bucle.',
  params: [
    { key: 'seed', label: 'Semilla', type: 'choice', def: 'punto', rebuild: true, hint: 'Dónde empieza el agregado y de dónde llegan los caminantes.', options: [
      { id: 'punto', label: 'Punto' }, { id: 'suelo', label: 'Línea inferior' }, { id: 'techo', label: 'Línea superior' },
      { id: 'anillo', label: 'Círculo' }, { id: 'varios', label: 'Varios puntos' },
    ] },
    { key: 'stick', label: 'Adherencia', type: 'number', min: 0.03, max: 1, def: 0.9, step: 0.01, hint: 'Probabilidad de pegarse al tocar: baja, ramas gruesas y compactas; alta, finas.' },
    { key: 'bias', label: 'Deriva', type: 'number', min: 0, max: 1, def: 0.1, step: 0.01, hint: 'Cuánto empuja una corriente a los caminantes.' },
    { key: 'dir', label: 'Crece hacia', type: 'choice', def: 'fuera', hint: 'La corriente lleva a los caminantes en sentido contrario.', options: [
      { id: 'fuera', label: 'Fuera' }, { id: 'abajo', label: 'Abajo' }, { id: 'arriba', label: 'Arriba' },
      { id: 'izquierda', label: 'Izquierda' }, { id: 'derecha', label: 'Derecha' },
    ] },
    { key: 'walkers', label: 'Caminantes', type: 'int', min: 2, max: 400, def: 16, hint: 'Caminantes a la vez, cada uno con 24 movimientos por paso: la velocidad de crecimiento.' },
    { key: 'width', label: 'Grosor', type: 'number', min: 0, max: 3, def: 0.8, step: 0.05, unit: 'px', hint: 'Engrosa cada partícula al dibujarla.' },
    { key: 'age', label: 'Brillo por edad', type: 'choice', def: 'nuevas', options: [
      { id: 'nuevas', label: 'Puntas brillantes' }, { id: 'antiguas', label: 'Núcleo brillante' }, { id: 'plano', label: 'Uniforme' },
    ] },
  ],
  presets: [
    { id: 'cristal', name: 'Cristalización', desc: 'Un copo dendrítico desde un punto: ramas finas que se abren hacia los lados.', params: { seed: 'punto', stick: 1, bias: 0.06, dir: 'fuera', walkers: 12, width: 0.9, age: 'nuevas' }, look: { stops: ['#06101a', '#d8f1ff'], bg: '#03080d', charset: ' .:+*#' } },
    { id: 'coral', name: 'Arrecife', desc: 'Desde el suelo, con poca adherencia: ramas gruesas y apretadas que compiten por subir.', params: { seed: 'suelo', stick: 0.12, bias: 0, dir: 'arriba', walkers: 10, width: 1.1, age: 'antiguas' }, look: { stops: ['#140a08', '#ffc9a1'], bg: '#0a0504', charset: ' .,:;oO@' } },
    { id: 'raices', name: 'Raíces eléctricas', desc: 'Desde arriba, con una corriente leve: pocas descargas largas que bajan en zigzag.', params: { seed: 'techo', stick: 1, bias: 0.12, dir: 'abajo', walkers: 8, width: 0.7, age: 'plano' }, look: { stops: ['#05051a', '#c9c6ff'], bg: '#020210', charset: " .'`|/\\#" } },
    { id: 'corona', name: 'Corona', desc: 'Un anillo del que brotan rayos ramificados hacia fuera; el interior queda vacío.', params: { seed: 'anillo', stick: 0.7, bias: 0.05, dir: 'fuera', walkers: 12, width: 0.8, age: 'nuevas' }, look: { stops: ['#160b02', '#ffe2a8'], bg: '#0b0501', charset: ' .·:*#' } },
    { id: 'colonias', name: 'Colonias', desc: 'Varias semillas que crecen a la vez y se cierran el paso.', params: { seed: 'varios', stick: 0.5, bias: 0.15, dir: 'fuera', walkers: 10, width: 1, age: 'antiguas' }, look: { stops: ['#0c0f05', '#e6f59a'], bg: '#060802', charset: ' .:-=+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'semilla', label: 'Semilla', hint: 'Añade agregado donde tocas: una rama nueva que sigue creciendo desde ahí, aunque la agregación se hubiera detenido.' }],
  },
  budget: { res: [48, 160, 64], rate: 30, warmup: 90, limits: 'Rejilla de 2 × filas columnas (9 bytes por celda); hasta 400 caminantes con 24 movimientos cada uno por paso; se detiene al 35 % de celdas.' },
  sources: [
    { label: 'Witten y Sander (1981): Diffusion-Limited Aggregation', url: 'https://doi.org/10.1103/PhysRevLett.47.1400' },
    { label: 'Paul Bourke: DLA', url: 'https://paulbourke.net/fractals/dla/' },
    { label: 'Jason Webb: experimentos de DLA (sólo el algoritmo)', url: 'https://github.com/jasonwebb/2d-diffusion-limited-aggregation-experiments' },
  ],
  wrap: 'clamp',
};
