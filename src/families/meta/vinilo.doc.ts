import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un disco que gira con sus surcos en V, la música ondulándolos, un reflejo en cruz de colores y el brazo que avanza.',
  mechanism: 'Los surcos son una onda triangular a lo largo del radio (las dos paredes de cada surco en V) que se ondula con la música: un desplazamiento que sigue el ángulo propio del disco, así que gira con él, más fuerte en unos pasajes que en otros; entre pista y pista hay un tramo liso. Las paredes de los surcos son radiales, de modo que devuelven la luz sólo en una cruz de cuñas perpendicular a ella (un par fuerte y otro más débil); los surcos hacen de red de difracción y dentro de las cuñas el color recorre el espectro con el ángulo y el radio; los tramos lisos brillan como un espejo. La luz puede dar vueltas alrededor del disco. La etiqueta gira con el disco, con anillos de marcas como letras impresas; un brazo sobre su pivote lleva la aguja desde el borde hacia dentro a lo largo del ciclo y vuelve. Cada celda lleva su color.',
  time: 'Un bucle exacto: el disco da un número entero de vueltas por ciclo (la velocidad elegida, redondeada a eso), la luz gira un número entero de vueltas y el brazo recorre el disco una vez por ciclo.',
  limits: 'Un disco plano visto desde arriba o inclinado; los surcos visibles son muchos menos que los reales (los de verdad son mucho más finos que un carácter). El brazo no proyecta sombra sobre el reflejo.',
  sources: [
    { label: 'Radiant · Vinyl Grooves, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Red de difracción (por qué los surcos dan colores)', url: 'https://es.wikipedia.org/wiki/Red_de_difracci%C3%B3n' },
    { label: 'Disco de vinilo (surcos en V y velocidades)', url: 'https://es.wikipedia.org/wiki/Disco_de_vinilo' },
  ],
  hints: {
    speed: 'Las vueltas por minuto del disco.',
    size: 'El tamaño del disco.',
    tilt: 'Cuánto se inclina el disco: de visto desde arriba a muy de lado.',
    grooves: 'Cuántos surcos se ven.',
    signal: 'Cuánto ondula la música los surcos.',
    tracks: 'Cuántas pistas, separadas por tramos lisos.',
    shine: 'La fuerza del reflejo en cruz.',
    iris: 'Cuánto color del espectro tiene el reflejo.',
    light: 'De dónde viene la luz.',
    turn: 'Cuántas vueltas da la luz (y con ella la cruz) en cada ciclo.',
    arm: 'El brazo del tocadiscos.',
    label: 'El color de la etiqueta del centro.',
    cycle: 'Los segundos que tarda el brazo en recorrer el disco; todo vuelve a empezar igual.',
  },
  presets: {
    tocadiscos: 'Un LP a 33⅓ algo inclinado, con cinco pistas, la cruz de colores girando y el brazo que avanza.',
    arcoiris: 'Un disco grande visto desde arriba que gira despacio, con un reflejo de arcoíris que da dos vueltas.',
    single: 'Un single pequeño muy inclinado, una sola pista con mucha música en los surcos.',
    pizarra: 'Un disco antiguo de 78 con surcos densos, luz fija y casi sin color.',
  },
};
