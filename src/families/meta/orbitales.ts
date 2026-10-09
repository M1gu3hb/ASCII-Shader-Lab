import type { FamilyMeta } from '../types';

const STATES = [
  { id: '1s', label: '1s' }, { id: '2s', label: '2s' }, { id: '2pz', label: '2pz' }, { id: '2px', label: '2px' },
  { id: '3s', label: '3s' }, { id: '3pz', label: '3pz' }, { id: '3dz2', label: '3dz²' }, { id: '3dxy', label: '3dxy' },
  { id: '3dxz', label: '3dxz' }, { id: '4s', label: '4s' }, { id: '4pz', label: '4pz' }, { id: '4dz2', label: '4dz²' },
  { id: '4fz3', label: '4fz³' }, { id: '4fxyz', label: '4fxyz' }, { id: '4fx3', label: '4fx(x²−3y²)' },
];

export const META: FamilyMeta = {
  id: 'orbitales',
  name: 'Orbitales y superposiciones',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  blurb: 'Las nubes de probabilidad del átomo de hidrógeno, y la mezcla de dos estados que late.',
  mechanism: 'Funciones de onda del hidrógeno: una parte radial (polinomios de Laguerre, con n − l − 1 nodos) por un armónico esférico real. Dos estados superpuestos cambian su fase relativa al ritmo de su diferencia de energía (E ∝ −1/n²), así que la densidad va y viene. Cada celda recorre un rayo que suma |ψ|² o busca la superficie donde |ψ|² vale el nivel.',
  time: 'Una función del tiempo: la cámara gira y la superposición oscila con un periodo fijo. Admite bucle perfecto.',
  params: [
    { key: 'a', label: 'Estado A', type: 'choice', def: '2px', options: STATES, hint: 'n, l y la forma del armónico: s, p, d, f.' },
    { key: 'b', label: 'Estado B', type: 'choice', def: '3dz2', options: STATES, hint: 'Con el mismo n que A no oscila (estados de igual energía): forma un híbrido quieto, como sp.' },
    { key: 'mix', label: 'Mezcla', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01, hint: 'De sólo A (0) a sólo B (1).' },
    { key: 'speed', label: 'Velocidad de fase', type: 'number', min: 0, max: 4, def: 1, step: 0.01, hint: 'Cámara lenta de la oscilación: de verdad dura de attosegundos (1s+2p) a femtosegundos.' },
    { key: 'mode', label: 'Modo', type: 'choice', def: 'iso', options: [
      { id: 'densidad', label: 'Densidad' }, { id: 'iso', label: 'Isosuperficie' }, { id: 'fase', label: 'Fase' },
    ], hint: 'Densidad: la probabilidad sumada a lo largo de la vista. Fase: la superficie, más tenue donde ψ es negativa.' },
    { key: 'level', label: 'Nivel', type: 'number', min: 0, max: 1, def: 0.45, step: 0.01, hint: 'Densidad de la superficie: más alto, lóbulos más pequeños. En «Densidad», apaga lo que queda por debajo.' },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.3, step: 0.01, hint: 'Vueltas por minuto alrededor del eje z.' },
    { key: 'expo', label: 'Exposición', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01, hint: 'Brillo: en «Densidad», cuánta probabilidad enciende una celda.' },
  ],
  presets: [
    { id: 'lobulos', name: 'Lóbulos 3d', desc: 'El orbital 3dz²: dos lóbulos y un anillo de signo contrario, en tonos de fase.', params: { a: '3dz2', b: '3dz2', mix: 0, speed: 0, mode: 'fase', level: 0.45, turn: 0.4, expo: 1.2 }, look: { stops: ['#05070f', '#bfe0ff'], bg: '#03050a', charset: ' .:-=+*#%@' } },
    { id: 'dipolo', name: 'Superposición 1s+2p (dipolo que oscila)', desc: 'La mitad de 1s y la mitad de 2pz: la nube sube y baja cada cuatro segundos, como la transición Lyman-α.', params: { a: '1s', b: '2pz', mix: 0.55, speed: 1, mode: 'densidad', level: 0.12, turn: 0.15, expo: 2 }, look: { stops: ['#0b0612', '#ffd6a0'], bg: '#060309', charset: ' .·:;+*#@' } },
    { id: 'anillos', name: 'Anillos 4f', desc: 'El orbital 4fz³: lóbulos en el eje y dos conos que forman anillos.', params: { a: '4fz3', b: '4fz3', mix: 0, speed: 0, mode: 'iso', level: 0.55, turn: -0.3, expo: 1.1 }, look: { stops: ['#041008', '#b6f5c8'], bg: '#020804', charset: ' .-=+*#' } },
    { id: 'hibrido', name: 'Híbrido sp (2s+2p)', desc: 'Dos estados de igual energía: no oscilan, se suman en un lóbulo grande y uno pequeño.', params: { a: '2s', b: '2pz', mix: 0.5, speed: 1, mode: 'iso', level: 0.4, turn: 0.25, expo: 1 }, look: { stops: ['#100606', '#ffc2b0'], bg: '#080303', charset: ' .:;oO@' } },
  ],
  caps: { loop: true, basic: 'full', checkpoint: false },
  budget: { limits: 'Hasta 64 muestras por rayo, 5 bisecciones y 6 muestras para la normal; polinomios de grado ≤ 3 y n ≤ 4.' },
  sources: [
    { label: 'El átomo de hidrógeno: funciones de onda y polinomios de Laguerre', url: 'https://en.wikipedia.org/wiki/Hydrogen_atom#Wavefunction' },
    { label: 'Armónicos esféricos reales', url: 'https://en.wikipedia.org/wiki/Table_of_spherical_harmonics#Real_spherical_harmonics' },
    { label: 'Paul Falstad: applet de orbitales del hidrógeno (sólo la física)', url: 'https://www.falstad.com/qmatom/' },
  ],
  figure: true,
};
