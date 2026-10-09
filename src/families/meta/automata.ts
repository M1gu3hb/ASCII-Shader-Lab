import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'automata',
  name: 'Autómatas celulares',
  group: 'vida',
  kind: 'simulation',
  version: 1,
  blurb: 'Celdas vivas o muertas que siguen una regla de vecindad: el Juego de la vida y sus parientes.',
  mechanism: 'Cada generación, una celda muerta nace si tiene tantas vecinas vivas como pide la regla (B) y una viva sobrevive si su número está en S; si no, muere. Con más de dos estados, la celda tarda varias generaciones en morir y deja un rastro que se apaga.',
  time: 'Evoluciona por generaciones con memoria: cada una sale de la anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  params: [
    { key: 'rule', label: 'Regla', type: 'choice', def: 'conway', options: [
      { id: 'conway', label: 'Vida de Conway (B3/S23)' }, { id: 'highlife', label: 'HighLife (B36/S23)' },
      { id: 'diaynoche', label: 'Día y noche (B3678/S34678)' }, { id: 'cerebro', label: 'Cerebro de Brian (B2/S/3)' },
      { id: 'starwars', label: 'Star Wars (B2/S345/4)' }, { id: 'coral', label: 'Coral (B3/S45678)' },
      { id: 'laberinto', label: 'Laberinto (B3/S12345)' }, { id: 'propia', label: 'Regla propia' },
    ], hint: 'B: vecinas con las que nace una celda; S: con las que sobrevive; un tercer número da los estados.' },
    { key: 'custom', label: 'Regla propia', type: 'text', def: 'B3/S23', max: 20, allowed: 'BSCbsc0123456789/', hint: 'Sólo con «Regla propia». Ejemplos: B36/S23, B2/S/3, B2/S345/4.', advanced: true },
    { key: 'neigh', label: 'Vecindad', type: 'choice', def: 'moore', options: [{ id: 'moore', label: 'Ocho vecinas' }, { id: 'vonneumann', label: 'Cuatro vecinas' }], hint: 'Ocho: también las diagonales (Moore). Cuatro: sólo los lados (von Neumann).' },
    { key: 'density', label: 'Densidad inicial', type: 'number', min: 0.02, max: 0.9, def: 0.3, step: 0.01, rebuild: true, hint: 'Parte de las celdas que empiezan vivas.' },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'aleatoria', rebuild: true, options: [
      { id: 'aleatoria', label: 'Aleatoria' }, { id: 'centro', label: 'Centro' }, { id: 'simetrica', label: 'Simétrica' },
    ], hint: 'Todo el campo, un cuadro en el centro o un dibujo con dos espejos que la regla conserva.' },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'toro', options: [{ id: 'toro', label: 'Continuos' }, { id: 'cerrado', label: 'Cerrados' }], hint: 'Continuos: lo que sale por un lado entra por el otro.' },
    { key: 'speed', label: 'Velocidad', type: 'int', min: 1, max: 30, def: 10, unit: 'gen/s', hint: 'Generaciones por segundo.' },
    { key: 'trail', label: 'Estela', type: 'choice', def: 'corta', options: [{ id: 'ninguna', label: 'Ninguna' }, { id: 'corta', label: 'Corta' }, { id: 'larga', label: 'Larga' }], hint: 'Rastro que dejan las celdas al morir.' },
  ],
  presets: [
    { id: 'vida', name: 'Vida clásica', desc: 'El Juego de la vida de Conway: una sopa que se apaga en islas, osciladores y planeadores.', params: { rule: 'conway', neigh: 'moore', density: 0.3, seedShape: 'aleatoria', edges: 'toro', speed: 10, trail: 'corta' }, look: { stops: ['#06100a', '#b8f5c0'], bg: '#030805', charset: ' .:+#@' } },
    { id: 'cerebro', name: 'Cerebro', desc: 'Tres estados: cada celda se enciende, se apaga y descansa; chispas que viajan y nunca se calman.', params: { rule: 'cerebro', neigh: 'moore', density: 0.2, seedShape: 'aleatoria', edges: 'toro', speed: 12, trail: 'corta' }, look: { stops: ['#0a0614', '#d6b8ff'], bg: '#05030a', charset: ' .-+*#' } },
    { id: 'diaynoche', name: 'Día y noche', desc: 'Lo vivo y lo muerto siguen la misma regla: continentes que se redondean y lagos que se cierran.', params: { rule: 'diaynoche', neigh: 'moore', density: 0.5, seedShape: 'aleatoria', edges: 'cerrado', speed: 10, trail: 'corta' }, look: { stops: ['#05080f', '#cfe0ff'], bg: '#020408', charset: ' .:=#' } },
    { id: 'pasadizos', name: 'Pasadizos', desc: 'Desde el centro crece un laberinto de pasillos de una celda hasta ocupar el campo.', params: { rule: 'laberinto', neigh: 'moore', density: 0.4, seedShape: 'centro', edges: 'cerrado', speed: 12, trail: 'ninguna' }, look: { stops: ['#0c0c06', '#f0f0b0'], bg: '#060603', charset: ' .|+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'dibujar', label: 'Dibujar', hint: 'Enciende celdas al azar donde tocas.' }, { id: 'borrar', label: 'Borrar', hint: 'Apaga las celdas de la zona.' }],
  },
  budget: { res: [32, 192, 64], rate: 30, warmup: 90, limits: 'Rejilla de 2 × filas columnas con un estado y una edad por celda (2 bytes); hasta 30 generaciones por segundo y 16 estados.' },
  sources: [
    { label: 'Gardner (1970): The fantastic combinations of John Conway\'s new solitaire game «life»', url: 'https://web.stanford.edu/class/sts145/Library/life.pdf' },
    { label: 'LifeWiki: Life-like cellular automaton', url: 'https://conwaylife.com/wiki/Life-like_cellular_automaton' },
    { label: 'LifeWiki: Generations', url: 'https://conwaylife.com/wiki/Generations' },
  ],
  wrap: 'repeat',
};
