import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Las visitas de un sistema caótico acumuladas en una imagen: cintas, nubes y la mariposa de Lorenz.',
  mechanism: 'Un punto se transforma una y otra vez con dos fórmulas de senos y cosenos (Clifford o De Jong) y cada visita suma brillo donde cae: el caos dibuja una figura estable. Lorenz es un sistema de tres ecuaciones que muchas partículas recorren en 3D.',
  time: 'Acumula con memoria: la imagen se densifica paso a paso y la deriva transforma los coeficientes despacio, con la estela borrando lo antiguo. No repite un bucle.',
  limits: 'Mapas: histograma de 2 × filas × filas en coma flotante, 256 órbitas y hasta 60 000 iteraciones por paso. Lorenz: hasta 600 partículas con estelas de 120 posiciones (RK4).',
  sources: [
    { label: 'Paul Bourke: atractores de Clifford y De Jong', url: 'https://paulbourke.net/fractals/clifford/' },
    { label: 'Lorenz (1963): Deterministic Nonperiodic Flow', url: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2' },
    { label: 'Jérémie Piellard: Strange Attractors (sólo las ecuaciones)', url: 'https://piellardj.github.io/strange-attractors-webgl/' },
  ],
  hints: {
    'a': 'Coeficiente a. En Lorenz: σ, de 4 a 16.',
    'b': 'Coeficiente b. En Lorenz: ρ, de 16 a 40.',
    'c': 'Coeficiente c. En Lorenz: β, de 0,7 a 4,7.',
    'd': 'Coeficiente d. En Lorenz: la velocidad del flujo.',
    'drift': 'Velocidad a la que los coeficientes se transforman (0: fijos).',
    'trail': 'Cuánto dura lo acumulado: corta, la figura se renueva; larga, se densifica.',
    'points': 'Iteraciones por paso; en Lorenz, partículas × 100.',
    'zoom': 'Acerca o aleja la figura.',
    'gain': 'Exposición del mapa de densidad: alto, se ven también las zonas poco visitadas.',
  },
  presets: {
    'cintas': 'Clifford: cintas finas que se pliegan sobre sí mismas y cambian despacio.',
    'nube': 'De Jong: una lámina de puntos que se enrolla sobre sí misma y se despliega despacio.',
    'lorenz': 'Cientos de partículas recorren las dos alas en 3D mientras la cámara gira.',
  },
};
