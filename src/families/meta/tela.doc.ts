import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una tela de partículas y restricciones que cuelga, ondea con el viento y rebota.',
  mechanism: 'Dinámica basada en posiciones (XPBD): una malla de partículas unidas por restricciones de distancia (lados, diagonales y saltos de dos para la flexión), cada una con su rigidez. En cada subpaso se predicen las posiciones con la gravedad y el viento, se corrigen las restricciones y las colisiones, y la velocidad sale del desplazamiento. El viento empuja cada punto de la tela según hacia dónde mira la superficie.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto. La cámara gira despacio a su alrededor.',
  limits: 'Malla de hasta 48 × 32 partículas (≈ 9000 restricciones) y 24 subpasos por paso; un búfer de profundidad de 2 × filas × filas.',
  sources: [
    { label: 'Macklin, Müller y Chentanez (2016): XPBD: Position-Based Simulation of Compliant Constrained Dynamics', url: 'https://matthias-research.github.io/pages/publications/XPBD.pdf' },
    { label: 'Macklin et al. (2019): Small Steps in Physics Simulation', url: 'https://mmacklin.com/smallsteps.pdf' },
    { label: 'Matthias Müller: Ten Minute Physics', url: 'https://matthias-research.github.io/pages/tenMinutePhysics/' },
  ],
  hints: {
    'anchors': 'De dónde se sujeta la tela.',
    'stiff': 'Poca: se estira como goma; mucha: tela que apenas cede.',
    'wind': 'Fuerza media del viento; las ráfagas salen de la semilla.',
    'substeps': 'Más subpasos: restricciones mejor cumplidas, más cálculo.',
    'damping': 'Freno del aire: con poca, rebota y ondea más tiempo.',
    'sphere': 'Un obstáculo con el que choca la tela.',
    'turn': 'Vueltas por minuto alrededor de la tela.',
  },
  presets: {
    'velo': 'Una tela fina colgada de dos esquinas: cae en pliegues y se hincha con cada ráfaga.',
    'bandera': 'Sujeta a un mástil, flamea con pliegues que viajan hasta el borde libre.',
    'membrana': 'Una lámina elástica sujeta por sus cuatro esquinas a la que una esfera golpea desde abajo.',
  },
};
