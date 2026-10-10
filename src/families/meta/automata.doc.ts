import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Celdas vivas o muertas que siguen una regla de vecindad: el Juego de la vida y sus parientes.',
  mechanism: 'Cada generación, una celda muerta nace si tiene tantas vecinas vivas como pide la regla (B) y una viva sobrevive si su número está en S; si no, muere. Con más de dos estados, la celda tarda varias generaciones en morir y deja un rastro que se apaga.',
  time: 'Evoluciona por generaciones con memoria: cada una sale de la anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de 2 × filas columnas con un estado y una edad por celda (2 bytes); hasta 30 generaciones por segundo y 16 estados.',
  sources: [
    { label: 'Gardner (1970): The fantastic combinations of John Conway\'s new solitaire game «life»', url: 'https://web.stanford.edu/class/sts145/Library/life.pdf' },
    { label: 'LifeWiki: Life-like cellular automaton', url: 'https://conwaylife.com/wiki/Life-like_cellular_automaton' },
    { label: 'LifeWiki: Generations', url: 'https://conwaylife.com/wiki/Generations' },
  ],
  hints: {
    'rule': 'B: vecinas con las que nace una celda; S: con las que sobrevive; un tercer número da los estados.',
    'custom': 'Sólo con «Regla propia». Ejemplos: B36/S23, B2/S/3, B2/S345/4.',
    'neigh': 'Ocho: también las diagonales (Moore). Cuatro: sólo los lados (von Neumann).',
    'density': 'Parte de las celdas que empiezan vivas.',
    'seedShape': 'Todo el campo, un cuadro en el centro o un dibujo con dos espejos que la regla conserva.',
    'edges': 'Continuos: lo que sale por un lado entra por el otro.',
    'speed': 'Generaciones por segundo.',
    'trail': 'Rastro que dejan las celdas al morir.',
  },
  presets: {
    'vida': 'El Juego de la vida de Conway: una sopa que se apaga en islas, osciladores y planeadores.',
    'cerebro': 'Tres estados: cada celda se enciende, se apaga y descansa; chispas que viajan y nunca se calman.',
    'diaynoche': 'Lo vivo y lo muerto siguen la misma regla: continentes que se redondean y lagos que se cierran.',
    'pasadizos': 'Desde el centro crece un laberinto de pasillos de una celda hasta ocupar el campo.',
  },
};
