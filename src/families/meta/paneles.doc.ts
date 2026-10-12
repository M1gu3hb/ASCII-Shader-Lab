import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Láminas de cristal de colores que giran alrededor de un eje y se superponen con profundidad.',
  mechanism: 'Cada panel es un rectángulo translúcido sujeto a un eje común, como las palas de una noria; un segundo juego puede girar al revés. El eje se ve en perspectiva, algo girado y desde un poco arriba. Para cada celda se lanza un rayo desde la cámara y se calcula dónde corta el plano de cada panel (intersección rayo–plano): si cae dentro del rectángulo, ese panel aporta una capa con su profundidad, su color de la paleta (que se degrada hacia el siguiente a lo largo del panel) y su transparencia. Las capas se ordenan de la más lejana a la más cercana y se componen una sobre otra, así que donde se cruzan los colores se mezclan como en un vidrio. Los paneles lejanos se oscurecen; los bordes, de una celda de ancho a cualquier profundidad, brillan. El carácter sale de la cobertura: donde se apilan más paneles, glifos más densos.',
  time: 'Bucle exacto de 60 s: cada juego da un número entero de vueltas por minuto y el eje se balancea una vez por minuto, así que estado, color y cámara vuelven exactamente a su inicio.',
  limits: 'Hasta 10 paneles por juego y 2 juegos (20 capas por celda). Los colores son los de tu paleta: el más oscuro hace de fondo y los demás se reparten entre los paneles.',
  sources: [
    { label: 'Paper Shaders · Color Panels (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/color-panels' },
    { label: 'Composición alfa «over» (Porter y Duff, 1984)', url: 'https://en.wikipedia.org/wiki/Alpha_compositing' },
  ],
  hints: {
    count: 'Cuántos paneles tiene cada juego: más paneles, más superposición.',
    turns: 'Vueltas por minuto de cada juego (el bucle siempre dura 60 s).',
    opacity: 'Lo que tapa cada panel: bajo, cristal; alto, colores casi opacos.',
    length: 'Lo que salen los paneles desde el eje.',
    sets: 'Un solo juego, o dos que giran en sentidos contrarios y se cruzan.',
    tilt: 'Ángulo del eje en el lienzo: horizontal en 0, vertical en los extremos (puerta giratoria).',
    edges: 'Brillo de los bordes de cada panel.',
    width: 'Ancho de los paneles a lo largo del eje.',
  },
  presets: {
    vidrieras: 'Dos juegos de siete paneles largos en un eje casi vertical que se cruzan y llenan el lienzo: un fondo de vidrieras que no para.',
    abanico: 'Diez paneles estrechos y transparentes en un eje inclinado: un abanico de cristal de bordes finos.',
    noria: 'Ocho palas cortas en dos juegos que giran deprisa, como una turbina vista de lado, en colores cálidos.',
    puerta: 'Eje vertical: tres paneles y su contrario, como una puerta giratoria de colores.',
  },
};
