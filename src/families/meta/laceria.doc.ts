import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Estrellas y rosetas de lazo entrelazado que giran, se cruzan por encima y por debajo, y se vuelven a dibujar.',
  mechanism: 'Cada roseta es un polígono estrellado regular {N/k}: N cuerdas de un círculo que unen cada vértice con el k-ésimo siguiente. Hay hasta tres rosetas encajadas (radios en proporción áurea) que giran en sentidos alternos, solas en el centro o repetidas en una rejilla cuadrada o hexagonal, donde las puntas de una se meten en las vecinas. El entrelazado sale de la topología: las cintas forman curvas cerradas, así que el plano se colorea en dos tonos por paridad (dentro de una estrella regular, el número de vueltas es k menos las cuerdas que quedan por dentro del punto), y de esa coloración sale un tejido alterno, como en el diagrama de un nudo: en cada cruce pasa por encima la cinta que, al girarla hacia la otra en sentido antihorario, barre la región sombreada. La de abajo se corta con un hueco; las cuerdas de una misma estrella que se juntan en una punta se unen sin cortarse. Las regiones entre cintas toman dos tonos, como un alicatado.',
  time: '«Bucle de 32 s»: cada medio ciclo un frente (desde el centro o desde las esquinas) recorre la pieza y deja detrás la configuración siguiente, con las cintas recién entintadas; dos configuraciones se alternan y cada capa gira un número entero de pasos de simetría por ciclo, así que vuelve exactamente a su inicio. «Continuo»: las configuraciones salen al azar de cada ciclo y las capas giran a velocidades sin relación, así que no se repite.',
  limits: 'Simetrías de 6, 8, 10 y 12; la profundidad de la estrella se limita a lo que admite cada simetría (con 6 puntas sólo hay hexagrama). En un cruce de tres cintas a la vez el tejido puede fallar un instante.',
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
    nazari: 'Estrellas de ocho en rejilla cuadrada cuyas puntas se cruzan con las vecinas; se renuevan desde las esquinas.',
    roseton: 'Una rosa de doce con tres anillos que contrarrotan, redibujada desde el centro.',
    traceria: 'Hexagramas en rejilla hexagonal, cintas anchas, dibujos nuevos sin repetirse.',
    diez: 'Una estrella de diez sola en el centro, con su estrella interior girando al revés.',
  },
};
