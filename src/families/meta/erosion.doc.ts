import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Un relieve en maqueta que la lluvia talla: barrancos, ríos que bajan al mar y mesetas en terrazas.',
  mechanism: 'Miles de gotas de lluvia caen sobre una rejilla de alturas y ruedan cuesta abajo, ganando velocidad y perdiendo agua. Cada gota arranca roca mientras puede cargar más sedimento y lo deja caer donde se frena, cuesta arriba o al llegar al mar. Las laderas más empinadas que el talud se desmoronan; los estratos duros resisten.',
  time: 'Evoluciona con memoria: el terreno cambia poco a poco y no vuelve atrás; la cámara gira alrededor. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de alturas de 1,15 × filas celdas por lado (hasta 160 × 160) más su mapa de caudal (8 bytes por celda); hasta 96 gotas por paso de 64 pasos de vida cada una. Al dibujar, unos 500 pasos de rayo por columna.',
  sources: [
    { label: 'Beyer (2015): Implementation of a method for hydraulic erosion', url: 'https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf' },
    { label: 'Sebastian Lague: Hydraulic Erosion', url: 'https://github.com/SebLague/Hydraulic-Erosion' },
    { label: 'Olsen (2004): Realtime Procedural Terrain Generation (erosión térmica)', url: 'https://web.mit.edu/cesium/Public/terrain.pdf' },
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
    'orbit': 'La cámara rodea la maqueta (vista 3D).',
    'pitch': 'De una mirada rasante a una vista alta (vista 3D).',
  },
  presets: {
    'barrancos': 'Lluvia fuerte y roca blanda sobre una cordillera: el agua talla surcos profundos en las laderas.',
    'delta': 'Una ladera que baja al mar: el agua se junta en ríos y deja su sedimento al llegar abajo.',
    'mesetas': 'Capas de roca dura y desmoronamiento: los bordes de una meseta se escalonan en terrazas.',
  },
};
