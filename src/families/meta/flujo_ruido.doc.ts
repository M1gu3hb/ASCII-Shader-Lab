import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Miles de partículas siguen el ángulo de un ruido y dejan estelas que se desvanecen: líneas que se enredan y cambian con el campo.',
  mechanism: 'Donde «Campo de flujo» dibuja senos regulares, aquí miles de partículas avanzan según el ángulo de un campo de ruido, θ = dirección + 2π·enredo·N(p, t), y dejan tinta en un lienzo que se desvanece (en cada paso cada píxel conserva e^(−dt/estela) de su tinta). Las estelas son las líneas de corriente del campo: se rizan, se anudan y se separan donde el ruido gira, y cambian a medida que el ruido avanza en el tiempo. Cada partícula vive un rato y renace en otro sitio, así que el lienzo se sigue dibujando. N es un ruido de gradiente 3D con semilla, periódico a lo ancho y a lo alto del dominio (el lienzo se repite sin costura y las partículas viven en un toro); su tercera coordenada es el tiempo. La tinta se suma: donde las estelas se cruzan o se apiñan, se oscurece como tinta.',
  time: 'Evoluciona por pasos desde la semilla, con memoria: el lienzo de tinta guarda las estelas de los últimos segundos. Sigue cambiando mientras corre (el ruido avanza y las partículas renacen) y no es periódico, así que no tiene «Bucle perfecto»; el clip arranca con cinco segundos ya dibujados.',
  limits: 'Hasta 6000 partículas, un lienzo de hasta 288 × 144 píxeles y una octava extra de ruido. La tinta no se mueve con el campo (es una estela, no un fluido) y las partículas no interactúan entre sí.',
  sources: [
    { label: 'Radiant · static/flow-field.html, de Paul Bakaus (MIT, «Copyright (c) 2025 Paul Bakaus»; su ruido, «basado en Stefan Gustavson»; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Vanta · src/vanta.topology.js, de Teng Bao (MIT, «Copyright 2020 Teng Bao»; «Original effect by Kjetil Midtgarden Golid», p5ycho, MIT; usa vendor/p5.min.js, que no se usa aquí; referencia de la idea)', url: 'https://github.com/tengbao/vanta' },
    { label: 'Kjetil Midtgarden Golid · p5ycho (MIT, «Copyright (c) 2017 Kjetil Midtgarden Golid»), origen del efecto «topology»', url: 'https://github.com/kgolid/p5ycho' },
    { label: 'Ken Perlin · ruido de gradiente mejorado (desvanecimiento quíntico, doce gradientes)', url: 'https://mrl.cs.nyu.edu/~perlin/paper445.pdf' },
  ],
  hints: {
    count: 'Cuántas partículas dibujan a la vez: más, un tejido más denso.',
    cells: 'Cuántos remolinos del ruido caben a lo alto: pocos y grandes o muchos y pequeños.',
    tangle: 'Cuánto gira el ángulo con el ruido: poco, corrientes casi paralelas; mucho, nudos y lazos.',
    detail: 'Una segunda octava de ruido: rizos pequeños sobre los grandes.',
    speed: 'Lo deprisa que avanzan las partículas.',
    trail: 'Cuánto dura la tinta antes de desvanecerse: estelas cortas o líneas que se acumulan.',
    evolve: 'Lo deprisa que cambia el campo; a cero, las líneas recorren siempre los mismos caminos.',
    life: 'Cuánto vive cada partícula antes de renacer en otro sitio: trazos cortos o filamentos largos.',
    wind: 'Hacia dónde tiende el flujo (con poco enredo, la dirección del viento).',
    width: 'Grosor de cada trazo.',
    ink: 'Cuánta tinta deja cada paso: líneas tenues o intensas.',
  },
  presets: {
    enredo: 'Cinco mil partículas en un campo muy enredado: un tejido denso de lazos que no para de cambiar.',
    filamentos: 'Pocas partículas que viven mucho y una tinta que dura: filamentos largos que se acumulan, como una topografía.',
    viento: 'Poco enredo y estelas cortas: corrientes casi paralelas que ondulan con el viento.',
    remolinos: 'Un solo remolino por alto, lento: grandes vórtices de trazos gruesos.',
    tinta: 'Trazos finos de tinta oscura sobre papel claro que se acumulan durante medio minuto.',
  },
};
