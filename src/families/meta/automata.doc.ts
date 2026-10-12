import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Celdas vivas o muertas que siguen una regla de vecindad: el Juego de la vida y sus parientes.',
  mechanism: 'Cada generación, una celda muerta nace si tiene tantas vecinas vivas como pide la regla (B) y una viva sobrevive si su número está en S; si no, muere. Con más de dos estados, la celda tarda varias generaciones en morir y deja un rastro que se apaga. La renovación echa celdas al azar de vez en cuando: gotas sueltas («Lluvia») o una franja que avanza («Banda») y tras la que la regla vuelve a construir.',
  time: 'Evoluciona por generaciones con memoria. Sin renovación casi todas las reglas acaban quietas o casi vacías: la Vida se apaga en islas y osciladores, el laberinto se termina, Día y noche se redondea en continentes casi inmóviles (y con bordes cerrados se extingue; sembrado al azar, en un campo pequeño uno de los dos lados puede comérselo todo: con el «Mapa de continentes» la tierra es siempre la mitad, y en unos minutos los continentes se juntan en dos grandes masas) y el Cerebro puede apagarse en un campo pequeño; es una construcción para mirarla crecer. Con «Lluvia» o «Banda» es continua: siempre hay algo naciendo o rehaciéndose. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
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
    'density': 'Parte de las celdas que empiezan vivas (y de las que siembra la renovación).',
    'seedShape': 'Todo el campo, un cuadro en el centro, un dibujo con dos espejos que la regla conserva, o un mapa: manchas que al otro lado del toro son su negativo (con Día y noche, la tierra es siempre la mitad).',
    'edges': 'Continuos: lo que sale por un lado entra por el otro.',
    'speed': 'Generaciones por segundo.',
    'trail': 'Rastro que dejan las celdas al morir.',
    'renew': 'Lluvia: gotas de celdas al azar que despiertan el campo. Banda: un frente que cruza el campo y deja que la regla lo rehaga.',
    'renewRate': 'Cuántas gotas caen o lo deprisa que avanza la banda.',
  },
  presets: {
    'vida': 'El Juego de la vida de Conway: una sopa que se apaga en islas, osciladores y planeadores.',
    'cerebro': 'Tres estados: cada celda se enciende, se apaga y descansa; chispas que viajan y una lluvia leve que las vuelve a encender.',
    'diaynoche': 'Lo vivo y lo muerto siguen la misma regla: un mapa cuya tierra es siempre la mitad del campo (al otro lado del toro es su negativo), con costas que se pulen y continentes que se redondean y se juntan despacio.',
    'pasadizos': 'Desde el centro crece un laberinto de pasillos de una celda hasta ocupar el campo y quedarse quieto.',
    'pasillos': 'Un laberinto de pasillos que un frente vertical cruza sin parar: tras él, la regla vuelve a trazar los pasillos de otra forma.',
    'vida_lluvia': 'La Vida de Conway con gotas de celdas al azar: cada una despierta una explosión que se calma en islas y planeadores.',
  },
};
