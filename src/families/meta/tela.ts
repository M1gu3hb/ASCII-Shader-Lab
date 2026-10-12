import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'tela',
  name: 'Telas y cuerpos blandos',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  aka: ['XPBD', 'Dinámica basada en posiciones', 'Tela', 'Simulación de ropa'],
  params: [
    { key: 'anchors', label: 'Anclajes', type: 'choice', def: 'borde', rebuild: true, options: [
      { id: 'borde', label: 'Borde superior' }, { id: 'esquinas', label: 'Dos esquinas' }, { id: 'mastil', label: 'Mástil' },
      { id: 'cuatro', label: 'Cuatro esquinas' }, { id: 'centro', label: 'Centro fijado' }, { id: 'ninguno', label: 'Ninguno (cae al suelo)' },
      { id: 'perimetro', label: 'Todo el borde (tensa)' },
    ] },
    { key: 'mesh', label: 'Resolución de la malla', type: 'choice', def: 'baja', rebuild: true, options: [
      { id: 'baja', label: '24 × 16' }, { id: 'media', label: '36 × 24' }, { id: 'alta', label: '48 × 32' },
    ] },
    { key: 'stiff', label: 'Rigidez', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'gravity', label: 'Gravedad', type: 'number', min: 0, max: 2, def: 1, step: 0.01 },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 3, def: 0.5, step: 0.01 },
    { key: 'substeps', label: 'Subpasos', type: 'int', min: 1, max: 24, def: 6 },
    { key: 'damping', label: 'Amortiguación', type: 'number', min: 0, max: 1, def: 0.2, step: 0.01 },
    { key: 'sphere', label: 'Esfera', type: 'choice', def: 'ninguna', options: [
      { id: 'ninguna', label: 'Ninguna' }, { id: 'fija', label: 'Fija' }, { id: 'rebota', label: 'Sube y baja' },
    ] },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01 },
    { key: 'angle', label: 'Ángulo de vista', type: 'number', min: -80, max: 80, def: 0, step: 1, unit: '°' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'sombreado', options: [
      { id: 'sombreado', label: 'Sombreado' }, { id: 'malla', label: 'Malla' }, { id: 'ambos', label: 'Sombreado y malla' },
      { id: 'tension', label: 'Tensión de la malla' },
    ] },
    { key: 'kick', label: 'Golpes', type: 'number', min: 0, max: 1, def: 0, step: 0.01 },
    { key: 'every', label: 'Un golpe cada', type: 'number', min: 0.5, max: 8, def: 2.5, step: 0.1, unit: 's' },
  ],
  presets: [
    {
      id: 'velo', name: 'Velo al viento', aka: ['Tela colgada de dos esquinas'], uses: ['arte/figuras'],
      params: { anchors: 'esquinas', mesh: 'alta', stiff: 0.55, gravity: 1, wind: 0.9, substeps: 10, damping: 0.15, sphere: 'ninguna', turn: 0, angle: -25, view: 'sombreado' },
      look: { stops: ['#0b0a10', '#f1e6ff'], bg: '#06050a', charset: ' .:-=+*#%@' },
    },
    {
      id: 'bandera', name: 'Bandera', aka: ['Tela en el mástil'], uses: ['arte/figuras'],
      params: { anchors: 'mastil', mesh: 'media', stiff: 0.7, gravity: 0.25, wind: 2.4, substeps: 12, damping: 0.05, sphere: 'ninguna', turn: 0, angle: 35, view: 'ambos' },
      look: { stops: ['#140606', '#ffc9a8'], bg: '#0a0303', charset: ' .-~=*#' },
    },
    {
      id: 'membrana', name: 'Membrana elástica', aka: ['Cama elástica', 'Colisión con una esfera'], uses: ['arte/figuras'],
      params: { anchors: 'cuatro', mesh: 'media', stiff: 0.3, gravity: 1, wind: 0, substeps: 12, damping: 0.05, sphere: 'rebota', turn: 0.2, angle: 0, view: 'malla' },
      look: { stops: ['#04100e', '#a8fff0'], bg: '#020807', charset: ' .·:+#' },
    },
    {
      id: 'malla_cinetica', name: 'Malla cinética', aka: ['Kinetic grid', 'Red de muelles', 'Membrana tensa golpeada'], uses: ['arte/geometricas', 'fondos/geometricas'],
      params: { anchors: 'perimetro', mesh: 'baja', stiff: 0.8, gravity: 0, wind: 0, substeps: 10, damping: 0.25, sphere: 'ninguna', turn: 0, angle: 0, view: 'tension', kick: 0.8, every: 1.8 },
      look: { stops: ['#04060c', '#2a5d8c', '#62d2ff', '#fff1c0'], bg: '#03040a', charset: ' .·:-+=*#' },
    },
  ],
  caps: {
    loop: false, time: p => (Number(p.wind) > 0 || p.sphere === 'rebota' || Number(p.kick) > 0 ? 'continuo' : 'construccion'), basic: 'full', checkpoint: true,
    brushes: [{ id: 'empujar', label: 'Empujar', hint: 'Arrastra la tela con el dedo; sin moverlo, la hunde hacia el fondo.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 20 },
  wrap: 'clamp',
  // (a cloth is a figure in the middle; the drumhead pinned along its whole edge fills the frame)
  figure: p => p.anchors !== 'perimetro',
};
