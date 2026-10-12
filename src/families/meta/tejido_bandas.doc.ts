import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una tela de hilos de colores por bandas que pasan unos sobre otros; los cruces se dan la vuelta como una ola.',
  mechanism: 'La tela es una red de hilos verticales (urdimbre) y horizontales (trama). Cada hilo toma un color de tu paleta por bandas (el primero de la paleta es el fondo que asoma entre hilos): la urdimbre en bandas de «Banda» hilos y la trama en bandas un hilo más anchas, así que las rayas de los dos sentidos forman bloques de color. En cada cruce el ligamento dice qué hilo va arriba: llano (como un tablero), sarga (diagonales) o bloques (cuadros donde manda la urdimbre y cuadros donde manda la trama). Una ola recorre la tela en la dirección elegida: a su paso, el hilo de arriba baja y el de abajo sube, con suavidad. Cada hilo se sombrea por su perfil redondo y su altura (el que pasa por debajo se oscurece), con fibra a lo largo y un brillo en su lomo; entre hilos queda el hueco oscuro.',
  time: 'Una función del tiempo. Los frentes avanzan unos cuatro cruces por segundo; cada cruce se da la vuelta cada 1/(0,35·«Cruce») segundos y vuelve a su estado al doble de ese tiempo (con «Cruce» a cero, la tela queda como la teje el ligamento); la «Deriva» desliza la tela sin fin, así que con deriva sigue cambiando sin reinicio. «Bucle perfecto» la funde con su inicio, como cualquier patrón.',
  limits: 'Hasta 40 hilos en el alto del lienzo; los colores son los de la paleta (hasta 6, repartidos por bandas).',
  sources: [
    { label: 'Radiant · Woven Radiance, de Paul Bakaus (MIT; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Ligamentos textiles: tafetán, sarga y raso', url: 'https://es.wikipedia.org/wiki/Ligamento_(textil)' },
  ],
  hints: {
    threads: 'Cuántos hilos caben en el alto del lienzo.',
    width: 'Lo que ocupa cada hilo: con poco, se ven huecos entre ellos.',
    band: 'Cuántos hilos seguidos comparten color.',
    weave: 'Qué hilo va arriba en cada cruce: tablero, diagonal o bloques.',
    flip: 'Cuántas olas dan la vuelta a los cruces: más juntas y más seguidas (0: la tela quieta, tal como la teje el ligamento).',
    angle: 'Hacia dónde avanza la ola de cruces.',
    sheen: 'Brillo en el lomo de los hilos.',
    drift: 'La tela se desliza despacio (hacia un lado u otro).',
  },
  presets: {
    oro_verde: 'Bloques de urdimbre y trama en oro, verde y rojo; la ola de cruces avanza en diagonal.',
    sarga: 'Hilos finos en diagonal, azul de tela vaquera, que se deslizan.',
    cuadros: 'Tafetán de bandas anchas: cuadros rojos, crema y verdes que se dan la vuelta en franjas.',
    seda: 'Pocas cintas anchas de seda pastel con mucho brillo, cruzándose de arriba abajo.',
  },
};
