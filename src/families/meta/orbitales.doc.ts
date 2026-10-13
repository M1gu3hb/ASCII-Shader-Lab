import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Nubes y lóbulos de cristal que laten: la probabilidad de un electrón, y la mezcla de dos estados que va y viene.',
  mechanism: 'Funciones de onda del átomo de hidrógeno: una parte radial (polinomios de Laguerre, con n − l − 1 nodos) por un armónico esférico real. Dos estados superpuestos cambian su fase relativa al ritmo de su diferencia de energía (E ∝ −1/n²), así que la densidad va y viene. Cada celda recorre un rayo que suma |ψ|² (una nube), busca la superficie donde |ψ|² vale el nivel (una figura maciza, con tono de fase si se quiere) o cruza tres superficies anidadas que brillan donde el rayo las roza, como láminas de cristal.',
  time: 'Una función del tiempo. Con la cámara quieta es un bucle exacto: el latido de los dos estados (por ejemplo «Nube pendular», 4 s; «Lóbulos que laten», 20 s). Con giro de cámara es continuo: la vuelta y el latido no vuelven a coincidir. Dos estados con el mismo n no laten: con la cámara quieta la figura se queda fija, y girando (como «Faro») sólo se mueve la cámara, que vuelve a su sitio en 60 / giro segundos: es un bucle exacto de esa duración («Faro», 240 s).',
  limits: 'Hasta 64 muestras por rayo, 5 bisecciones y 6 muestras para la normal (en «Capas», 7 más por cada cruce de una lámina); polinomios de grado ≤ 3 y n ≤ 4.',
  sources: [
    { label: 'El átomo de hidrógeno: funciones de onda y polinomios de Laguerre', url: 'https://en.wikipedia.org/wiki/Hydrogen_atom#Wavefunction' },
    { label: 'Armónicos esféricos reales', url: 'https://en.wikipedia.org/wiki/Table_of_spherical_harmonics#Real_spherical_harmonics' },
    { label: 'Paul Falstad: applet de orbitales del hidrógeno (sólo la física)', url: 'https://www.falstad.com/qmatom/' },
  ],
  hints: {
    'a': 'n, l y la forma del armónico: s, p, d, f.',
    'b': 'Con el mismo n que A no oscila (estados de igual energía): forma un híbrido quieto, como sp.',
    'mix': 'De sólo A (0) a sólo B (1).',
    'speed': 'Cámara lenta de la oscilación: de verdad dura de attosegundos (1s+2p) a femtosegundos.',
    'mode': 'Densidad: la probabilidad sumada a lo largo de la vista. Fase: la superficie, más tenue donde ψ es negativa. Capas: tres superficies anidadas como láminas de cristal.',
    'level': 'Densidad de la superficie: más alto, lóbulos más pequeños. En «Densidad», apaga lo que queda por debajo.',
    'turn': 'Vueltas por minuto alrededor del eje vertical (0: un bucle exacto del latido). Los orbitales que son iguales alrededor de ese eje no cambian al girar.',
    'expo': 'Brillo: en «Densidad», cuánta probabilidad enciende una celda.',
  },
  presets: {
    'lobulos': 'Dos lóbulos y un anillo en tonos de fase que se hinchan por turnos, arriba y abajo, cada 20 s.',
    'dipolo': 'Una nube que sube y baja cada 4 segundos, como un péndulo de luz.',
    'anillos': 'Láminas de cristal anidadas: un lóbulo arriba, anillos en el medio y una copa abajo que respiran cada 24 s.',
    'hibrido': 'Un lóbulo grande y uno pequeño apuntando a un lado, como el haz de un faro, mientras la cámara da la vuelta.',
    'estrella': 'Ocho lóbulos de cristal en las diagonales de un cubo que giran y cambian de brillo sin repetirse.',
  },
};
