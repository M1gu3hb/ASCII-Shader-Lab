import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una piscina vista desde arriba: gotas, ondas que rebotan y redes de luz que bailan en el fondo.',
  mechanism: 'La superficie es una rejilla de alturas que sigue la ecuación de ondas con amortiguación; las paredes y los obstáculos reflejan las ondas. La luz atraviesa la superficie, se refracta y se concentra en el fondo: esas cáusticas se calculan proyectando la luz de cada punto de la superficie hasta el suelo de baldosas.',
  time: 'Evoluciona con memoria: cada onda sale de las anteriores y la lluvia cae donde dice la semilla. Con lluvia u oleaje es continuo: siempre llegan ondas nuevas y la amortiguación calma las viejas. Sin lluvia ni oleaje, el agua se calma hasta quedar lisa y sólo tus gotas la mueven. Se puede pausar y guardar su estado; no repite un bucle perfecto.',
  limits: 'Rejilla de alturas de 2 × filas columnas (8 bytes por celda); hasta 8 gotas por paso y 48 por trazo. Al dibujar, un rayo de luz por celda para las cáusticas (las recetas de la versión 1 conservan sus cuatro rayos por celda).',
  sources: [
    { label: 'Evan Wallace: WebGL Water', url: 'https://madebyevan.com/webgl-water/' },
    { label: 'GPU Gems, cap. 2: Rendering Water Caustics', url: 'https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics' },
  ],
  hints: {
    'rain': 'Gotas que caen cada segundo en sitios que salen de la semilla.',
    'drop': 'Ancho del hoyuelo que deja cada gota: más grande, ondas más largas.',
    'damp': 'Lo rápido que se calman las ondas; las cortas, antes que las largas.',
    'speed': 'Lo rápido que viajan las ondas (dentro del margen estable).',
    'paddle': 'Una pala junto a la pared izquierda hace olas planas; los dos extremos se vuelven playas que las absorben.',
    'obst': 'Lo que hay en el agua y refleja las ondas.',
    'depth': 'Más hondo: el fondo se deforma más y las cáusticas se enfocan en hilos.',
    'light': 'De dónde viene la luz: mueve los brillos y las cáusticas.',
    'view': 'El fondo de baldosas visto a través del agua, sólo la luz que llega al fondo, o la superficie iluminada.',
  },
  presets: {
    'piscina': 'Lluvia fina sobre agua honda: la luz se junta en celdas brillantes que tiemblan sobre las baldosas.',
    'destellos': 'Sólo la luz que llega al fondo: manchas y cordones brillantes que bailan sobre la oscuridad.',
    'lluvia': 'Muchas gotas entre rocas: anillos que se cruzan, rebotan en las piedras y se calman deprisa (vista de la superficie).',
    'canal': 'Olas planas pasan por dos rendijas y se abren en franjas de interferencia (vista de las cáusticas).',
  },
};
