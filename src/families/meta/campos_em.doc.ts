import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cargas, espiras e imanes con sus líneas de campo en 3D, y partículas que viajan por ellas.',
  mechanism: 'Las líneas se trazan siguiendo el campo paso a paso (Runge–Kutta) desde puntos alrededor de cada fuente, tantos como su intensidad: el campo eléctrico de Coulomb sale de las cargas positivas y entra en las negativas; el magnético de una espira se suma tramo a tramo (Biot–Savart) y el de un imán es el de un dipolo. Las líneas magnéticas se cierran sobre sí mismas.',
  time: 'Las líneas crecen desde las fuentes durante los primeros segundos; la cámara gira y las partículas fluyen, más rápido donde el campo es más fuerte. El crecimiento no es un bucle.',
  limits: 'Hasta 120 líneas de 420 pasos de RK4 cada una, trazadas una vez por configuración; espiras de 32 tramos; partículas ≤ 8 por línea.',
  sources: [
    { label: 'Ley de Biot–Savart', url: 'https://en.wikipedia.org/wiki/Biot%E2%80%93Savart_law' },
    { label: 'Líneas de campo como curvas integrales del campo', url: 'https://en.wikipedia.org/wiki/Field_line' },
    { label: 'Paul Falstad: applets de campos (sólo la física)', url: 'https://www.falstad.com/vector3de/' },
  ],
  hints: {
    'config': 'Cada configuración tiene una segunda fuente según la intensidad relativa: la otra carga, otra espira en el mismo eje u otro imán al lado.',
    'sep': 'Distancia entre las fuentes.',
    'ratio': 'La segunda fuente frente a la primera: carga, corriente o imán. Con 0 queda una sola.',
    'lines': 'Por unidad de intensidad: una fuente el doble de fuerte tiene el doble.',
    'particles': 'Partículas de prueba en cada línea.',
    'turn': 'Vueltas por minuto.',
    'tilt': 'La cámara por encima o por debajo del plano de las fuentes.',
    'view': 'Flujo: las partículas mandan. Potencial: bandas equipotenciales (|B| en las espiras) en el plano que mira a la cámara.',
  },
  presets: {
    'dipolo': 'Una carga positiva y otra negativa: las líneas salen de una y se curvan hasta la otra.',
    'repulsion': 'Dos cargas positivas, una el doble que la otra: las líneas se apartan y dejan un punto sin campo.',
    'helmholtz': 'Dos espiras iguales separadas un radio: entre ellas el campo es casi uniforme.',
    'cuadrupolo': 'Cuatro cargas alternas: las líneas saltan a la vecina y el centro queda vacío.',
    'iman': 'Un dipolo magnético solo: líneas cerradas que salen del norte y vuelven por el sur.',
  },
};
