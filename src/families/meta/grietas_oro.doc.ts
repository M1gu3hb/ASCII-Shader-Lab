import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'La piedra se resquebraja desde un punto: las grietas avanzan, se llenan de oro fundido que sangra y brilla, y se cierran.',
  mechanism: 'Las grietas son los bordes de un diagrama de Voronoi (la diferencia F2 − F1) sobre un plano deformado por ruido, como en el patrón «Grietas», pero aparecen con el tiempo. En cada ciclo un frente sale del origen; un borde se abre cuando el frente lo alcanza (cada borde un poco antes o después, según las dos placas que separa), así que las grietas corren hacia fuera desde el origen. Una grieta abierta se llena de metal fundido: blanco de calor justo detrás del frente y enfriándose hacia su color; se ensancha un poco con la edad y sangra hacia la piedra (un resplandor cuyo alcance crece). Más tarde se abren grietas finas (un segundo Voronoi, más pequeño) y del metal caliente sube un polvo de chispas. Al final del ciclo las juntas se enfrían y se cierran, y el ciclo empieza otra vez sobre piedra intacta.',
  time: 'Con «Trazado nuevo cada ciclo» apagado es un bucle exacto de «Ciclo» segundos: la misma red de grietas se abre, brilla y se cierra (el polvo y el brillo que corre por las juntas dan un número entero de vueltas por ciclo). Encendido, cada ciclo dibuja otra red y otro origen: es continuo y no se repite. Entre ciclos la piedra está intacta, así que no hay salto.',
  limits: 'Dos escalas de grietas (3 × 3 placas vecinas cada una) sobre un plano deformado; las grietas son bordes rectos de Voronoi doblados por la deformación, no fracturas físicas. El frente es radial desde el origen.',
  sources: [
    { label: 'Radiant · static/gilded-fracture.html, de Paul Bakaus (MIT, «Copyright (c) 2025 Paul Bakaus»; referencia de la idea, no se copió código)', url: 'https://github.com/pbakaus/radiant' },
    { label: 'Diagrama de Voronoi y distancias F1/F2 (ruido celular de Worley)', url: 'https://en.wikipedia.org/wiki/Worley_noise' },
  ],
  hints: {
    metal: 'Con qué se llenan las grietas: oro, cobre, plata o lava.',
    scale: 'Cuántas placas caben: pocas y grandes o muchas y pequeñas.',
    warp: 'Cuánto se tuercen las grietas.',
    width: 'Ancho de las grietas abiertas.',
    period: 'Duración de un ciclo: abrirse, brillar y cerrarse.',
    origin: 'Desde dónde se rompe la piedra.',
    bleed: 'Cuánto se extiende el brillo del metal por la piedra.',
    dust: 'Chispas de polvo de metal que suben de las juntas calientes.',
    fine: 'Grietas finas que se abren después de las grandes.',
    jitter: 'Cuánto se adelantan o retrasan unas grietas respecto a otras.',
    renew: 'Cada ciclo, otra red de grietas y otro origen (deja de ser un bucle).',
    heat: 'Cuánto tarda en enfriarse el metal: más calor, más blanco y más brillo.',
  },
  presets: {
    kintsugi: 'Piedra oscura que se abre desde el centro y se llena de oro que sangra: un bucle de 14 s.',
    brasa: 'Suelo volcánico que se agrieta desde abajo con lava muy caliente y muchas chispas; cada ciclo, otra red.',
    porcelana: 'Placas grandes que se craquelan desde la izquierda con hilos de plata y muchas grietas finas.',
    cobre: 'Placas pequeñas muy torcidas, con cobre, desde un punto distinto cada ciclo.',
  },
};
