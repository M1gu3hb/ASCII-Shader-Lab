import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Una tela de partículas y restricciones que cuelga, ondea con el viento y rebota.',
  mechanism: 'Dinámica basada en posiciones (XPBD): una malla de partículas unidas por restricciones de distancia (lados, diagonales y saltos de dos para la flexión), cada una con su rigidez. En cada subpaso se predicen las posiciones con la gravedad y el viento, se corrigen las restricciones y las colisiones, y la velocidad sale del desplazamiento. El viento empuja cada punto de la tela según hacia dónde mira la superficie. Con «Todo el borde» la malla es un parche tenso sujeto por todo su marco, sin gravedad, con muelles algo más cortos que la rejilla; cada golpe da velocidad a los nudos cerca de un punto del borde (hacia dentro y fuera del plano), y la onda de estiramiento cruza la malla y rebota en el marco. La vista «Tensión» dibuja cada muelle con la tinta de lo que se aparta de su estiramiento en reposo. El «cojín inflado» es un cuerpo blando: dos láminas cosidas por el borde que encierran un volumen, y una restricción más mantiene ese volumen en el que pide «Inflado» (la presión), que «Respiración» hace subir y bajar; cae, se apoya en el suelo y se aplasta y rebota con su peso y los golpes.',
  time: 'Evoluciona con memoria: cada paso depende del anterior. Con viento o con la esfera que sube y baja es continuo: las ráfagas, que salen de la semilla, nunca se paran del todo, y la tela no deja de ondear. Con golpes, o con el cojín que respira, también es continuo: llegan cada pocos segundos desde un borde que elige la semilla, así que la misma semilla repite la misma partida. Sin viento, esfera que se mueva ni golpes, la tela cae, se balancea y se queda quieta colgando. La cámara puede girar despacio a su alrededor o quedarse en un ángulo. Se puede pausar, avanzar paso a paso y guardar su estado; no repite un bucle perfecto.',
  limits: 'Malla de hasta 48 × 32 partículas (≈ 9000 restricciones) y 24 subpasos por paso; un búfer de profundidad de 2 × filas × filas. El cojín inflado son dos láminas (el doble de partículas) más una restricción de volumen por subpaso; no modela choques de la tela consigo misma (con poco inflado, sus dos caras se pueden cruzar).',
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
    'turn': 'Vueltas por minuto alrededor de la tela. Con 0 la cámara se queda quieta en su ángulo.',
    'angle': 'Desde dónde miras la tela: de frente o de lado, donde se ven mejor sus pliegues y ondas.',
    'view': 'Sombreado, malla, los dos, o la tensión: cada muelle con la tinta de lo que se estira o se encoge.',
    'kick': 'Fuerza de los golpes que entran por un borde al azar; 0: sin golpes.',
    'every': 'Segundos entre un golpe y el siguiente.',
    'inflate': 'Cojín: cuánto aire tiene dentro (la presión que lo sostiene contra su peso).',
    'breath': 'Cojín: cuánto se infla y se desinfla, una respiración cada cuatro segundos. 0: quieto.',
  },
  presets: {
    'velo': 'Una tela fina colgada de dos esquinas, casi de frente: cae en pliegues y se hincha con cada ráfaga.',
    'bandera': 'Sujeta a un mástil y vista de lado: flamea con pliegues que viajan hasta el borde libre.',
    'membrana': 'Una lámina elástica sujeta por sus cuatro esquinas a la que una esfera golpea desde abajo.',
    'cojin': 'Un cojín inflado en el suelo, un cuerpo blando que se sostiene por la presión de dentro: respira, se aplasta y salta cuando lo golpean desde abajo.',
    'malla_cinetica': 'Una rejilla de muelles tensa, sujeta por todo el marco y vista de frente: cada golpe entra por un borde al azar y una onda de tensión la cruza y rebota, encendiendo los muelles que se estiran.',
  },
};
