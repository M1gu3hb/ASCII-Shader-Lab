import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'nubes_vol',
  name: 'Nubes volumétricas',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  blurb: 'Nubes con volumen, iluminadas por el sol: un mar de nubes, una nebulosa o haces de luz.',
  mechanism: 'Cada celda recorre un rayo a través de una capa de densidad hecha con ruido fractal, recortada por la cobertura y erosionada en los bordes. La luz se apaga según la ley de Beer–Lambert; cada muestra mira hacia el sol para saber cuánta luz le llega y la reparte con una función de fase de Henyey–Greenstein (el borde plateado a contraluz).',
  time: 'Una función del tiempo: el viento arrastra el ruido y, dentro de la capa, las nubes vienen hacia ti. Admite bucle perfecto.',
  extends: 'nube',
  params: [
    { key: 'cover', label: 'Cobertura', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Cuánto cielo tapan las nubes; con 0, despejado.' },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.4, max: 3, def: 1, step: 0.01, hint: 'Tamaño de las nubes.' },
    { key: 'erosion', label: 'Erosión', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01, hint: 'Deshilacha los bordes con un ruido más fino.' },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 2, def: 0.4, step: 0.01, hint: 'Velocidad con que se mueven las nubes.' },
    { key: 'sun', label: 'Luz', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01, hint: 'Posición del sol: a tu espalda (0) o enfrente, a contraluz (1).' },
    { key: 'absorb', label: 'Absorción', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01, hint: 'Lo opacas que son: con más, el interior se oscurece y las bases se vuelven grises.' },
    { key: 'steps', label: 'Calidad', type: 'int', min: 12, max: 64, def: 40, unit: 'pasos', hint: 'Pasos del rayo a través de la capa.', advanced: true },
    { key: 'camera', label: 'Cámara', type: 'choice', def: 'horizonte', options: [
      { id: 'dentro', label: 'Dentro' }, { id: 'horizonte', label: 'Sobre el mar de nubes' }, { id: 'haces', label: 'Haces de luz' },
    ], hint: 'Dentro: vuelas a través de la capa. Haces: bajo la capa, en una bruma que el sol atraviesa por los huecos.' },
  ],
  presets: [
    { id: 'banco', name: 'Banco de nubes', desc: 'Un mar de nubes desde arriba, con el sol bajo que ilumina las cimas.', params: { cover: 0.78, scale: 1.1, erosion: 0.45, wind: 0.35, sun: 0.55, absorb: 1, steps: 40, camera: 'horizonte' }, look: { stops: ['#0b1220', '#f3f0e6'], bg: '#060a12', charset: ' .:-=+*#%@' } },
    { id: 'nebulosa', name: 'Nebulosa', desc: 'Dentro de una nube deshilachada y a contraluz: filamentos que brillan contra el negro.', params: { cover: 0.45, scale: 1.1, erosion: 1, wind: 0.6, sun: 0.9, absorb: 2.2, steps: 36, camera: 'dentro' }, look: { stops: ['#0c0414', '#ffb8e8'], bg: '#05020a', charset: ' .·:;+*#@' } },
    { id: 'haces', name: 'Haces de luz', desc: 'Bajo una capa rota: el sol entra por los huecos y dibuja columnas en la bruma.', params: { cover: 0.8, scale: 1.6, erosion: 0.3, wind: 0.3, sun: 0.85, absorb: 2.6, steps: 40, camera: 'haces' }, look: { stops: ['#100c06', '#ffe6b0'], bg: '#080603', charset: ' .\'`:;|!#' } },
  ],
  caps: { loop: true, basic: 'reduced', basicNote: 'En el motor básico: como mucho 32 pasos de rayo, 3 hacia el sol y 10 en la bruma.', checkpoint: false },
  budget: { limits: 'Hasta 64 pasos de rayo por celda, 5 hacia el sol por muestra iluminada y 3 por muestra de bruma; cada muestra son 4 o 5 octavas de ruido.' },
  sources: [
    { label: 'Maxime Heckel: Real-time dreamy cloudscapes with volumetric raymarching (sólo la técnica)', url: 'https://blog.maximeheckel.com/posts/real-time-cloudscapes-with-volumetric-raymarching/' },
    { label: 'Hillaire (2016): Physically based sky, atmosphere and cloud rendering in Frostbite (curso de SIGGRAPH)', url: 'https://blog.selfshadow.com/publications/s2016-shading-course/' },
    { label: 'Ley de Beer–Lambert', url: 'https://en.wikipedia.org/wiki/Beer%E2%80%93Lambert_law' },
  ],
};
