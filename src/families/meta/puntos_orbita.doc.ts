import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Celdas irregulares, cada una con un punto que gira alrededor de su centro; cada celda tiene su color, por pasos.',
  mechanism: 'Cada cuadrado de la rejilla lleva un centro desplazado al azar dentro de él, y cada punto del lienzo pertenece al centro más cercano: son celdas de Voronoi. Alrededor de cada centro gira un punto en una órbita circular, con su radio, su velocidad (a un lado o al otro) y su fase propios; su tamaño varía de una celda a otra y late un poco, y su círculo puede verse tenue. Se comprueban los puntos de las nueve celdas de alrededor, así que un punto que se sale de su celda sigue viéndose. El color de cada celda es uno de unos pocos pasos repartidos por tu paleta: la celda se rellena con él, tenue, sus bordes pueden marcarse y el punto brilla con el color de su celda.',
  time: 'Una función del tiempo: cada punto gira a su velocidad y la rejilla puede derivar, así que sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Un punto por celda; se miran las nueve celdas de alrededor de cada punto del lienzo (una órbita mayor que la celda se corta). De 2 a 6 pasos de color.',
  sources: [
    { label: 'Paper Shaders: Dot Orbit (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/dot-orbit' },
    { label: 'Diagrama de Voronoi', url: 'https://es.wikipedia.org/wiki/Pol%C3%ADgonos_de_Thiessen' },
  ],
  hints: {
    size: 'Tamaño de cada celda en el lienzo.',
    orbit: 'Radio de la órbita de cada punto alrededor de su centro.',
    speed: 'Lo rápido que giran los puntos.',
    dot: 'Tamaño de los puntos.',
    vary: 'Cuánto cambia el tamaño de un punto a otro.',
    steps: 'En cuántos colores de la paleta se reparten las celdas.',
    fill: 'Cuánto se rellena cada celda con su color.',
    jitter: 'Cuánto se desordenan los centros: de rejilla regular a celdas irregulares.',
    edges: 'Marca los bordes entre celdas.',
    drift: 'Toda la rejilla se desliza despacio.',
    track: 'Marca tenue del círculo que recorre cada punto.',
  },
  presets: {
    confeti: 'Celdas irregulares de cuatro colores con puntos medianos que giran a su ritmo.',
    reloj: 'Rejilla regular y dos colores: puntos iguales en órbitas amplias, con los bordes marcados.',
    vitral: 'Celdas grandes rellenas de seis colores, bordes marcados y puntos de tamaños muy distintos.',
    polvo: 'Celdas pequeñas y sin relleno: un polvo de puntos finos que giran deprisa y se desliza.',
  },
};
