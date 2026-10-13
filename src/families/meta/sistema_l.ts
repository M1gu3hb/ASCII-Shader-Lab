import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'sistema_l',
  name: 'Sistemas L',
  group: 'forma',
  kind: 'geometry',
  aka: ['sistema de Lindenmayer', 'L-system', 'gramática de reescritura', 'tortuga', 'fractal de plantas'],
  version: 1,
  params: [
    { key: 'model', label: 'Modelo', type: 'choice', def: 'helecho', rebuild: true, options: [
      { id: 'helecho', label: 'Helecho' }, { id: 'arbusto', label: 'Arbusto' }, { id: 'arbol3d', label: 'Árbol 3D' },
      { id: 'raices', label: 'Raíces' }, { id: 'koch', label: 'Copo de Koch' }, { id: 'dragon', label: 'Curva del dragón' },
      { id: 'propio', label: 'Mi gramática' },
    ] },
    { key: 'axiom', label: 'Axioma', type: 'text', def: 'X', max: 24, allowed: 'FGXYAB+-[]&^\\/|', rebuild: true, advanced: true },
    { key: 'rules', label: 'Reglas', type: 'text', def: 'X=F+[[X]-X]-F[-FX]+X;F=FF', max: 160, allowed: 'FGXYAB+-[]&^\\/|=;', rebuild: true, advanced: true },
    { key: 'gens', label: 'Generaciones', type: 'int', min: 1, max: 9, def: 5, rebuild: true },
    { key: 'angle', label: 'Ángulo', type: 'number', min: 5, max: 120, def: 25, step: 0.5, unit: '°', rebuild: true },
    { key: 'decay', label: 'Acortar', type: 'number', min: 0.5, max: 1, def: 1, step: 0.01, rebuild: true },
    { key: 'jitter', label: 'Variación', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01, rebuild: true },
    { key: 'grow', label: 'Crecimiento', type: 'number', min: 1, max: 40, def: 8, step: 0.5, unit: 's' },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 1, def: 0.25, step: 0.01 },
    { key: 'turn', label: 'Giro 3D', type: 'number', min: -1, max: 1, def: 0.15, step: 0.01 },
    { key: 'width', label: 'Grosor', type: 'number', min: 0.5, max: 4, def: 1.4, step: 0.05 },
    { key: 'mode', label: 'Tiempo', type: 'choice', def: 'crece', rebuild: true, options: [
      { id: 'crece', label: 'Crece y se queda' }, { id: 'jardin', label: 'Jardín que se renueva' }, { id: 'pliegue', label: 'Se pliega en ciclo' },
    ] },
  ],
  presets: [
    { id: 'helecho', name: 'Helecho recursivo', uses: ['arte/organicas', 'arte/curvas'], params: { model: 'helecho', gens: 5, angle: 25, decay: 1, jitter: 0.12, grow: 8, wind: 0.25, width: 2.2 }, look: { stops: ['#07110a', '#b9f2a6'], bg: '#040905', charset: " .'`|/\\#" } },
    { id: 'arbol3d', name: 'Bosque de símbolos', uses: ['arte/organicas', 'arte/figuras'], aka: ['árbol 3D'], params: { model: 'arbol3d', gens: 6, angle: 28, decay: 0.78, jitter: 0.2, grow: 10, wind: 0.2, turn: 0.25, width: 2.6 }, look: { stops: ['#100c08', '#f2d7a6'], bg: '#080604', charset: ' .:;|+*#' } },
    { id: 'raices', name: 'Raíces', uses: ['arte/organicas'], params: { model: 'raices', gens: 6, angle: 18, decay: 0.92, jitter: 0.45, grow: 12, wind: 0.05, width: 2 }, look: { stops: ['#120a06', '#e8b07c'], bg: '#090503', charset: ' .,:;!|' } },
    { id: 'dragon', name: 'Curva del dragón', uses: ['arte/geometricas', 'arte/curvas'], aka: ['Heighway', 'curva del dragón de Heighway'], params: { model: 'dragon', gens: 9, angle: 90, decay: 1, jitter: 0, grow: 14, wind: 0, width: 2.2 }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .-=+#' } },
    { id: 'jardin', name: 'Jardín que se renueva', uses: ['arte/organicas', 'fondos/organicas'], aka: ['helechos', 'sistema L en jardín'], params: { model: 'helecho', gens: 5, angle: 25, decay: 1, jitter: 0.25, grow: 9, wind: 0.35, width: 2.6, mode: 'jardin' }, look: { stops: ['#07110a', '#b9f2a6'], bg: '#040905', charset: " .'`|/\\#" } },
    { id: 'raices_vivas', name: 'Raíces que cuelgan', uses: ['arte/organicas', 'fondos/organicas'], aka: ['raíces', 'sistema L en jardín'], params: { model: 'raices', gens: 6, angle: 18, decay: 0.92, jitter: 0.45, grow: 10, wind: 0.05, width: 2.2, mode: 'jardin' }, look: { stops: ['#120a06', '#e8b07c'], bg: '#090503', charset: ' .,:;!|' } },
    { id: 'dragon_pliegue', name: 'Dragón que se pliega', uses: ['arte/geometricas', 'arte/curvas'], aka: ['curva del dragón', 'plegado de papel', 'paperfolding', 'Heighway'], period: 24, params: { model: 'dragon', gens: 8, angle: 90, decay: 1, jitter: 0, grow: 24, wind: 0, width: 3.4, mode: 'pliegue' }, look: { stops: ['#0a0816', '#c6b6ff'], bg: '#05040c', charset: ' .-=+#' } },
  ],
  caps: { loop: false, time: { param: 'mode', values: { jardin: 'continuo', pliegue: 'bucle' }, else: 'construccion' }, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 0 },
  wrap: 'clamp',
  // a plant or a curve is a figure; the garden spreads its plants across the whole width
  figure: p => p.mode !== 'jardin',
};
