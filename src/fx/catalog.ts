/**
 * The catalog of finishes: Spanish names, one line of what each does, its group and its parameters with
 * ranges, defaults and help. Sizes are in pixels of the final render (the preview scales them).
 * The defaults are tuned so each finish, alone on a photo, already looks like itself.
 */
import type { FinishDef, ParamDef } from './index';
import { CUSTOM_KEYS, PALETTE_OPTIONS } from './palettes';

export interface DitherAlgo {
  id: string;
  name: string;
  family: 'difusion' | 'ordenado' | 'curva' | 'umbral';
}

export const DITHER_ALGOS: DitherAlgo[] = [
  { id: 'floyd', name: 'Floyd–Steinberg', family: 'difusion' },
  { id: 'atkinson', name: 'Atkinson', family: 'difusion' },
  { id: 'jarvis', name: 'Jarvis–Judice–Ninke', family: 'difusion' },
  { id: 'stucki', name: 'Stucki', family: 'difusion' },
  { id: 'burkes', name: 'Burkes', family: 'difusion' },
  { id: 'sierra', name: 'Sierra', family: 'difusion' },
  { id: 'sierra2', name: 'Sierra de dos filas', family: 'difusion' },
  { id: 'sierralite', name: 'Sierra Lite', family: 'difusion' },
  { id: 'riemersma', name: 'Riemersma (curva de Hilbert)', family: 'curva' },
  { id: 'bayer2', name: 'Bayer 2×2', family: 'ordenado' },
  { id: 'bayer4', name: 'Bayer 4×4', family: 'ordenado' },
  { id: 'bayer8', name: 'Bayer 8×8', family: 'ordenado' },
  { id: 'bayer16', name: 'Bayer 16×16', family: 'ordenado' },
  { id: 'cluster', name: 'Punto agrupado', family: 'ordenado' },
  { id: 'bluenoise', name: 'Ruido azul', family: 'ordenado' },
  { id: 'random', name: 'Ruido blanco', family: 'ordenado' },
  { id: 'threshold', name: 'Umbral', family: 'umbral' },
];

const DIFFUSION = DITHER_ALGOS.filter(a => a.family === 'difusion').map(a => a.id);

/* ------------------------------------------------------------------ param helpers */

const range = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string, help?: string, when?: ParamDef['when']): ParamDef =>
  ({ key, label, type: 'range', min, max, step, def, ...(unit ? { unit } : {}), ...(help ? { help } : {}), ...(when ? { when } : {}) });
const select = (key: string, label: string, options: Array<[string, string]>, def: string, help?: string, when?: ParamDef['when']): ParamDef =>
  ({ key, label, type: 'select', options, def, ...(help ? { help } : {}), ...(when ? { when } : {}) });
const toggle = (key: string, label: string, def: boolean, help?: string, when?: ParamDef['when']): ParamDef =>
  ({ key, label, type: 'toggle', def, ...(help ? { help } : {}), ...(when ? { when } : {}) });
const color = (key: string, label: string, def: string, help?: string, when?: ParamDef['when']): ParamDef =>
  ({ key, label, type: 'color', def, ...(help ? { help } : {}), ...(when ? { when } : {}) });

/** Palette choice + its automatic count + custom colours, shown only when they apply. */
function paletteParams(def: string, when?: ParamDef['when']): ParamDef[] {
  const custom = { ...(when ?? {}), palette: ['custom'] };
  const counted = { ...(when ?? {}), palette: ['auto', 'custom'] };
  const defaults = ['#0c0b0a', '#3255a4', '#ff5b1f', '#ede6da', '#8bac0f', '#ffe800'];
  return [
    select('palette', 'Paleta', PALETTE_OPTIONS, def, 'Automática toma los colores de la propia imagen.', when),
    range('count', 'Colores', 2, 16, 1, 4, undefined, '«Tus colores» usa hasta 6.', counted),
    ...CUSTOM_KEYS.map((k, i) => color(k, `Color ${i + 1}`, defaults[i], undefined, custom)),
  ];
}

const INK = '#0c0b0a', PAPER = '#ede6da';

/* ------------------------------------------------------------------ the catalog */

export const CATALOG: FinishDef[] = [
  /* ---------- tramado */
  {
    kind: 'dither', name: 'Tramado (dither)', group: 'tramado',
    blurb: 'Reduce la imagen a pocos tonos o colores con difusión de error, matrices ordenadas o ruido.',
    params: [
      select('algo', 'Método', DITHER_ALGOS.map(a => [a.id, a.name]), 'atkinson',
        'Difusión de error: grano orgánico. Bayer: trama regular. Ruido azul: sin patrones visibles.'),
      toggle('serpentine', 'Serpentina', true, 'Recorre las filas en zigzag: menos «gusanos» diagonales.', { algo: DIFFUSION }),
      select('color', 'Color', [['bn', '1 bit (tinta y papel)'], ['tonos', 'Tonos entre tinta y papel'], ['rgb', 'Niveles por canal (RGB)'], ['paleta', 'Paleta']], 'bn'),
      color('ink', 'Tinta', INK, undefined, { color: ['bn', 'tonos'] }),
      color('paper', 'Papel', PAPER, undefined, { color: ['bn', 'tonos'] }),
      toggle('clear', 'Papel transparente', false, 'Solo queda la tinta: útil para superponer la trama a la foto.', { color: ['bn', 'tonos'] }),
      range('levels', 'Niveles', 2, 16, 1, 4, undefined, undefined, { color: ['tonos', 'rgb'] }),
      ...paletteParams('gameboy', { color: ['paleta'] }),
      range('pixel', 'Tamaño de píxel', 1, 24, 1, 2, 'px', 'Tramar a menor resolución y ampliar sin suavizar: píxeles en bloque.'),
      range('bright', 'Brillo', -1, 1, 0.01, 0),
      range('contrast', 'Contraste', 0, 3, 0.01, 1.15),
      toggle('linear', 'Luz lineal', false, 'Reparte la luz como una impresión física (fiel en papel o a tamaño real). Reducida en pantalla se ve más oscura.'),
    ],
  },
  {
    kind: 'halftone', name: 'Semitono', group: 'tramado',
    blurb: 'Trama de imprenta: puntos, líneas o cruces cuyo tamaño sigue al tono, en tinta o en CMYK.',
    params: [
      select('shape', 'Forma', [['dot', 'Punto'], ['ellipse', 'Elipse'], ['square', 'Cuadrado'], ['line', 'Línea'], ['cross', 'Cruz']], 'dot'),
      range('freq', 'Frecuencia', 2, 40, 0.5, 9, 'celdas / 100 px', 'Celdas por cada 100 px del resultado: menos es un punto más grande.'),
      range('angle', 'Ángulo', 0, 180, 1, 45, '°'),
      range('contrast', 'Contraste', 0.2, 3, 0.01, 1.2),
      range('bright', 'Brillo', -1, 1, 0.01, 0, undefined, 'Menos brillo, más tinta: recupera las luces de una figura clara.'),
      select('color', 'Color', [['tinta', 'Tinta sobre papel'], ['fuente', 'Color de la imagen'], ['cmyk', 'CMYK (cuatro tramas)']], 'tinta'),
      color('ink', 'Tinta', INK, undefined, { color: ['tinta'] }),
      color('paper', 'Papel', PAPER),
      toggle('clear', 'Papel transparente', false, 'Solo quedan los puntos.'),
    ],
  },
  {
    kind: 'crosshatch', name: 'Rayado cruzado', group: 'tramado',
    blurb: 'Líneas de grabado que se cruzan en más direcciones donde la imagen es más oscura.',
    params: [
      range('spacing', 'Separación', 3, 40, 0.5, 11, 'px'),
      range('width', 'Grosor', 0.05, 0.9, 0.01, 0.42, undefined, 'Grosor máximo de la línea, en fracción de la separación.'),
      range('angle', 'Ángulo', 0, 180, 1, 45, '°'),
      range('layers', 'Capas', 1, 4, 1, 3, undefined, 'Direcciones de línea que se suman al oscurecer.'),
      range('wobble', 'Pulso', 0, 1, 0.01, 0.25, undefined, 'Ondulación de trazo a mano.'),
      range('bright', 'Brillo', -1, 1, 0.01, 0, undefined, 'Menos brillo, más líneas.'),
      select('color', 'Color', [['tinta', 'Tinta'], ['fuente', 'Color de la imagen']], 'tinta'),
      color('ink', 'Tinta', '#1a1714', undefined, { color: ['tinta'] }),
      color('paper', 'Papel', PAPER),
      toggle('clear', 'Papel transparente', false, 'Solo quedan las líneas.'),
    ],
  },
  {
    kind: 'pixelate', name: 'Pixelado', group: 'tramado',
    blurb: 'Bloques del color medio de cada celda; con hueco, mosaico o pantalla de LED.',
    params: [
      range('size', 'Tamaño', 2, 128, 1, 14, 'px'),
      select('shape', 'Forma', [['square', 'Cuadrado'], ['circle', 'Círculo (LED)']], 'square'),
      range('gap', 'Hueco', 0, 0.45, 0.01, 0, undefined, 'Separación transparente entre bloques.'),
    ],
  },
  {
    kind: 'edges', name: 'Bordes', group: 'tramado',
    blurb: 'Detecta contornos (Sobel) y los dibuja como línea: sobre la imagen, solos o como boceto.',
    params: [
      select('mode', 'Modo', [['boceto', 'Boceto (línea sobre papel)'], ['sobre', 'Sobre la imagen'], ['solo', 'Solo líneas (transparente)']], 'boceto'),
      range('threshold', 'Umbral', 0, 1, 0.01, 0.3, undefined, 'Más alto: solo los bordes fuertes.'),
      range('width', 'Grosor', 0.5, 12, 0.5, 1.5, 'px'),
      color('color', 'Color de línea', '#16130f'),
      color('paper', 'Papel', PAPER, undefined, { mode: ['boceto'] }),
    ],
  },

  /* ---------- tono */
  {
    kind: 'levels', name: 'Niveles', group: 'tono',
    blurb: 'Punto negro, punto blanco y gamma: el contraste fino de una foto.',
    params: [
      range('black', 'Negro', 0, 1, 0.005, 0.06),
      range('white', 'Blanco', 0, 1, 0.005, 0.94),
      range('gamma', 'Gamma', 0.2, 3, 0.01, 1, undefined, 'Más de 1 aclara los medios tonos.'),
      range('outBlack', 'Salida negro', 0, 1, 0.005, 0),
      range('outWhite', 'Salida blanco', 0, 1, 0.005, 1),
    ],
  },
  {
    kind: 'threshold', name: 'Umbral', group: 'tono',
    blurb: 'Dos tintas: todo lo más oscuro que el umbral es tinta; lo demás, papel.',
    params: [
      range('level', 'Umbral', 0, 1, 0.005, 0.5),
      range('soft', 'Suavidad', 0, 0.5, 0.005, 0.03),
      select('mode', 'Modo', [['global', 'Global'], ['local', 'Local (adaptativo)']], 'global', 'Local compara cada píxel con su entorno: dibuja detalle en luces y sombras.'),
      range('radius', 'Radio local', 2, 80, 1, 18, 'px', undefined, { mode: ['local'] }),
      color('ink', 'Tinta', INK),
      color('paper', 'Papel', PAPER),
      toggle('clear', 'Papel transparente', false),
    ],
  },
  {
    kind: 'posterize', name: 'Posterizar', group: 'tono',
    blurb: 'Pocos niveles por canal: zonas planas de color, como un cartel serigrafiado.',
    params: [
      range('levels', 'Niveles', 2, 32, 1, 5),
      select('mode', 'Modo', [['rgb', 'Cada canal'], ['luz', 'Solo la luz (mantiene el color)']], 'rgb'),
    ],
  },
  {
    kind: 'invert', name: 'Invertir', group: 'tono',
    blurb: 'Negativo de la imagen, o solo de su luz manteniendo los colores.',
    params: [
      select('mode', 'Modo', [['rgb', 'Negativo'], ['luz', 'Solo la luz']], 'rgb'),
    ],
  },

  /* ---------- color */
  {
    kind: 'mono', name: 'Monocromo', group: 'color',
    blurb: 'Blanco y negro con filtro de color como en la película, y un tinte opcional.',
    params: [
      select('filter', 'Filtro', [['neutro', 'Neutro'], ['rojo', 'Rojo (cielos oscuros)'], ['naranja', 'Naranja'], ['verde', 'Verde'], ['azul', 'Azul']], 'neutro'),
      range('contrast', 'Contraste', 0, 3, 0.01, 1.1),
      color('tint', 'Tinte', '#d9b98c'),
      range('tintAmount', 'Fuerza del tinte', 0, 1, 0.01, 0),
    ],
  },
  {
    kind: 'duotone', name: 'Duotono', group: 'color',
    blurb: 'La luz de la imagen pintada con dos colores: uno para las sombras y otro para las luces.',
    params: [
      color('dark', 'Sombras', '#1b1446'),
      color('light', 'Luces', '#ff9b5e'),
      range('contrast', 'Contraste', 0, 3, 0.01, 1.15),
      range('balance', 'Equilibrio', -1, 1, 0.01, 0, undefined, 'Desplaza el paso entre los dos colores.'),
    ],
  },
  {
    kind: 'palette', name: 'Paleta limitada', group: 'color',
    blurb: 'Cada píxel toma el color más cercano de una paleta (Game Boy, CGA, PICO-8, risografía…).',
    params: [
      ...paletteParams('pico8'),
      select('dither', 'Tramado', [['none', 'Ninguno'], ['bayer4', 'Bayer 4×4'], ['bayer8', 'Bayer 8×8'], ['bluenoise', 'Ruido azul'], ['floyd', 'Floyd–Steinberg'], ['atkinson', 'Atkinson']], 'bayer4',
        'Sin tramado quedan zonas planas; con tramado, degradados de puntos.'),
      range('pixel', 'Tamaño de píxel', 1, 24, 1, 2, 'px'),
    ],
  },
  {
    kind: 'chroma', name: 'Separación RGB', group: 'color',
    blurb: 'Desplaza los canales rojo y azul: aberración de lente, VHS o impresión desregistrada.',
    params: [
      range('amount', 'Distancia', 0, 40, 0.5, 5, 'px'),
      range('angle', 'Dirección', 0, 360, 1, 0, '°', undefined, { mode: ['lineal'] }),
      select('mode', 'Modo', [['lineal', 'Lineal'], ['radial', 'Radial (lente)']], 'lineal'),
      range('jitter', 'Temblor VHS', 0, 1, 0.01, 0, undefined, 'Desplaza franjas de filas; cambia con el tiempo.'),
    ],
  },

  /* ---------- luz */
  {
    kind: 'glow', name: 'Resplandor', group: 'luz',
    blurb: 'Las luces se derraman alrededor (bloom); sobre transparente, un halo de luz.',
    params: [
      range('threshold', 'Umbral', 0, 1, 0.01, 0.55, undefined, 'Solo brilla lo más claro que esto. 0: todo brilla (halo exterior).'),
      range('radius', 'Radio', 1, 160, 1, 28, 'px'),
      range('strength', 'Fuerza', 0, 4, 0.01, 1),
      color('tint', 'Tinte', '#ffffff', 'Blanco conserva el color de la luz.'),
      select('blend', 'Mezcla', [['screen', 'Trama (suave)'], ['add', 'Suma (luz intensa)']], 'screen', 'Suma quema a blanco las luces fuertes; trama las respeta.'),
    ],
  },
  {
    kind: 'shadow', name: 'Sombra', group: 'luz',
    blurb: 'Sombra de la silueta de un recorte: caída suave, dura o sombra larga.',
    params: [
      select('mode', 'Tipo', [['drop', 'Caída'], ['long', 'Larga']], 'drop'),
      range('angle', 'Ángulo', 0, 360, 1, 60, '°', '0° hacia la derecha, 90° hacia abajo.'),
      range('distance', 'Distancia', 0, 400, 1, 16, 'px'),
      range('blur', 'Desenfoque', 0, 80, 0.5, 14, 'px', '0: sombra dura.'),
      color('color', 'Color', '#0c0b0a'),
      range('opacity', 'Opacidad', 0, 1, 0.01, 0.55),
      toggle('fade', 'Desvanecer', true, 'La sombra larga se aclara con la distancia.', { mode: ['long'] }),
    ],
  },
  {
    kind: 'vignette', name: 'Viñeta', group: 'luz',
    blurb: 'Oscurece (o tiñe) los bordes para llevar la mirada al centro.',
    params: [
      range('amount', 'Fuerza', 0, 1, 0.01, 0.55),
      range('size', 'Tamaño', 0, 1.5, 0.01, 0.55, undefined, 'Dónde empieza a oscurecer, desde el centro.'),
      range('soft', 'Suavidad', 0.05, 1, 0.01, 0.6),
      range('round', 'Redondez', 0, 1, 0.01, 0.6, undefined, '1: círculo. 0: sigue la forma del cuadro.'),
      color('color', 'Color', '#000000'),
    ],
  },

  /* ---------- movimiento */
  {
    kind: 'motionblur', name: 'Desenfoque de movimiento', group: 'movimiento',
    blurb: 'Barrido en una dirección, zoom radial o giro; la estela deja el original nítido encima.',
    params: [
      select('mode', 'Tipo', [['linear', 'Direccional'], ['zoom', 'Zoom radial'], ['spin', 'Giro']], 'linear'),
      range('angle', 'Ángulo', 0, 360, 1, 0, '°', undefined, { mode: ['linear'] }),
      range('distance', 'Distancia', 0, 400, 1, 48, 'px', undefined, { mode: ['linear'] }),
      range('amount', 'Cantidad', 0, 1, 0.01, 0.25, undefined, 'Zoom: fracción del camino al centro. Giro: 1 es un sexto de vuelta (60°).', { mode: ['zoom', 'spin'] }),
      range('cx', 'Centro X', 0, 1, 0.01, 0.5, undefined, undefined, { mode: ['zoom', 'spin'] }),
      range('cy', 'Centro Y', 0, 1, 0.01, 0.5, undefined, undefined, { mode: ['zoom', 'spin'] }),
      toggle('trail', 'Estela', false, 'El barrido queda detrás y el original nítido encima (texto ASCII sobre transparente).'),
    ],
  },
  {
    kind: 'blur', name: 'Desenfoque', group: 'textura',
    blurb: 'Desenfoque gaussiano: suaviza o manda una capa al fondo.',
    params: [
      range('radius', 'Radio', 0, 100, 0.5, 6, 'px'),
    ],
  },
  {
    kind: 'sharpen', name: 'Enfocar', group: 'textura',
    blurb: 'Máscara de enfoque: realza el detalle y los bordes.',
    params: [
      range('amount', 'Fuerza', 0, 4, 0.01, 1),
      range('radius', 'Radio', 0.3, 20, 0.1, 1.5, 'px'),
      range('threshold', 'Umbral', 0, 0.3, 0.005, 0.02, undefined, 'No realza diferencias menores que esto (evita realzar el ruido).'),
    ],
  },

  /* ---------- textura */
  {
    kind: 'grain', name: 'Grano', group: 'textura',
    blurb: 'Grano de película: suave, más visible en los medios tonos, fijo o vivo en el tiempo.',
    params: [
      range('amount', 'Cantidad', 0, 1, 0.01, 0.35),
      range('size', 'Tamaño', 0.5, 8, 0.1, 1.6, 'px'),
      toggle('color', 'Grano de color', false),
      toggle('anim', 'Animado', true, 'Cambia en cada fotograma (24 por segundo).'),
    ],
  },
  {
    kind: 'noise', name: 'Ruido', group: 'textura',
    blurb: 'Ruido digital plano: estática uniforme o gaussiana, por píxel o en bloques.',
    params: [
      range('amount', 'Cantidad', 0, 1, 0.01, 0.22),
      select('dist', 'Distribución', [['gauss', 'Gaussiana'], ['uniform', 'Uniforme']], 'gauss'),
      range('size', 'Tamaño', 1, 16, 1, 1, 'px'),
      toggle('color', 'Ruido de color', true),
      toggle('anim', 'Animado', true),
    ],
  },
  {
    kind: 'scanlines', name: 'Líneas de barrido', group: 'textura',
    blurb: 'Líneas de monitor CRT, con máscara de fósforo RGB y desplazamiento en el tiempo.',
    params: [
      range('spacing', 'Separación', 2, 32, 0.5, 4, 'px'),
      range('intensity', 'Intensidad', 0, 1, 0.01, 0.45),
      range('width', 'Grosor', 0.1, 0.9, 0.01, 0.45, undefined, 'Fracción oscura de cada línea.'),
      range('roll', 'Desplazamiento', -200, 200, 1, 0, 'px/s'),
      toggle('mask', 'Máscara de fósforo', false, 'Franjas verticales rojas, verdes y azules.'),
    ],
  },
];
