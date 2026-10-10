import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Las nubes de probabilidad del átomo de hidrógeno, y la mezcla de dos estados que late.',
  mechanism: 'Funciones de onda del hidrógeno: una parte radial (polinomios de Laguerre, con n − l − 1 nodos) por un armónico esférico real. Dos estados superpuestos cambian su fase relativa al ritmo de su diferencia de energía (E ∝ −1/n²), así que la densidad va y viene. Cada celda recorre un rayo que suma |ψ|² o busca la superficie donde |ψ|² vale el nivel.',
  time: 'Una función del tiempo: la cámara gira y la superposición oscila con un periodo fijo. Admite bucle perfecto.',
  limits: 'Hasta 64 muestras por rayo, 5 bisecciones y 6 muestras para la normal; polinomios de grado ≤ 3 y n ≤ 4.',
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
    'mode': 'Densidad: la probabilidad sumada a lo largo de la vista. Fase: la superficie, más tenue donde ψ es negativa.',
    'level': 'Densidad de la superficie: más alto, lóbulos más pequeños. En «Densidad», apaga lo que queda por debajo.',
    'turn': 'Vueltas por minuto alrededor del eje z.',
    'expo': 'Brillo: en «Densidad», cuánta probabilidad enciende una celda.',
  },
  presets: {
    'lobulos': 'El orbital 3dz²: dos lóbulos y un anillo de signo contrario, en tonos de fase.',
    'dipolo': 'La mitad de 1s y la mitad de 2pz: la nube sube y baja cada cuatro segundos, como la transición Lyman-α.',
    'anillos': 'El orbital 4fz³: lóbulos en el eje y dos conos que forman anillos.',
    'hibrido': 'Dos estados de igual energía: no oscilan, se suman en un lóbulo grande y uno pequeño.',
  },
};
