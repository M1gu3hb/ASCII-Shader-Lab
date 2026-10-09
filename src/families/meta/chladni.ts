import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'chladni',
  name: 'Chladni y cimática',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Arena sobre una placa que vibra: se junta en las líneas que no se mueven y dibuja figuras de Chladni.',
  mechanism: 'La placa vibra en uno de sus modos de onda estacionaria (en la cuadrada, sumas de cosenos; en la circular, funciones de Bessel con el borde libre). Cada grano salta al azar con un paso proporcional a lo que se mueve la placa donde está: rebota en los vientres y se queda quieto en los nodos, así que la arena acaba dibujando las líneas nodales.',
  time: 'Evoluciona con memoria: la arena se mueve grano a grano y tarda en reunirse; al cambiar de modo, migra hacia las nuevas líneas. No escucha sonido ni mide nada: la secuencia de modos sale de la semilla. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'plate', label: 'Forma de placa', type: 'choice', def: 'cuadrada', options: [{ id: 'cuadrada', label: 'Cuadrada' }, { id: 'circular', label: 'Circular' }] },
    { key: 'n', label: 'Modo n', type: 'int', min: 0, max: 10, def: 3, hint: 'Cuadrada: ondas en un eje. Circular: número de diámetros nodales.' },
    { key: 'm', label: 'Modo m', type: 'int', min: 1, max: 10, def: 5, hint: 'Cuadrada: ondas en el otro eje. Circular: orden radial (más m, más anillos nodales).' },
    { key: 'mix', label: 'Mezcla', type: 'number', min: -1, max: 1, def: -1, step: 0.01, hint: 'Cuadrada: −1, figuras antisimétricas; +1, simétricas. Circular: añade el modo de anillos.' },
    { key: 'seq', label: 'Secuencia', type: 'choice', def: 'fijo', options: [
      { id: 'fijo', label: 'Modo fijo' }, { id: 'lento', label: 'Ciclo lento' }, { id: 'rapido', label: 'Ciclo rápido' },
    ], hint: 'Cambia de modo cada pocos segundos, con un paso suave entre ellos.' },
    { key: 'count', label: 'Partículas', type: 'int', min: 2000, max: 40000, def: 5000, rebuild: true, hint: 'Granos de arena.' },
    { key: 'agit', label: 'Agitación', type: 'number', min: 0.1, max: 2.5, def: 1, step: 0.01, hint: 'Tamaño de los saltos: más, la arena se reúne antes y queda más suelta.' },
    { key: 'persist', label: 'Persistencia', type: 'number', min: 0, max: 0.97, def: 0.85, step: 0.01, hint: 'Cuánto tarda en borrarse el rastro de los granos.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'arena', options: [
      { id: 'arena', label: 'Arena' }, { id: 'campo', label: 'Líneas nodales' }, { id: 'ambos', label: 'Arena y líneas' },
    ] },
  ],
  presets: [
    { id: 'placa', name: 'Placa resonante', desc: 'Una placa cuadrada en un modo fijo: la arena traza su figura y la sostiene.', params: { plate: 'cuadrada', n: 3, m: 5, mix: -1, seq: 'fijo', count: 20000, agit: 1, persist: 0.85, view: 'arena' }, look: { stops: ['#0c0a07', '#f2e2c0'], bg: '#060504', charset: ' .:-=+*#%@' } },
    { id: 'flor', name: 'Flor nodal', desc: 'Una placa circular: diámetros y anillos nodales como pétalos.', params: { plate: 'circular', n: 4, m: 3, mix: -1, seq: 'fijo', count: 20000, agit: 1.1, persist: 0.88, view: 'ambos' }, look: { stops: ['#0a0612', '#e8c8ff'], bg: '#05030a', charset: ' .·:+*#' } },
    { id: 'musical', name: 'Arena musical', desc: 'Los modos cambian cada pocos segundos y la arena corre a dibujar la figura siguiente.', params: { plate: 'cuadrada', n: 2, m: 7, mix: -1, seq: 'rapido', count: 24000, agit: 1.6, persist: 0.75, view: 'arena' }, look: { stops: ['#04100f', '#bff7ec'], bg: '#020807', charset: ' .`:;+=#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'golpe', label: 'Golpe', hint: 'Esparce la arena donde tocas.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 60, limits: 'Hasta 40 000 granos con un salto por paso; campos de modo en una rejilla de 128 × 128 (como mucho 8 en caché); un búfer de densidad de 2 × filas × filas.' },
  sources: [
    { label: 'Wikipedia: Ernst Chladni y sus figuras', url: 'https://es.wikipedia.org/wiki/Ernst_Chladni' },
    { label: 'Wikipedia: Cymatics', url: 'https://en.wikipedia.org/wiki/Cymatics' },
    { label: 'Paul Bourke: Chladni plate interference surfaces', url: 'https://paulbourke.net/geometry/chladni/' },
  ],
  wrap: 'clamp',
  figure: true,
};
