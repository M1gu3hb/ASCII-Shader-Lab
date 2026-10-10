import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'gravedad',
  name: 'Gravedad N-cuerpos',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  params: [
    { key: 'bodies', label: 'Cuerpos', type: 'int', min: 100, max: 1200, def: 300, rebuild: true },
    { key: 'init', label: 'Condiciones iniciales', type: 'choice', def: 'disco', rebuild: true, options: [
      { id: 'disco', label: 'Disco galáctico' }, { id: 'choque', label: 'Dos cúmulos que chocan' },
      { id: 'colapso', label: 'Nube fría que colapsa' }, { id: 'binario', label: 'Estrella doble con anillo' },
    ] },
    { key: 'masses', label: 'Masas', type: 'choice', def: 'iguales', rebuild: true, options: [{ id: 'iguales', label: 'Iguales' }, { id: 'variadas', label: 'Variadas' }] },
    { key: 'G', label: 'Atracción', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01 },
    { key: 'soft', label: 'Suavizado', type: 'number', min: 0.005, max: 0.2, def: 0.04, step: 0.001, digits: 3 },
    { key: 'dt', label: 'Paso temporal', type: 'number', min: 0.002, max: 0.03, def: 0.012, step: 0.001, digits: 3 },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.5, step: 0.01 },
    { key: 'zoom', label: 'Zoom', type: 'number', min: 0.4, max: 3, def: 1, step: 0.01 },
    { key: 'tilt', label: 'Inclinación', type: 'number', min: 0, max: 85, def: 35, step: 1, unit: '°' },
    { key: 'spin', label: 'Giro', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01 },
    { key: 'view', label: 'Vista', type: 'choice', def: 'masa', options: [{ id: 'masa', label: 'Brillo por masa' }, { id: 'velocidad', label: 'Brillo por velocidad' }] },
  ],
  presets: [
    { id: 'galaxia', name: 'Galaxia espiral', params: { bodies: 700, init: 'disco', masses: 'iguales', G: 1, soft: 0.03, dt: 0.012, trail: 0.55, zoom: 1.05, tilt: 40, spin: 0.15, view: 'velocidad' }, look: { stops: ['#05060f', '#c8d4ff'], bg: '#020309', charset: ' .·:*+#@' } },
    { id: 'choque', name: 'Choque de cúmulos', params: { bodies: 700, init: 'choque', masses: 'variadas', G: 1, soft: 0.04, dt: 0.012, trail: 0.4, zoom: 1.2, tilt: 30, spin: 0.08, view: 'masa' }, look: { stops: ['#0f0805', '#ffd9a8'], bg: '#080402', charset: ' .:-=+*#' } },
    { id: 'colapso', name: 'Colapso frío', params: { bodies: 700, init: 'colapso', masses: 'iguales', G: 1, soft: 0.05, dt: 0.01, trail: 0.7, zoom: 1, tilt: 60, spin: 0.2, view: 'velocidad' }, look: { stops: ['#0a0410', '#f0b8ff'], bg: '#050208', charset: ' .`:;oO@' } },
    { id: 'binaria', name: 'Estrella doble con anillo', params: { bodies: 600, init: 'binario', masses: 'iguales', G: 1, soft: 0.03, dt: 0.01, trail: 0.85, zoom: 1, tilt: 25, spin: 0.05, view: 'masa' }, look: { stops: ['#03100c', '#a8ffd8'], bg: '#010805', charset: ' .-~=*#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'masa', label: 'Añadir masa', hint: 'Deja un cuerpo pesado en reposo donde tocas (hasta 12).' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 30 },
  wrap: 'clamp',
  figure: true,
};
