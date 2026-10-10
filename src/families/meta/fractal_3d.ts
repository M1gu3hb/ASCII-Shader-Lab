import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'fractal_3d',
  name: 'Fractales 3D',
  group: 'ciencia',
  kind: 'analytic',
  version: 1,
  extends: 'mandelbrot',
  params: [
    { key: 'form', label: 'Forma', type: 'choice', def: 'bulb', options: [{ id: 'bulb', label: 'Mandelbulb' }, { id: 'box', label: 'Mandelbox' }] },
    { key: 'power', label: 'Potencia', type: 'number', min: 2, max: 12, def: 8, step: 0.1 },
    { key: 'iters', label: 'Iteraciones', type: 'int', min: 3, max: 12, def: 7 },
    { key: 'cut', label: 'Corte', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'orbit', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.2, step: 0.01 },
    { key: 'dist', label: 'Distancia', type: 'number', min: 1.6, max: 4.5, def: 3, step: 0.01 },
    { key: 'breathe', label: 'Respiración', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01 },
    { key: 'light', label: 'Luz', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
  ],
  presets: [
    { id: 'bulbo', name: 'Bulbo clásico', params: { form: 'bulb', power: 8, iters: 7, cut: 0, orbit: 0.2, dist: 3, breathe: 0.1, light: 0.6 }, look: { stops: ['#0b0712', '#f4d0a8'], bg: '#050309', charset: ' .:-=+*#%@' } },
    { id: 'corte', name: 'Corte interior', params: { form: 'bulb', power: 6, iters: 8, cut: 0.55, orbit: 0.12, dist: 2.4, breathe: 0, light: 0.8 }, look: { stops: ['#04100f', '#9ff2de'], bg: '#020807', charset: ' .·:;oO@' } },
    { id: 'caja', name: 'Caja plegada', params: { form: 'box', power: 6, iters: 10, cut: 0, orbit: 0.15, dist: 3, breathe: 0.05, light: 0.4 }, look: { stops: ['#0e0a06', '#ffd27a'], bg: '#070503', charset: ' .-=+#' } },
  ],
  caps: { loop: true, basic: 'reduced', basicNote: 'En el motor básico: 56 pasos de rayo y sin sombra suave.', checkpoint: false },
  budget: { },
  figure: true,
};
