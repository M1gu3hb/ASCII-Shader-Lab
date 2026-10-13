import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un marco de caracteres alrededor del lienzo, con cometas de color que lo recorren, latido y humo.',
  mechanism: 'Un rectángulo redondeado, metido hacia dentro por los márgenes, da a cada celda su distancia al contorno y su posición a lo largo del perímetro (la longitud de arco desde arriba, en el sentido de las agujas del reloj). La línea es un núcleo fino sobre una base tenue; los cometas la recorren, cada uno con una cabeza brillante, una cola que se apaga de forma exponencial y su propio color de tu paleta, a velocidades un poco distintas. El latido engorda y aviva la línea con dos golpes por pulso; el humo es un fBm que se aleja de la línea y se ilumina con los cometas.',
  time: 'Una función del tiempo: los cometas van a velocidades que no guardan proporción y el humo deriva, así que sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 4 cometas. El campo no conoce la proporción del lienzo: ajusta «Proporción» (ancho entre alto: 1,78 para 16:9) para que el marco abrace tu lienzo.',
  sources: [
    { label: 'Paper Shaders: Pulsing Border (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/pulsing-border' },
    { label: 'Distancia con signo a un rectángulo redondeado', url: 'https://iquilezles.org/articles/distfunctions2d/' },
  ],
  hints: {
    comets: 'Cuántos cometas recorren el marco; a cero, sólo la línea.',
    speed: 'Lo rápido que dan la vuelta.',
    thick: 'Grosor de la línea.',
    margin: 'Distancia del marco al borde del lienzo.',
    radius: 'Lo redondeadas que son las esquinas.',
    pulse: 'Un latido que engorda y aviva la línea.',
    smoke: 'Humo que se desprende de la línea.',
    ratio: 'Ancho entre alto del lienzo, para que el marco lo abrace (1,78 para 16:9, 1 para un cuadrado).',
  },
  presets: {
    terminal: 'Un marco fino y verde con un cometa, pegado al borde: para una consola.',
    neon: 'Dos cometas de colores opuestos sobre un marco grueso de esquinas redondas, con algo de humo.',
    latido: 'Sin cometas: un marco muy redondeado que late y echa humo rojo.',
    humo: 'Cuatro cometas de colores entre humo espeso.',
  },
};
