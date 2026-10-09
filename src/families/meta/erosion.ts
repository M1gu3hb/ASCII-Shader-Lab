import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'erosion',
  name: 'Terreno que se erosiona',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Un relieve en maqueta que la lluvia talla: barrancos, ríos que bajan al mar y mesetas en terrazas.',
  mechanism: 'Miles de gotas de lluvia caen sobre una rejilla de alturas y ruedan cuesta abajo, ganando velocidad y perdiendo agua. Cada gota arranca roca mientras puede cargar más sedimento y lo deja caer donde se frena, cuesta arriba o al llegar al mar. Las laderas más empinadas que el talud se desmoronan; los estratos duros resisten.',
  time: 'Evoluciona con memoria: el terreno cambia poco a poco y no vuelve atrás; la cámara gira alrededor. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  extends: 'topografia',
  params: [
    { key: 'shape', label: 'Relieve inicial', type: 'choice', def: 'cordillera', rebuild: true, options: [
      { id: 'cordillera', label: 'Cordillera' }, { id: 'ladera', label: 'Ladera hacia el mar' }, { id: 'meseta', label: 'Meseta' },
    ], hint: 'La forma de partida, hecha con ruido a partir de la semilla.' },
    { key: 'height', label: 'Altura', type: 'number', min: 0.2, max: 1, def: 0.6, step: 0.01, rebuild: true, hint: 'Lo alto del relieve inicial: más altura, más pendiente y más fuerza del agua.' },
    { key: 'scale', label: 'Escala del ruido', type: 'number', min: 1.5, max: 8, def: 3, step: 0.1, rebuild: true, hint: 'Más: montes más pequeños y numerosos.' },
    { key: 'rain', label: 'Lluvia', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Gotas que caen en cada paso (hasta 96, en sitios que salen de la semilla).' },
    { key: 'erode', label: 'Erosión', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Lo deprisa que el agua arranca roca.' },
    { key: 'deposit', label: 'Depósito', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Lo deprisa que el sedimento se posa donde el agua se frena.' },
    { key: 'capacity', label: 'Capacidad', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Cuánto sedimento puede llevar una gota según su velocidad, su agua y la pendiente.' },
    { key: 'evap', label: 'Evaporación', type: 'number', min: 0, max: 1, def: 0.3, step: 0.01, hint: 'Lo deprisa que se secan las gotas: poca evaporación, ríos largos que llegan al mar.' },
    { key: 'talus', label: 'Pendiente de talud', type: 'number', min: 15, max: 75, def: 40, step: 1, unit: '°', hint: 'Las laderas más empinadas se desmoronan hasta este ángulo.' },
    { key: 'strata', label: 'Estratos', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Capas de roca dura cada pocos metros: las laderas se vuelven terrazas.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'relieve', options: [
      { id: 'relieve', label: 'Relieve 3D' }, { id: 'agua', label: 'Mapa del agua' }, { id: 'alturas', label: 'Mapa de alturas' },
    ] },
    { key: 'orbit', label: 'Giro de cámara', type: 'number', min: -2, max: 2, def: 0.5, step: 0.01, unit: 'vueltas/min', hint: 'La cámara rodea la maqueta (vista 3D).' },
    { key: 'pitch', label: 'Inclinación', type: 'number', min: 0, max: 1, def: 0.4, step: 0.01, hint: 'De una mirada rasante a una vista alta (vista 3D).' },
  ],
  presets: [
    { id: 'barrancos', name: 'Barrancos', desc: 'Lluvia fuerte y roca blanda sobre una cordillera: el agua talla surcos profundos en las laderas.', params: { shape: 'cordillera', height: 0.75, scale: 3, rain: 0.7, erode: 0.9, deposit: 0.3, capacity: 0.8, evap: 0.3, talus: 45, strata: 0, view: 'relieve', orbit: 0.6, pitch: 0.45 }, look: { stops: ['#0b0906', '#e8c9a0'], bg: '#060503', charset: ' .:-=+*#%@' } },
    { id: 'delta', name: 'Ríos y delta', desc: 'Una ladera que baja al mar: el agua se junta en ríos y deja su sedimento al llegar abajo.', params: { shape: 'ladera', height: 0.6, scale: 2.5, rain: 0.6, erode: 0.6, deposit: 0.7, capacity: 0.6, evap: 0.08, talus: 40, strata: 0, view: 'relieve', orbit: 0.4, pitch: 0.6 }, look: { stops: ['#04100c', '#7fe0c0', '#effff8'], bg: '#020806', charset: ' .·:;=+#' } },
    { id: 'mesetas', name: 'Mesetas', desc: 'Capas de roca dura y desmoronamiento: los bordes de una meseta se escalonan en terrazas.', params: { shape: 'meseta', height: 0.8, scale: 4, rain: 0.2, erode: 0.5, deposit: 0.4, capacity: 0.5, evap: 0.4, talus: 22, strata: 1, view: 'relieve', orbit: 0.5, pitch: 0.2 }, look: { stops: ['#120806', '#ffb27a'], bg: '#090403', charset: ' .-=+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: {
    res: [48, 160, 112], rate: 30, warmup: 30,
    limits: 'Rejilla de alturas de 1,15 × filas celdas por lado (hasta 160 × 160) más su mapa de caudal (8 bytes por celda); hasta 96 gotas por paso de 64 pasos de vida cada una. Al dibujar, unos 500 pasos de rayo por columna.',
  },
  sources: [
    { label: 'Beyer (2015): Implementation of a method for hydraulic erosion', url: 'https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf' },
    { label: 'Sebastian Lague: Hydraulic Erosion', url: 'https://github.com/SebLague/Hydraulic-Erosion' },
    { label: 'Olsen (2004): Realtime Procedural Terrain Generation (erosión térmica)', url: 'https://web.mit.edu/cesium/Public/terrain.pdf' },
    { label: 's-macke: VoxelSpace (el algoritmo de Comanche)', url: 'https://github.com/s-macke/VoxelSpace' },
  ],
  wrap: 'clamp',
  figure: true,
};
