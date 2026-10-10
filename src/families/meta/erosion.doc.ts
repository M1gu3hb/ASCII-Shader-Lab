import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un relieve que la lluvia talla mientras la tierra se levanta: mapas de ríos que se ramifican, costas y montañas vivas.',
  mechanism: 'Miles de gotas de lluvia caen sobre una rejilla de alturas y ruedan cuesta abajo, ganando velocidad y perdiendo agua. Cada gota arranca roca mientras puede cargar más sedimento y lo deja caer donde se frena, cuesta arriba o al llegar al mar. Las laderas más empinadas que el talud se desmoronan; los estratos duros resisten. Con «Levantamiento», la corteza sube despacio bajo un dibujo que cambia en un ciclo de unos minutos: las sierras crecen donde sube y los ríos que las cortan se reorganizan con ella, un equilibrio entre lo que se levanta y lo que el agua se lleva. El mapa del agua dibuja el caudal: por dónde han corrido las gotas en los últimos segundos.',
  time: 'Evoluciona con memoria y no vuelve atrás. Sin levantamiento es una construcción: la lluvia talla barrancos, ríos y terrazas cada vez más despacio hasta que el relieve casi no cambia (la cámara sigue girando). Con levantamiento es continuo: la tierra sube y la lluvia la corta sin terminar nunca, así que los ríos y las sierras se siguen moviendo; sin lluvia, la tierra sólo sube hasta su techo y se para. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de alturas de 1,15 × filas celdas por lado (hasta 160 × 160) o, en el lienzo entero, el doble de ancha que de alta con las mismas celdas; más su mapa de caudal y tres dibujos de levantamiento (4 bytes por celda cada uno); hasta 96 gotas por paso de 64 pasos de vida cada una. Al dibujar la maqueta, unos 500 pasos de rayo por columna.',
  sources: [
    { label: 'Beyer (2015): Implementation of a method for hydraulic erosion', url: 'https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf' },
    { label: 'Sebastian Lague: Hydraulic Erosion', url: 'https://github.com/SebLague/Hydraulic-Erosion' },
    { label: 'Olsen (2004): Realtime Procedural Terrain Generation (erosión térmica)', url: 'https://web.mit.edu/cesium/Public/terrain.pdf' },
    { label: 'Cordonnier et al. (2016): Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion', url: 'https://hal.science/hal-01262376' },
    { label: 's-macke: VoxelSpace (el algoritmo de Comanche)', url: 'https://github.com/s-macke/VoxelSpace' },
  ],
  hints: {
    'shape': 'La forma de partida, hecha con ruido a partir de la semilla.',
    'height': 'Lo alto del relieve inicial: más altura, más pendiente y más fuerza del agua.',
    'scale': 'Más: montes más pequeños y numerosos.',
    'rain': 'Gotas que caen en cada paso (hasta 96, en sitios que salen de la semilla).',
    'erode': 'Lo deprisa que el agua arranca roca.',
    'deposit': 'Lo deprisa que el sedimento se posa donde el agua se frena.',
    'capacity': 'Cuánto sedimento puede llevar una gota según su velocidad, su agua y la pendiente.',
    'evap': 'Lo deprisa que se secan las gotas: poca evaporación, ríos largos que llegan al mar.',
    'talus': 'Las laderas más empinadas se desmoronan hasta este ángulo.',
    'strata': 'Capas de roca dura cada pocos metros: las laderas se vuelven terrazas.',
    'uplift': 'La tierra sube despacio bajo un dibujo que cambia: la lluvia nunca termina su trabajo. 0: sólo erosión.',
    'frame': 'Una maqueta en el centro que la cámara rodea, o el mapa visto desde arriba llenando todo el lienzo.',
    'view': 'El relieve iluminado, el agua que corre (ríos y mar) o las alturas.',
    'orbit': 'La cámara rodea la maqueta (vista 3D).',
    'pitch': 'De una mirada rasante a una vista alta (vista 3D).',
  },
  presets: {
    'rios': 'Un mapa que llena el lienzo: ríos que se ramifican hasta la costa y cambian de cauce mientras las sierras suben.',
    'costa': 'Una ladera que baja al mar vista desde arriba: barrancos sombreados que la lluvia ahonda mientras la tierra se levanta.',
    'montana': 'Una maqueta de cordillera que la tierra sigue levantando: la lluvia la talla sin terminar nunca.',
    'barrancos': 'Lluvia fuerte y roca blanda sobre una cordillera: el agua talla surcos profundos en las laderas.',
    'delta': 'Una ladera que baja al mar: el agua se junta en ríos y deja su sedimento al llegar abajo.',
    'mesetas': 'Capas de roca dura y desmoronamiento: los bordes de una meseta se escalonan en terrazas.',
  },
};
