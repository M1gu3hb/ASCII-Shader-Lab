import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'tela',
  name: 'Telas y cuerpos blandos',
  group: 'fisica',
  kind: 'simulation',
  version: 1,
  blurb: 'Una tela de partículas y restricciones que cuelga, ondea con el viento y rebota.',
  mechanism: 'Dinámica basada en posiciones (XPBD): una malla de partículas unidas por restricciones de distancia (lados, diagonales y saltos de dos para la flexión), cada una con su rigidez. En cada subpaso se predicen las posiciones con la gravedad y el viento, se corrigen las restricciones y las colisiones, y la velocidad sale del desplazamiento. El viento empuja cada punto de la tela según hacia dónde mira la superficie.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto. La cámara gira despacio a su alrededor.',
  params: [
    { key: 'anchors', label: 'Anclajes', type: 'choice', def: 'borde', rebuild: true, options: [
      { id: 'borde', label: 'Borde superior' }, { id: 'esquinas', label: 'Dos esquinas' }, { id: 'mastil', label: 'Mástil' },
      { id: 'cuatro', label: 'Cuatro esquinas' }, { id: 'centro', label: 'Centro fijado' }, { id: 'ninguno', label: 'Ninguno (cae al suelo)' },
    ], hint: 'De dónde se sujeta la tela.' },
    { key: 'mesh', label: 'Resolución de la malla', type: 'choice', def: 'baja', rebuild: true, options: [
      { id: 'baja', label: '24 × 16' }, { id: 'media', label: '36 × 24' }, { id: 'alta', label: '48 × 32' },
    ] },
    { key: 'stiff', label: 'Rigidez', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01, hint: 'Poca: se estira como goma; mucha: tela que apenas cede.' },
    { key: 'gravity', label: 'Gravedad', type: 'number', min: 0, max: 2, def: 1, step: 0.01 },
    { key: 'wind', label: 'Viento', type: 'number', min: 0, max: 3, def: 0.5, step: 0.01, hint: 'Fuerza media del viento; las ráfagas salen de la semilla.' },
    { key: 'substeps', label: 'Subpasos', type: 'int', min: 1, max: 24, def: 6, hint: 'Más subpasos: restricciones mejor cumplidas, más cálculo.' },
    { key: 'damping', label: 'Amortiguación', type: 'number', min: 0, max: 1, def: 0.2, step: 0.01, hint: 'Freno del aire: con poca, rebota y ondea más tiempo.' },
    { key: 'sphere', label: 'Esfera', type: 'choice', def: 'ninguna', options: [
      { id: 'ninguna', label: 'Ninguna' }, { id: 'fija', label: 'Fija' }, { id: 'rebota', label: 'Sube y baja' },
    ], hint: 'Un obstáculo con el que choca la tela.' },
    { key: 'turn', label: 'Giro de cámara', type: 'number', min: -1, max: 1, def: 0.1, step: 0.01, hint: 'Vueltas por minuto alrededor de la tela.' },
    { key: 'view', label: 'Vista', type: 'choice', def: 'sombreado', options: [
      { id: 'sombreado', label: 'Sombreado' }, { id: 'malla', label: 'Malla' }, { id: 'ambos', label: 'Sombreado y malla' },
    ] },
  ],
  presets: [
    { id: 'velo', name: 'Velo al viento', desc: 'Una tela fina colgada de dos esquinas: cae en pliegues y se hincha con cada ráfaga.', params: { anchors: 'esquinas', mesh: 'alta', stiff: 0.55, gravity: 1, wind: 0.9, substeps: 10, damping: 0.15, sphere: 'ninguna', turn: 0.12, view: 'sombreado' }, look: { stops: ['#0b0a10', '#f1e6ff'], bg: '#06050a', charset: ' .:-=+*#%@' } },
    { id: 'bandera', name: 'Bandera', desc: 'Sujeta a un mástil, flamea con pliegues que viajan hasta el borde libre.', params: { anchors: 'mastil', mesh: 'media', stiff: 0.85, gravity: 0.25, wind: 2, substeps: 12, damping: 0.05, sphere: 'ninguna', turn: 0.05, view: 'ambos' }, look: { stops: ['#140606', '#ffc9a8'], bg: '#0a0303', charset: ' .-~=*#' } },
    { id: 'membrana', name: 'Membrana elástica', desc: 'Una lámina elástica sujeta por sus cuatro esquinas a la que una esfera golpea desde abajo.', params: { anchors: 'cuatro', mesh: 'media', stiff: 0.3, gravity: 1, wind: 0, substeps: 12, damping: 0.05, sphere: 'rebota', turn: 0.2, view: 'malla' }, look: { stops: ['#04100e', '#a8fff0'], bg: '#020807', charset: ' .·:+#' } },
  ],
  caps: {
    loop: false, basic: 'full', checkpoint: true,
    brushes: [{ id: 'empujar', label: 'Empujar', hint: 'Arrastra la tela con el dedo; sin moverlo, la hunde hacia el fondo.' }],
  },
  budget: { res: [48, 192, 96], rate: 30, warmup: 20, limits: 'Malla de hasta 48 × 32 partículas (≈ 9000 restricciones) y 24 subpasos por paso; un búfer de profundidad de 2 × filas × filas.' },
  sources: [
    { label: 'Macklin, Müller y Chentanez (2016): XPBD: Position-Based Simulation of Compliant Constrained Dynamics', url: 'https://matthias-research.github.io/pages/publications/XPBD.pdf' },
    { label: 'Macklin et al. (2019): Small Steps in Physics Simulation', url: 'https://mmacklin.com/smallsteps.pdf' },
    { label: 'Matthias Müller: Ten Minute Physics', url: 'https://matthias-research.github.io/pages/tenMinutePhysics/' },
  ],
  wrap: 'clamp',
  figure: true,
};
