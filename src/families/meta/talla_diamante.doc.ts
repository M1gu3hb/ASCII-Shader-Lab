import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una piedra tallada vista desde arriba que gira bajo la luz: facetas que destellan en colores del espectro, centelleo y estrellas.',
  mechanism: 'La corona de la piedra es una red de anillos por sectores: la mesa, las facetas en estrella, las cometas y las facetas del filetín, cada anillo desplazado medio sector respecto al siguiente y cada celda partida en un triángulo y dos medios. Así cada faceta tiene un ángulo y una inclinación, es decir, una normal. Al girar la piedra bajo una luz fija, cada faceta refleja según el vector medio de Blinn (más nítido con «Brillo») y devuelve su propio color del espectro, el fuego: el tono depende de lo lejos que está su normal del reflejo perfecto, así que los colores corren por las facetas. Cada faceta centellea con un destello breve, algunas lanzan una estrella de rayos, la mesa deja ver las flechas del pabellón, unas líneas oscuras marcan las aristas y alrededor se abren cáusticas de arcoíris. Cada celda lleva su color.',
  time: 'Un bucle exacto: la piedra da un número entero de vueltas por ciclo y cada destello se repite un número entero de veces; a los segundos de «Ciclo» vuelve a ser la misma.',
  limits: 'Sólo la corona vista desde arriba (el pabellón se intuye por la mesa); la luz es una sola y fija. Las facetas son una aproximación de la talla, no una piedra trazada rayo a rayo.',
  sources: [
    { label: 'Radiant · Diamond Caustics, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Talla brillante (mesa, estrellas, cometas y facetas del filetín)', url: 'https://es.wikipedia.org/wiki/Talla_brillante' },
    { label: 'Modelo de reflexión de Blinn–Phong', url: 'https://es.wikipedia.org/wiki/Modelo_de_reflexi%C3%B3n_de_Phong' },
  ],
  hints: {
    cut: 'Redonda con mesa, cuadrada o una rosa antigua de triángulos.',
    size: 'El tamaño de la piedra.',
    facets: 'Cuántas veces se multiplican los sectores: facetas más finas.',
    cycle: 'Los segundos que tarda la piedra en volver exactamente a su inicio.',
    turns: 'Cuántas vueltas da la piedra en cada ciclo.',
    fire: 'Cuánto color del espectro devuelve cada faceta.',
    sparkle: 'El centelleo: destellos breves de cada faceta.',
    star: 'Las estrellas de rayos que lanzan algunos destellos.',
    sharp: 'Lo nítido del reflejo: muchas facetas a medias o pocas muy brillantes.',
    edges: 'Las líneas oscuras de las aristas entre facetas.',
    caustics: 'Los rayos de arcoíris que la piedra proyecta a su alrededor.',
    light: 'De dónde viene la luz.',
  },
  presets: {
    brillante: 'Un brillante redondo que gira despacio con fuego de colores, estrellas y un abanico de cáusticas.',
    princesa: 'Una talla cuadrada de facetas finas con todo el fuego y muchas cáusticas.',
    rosa_antigua: 'Una rosa antigua sin mesa, de aristas marcadas y luz cálida, que lanza estrellas.',
    hielo: 'Un brillante pequeño de facetas muy finas que gira deprisa y centellea en blanco azulado.',
  },
};
