import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Haces finos que entran por los bordes y barren dentro de la niebla, o conos de foco donde brilla el polvo.',
  mechanism: 'Cada haz sale de un emisor fijo y barre con su propio vaivén lento. Con «Láseres», los emisores están en el borde del cuadro y los haces son finos (apenas se abren con la distancia); con «Focos», cuelgan sobre el borde de arriba y abren conos anchos con rayos que corren a lo largo del cono. La niebla es un ruido fBm que deriva: un haz se ve tanto como niebla atraviesa (la luz que la niebla desvía hacia nosotros), así que los haces se cortan y se encienden al pasar. Cada haz tiene su tono y los tonos giran con el tiempo; donde dos haces se cruzan, la parte común se enciende en blanco (el producto de sus intensidades: cero si falta uno). Unas motas de polvo flotan por todo el cuadro, pero sólo se ven donde un haz las ilumina; fuera, las mismas motas quedan a oscuras. Cada celda lleva el color de la luz que le llega.',
  time: 'Una función del tiempo: los barridos tienen frecuencias distintas y la niebla deriva sin repetirse; sigue cambiando sin reinicio. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Seis haces como mucho; la niebla es una capa plana (no hay sombras de un haz sobre otro ni profundidad). Los emisores de los láseres están en el contorno de un cuadro 16:9: en un lienzo vertical entran desde fuera de la vista.',
  sources: [
    { label: 'Radiant · Laser Labyrinth y Velvet Spotlight, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Efecto Tyndall (la luz que el polvo o la niebla dispersan hace visible el haz)', url: 'https://es.wikipedia.org/wiki/Efecto_Tyndall' },
  ],
  hints: {
    mode: 'Láseres finos que entran por los bordes o focos anchos que cuelgan arriba.',
    beams: 'Cuántos haces hay.',
    width: 'Lo que se abre cada haz con la distancia: un hilo o un cono.',
    sweep: 'Cuánto barre cada haz de un lado a otro.',
    speed: 'Lo deprisa que barren.',
    fog: 'Cuánto depende la luz de la niebla: con mucha, los haces se cortan donde no hay niebla.',
    drift: 'Lo deprisa que se mueven la niebla y el polvo.',
    hue: 'El tono de la luz.',
    hueTurn: 'Lo deprisa que giran los tonos de los haces.',
    flash: 'El destello blanco donde dos haces se cruzan.',
    dust: 'Motas de polvo que sólo se ven dentro de los haces.',
    rays: 'Rayos que corren a lo largo de cada haz.',
    haze: 'La neblina de la sala (con focos, un telón de terciopelo).',
    sat: 'De luz blanca a color pleno.',
  },
  presets: {
    laberinto: 'Cinco láseres finos de colores que barren desde los bordes y se cruzan con destellos blancos.',
    discoteca: 'Seis haces rápidos en un humo denso, con los tonos girando deprisa y muchos cruces.',
    faros: 'Tres haces anchos y lentos de luz casi blanca en una bruma espesa.',
    terciopelo: 'Tres conos cálidos que bajan del techo sobre un telón rojo, llenos de polvo brillante.',
    escenario: 'Dos focos fríos que se cruzan sobre el escenario con muchos rayos y polvo.',
  },
};
