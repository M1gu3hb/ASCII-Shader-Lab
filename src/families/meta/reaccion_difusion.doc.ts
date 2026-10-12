import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Dos sustancias que se difunden y reaccionan: manchas que se dividen, laberintos y coral que no paran de rehacerse.',
  mechanism: 'Modelo de Gray–Scott sobre una rejilla: la sustancia A se alimenta, B la consume y se elimina; ambas se difunden a ritmos distintos. Las formas salen del equilibrio entre alimentación y eliminación, no de un dibujo. Con un «Mapa vivo», la eliminación cambia de un sitio a otro y con el tiempo: donde sube, la forma se disuelve; donde baja, los frentes vecinos vuelven a crecer hacia el hueco. Con «Heridas», de vez en cuando se vacía un círculo y se siembra su centro.',
  time: 'Evoluciona con memoria: cada momento depende del anterior. Con el mapa «Uniforme» es una construcción: el coral, las manchas y el laberinto llenan el campo y se quedan quietos (el régimen caótico es la excepción). Con «Heridas», «Mareas», «Franjas» o «Isla» es continuo: se reorganiza sin fin y sin reinicios. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'La química se calcula siempre en una rejilla de 192 × 96 celdas con dos sustancias en coma flotante (16 bytes por celda con el doble búfer) y un laplaciano de 9 puntos, 600 pasos por segundo: las formas tienen el mismo tamaño y el mismo ritmo con cualquier número de filas, que sólo afina el dibujo. Las recetas hechas con la versión 1 conservan su rejilla de 2 × filas.',
  sources: [
    { label: 'Karl Sims: tutorial de reacción–difusión', url: 'https://www.karlsims.com/rd.html' },
    { label: 'Karl Sims: RD Tool', url: 'https://www.karlsims.com/rdtool.html' },
    { label: 'Pearson (1993): Complex Patterns in a Simple System', url: 'https://arxiv.org/abs/patt-sol/9304003' },
  ],
  hints: {
    'feed': 'Cuánta sustancia A entra en cada celda.',
    'kill': 'Cuánta sustancia B desaparece.',
    'diff': 'Lo que se extiende B frente a A: cambia el grosor de las formas.',
    'scale': 'Tamaño de las formas en la rejilla.',
    'edges': 'Continuos: lo que sale por un lado entra por el otro.',
    'map': 'Uniforme: la misma química en todo el campo. Heridas: claros que se cierran. Mareas: manchas de eliminación que derivan. Franjas: una banda que barre el campo. Isla: vida dentro de una orilla que respira.',
    'amp': 'Cuánto empuja el mapa: el tamaño de las heridas o lo que suben y bajan las mareas.',
    'drift': 'Lo deprisa que cambia el mapa: heridas más frecuentes o mareas más rápidas.',
    'view': 'Concentración: la sustancia B como luz. Relieve: sombreada como un grabado. Contorno: sólo sus bordes.',
  },
  presets: {
    'coral': 'Ramas que crecen desde el centro hasta cubrir el campo y quedarse quietas.',
    'mitosis': 'Manchas que se estiran y se dividen hasta llenar el campo en una red de puntos.',
    'laberinto': 'Franjas que se curvan como una huella dactilar, llenan el campo y se quedan grabadas.',
    'caos': 'Gusanos que nacen, chocan y se deshacen sin parar, y zonas que se calman en anillos mientras la marea pasa.',
    'coral_vivo': 'Un coral que cubre el campo y se abre en claros: las ramas vuelven a crecer hacia dentro y se cierran de otra forma.',
    'laberinto_vivo': 'Un laberinto de franjas que la marea rompe en puntos y vuelve a trazar en otra dirección.',
    'celulas': 'Puntos que mueren bajo la marea y se dividen hacia los huecos; a ratos se alargan en gusanos.',
    'corrientes': 'Bandas diagonales de puntos y de franjas que avanzan: cada frente reordena lo que pisa.',
    'isla': 'Un coral encerrado en una isla con orilla luminosa que crece y se encoge despacio.',
  },
};
