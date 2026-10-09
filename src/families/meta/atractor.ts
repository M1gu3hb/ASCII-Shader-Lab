import type { FamilyMeta } from '../types';

export const META: FamilyMeta = {
  id: 'atractor',
  name: 'Atractores extraños',
  group: 'forma',
  kind: 'simulation',
  version: 1,
  blurb: 'Las visitas de un sistema caótico acumuladas en una imagen: cintas, nubes y la mariposa de Lorenz.',
  mechanism: 'Un punto se transforma una y otra vez con dos fórmulas de senos y cosenos (Clifford o De Jong) y cada visita suma brillo donde cae: el caos dibuja una figura estable. Lorenz es un sistema de tres ecuaciones que muchas partículas recorren en 3D.',
  time: 'Acumula con memoria: la imagen se densifica paso a paso y la deriva transforma los coeficientes despacio, con la estela borrando lo antiguo. No repite un bucle.',
  params: [
    { key: 'type', label: 'Sistema', type: 'choice', def: 'clifford', rebuild: true, options: [
      { id: 'clifford', label: 'Clifford' }, { id: 'dejong', label: 'De Jong' }, { id: 'lorenz', label: 'Lorenz 3D' },
    ] },
    { key: 'a', label: 'a', type: 'number', min: -3, max: 3, def: 1.53, step: 0.01, hint: 'Coeficiente a. En Lorenz: σ, de 4 a 16.' },
    { key: 'b', label: 'b', type: 'number', min: -3, max: 3, def: 2.91, step: 0.01, hint: 'Coeficiente b. En Lorenz: ρ, de 16 a 40.' },
    { key: 'c', label: 'c', type: 'number', min: -3, max: 3, def: 1.63, step: 0.01, hint: 'Coeficiente c. En Lorenz: β, de 0,7 a 4,7.' },
    { key: 'd', label: 'd', type: 'number', min: -3, max: 3, def: 0.33, step: 0.01, hint: 'Coeficiente d. En Lorenz: la velocidad del flujo.' },
    { key: 'drift', label: 'Deriva', type: 'number', min: 0, max: 1, def: 0.15, step: 0.01, hint: 'Velocidad a la que los coeficientes se transforman (0: fijos).' },
    { key: 'trail', label: 'Estela', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01, hint: 'Cuánto dura lo acumulado: corta, la figura se renueva; larga, se densifica.' },
    { key: 'points', label: 'Puntos por paso', type: 'int', min: 2000, max: 60000, def: 6000, hint: 'Iteraciones por paso; en Lorenz, partículas × 100.' },
    { key: 'zoom', label: 'Encuadre', type: 'number', min: 0.5, max: 2, def: 1, step: 0.01, hint: 'Acerca o aleja la figura.' },
    { key: 'gain', label: 'Brillo', type: 'number', min: 0.2, max: 3, def: 1, step: 0.01, hint: 'Exposición del mapa de densidad: alto, se ven también las zonas poco visitadas.' },
  ],
  presets: [
    { id: 'cintas', name: 'Cintas caóticas', desc: 'Clifford: cintas finas que se pliegan sobre sí mismas y cambian despacio.', params: { type: 'clifford', a: 1.53, b: 2.91, c: 1.63, d: 0.33, drift: 0.15, trail: 0.6, points: 10000, zoom: 1, gain: 1 }, look: { stops: ['#05070f', '#f3e3c2'], bg: '#020308', charset: ' .:-=+*#%@' } },
    { id: 'nube', name: 'Nube orbital', desc: 'De Jong: una lámina de puntos que se enrolla sobre sí misma y se despliega despacio.', params: { type: 'dejong', a: 2.27, b: -2.54, c: 1.11, d: -1.58, drift: 0.1, trail: 0.5, points: 14000, zoom: 1, gain: 1.3 }, look: { stops: ['#0a0612', '#e3b9ff'], bg: '#05030a', charset: ' .·:;oO@' } },
    { id: 'lorenz', name: 'Mariposa de Lorenz', desc: 'Cientos de partículas recorren las dos alas en 3D mientras la cámara gira.', params: { type: 'lorenz', a: 0, b: 0, c: 0, d: 0, drift: 0.1, trail: 0.7, points: 20000, zoom: 1, gain: 1 }, look: { stops: ['#040d10', '#a6f3ff'], bg: '#02070a', charset: ' .,:;+*#' } },
  ],
  caps: { loop: false, basic: 'full', checkpoint: true },
  budget: { res: [48, 256, 96], rate: 30, warmup: 30, limits: 'Mapas: histograma de 2 × filas × filas en coma flotante, 256 órbitas y hasta 60 000 iteraciones por paso. Lorenz: hasta 600 partículas con estelas de 120 posiciones (RK4).' },
  sources: [
    { label: 'Paul Bourke: atractores de Clifford y De Jong', url: 'https://paulbourke.net/fractals/clifford/' },
    { label: 'Lorenz (1963): Deterministic Nonperiodic Flow', url: 'https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2' },
    { label: 'Jérémie Piellard: Strange Attractors (sólo las ecuaciones)', url: 'https://piellardj.github.io/strange-attractors-webgl/' },
  ],
  wrap: 'clamp',
  figure: true,
};
