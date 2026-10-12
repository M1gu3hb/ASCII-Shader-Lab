import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Bandas de metal pulido que se curvan siguiendo el borde de una forma, con reflejos que se separan en colores.',
  mechanism: 'Cada forma (círculo, anillo, gota, rombo, metabolas o ninguna) da una distancia con signo a su contorno. De ella sale un campo de borde: vale 1 en el contorno y baja hacia dentro con un perfil parabólico, el de una solución de Poisson con borde fijo. Ese campo dobla la coordenada de las bandas (una diagonal girada, más el campo de borde y un ruido), así que junto al contorno las bandas giran y se aprietan siguiéndolo. Cada periodo de banda es un reflejo: un degradado que acaba en un horizonte nítido y una línea en la zona oscura, filtrado por lo que cabe en una celda. El rojo y el azul leen la banda un poco adelantada y atrasada (dispersión) y cada canal pasa por tu paleta. El carácter sale de la fase de la banda.',
  time: 'Una función del tiempo: las bandas corren, el ruido se desplaza y las metabolas siguen trayectorias con frecuencias que no se repiten juntas. Sigue cambiando sin reinicio y no es periódica. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Formas analíticas fijas (6). No lee todavía la imagen ni el texto de la pieza: eso necesitaría que una familia reciba la fuente (ver el informe de la revisión).',
  sources: [
    { label: 'Paper Shaders: Liquid Metal (Apache-2.0; referencia de la idea, no se copió código)', url: 'https://shaders.paper.design/liquid-metal' },
    { label: 'Ecuación de Poisson (perfil del campo de borde)', url: 'https://es.wikipedia.org/wiki/Ecuaci%C3%B3n_de_Poisson' },
  ],
  hints: {
    mask: 'La forma que se llena de metal; «Sin forma» cubre todo el lienzo.',
    rep: 'Cuántas bandas cruzan la forma.',
    distortion: 'Ondulación de las bandas, como metal líquido que se mueve.',
    contour: 'Cuánto se doblan y se aprietan las bandas siguiendo el borde.',
    angle: 'Dirección de las bandas.',
    dispersion: 'Separación de rojo y azul en los reflejos: franjas de color en los bordes.',
    speed: 'Lo rápido que corren las bandas.',
    size: 'Tamaño de la forma (en «Sin forma», el de las ondulaciones).',
  },
  presets: {
    gota: 'Una gota cromada que se balancea; los reflejos rodean la punta.',
    lamina: 'Todo el lienzo es metal: bandas anchas que se doblan alrededor de bultos que no se ven.',
    mercurio: 'Cuatro gotas que se funden y se separan, con bandas apretadas en cada cuello.',
    anillo: 'Un anillo de oro con muchas bandas finas que siguen su curva.',
    prisma: 'Un rombo con la dispersión al máximo: cada reflejo se abre en rojo y azul.',
  },
};
