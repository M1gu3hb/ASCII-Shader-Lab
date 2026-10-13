import type { FamilyDoc } from '../types';

/** What the studio says about this family (loaded with its panel, not with the first view). */
export const DOC: FamilyDoc = {
  blurb: 'Cintas, velos y ovillos de hilo que el caos dibuja y transforma despacio, con relieve y capas.',
  mechanism: 'Un punto se transforma una y otra vez con dos fórmulas de senos y cosenos (los mapas de Clifford y de Peter de Jong) y cada visita suma brillo donde cae: el caos dibuja una figura estable. Las figuras en 3D son sistemas de tres ecuaciones (Lorenz, Thomas, Aizawa, Halvorsen) que cientos de partículas recorren dejando estela, vistas con una cámara. «Relieve» ilumina la densidad como si fuera un terreno (cada cinta tiene un lado con luz y otro en sombra) o, en 3D, apaga lo lejano; «Capas» deja detrás, desenfocadas, las formas de hace unos segundos.',
  time: 'Continuo con deriva: los coeficientes recorren despacio un camino cerrado y la figura se transforma sin repetirse, con la estela borrando lo antiguo; las ventanas donde el caos se apaga (todo cae en unos pocos puntos) se cruzan deprisa y las órbitas se renuevan, así que a los diez minutos sigue siendo una figura de cintas, no polvo. Las figuras 3D siguen corriendo siempre; sin deriva (0), los mapas se asientan en una figura quieta: entonces es una construcción.',
  limits: 'Mapas: histograma de 2 × filas × filas en coma flotante (más su memoria para «Capas»), 256 órbitas (4 renovadas por paso) y hasta 60 000 iteraciones por paso. 3D: hasta 600 partículas con estelas de 120 posiciones (RK4).',
  sources: [
    { label: 'Paul Bourke: atractores de Clifford y De Jong', url: 'https://paulbourke.net/fractals/clifford/' },
    { label: 'Lorenz (1963): Deterministic Nonperiodic Flow', url: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2' },
    { label: 'Thomas (1999): Deterministic chaos seen in terms of feedback circuits', url: 'https://doi.org/10.1142/S0218127499001383' },
    { label: 'Sprott: Elegant Chaos (Aizawa, Halvorsen y otros flujos)', url: 'https://sprott.physics.wisc.edu/chaos/' },
    { label: 'Jérémie Piellard: Strange Attractors (sólo las ecuaciones)', url: 'https://piellardj.github.io/strange-attractors-webgl/' },
  ],
  hints: {
    'type': 'Mapas (Clifford, De Jong): una figura plana de densidad. 3D (Lorenz, Thomas, Aizawa, Halvorsen): partículas con estela vistas con cámara.',
    'a': 'Coeficiente a. Lorenz: σ. Thomas: el rozamiento b. Aizawa: α. Halvorsen: a.',
    'b': 'Coeficiente b. Lorenz: ρ. Aizawa: el giro alrededor del eje.',
    'c': 'Coeficiente c. Lorenz: β.',
    'd': 'Coeficiente d. En 3D: la velocidad del flujo.',
    'drift': 'Velocidad a la que los coeficientes se transforman (0: fijos; los mapas se quedan quietos).',
    'trail': 'Cuánto dura lo acumulado: corta, la figura se renueva; larga, se densifica.',
    'points': 'Iteraciones por paso; en 3D, partículas × 100.',
    'zoom': 'Acerca o aleja la figura.',
    'gain': 'Exposición del mapa de densidad: alto, se ven también las zonas poco visitadas.',
    'relief': 'Mapas: luz rasante sobre la densidad, cintas con un lado claro y otro en sombra. 3D: lo cercano brilla y lo lejano se apaga.',
    'layers': 'Mapas: detrás, desenfocadas, las formas de hace unos segundos. 3D: la estela entera, tenue, detrás de la parte viva.',
  },
  presets: {
    'cintas': 'Cintas finas que se pliegan sobre sí mismas con luz rasante, sobre el eco desenfocado de sus formas anteriores.',
    'nube': 'Una lámina que se enrolla y se despliega; lo que fue queda detrás como un velo.',
    'lorenz': 'Cientos de estelas recorren dos alas; el ala lejana se apaga mientras la cámara se balancea.',
    'madeja': 'Un hilo enredado en tres dimensiones que gira despacio: lazos que cruzan por delante y por detrás.',
    'ovillo': 'Una esfera de hilo atravesada por un eje: las estelas suben por el centro y bajan enrollándose por fuera.',
    'helice': 'Tres aspas curvas que se persiguen alrededor de un centro, con la cámara dando la vuelta.',
  },
};
