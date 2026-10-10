import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'El fotograma anterior vuelve transformado: túneles, espirales, espejos y laberintos de tinta que se alimentan de sí mismos.',
  mechanism: 'Realimentación de fotograma: un búfer de luminancia al doble de resolución que el raster se vuelve a muestrear en cada paso a través de una malla de deformación (zoom alrededor de un centro que deambula, con más avance en los bordes que en el centro; giro, y un giro que crece hacia el centro; corriente y una ondulación senoidal), se apaga un poco y recibe formas nuevas: una onda o una línea de señal sintética, polígonos con borde, un polígono que copia el propio fotograma girado y reducido (copias de copias), puntos o una trama inyectada con poca opacidad. Con «Tinta», lo leído se realza contra una copia desenfocada (c + k·(c − desenfoque)) y el recorte a 0..1 lo convierte en laberintos de Turing que fluyen. Con «Espejo», el búfer se pliega en cada paso sobre una simetría de 2, 4, 6 u 8 gajos. Un reloj propio (osciladores lentos de frecuencias que no se relacionan y un pulso periódico de ataque rápido) mueve el centro, el giro, la deriva y la ondulación, y hace latir las semillas.',
  time: 'Continuo: el estado de cada paso depende del anterior y no se repite; nunca se queda quieto porque la deformación arrastra lo que hay y las semillas no paran. No tiene bucle perfecto. Arranca con 2 s de calentamiento para que el primer cuadro ya tenga historia; se puede guardar su estado.',
  limits: 'Búfer de luminancia de 2 × 2 píxeles por píxel del raster (hasta 576 × 288 con 144 filas), malla de deformación de 49 × 25 vértices, desenfoque a media resolución con 3 pasadas, hasta 24 puntos por paso y 2 polígonos. Sólo luminancia: la paleta de la pieza pone el color.',
  sources: [
    { label: 'Butterchurn (MIT, © 2013-2018 Jordan Berg): bucle de realimentación de MilkDrop en WebGL; referencia del mecanismo, no se copió código ni presets', url: 'https://github.com/jberg/butterchurn' },
    { label: 'Radiant · Feedback Loop (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Turing (1952): The Chemical Basis of Morphogenesis (activación local, inhibición lateral)', url: 'https://doi.org/10.1098/rstb.1952.0012' },
  ],
  hints: {
    seed: 'Lo que se dibuja dentro del bucle en cada paso: la deformación lo arrastra en los siguientes.',
    amount: 'Brillo de lo que se dibuja; con 0 sólo queda la historia (y tu trazo).',
    sides: 'Lados de los polígonos, lóbulos de la onda, ondas de la línea, puntos por ráfaga o direcciones de la trama.',
    strobe: 'Dibuja la semilla cada pocos pasos: copias separadas (anillos, ecos) en vez de una estela continua.',
    zoom: 'Positivo: lo dibujado sale del centro hacia fuera (túnel). Negativo: se hunde hacia el centro.',
    curve: 'Cuánto más avanzan los bordes que el centro: da profundidad de túnel.',
    rot: 'Giro de todo el fotograma en cada vuelta del bucle.',
    swirl: 'Giro que crece hacia el centro: enrolla lo dibujado en espiral, como un huracán.',
    wander: 'El centro del zoom y el giro deambulan despacio, sin repetirse.',
    drift: 'Una corriente que arrastra el fotograma en una dirección que va cambiando.',
    warp: 'Ondulación suave de todo el fotograma, como un líquido.',
    mirror: 'Pliega el fotograma sobre una simetría en cada paso: espejos que se realimentan.',
    memory: 'Cuánto dura lo dibujado: poca memoria deja sólo lo reciente; mucha, largas estelas.',
    ink: 'Realza contra una copia desenfocada: bordes nítidos y, con más, laberintos de Turing que fluyen.',
    pulse: 'Un latido periódico: la semilla se ilumina y el zoom da un empujón en cada golpe.',
    tempo: 'Segundos entre golpes del pulso.',
    echo: 'Mezcla el fotograma con su reflejo al mostrarlo (no entra en el bucle).',
    contrast: 'Curva de tono al mostrar: más contraste oscurece los grises de la historia.',
  },
  presets: {
    tinta: 'Laberintos de Turing que nacen de puntos sueltos y fluyen despacio hacia fuera, girando alrededor de un centro que deambula.',
    espejos: 'Dos polígonos que copian el fotograma girado y reducido, plegados en un caleidoscopio de 8 gajos: marcos dentro de marcos.',
    tunel: 'Anillos de una onda de cinco lóbulos que salen del centro cada pocos pasos y se aceleran hacia los bordes: profundidad de túnel.',
    huracan: 'Una línea de señal que cruza el centro y un giro que crece hacia dentro la enrollan en una espiral de brazos nítidos.',
    marea: 'Una trama de cinco direcciones inyectada con poca opacidad, arrastrada por corriente y ondulación: bandas que se pliegan sin parar.',
  },
};
