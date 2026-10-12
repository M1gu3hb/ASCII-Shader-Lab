import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'fluido',
  name: 'Fluido 2D',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  extends: 'campo_flujo',
  aka: ['Fluidos estables de Stam', 'Navier–Stokes incompresible', 'Simulación de fluidos', 'Tinta', 'Humo'],
  params: [
    { key: 'jets', label: 'Emisores', type: 'int', min: 0, max: 8, def: 4 },
    { key: 'layout', label: 'Chorros', type: 'choice', def: 'libres', options: [
      { id: 'libres', label: 'Libres' }, { id: 'suelo', label: 'Desde el suelo' }, { id: 'arriba', label: 'Desde arriba' },
      { id: 'izquierda', label: 'Corriente desde la izquierda' },
      { id: 'orbitas', label: 'Emisores en órbita' }, { id: 'chorro', label: 'Chorro sumergido (desde el fondo)' },
    ] },
    { key: 'force', label: 'Fuerza', type: 'number', min: 0.3, max: 5, def: 2, step: 0.05, unit: 'celdas/paso' },
    { key: 'motion', label: 'Movimiento', type: 'number', min: 0, max: 2, def: 0.4, step: 0.01 },
    { key: 'pulse', label: 'Pulsos', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'vort', label: 'Vorticidad', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
    { key: 'visc', label: 'Viscosidad', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'buoy', label: 'Flotación', type: 'number', min: -1, max: 1, def: 0, step: 0.01 },
    { key: 'obst', label: 'Obstáculos', type: 'int', min: 0, max: 6, def: 0 },
    { key: 'iters', label: 'Iteraciones de presión', type: 'int', min: 4, max: 40, def: 14, advanced: true },
    { key: 'dyeDiss', label: 'Disipación de la tinta', type: 'number', min: 0.02, max: 1.5, def: 0.25, step: 0.01, unit: '/s' },
    { key: 'ink', label: 'Qué echan los chorros', type: 'choice', def: 'tinta', options: [
      { id: 'tinta', label: 'Tinta' }, { id: 'alterna', label: 'Tinta y agua clara' }, { id: 'nada', label: 'Nada: sólo remueven' },
      { id: 'tonos', label: 'Un tono por emisor' },
    ] },
    { key: 'bands', label: 'Franjas', type: 'int', min: 0, max: 12, def: 0 },
    { key: 'renew', label: 'Renovación de las franjas', type: 'number', min: 0, max: 1, def: 0.3, step: 0.01 },
    { key: 'sharp', label: 'Bordes nítidos', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'contrast', label: 'Contraste', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'view', label: 'Vista', type: 'choice', def: 'tinta', options: [
      { id: 'tinta', label: 'Tinta' }, { id: 'velocidad', label: 'Velocidad' }, { id: 'vorticidad', label: 'Vorticidad' },
      { id: 'contornos', label: 'Curvas de nivel' },
    ] },
    { key: 'shear', label: 'Perturbación de cizalla', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
  ],
  presets: [
    {
      id: 'tinta_agua', name: 'Tinta en agua', aka: ['Gotas de tinta', 'Inestabilidad de Rayleigh–Taylor'], uses: ['fondos/organicas', 'arte/organicas'],
      params: { jets: 6, layout: 'arriba', force: 1.2, motion: 0.2, pulse: 0.6, vort: 0, visc: 0.05, buoy: -0.7, obst: 0, iters: 14, dyeDiss: 0.22, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0.35, contrast: 0.4, view: 'tinta' },
      look: { stops: ['#070a12', '#cfe0ff'], bg: '#04060b', charset: ' .·:-=+*#' },
    },
    {
      id: 'marmol', name: 'Mármol líquido', aka: ['Marmoleado', 'Suminagashi', 'Ebru', 'Advección de un escalar pasivo'], uses: ['fondos/organicas', 'arte/organicas', 'tipo/texturas'],
      params: { jets: 3, layout: 'libres', force: 1, motion: 0.25, pulse: 0, vort: 0.15, visc: 0.15, buoy: 0, obst: 0, iters: 14, dyeDiss: 0.02, ink: 'nada', bands: 6, renew: 0.8, sharp: 0.15, contrast: 0.8, view: 'tinta' },
      look: { stops: ['#0d0b08', '#f3e9d6'], bg: '#070605', charset: ' .:-=+*#%@' },
    },
    {
      id: 'manchas', name: 'Manchas de tinta', aka: ['Dos líquidos que no se mezclan', 'Allen–Cahn', 'Separación de fases'], uses: ['fondos/organicas', 'arte/organicas', 'tipo/texturas'],
      params: { jets: 5, layout: 'libres', force: 1.6, motion: 0.3, pulse: 0, vort: 0.5, visc: 0, buoy: 0, obst: 0, iters: 14, dyeDiss: 0.02, ink: 'alterna', bands: 7, renew: 0.15, sharp: 0.5, contrast: 0.6, view: 'tinta' },
      look: { stops: ['#05050a', '#e8e6ff'], bg: '#030306', charset: ' .:-=+*#@' },
    },
    {
      id: 'corriente', name: 'Corriente en capas', aka: ['Calle de vórtices de Kármán', 'Flujo en un canal con obstáculos'], uses: ['fondos/organicas', 'fondos/ondas'],
      params: { jets: 2, layout: 'izquierda', force: 2.2, motion: 0.15, pulse: 0, vort: 0.3, visc: 0, buoy: 0, obst: 3, iters: 22, dyeDiss: 0.05, ink: 'tinta', bands: 5, renew: 0.5, sharp: 0.2, contrast: 0.6, view: 'tinta' },
      look: { stops: ['#03101a', '#9fe4ff', '#f2fdff'], bg: '#020a10', charset: ' .-~=+*#' },
    },
    {
      id: 'humo_neon', name: 'Humo de neón', aka: ['Penacho por flotación'], uses: ['fondos/organicas', 'arte/organicas'],
      params: { jets: 4, layout: 'suelo', force: 1.4, motion: 0.35, pulse: 0, vort: 0.4, visc: 0, buoy: 0.8, obst: 0, iters: 14, dyeDiss: 0.45, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0, contrast: 0.25, view: 'tinta' },
      look: { stops: ['#0c0414', '#ff6ad5', '#ffe9fb'], bg: '#06020a', charset: ' .\'":;!|*' },
    },
    {
      id: 'humo_curvas', name: 'Humo en curvas de nivel', aka: ['Isolíneas de concentración'], uses: ['fondos/organicas', 'arte/curvas', 'tipo/texturas'],
      params: { jets: 3, layout: 'suelo', force: 1.2, motion: 0.3, pulse: 0, vort: 0.25, visc: 0, buoy: 0.6, obst: 0, iters: 14, dyeDiss: 0.35, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0, contrast: 0, view: 'contornos' },
      look: { stops: ['#06080c', '#b8f0d8'], bg: '#030405', charset: ' .-~=+*#' },
    },
    {
      id: 'tormenta', name: 'Tormenta de vórtices', aka: ['Refuerzo de vorticidad', 'Turbulencia'], uses: ['fondos/organicas'],
      params: { jets: 8, layout: 'libres', force: 3.2, motion: 1.1, pulse: 0, vort: 0.95, visc: 0, buoy: 0, obst: 0, iters: 18, dyeDiss: 0.9, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0, contrast: 0.35, view: 'tinta' },
      look: { stops: ['#04101a', '#4fd6ff', '#eafcff'], bg: '#020810', charset: ' .:-=+*%@' },
    },
    {
      id: 'pilares', name: 'Estela entre pilares', aka: ['Calle de vórtices de Kármán', 'Vorticidad'], uses: ['fondos/organicas', 'arte/organicas'],
      params: { jets: 5, layout: 'izquierda', force: 2.2, motion: 0.15, pulse: 0, vort: 0.3, visc: 0, buoy: 0, obst: 4, iters: 22, dyeDiss: 0.3, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0, contrast: 0, view: 'vorticidad' },
      look: { stops: ['#0b0a06', '#ffd27a'], bg: '#060503', charset: ' .-~=≈#' },
    },
    {
      id: 'lazos', name: 'Lazos de tinta', aka: ['Emisores en órbita', 'Tinte que traza lazos', 'Refuerzo de vorticidad'], uses: ['fondos/organicas', 'arte/organicas'],
      params: { jets: 3, layout: 'orbitas', force: 2.2, motion: 0.5, pulse: 0, vort: 0.85, visc: 0, buoy: 0, obst: 0, iters: 16, dyeDiss: 0.3, ink: 'tonos', bands: 0, renew: 0.3, sharp: 0, contrast: 0, view: 'tinta', shear: 0 },
      look: { stops: ['#0a0309', '#7a1d56', '#ff5a8f', '#ffe3ec'], bg: '#060206', charset: ' .:-=+*#%' },
    },
    {
      id: 'chorro', name: 'Chorro sumergido', aka: ['Chorro turbulento', 'Inestabilidad de Kelvin–Helmholtz', 'Capa de cizalla', 'Dos trazadores'], uses: ['fondos/organicas', 'arte/organicas'],
      params: { jets: 1, layout: 'chorro', force: 2.6, motion: 0.4, pulse: 0, vort: 0.4, visc: 0, buoy: 0, obst: 0, iters: 20, dyeDiss: 0.3, ink: 'tinta', bands: 0, renew: 0.3, sharp: 0, contrast: 0, view: 'tinta', shear: 0.6 },
      look: { stops: ['#02070c', '#1d7f86', '#59e0c8', '#f4fff6'], bg: '#010407', charset: ' .·:-=+*#' },
    },
  ],
  caps: {
    loop: false, time: p => (Number(p.jets) > 0 || p.layout === 'chorro' || (Number(p.bands) > 0 && Number(p.renew) > 0) ? 'continuo' : 'construccion'), basic: 'full', checkpoint: true,
    brushes: [{ id: 'tinta', label: 'Tinta', hint: 'Echa tinta y empuja el fluido en la dirección del trazo.' }],
  },
  budget: {
    res: [48, 192, 128], rate: 30, warmup: 30,
  },
  wrap: 'clamp',
};
