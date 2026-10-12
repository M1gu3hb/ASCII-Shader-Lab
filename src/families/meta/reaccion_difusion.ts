import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'reaccion_difusion',
  name: 'Reacción–difusión',
  group: 'vida',
  kind: 'simulation',
  // 2: the chemistry runs on a fixed grid whatever the rows (A-05); version-1 recipes keep their path
  version: 2,
  aka: ['Gray–Scott', 'Gray-Scott', 'reacción difusión', 'reaction–diffusion', 'patrones de Turing', 'Pearson'],
  params: [
    { key: 'feed', label: 'Alimentación', type: 'number', min: 0.01, max: 0.1, def: 0.0545, step: 0.0005, digits: 4 },
    { key: 'kill', label: 'Eliminación', type: 'number', min: 0.04, max: 0.075, def: 0.062, step: 0.0005, digits: 4 },
    { key: 'diff', label: 'Difusión de B', type: 'number', min: 0.25, max: 0.75, def: 0.5, step: 0.01 },
    { key: 'scale', label: 'Escala', type: 'number', min: 0.6, max: 1.6, def: 1, step: 0.01 },
    { key: 'seedShape', label: 'Siembra', type: 'choice', def: 'manchas', rebuild: true, options: [
      { id: 'manchas', label: 'Manchas' }, { id: 'centro', label: 'Centro' }, { id: 'anillo', label: 'Anillo' },
      { id: 'lineas', label: 'Líneas' }, { id: 'ruido', label: 'Ruido' },
    ] },
    { key: 'edges', label: 'Bordes', type: 'choice', def: 'toro', options: [{ id: 'toro', label: 'Continuos' }, { id: 'cerrado', label: 'Cerrados' }] },
    { key: 'map', label: 'Mapa vivo', type: 'choice', def: 'uniforme', options: [
      { id: 'uniforme', label: 'Uniforme' }, { id: 'heridas', label: 'Heridas' }, { id: 'mareas', label: 'Mareas' },
      { id: 'franjas', label: 'Franjas' }, { id: 'isla', label: 'Isla' },
    ] },
    { key: 'amp', label: 'Intensidad', type: 'number', min: 0.05, max: 1, def: 0.5, step: 0.01 },
    { key: 'drift', label: 'Ritmo', type: 'number', min: 0.1, max: 3, def: 1, step: 0.05 },
    { key: 'view', label: 'Vista', type: 'choice', def: 'concentracion', options: [
      { id: 'concentracion', label: 'Concentración' }, { id: 'relieve', label: 'Relieve' }, { id: 'contorno', label: 'Contorno' },
    ] },
  ],
  presets: [
    { id: 'coral', name: 'Coral químico', params: { feed: 0.0545, kill: 0.062, diff: 0.5, scale: 1, seedShape: 'centro', view: 'concentracion' }, uses: ['arte/organicas'], aka: ['coral growth'], look: { stops: ['#0c1416', '#e9d8b4'], bg: '#070b0c', charset: ' .:-=+*#%@' } },
    { id: 'mitosis', name: 'Células que se dividen', params: { feed: 0.0367, kill: 0.0649, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'concentracion' }, uses: ['arte/organicas'], aka: ['Mitosis'], look: { stops: ['#100a14', '#f0b6d4'], bg: '#08050a', charset: ' .·:oO@' } },
    { id: 'laberinto', name: 'Laberinto', params: { feed: 0.029, kill: 0.057, diff: 0.5, scale: 1, seedShape: 'ruido', view: 'relieve' }, uses: ['arte/organicas', 'tipo/texturas'], aka: ['huella dactilar', 'maze'], look: { stops: ['#0b0f08', '#d9f0a2'], bg: '#060805', charset: ' .-~=≈#' } },
    { id: 'caos', name: 'Caos que respira', params: { feed: 0.018, kill: 0.051, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'contorno', map: 'mareas', amp: 0.5, drift: 3 }, uses: ['fondos/vivas'], layer: { speed: 0.15 }, aka: ['caos', 'chaos'], look: { stops: ['#04101c', '#7fd0ff'], bg: '#020810', charset: ' .:+*#' } },
    { id: 'coral_vivo', name: 'Coral que respira', params: { feed: 0.0545, kill: 0.062, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'concentracion', map: 'heridas', amp: 1, drift: 2 }, uses: ['fondos/organicas', 'tipo/texturas'], aka: ['coral continuo', 'heridas que sanan'], look: { stops: ['#160c0a', '#ffd9b8'], bg: '#0b0605', charset: ' .:-=+*#%@' } },
    { id: 'laberinto_vivo', name: 'Laberinto que se rehace', params: { feed: 0.029, kill: 0.057, diff: 0.5, scale: 1, seedShape: 'ruido', view: 'concentracion', map: 'mareas', amp: 0.6, drift: 1 }, uses: ['fondos/organicas', 'tipo/texturas'], aka: ['laberinto continuo', 'mareas'], look: { stops: ['#070d12', '#bfe6ff'], bg: '#03070a', charset: ' .:-=+*#' } },
    { id: 'celulas', name: 'Células sin fin', params: { feed: 0.0367, kill: 0.0649, diff: 0.5, scale: 1, seedShape: 'manchas', view: 'concentracion', map: 'mareas', amp: 1, drift: 1.5 }, uses: ['fondos/vivas'], aka: ['mitosis continua'], look: { stops: ['#0e0814', '#e6c2ff'], bg: '#07040a', charset: ' .·:oO@' } },
    { id: 'corrientes', name: 'Corrientes de puntos', params: { feed: 0.029, kill: 0.057, diff: 0.5, scale: 1, seedShape: 'ruido', view: 'concentracion', map: 'franjas', amp: 0.8, drift: 1 }, uses: ['fondos/organicas'], aka: ['franjas', 'gradiente de Pearson'], look: { stops: ['#0f0d05', '#f4e3a0'], bg: '#080702', charset: ' .-:=+#' } },
    { id: 'isla', name: 'Isla que respira', params: { feed: 0.0545, kill: 0.062, diff: 0.5, scale: 1, seedShape: 'centro', view: 'concentracion', map: 'isla', amp: 0.8, drift: 1 }, uses: ['arte/organicas'], aka: ['isla', 'máscara'], look: { stops: ['#04110d', '#a8f0cf'], bg: '#020806', charset: ' .:-=+*#%@' } },
  ],
  caps: {
    loop: false,
    // a uniform chemistry settles (coral, spots and mazes fill the field and stay); a living map keeps it going
    time: { param: 'map', values: { uniforme: 'construccion' }, else: 'continuo' },
    basic: 'full', checkpoint: true,
    brushes: [{ id: 'sembrar', label: 'Sembrar', hint: 'Añade sustancia B donde tocas.' }, { id: 'borrar', label: 'Borrar', hint: 'Devuelve la zona al estado vacío.' }],
  },
  budget: { res: [64, 256, 96], rate: 600, warmup: 1200, resNote: 'La química corre siempre en la misma rejilla (versión 2): más filas sólo afinan el dibujo de la capa.' },
  wrap: 'repeat',
};
