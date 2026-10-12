import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una película de jabón o de aceite: bandas de color que cambian con su espesor, remolinos y pliegues que brillan.',
  mechanism: 'Es interferencia de película delgada. La luz se refleja en las dos caras de la película y una de las dos reflexiones se invierte, así que cada color del espectro vuelve más o menos fuerte según la diferencia de camino 2·n·d·cos θ (espesor d, índice n = 1,33 para el jabón y 1,45 para el aceite, ángulo de refracción θ por la ley de Snell). El espectro se divide en 8 bandas que se ponderan con las funciones de color CIE 1931 y se pasan a sRGB: así salen, por física y no por la paleta, la película negra donde es finísima y la serie de Newton (blanco, amarillo, magenta, azul, verde…) que palidece al engordar. El espesor drena con la gravedad y lo remueve un flujo deformado; la superficie ondula, y su inclinación cambia el ángulo, sombrea los pliegues y mueve el brillo. El carácter sale del brillo reflejado: las bandas oscuras dejan glifos ligeros y las claras, densos. Con «Color de: la paleta», la misma física se aplica a los colores de tu paleta, cada uno con su longitud de onda.',
  time: 'Una función del tiempo con ruido que deriva y ondas de frecuencias que no se repiten juntas: sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Ocho bandas de espectro y reflexión de dos haces (sin los órdenes múltiples de la fórmula de Airy); por encima de unos 2 µm de diferencia de camino los colores ya serían blancos y aquí se quedan en pastel. La burbuja se ve sólo por delante.',
  sources: [
    { label: 'Radiant · Artpop Iridescence (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Interferencia de película delgada', url: 'https://en.wikipedia.org/wiki/Thin-film_interference' },
    { label: 'Wyman, Sloan y Shirley (2013): Simple Analytic Approximations to the CIE XYZ Color Matching Functions, JCGT 2(2)', url: 'https://jcgt.org/published/0002/02/01/' },
    { label: 'Belcour y Barla (2017): A Practical Extension to Microfacet Theory for the Modeling of Varying Iridescence (modelo físico de referencia)', url: 'https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html' },
  ],
  hints: {
    form: 'Una lámina que llena el lienzo, una burbuja que flota en el centro o una mancha de aceite sobre agua oscura.',
    thick: 'Espesor de la película: fina, sólo los primeros colores (negro, blanco, amarillo); gruesa, más bandas y más pálidas.',
    flow: 'Remolinos que mezclan el espesor y doblan las bandas.',
    waves: 'Cuánto ondula la superficie: pliegues sombreados y colores que se desplazan con la inclinación.',
    speed: 'Lo rápido que fluye la película y se mueven las ondas.',
    shine: 'Fuerza del reflejo de la luz sobre los pliegues.',
    scale: 'Tamaño de las bandas, los remolinos y la burbuja.',
    tint: 'De dónde sale el color: de la física de la película (colores de Newton) o de los colores de tu paleta.',
  },
  presets: {
    jabon: 'Una lámina que drena: película negra arriba y bandas horizontales de color que los remolinos tuercen desde abajo.',
    pompa: 'Una burbuja sola en el centro: transparente por dentro, con el borde de color y el reflejo de una ventana.',
    aceite: 'Manchas de aceite sobre agua negra que se parten y se juntan, con ondas en la superficie.',
    pliegues: 'Película fina con ondas fuertes: pliegues sombreados y brillos que corren como en una tela.',
    nacar: 'Película gruesa con los colores de tu paleta: muchas bandas finas, como el nácar.',
  },
};
