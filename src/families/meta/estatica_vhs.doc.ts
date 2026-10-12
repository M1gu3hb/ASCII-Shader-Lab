import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una carta de barras de color que se derrite columna a columna, con los cortes y el barrido de una cinta gastada.',
  mechanism: 'Las siete barras de color, la tira de almenas y la fila de muestras de abajo forman la carta; cada celda lleva su color. El lienzo se corta en columnas del ancho de una gota: cada una empieza a derretirse en su momento y su contenido se hunde cada vez más rápido, redondeado dentro de la columna y sujeto por arriba, así que los bordes entre barras, tira y fila gotean hacia abajo con largos distintos. Encima, la cinta: líneas enteras que se desgarran de lado, una banda de seguimiento que baja por la imagen con estática, el rojo y el azul corridos a cada lado y, al final del ciclo, un salto vertical a la estática que corta de vuelta a la carta limpia. Las líneas de barrido oscurecen una fila de cada dos y una línea más clara recorre la imagen.',
  time: 'Un bucle exacto de «Ciclo» segundos: todo depende del tiempo dentro del ciclo, también la estática y los desgarros, así que el final empalma con el principio (el empalme es el corte de cinta).',
  limits: 'Siete barras; columnas de gota de 0,01 a 0,08 de alto de lienzo; la estática cambia quince veces por segundo.',
  sources: [
    { label: 'Radiant · Vintage Static, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Barras de color SMPTE (carta de ajuste)', url: 'https://en.wikipedia.org/wiki/SMPTE_color_bars' },
  ],
  hints: {
    cycle: 'Duración del bucle: del cuadro limpio al corte.',
    melt: 'Cuánto se derrite la carta antes del corte.',
    drip: 'Ancho de cada columna que gotea.',
    cuts: 'Líneas desgarradas y fuerza de la banda de seguimiento.',
    scan: 'Líneas de barrido: una fila de cada dos más oscura y una línea clara que baja.',
    snow: 'Estática de fondo sobre toda la imagen.',
    bleed: 'El rojo y el azul se corren a los lados.',
    roll: 'El salto vertical a la estática al final del ciclo.',
    bars: 'Las barras de siempre o los colores de tu paleta.',
  },
  presets: {
    carta: 'Las barras clásicas se derriten en columnas medianas y el ciclo acaba con un salto a la estática.',
    cinta: 'Ciclo corto y cinta muy gastada: muchos desgarros, banda de seguimiento fuerte, color corrido y mucha estática.',
    deshielo: 'Ciclo largo, columnas finas y derretido total: las barras gotean casi hasta abajo, con poca cinta encima.',
    paleta: 'Barras con los colores de neón de la paleta, derretido medio y barrido marcado.',
  },
};
