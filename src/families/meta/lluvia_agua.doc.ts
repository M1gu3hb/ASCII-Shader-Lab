import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Columnas de caracteres que caen y, al tocar la línea de agua de abajo, levantan ondas que corren por ella.',
  mechanism: 'Cada columna suelta una corriente de caracteres cada pocos segundos, con su propio ritmo y su velocidad de caída: la cabeza brilla y deja una estela que se apaga, y cada celda de la estela cambia de carácter de vez en cuando. Cuando una cabeza llega al agua, ese impacto (un instante y un lugar fijos, sin azar en vivo) levanta una onda amortiguada: nace en el punto de impacto, corre hacia los dos lados a velocidad constante y se apaga con el tiempo y la distancia. La línea del agua es la suma de las ondas de los últimos impactos de las columnas cercanas; bajo ella se ve la lluvia reflejada sobre la superficie que se mueve, torcida por su pendiente, y cada impacto salpica unas gotas.',
  time: 'Una función del tiempo: cada columna tiene un periodo distinto y sin proporción con las demás, así que la lluvia y las ondas siguen cambiando sin reinicio y no son periódicas. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Cada punto del agua suma las ondas de los tres últimos impactos de las 24 columnas a cada lado, hasta 0,45 de alto de lienzo (las más lejanas se desvanecen). Cada columna tiene una, dos o tres celdas de ancho; tres corrientes por columna se ven a la vez.',
  sources: [
    { label: 'Radiant · Digital Rain, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Ecuación de onda amortiguada', url: 'https://en.wikipedia.org/wiki/Wave_equation' },
  ],
  hints: {
    colw: 'Ancho de cada columna de lluvia, en celdas: una sola letra o columnas anchas.',
    density: 'Cuántas corrientes caen a la vez en cada columna.',
    speed: 'Lo rápido que caen las corrientes.',
    trail: 'Largo de la estela de cada corriente.',
    level: 'Altura de la línea de agua desde abajo.',
    waves: 'Altura de las ondas que levanta cada impacto.',
    damp: 'Lo rápido que se apagan las ondas: baja, recorren más agua.',
    wspeed: 'Lo rápido que se alejan las ondas del impacto.',
    reflect: 'Cuánto se ve la lluvia reflejada bajo la línea de agua.',
    flicker: 'Lo a menudo que cambia el carácter de cada celda de la estela.',
    splash: 'Gotas que salta cada impacto.',
    wavelength: 'Distancia entre crestas de una misma onda.',
  },
  presets: {
    consola: 'Verde de terminal: columnas medias, agua baja y ondas que cruzan la línea.',
    aguacero: 'Muchas columnas rápidas y apretadas: la línea de agua no para y salpica sin descanso.',
    estanque: 'Pocas gotas lentas sobre un agua alta y quieta: ondas largas que llegan lejos y un reflejo nítido.',
    espejo: 'El agua llega a la mitad: la lluvia se refleja casi entera, con ondas suaves.',
  },
};
