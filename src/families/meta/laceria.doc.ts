import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Estrellas y rosetas de lazo entrelazado que giran, se cruzan por encima y por debajo, y se vuelven a dibujar.',
  mechanism: 'Cada roseta es un polígono estrellado regular {N/k}: N cuerdas de un círculo que unen cada vértice con el k-ésimo siguiente. Dentro de cada estrella puede ir otra más simple, {N/2}, encajada en su polígono central, y una tercera dentro de esta; las capas giran en sentidos alternos. La roseta va sola en el centro o repetida en una rejilla cuadrada o hexagonal, donde cada estrella gira al revés que su vecina, como un engranaje. El entrelazado sale de la topología: las cintas forman curvas cerradas, así que el plano se colorea en dos tonos por paridad (dentro de una estrella regular, el número de vueltas es k menos las cuerdas que quedan por dentro del punto), y de esa coloración sale un tejido alterno, como en el diagrama de un nudo: en cada cruce pasa por encima la cinta que, al girarla hacia la otra en sentido antihorario, barre la región sombreada. La de abajo se corta con un hueco; las cuerdas de una misma estrella que se juntan en una punta se unen sin cortarse. Las regiones entre cintas toman dos tonos, como un alicatado.',
  time: '«Bucle de 32 s»: cada medio ciclo un frente (desde el centro o desde las esquinas) recorre la pieza y deja detrás la configuración siguiente, con las cintas recién entintadas; dos configuraciones se alternan y cada capa gira un número entero de pasos de simetría por ciclo, así que vuelve exactamente a su inicio. «Continuo»: las configuraciones salen al azar de cada ciclo y las capas giran a velocidades sin relación, así que no se repite.',
  limits: 'Simetrías de 6, 8, 10 y 12; la profundidad de la estrella se limita a lo que admite cada simetría (con 6 puntas sólo hay hexagrama). Cada celda decide el cruce con las dos cintas más cercanas: donde se juntan tres a la vez el tejido puede fallar un instante, y dos cintas casi paralelas se unen en vez de cruzarse. Para leer el tejido hace falta que la estrella mida unas 30 filas: a tamaño de terminal pequeño se pierde.',
  sources: [
    { label: 'Radiant · Radiant Geometry, Sacred Strange y Gothic Filigree (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Polígono estrellado {N/k}', url: 'https://en.wikipedia.org/wiki/Star_polygon' },
    { label: 'Nudos alternos y coloración de damero (grafo de Tait)', url: 'https://en.wikipedia.org/wiki/Alternating_knot' },
  ],
  hints: {
    sym: 'Cuántas puntas tiene cada estrella.',
    grid: 'Rosetas repetidas en rejilla cuadrada o hexagonal, o una sola grande en el centro.',
    depth: 'Cuántos vértices salta cada cuerda: más, estrella más aguda y más cruces.',
    layers: 'Cuántas rosetas encajadas, una dentro de otra, girando al revés.',
    width: 'Ancho de las cintas, en celdas.',
    spin: 'Lo que giran las capas en cada ciclo.',
    reveal: 'Qué parte de cada medio ciclo tarda el frente en recorrer la pieza (0: sin renovar).',
    cycle: 'Bucle exacto de 32 s con dos dibujos que se alternan, o continuo con dibujos nuevos.',
  },
  presets: {
    nazari: 'Dos cuadrados entrelazados con otra estrella dentro, en rejilla cuadrada; cada estrella gira al revés que su vecina y el dibujo se renueva desde las esquinas.',
    roseton: 'Una rosa de doce puntas sola en el centro, con su estrella interior girando al revés, redibujada desde el centro.',
    traceria: 'Hexagramas con otro dentro, en rejilla hexagonal, cintas anchas y dibujos nuevos que no se repiten.',
    diez: 'Una estrella de diez sola en el centro, con su estrella interior girando al revés, sin repetirse.',
  },
};
