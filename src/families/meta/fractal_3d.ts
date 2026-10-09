import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'fractal_3d',
  name: 'Fractales 3D',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  blurb: 'Mandelbulb y Mandelbox: volúmenes fractales recorridos con una cámara.',
  mechanism: 'Cada celda lanza un rayo que avanza según una estimación de la distancia al fractal (ray marching). El Mandelbulb eleva un punto 3D a una potencia en coordenadas esféricas; el Mandelbox lo pliega y escala.',
  time: 'Una función del tiempo: la cámara gira y la potencia puede respirar. Admite bucle perfecto.',
  extends: 'mandelbrot',
  params: [
    { key: 'form', label: 'Forma', type: 'choice', def: 'bulb', options: [{ id: 'bulb', label: 'Mandelbulb' }, { id: 'box', label: 'Mandelbox' }] },
    { key: 'power', label: 'Potencia', type: 'number', min: 2, max: 12, def: 8, step: 0.1, hint: 'Mandelbulb: número de lóbulos. Mandelbox: escala del plegado (de 2 a 3).' },
    { key: 'iters', label: 'Iteraciones', type: 'int', min: 3, max: 12, def: 7, hint: 'Detalle de la superficie.' },
    { key: 'cut', label: 'Corte', type: 'number', min: 0, max: 1, def: 0, step: 0.01, hint: 'Un plano que abre el volumen para ver dentro.' },
    { key: 'orbit', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.2, step: 0.01, hint: 'Vueltas de la cámara por minuto ×10.' },
    { key: 'dist', label: 'Distancia', type: 'number', min: 1.6, max: 4.5, def: 3, step: 0.01, hint: 'Cerca para entrar en el detalle.' },
    { key: 'breathe', label: 'Respiración', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01, hint: 'La potencia oscila con el tiempo.' },
    { key: 'light', label: 'Luz', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01, hint: 'Ángulo de la luz: de frente a rasante.' },
  ],
  presets: [
    { id: 'bulbo', name: 'Bulbo clásico', desc: 'El Mandelbulb de potencia 8 visto entero.', params: { form: 'bulb', power: 8, iters: 7, cut: 0, orbit: 0.2, dist: 3, breathe: 0.1, light: 0.6 }, look: { stops: ['#0b0712', '#f4d0a8'], bg: '#050309', charset: ' .:-=+*#%@' } },
    { id: 'corte', name: 'Corte interior', desc: 'Un plano abre el volumen y deja ver sus cavidades.', params: { form: 'bulb', power: 6, iters: 8, cut: 0.55, orbit: 0.12, dist: 2.4, breathe: 0, light: 0.8 }, look: { stops: ['#04100f', '#9ff2de'], bg: '#020807', charset: ' .·:;oO@' } },
    { id: 'caja', name: 'Caja plegada', desc: 'El Mandelbox: arquitectura de pliegues cúbicos.', params: { form: 'box', power: 6, iters: 10, cut: 0, orbit: 0.15, dist: 3, breathe: 0.05, light: 0.4 }, look: { stops: ['#0e0a06', '#ffd27a'], bg: '#070503', charset: ' .-=+#' } },
  ],
  caps: { loop: true, basic: 'reduced', basicNote: 'En el motor básico: 56 pasos de rayo y sin sombra suave.', checkpoint: false },
  budget: { limits: 'Hasta 96 pasos de rayo por celda (sólo dentro de la esfera que lo contiene) y 12 iteraciones del fractal; sombra suave de 12 pasos.' },
  sources: [
    { label: '4rknova: Mandelbulb, implementación y explicación', url: 'https://www.4rknova.com/blog/2025/09/01/mandelbulb' },
    { label: 'Artículo sobre fractales 3D por estimación de distancia', url: 'https://arxiv.org/abs/2102.01747' },
  ],
  figure: true,
};
