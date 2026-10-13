import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un anillo de humo alrededor del centro que se ondula y deja escapar jirones hacia fuera; el color cambia con el radio.',
  mechanism: 'El humo es un ruido leído en coordenadas polares: la dirección como un punto de un círculo (sin costura) y el radio desplazado con el tiempo, de modo que la misma textura aparece cada vez más lejos: fluye hacia fuera. Dos capas de ese ruido, medio ciclo desfasadas, se funden donde cada una vuelve a empezar, así que el flujo no se corta nunca. El anillo es la distancia a un círculo cuyo radio dobla ese ruido en cada ángulo; su densidad tiene una textura más fina, fuera de él se escapan jirones que se apagan con la distancia y dentro queda un brillo tenue. El color sale de tu paleta según el radio, de dentro a fuera; el carácter, de la densidad.',
  time: 'Un bucle exacto de «Ciclo» segundos: el flujo, el giro (un número entero de vueltas por ciclo) y las ondulaciones vuelven exactamente a su inicio.',
  limits: 'Dos capas de ruido de cuatro octavas por celda; un solo anillo centrado.',
  sources: [
    { label: 'Paper Shaders: Smoke Ring (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/smoke-ring' },
    { label: 'Flow maps: textura que fluye con dos capas desfasadas', url: 'https://catlikecoding.com/unity/tutorials/flow/texture-distortion/' },
  ],
  hints: {
    radius: 'Tamaño del anillo.',
    thick: 'Grosor del anillo.',
    wobble: 'Cuánto se ondula el borde del anillo con el ruido.',
    detail: 'Tamaño de los remolinos del humo: grandes o finos.',
    wisps: 'Jirones de humo que se escapan hacia fuera.',
    cycle: 'Duración del bucle: lo lento que fluye y gira.',
    core: 'Brillo tenue dentro del anillo.',
    spread: 'Cómo se reparten los colores de la paleta a lo largo del radio.',
    turns: 'Vueltas que da el humo en cada ciclo (y hacia qué lado).',
    flow: 'Cuánto se desplaza el humo hacia fuera en cada ciclo.',
  },
  presets: {
    aro: 'Un aro mediano violeta y rosa que gira una vez por ciclo con jirones moderados.',
    incienso: 'Un anillo fino que se deshilacha en muchos jirones grises que fluyen deprisa hacia fuera.',
    corona: 'Un anillo ancho y casi liso de fuego, sin brillo dentro, que gira dos veces por ciclo.',
    halo: 'Un anillo grande y difuso de niebla azul con brillo interior que gira despacio al revés.',
  },
};
