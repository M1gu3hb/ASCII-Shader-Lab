import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Trazas de partículas en una cámara de niebla: espirales que se cierran, rectas que cruzan y pares que se abren en V.',
  mechanism: 'Fuerza de Lorentz con frenado: dv/dt = (qB/m)·(v_y, −v_x) − γ·v. El campo magnético sólo gira la velocidad (radio m·v/(qB)); el frenado quita energía, el radio se encoge y cada traza curva se cierra en espiral, más deprisa al final porque la pérdida crece cuando la partícula se frena. Especies: electrones y positrones (ligeros, se enroscan), alfas (pesadas y con carga doble, cortas, gruesas y más brillantes al final, sueltan rayos delta), muones (rápidos, cruzan casi rectos) y fotones invisibles que se convierten en un par electrón-positrón abierto en V, cada brazo curvado hacia un lado. Las trazas se dibujan como gotas en un búfer que se desvanece y se difunde un poco, con una niebla de gotas sueltas.',
  time: 'Continuo: entran partículas sin parar (al azar de la semilla, a un ritmo por segundo) y las trazas viejas se borran; nunca se repite ni se vacía. No tiene bucle perfecto. Arranca con 3 s de calentamiento para que ya haya trazas; se puede guardar su estado.',
  limits: 'Hasta 192 partículas vivas a la vez, 3 subpasos de integración por paso (giro exacto de la velocidad), hasta 20 entradas por segundo y 12 s de vida por partícula. Sólo luminancia: la paleta de la pieza pone el color.',
  sources: [
    { label: 'Radiant · Spark Chamber (MIT, © 2025 Paul Bakaus; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'C. T. R. Wilson (1912): On an expansion apparatus for making visible the tracks of ionising particles in gases', url: 'https://doi.org/10.1098/rspa.1912.0093' },
    { label: 'Anderson (1933): The Positive Electron (trazas curvadas en campo magnético)', url: 'https://doi.org/10.1103/PhysRev.43.491' },
  ],
  hints: {
    field: 'Intensidad del campo: más campo, espirales más cerradas.',
    drag: 'Cuánta energía pierden las partículas: más frenado, espirales que se cierran antes.',
    rate: 'Partículas que entran cada segundo.',
    trace: 'Cuánto tardan las trazas en borrarse.',
    source: 'Por dónde entran: por cualquier borde, desde arriba como los rayos cósmicos, o desde una fuente radiactiva dentro de la cámara.',
    pairs: 'Proporción de fotones que se convierten en pares que se abren en V.',
    alphas: 'Proporción de partículas alfa: trazas cortas, gruesas y rectas.',
    muons: 'Proporción de muones: trazas largas que cruzan casi rectas.',
    energy: 'Energía de entrada: más energía, trazas más largas y menos curvadas.',
    mist: 'Gotas sueltas de fondo: la textura del vapor.',
    grain: 'Cuánto se nota que cada traza está hecha de gotas.',
  },
  presets: {
    burbujas: 'Campo fuerte y frenado alto: electrones que entran por los bordes y se enroscan en espirales cerradas.',
    cosmicos: 'Campo débil y partículas desde arriba: muones que cruzan casi rectos y algún electrón que se curva despacio.',
    pares: 'Casi todo son fotones que se convierten en pares: uves que se abren y se enroscan en sentidos opuestos.',
    fuente: 'Una fuente radiactiva dentro de la cámara dispara alfas cortas y gruesas en todas direcciones, con rayos delta.',
  },
};
