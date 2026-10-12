import type { FamilyMeta } from '../types';

/**
 * «Grabado láser» (C-07 of the PR #10 inventory): a hot tip that engraves the person's words (their outlines and
 * parallel cuts inside the letters, read from the piece's text), a figure or a signature into a plate. A raster
 * geometry family (sims/grabado.ts) that reads the piece's text and gives its cells their colour.
 */
export const META: FamilyMeta = {
  id: 'grabado',
  name: 'Grabado láser',
  group: 'forma',
  kind: 'geometry',
  version: 1,
  aka: ['grabado láser', 'laser engraving', 'pirograbado', 'trayectoria de herramienta', 'toolpath', 'contornos de texto', 'marching squares', 'buril'],
  reads: ['source'],
  color: true,
  colorSince: 1,
  figure: true,
  wrap: 'clamp',
  params: [
    { key: 'origen', label: 'Origen del trazado', type: 'choice', def: 'texto', options: [
      { id: 'texto', label: 'Texto' }, { id: 'forma', label: 'Forma' }, { id: 'curva', label: 'Curva (firma)' },
    ] },
    { key: 'palabra', label: 'Palabra propia', type: 'text', def: 'GLYPHOS', max: 40 },
    { key: 'velocidad', label: 'Velocidad', type: 'number', min: 0.1, max: 1.5, def: 0.45, step: 0.01, digits: 2 },
    { key: 'grosor', label: 'Grosor', type: 'number', min: 0.4, max: 3, def: 1, step: 0.01 },
    { key: 'pasadas', label: 'Cortes paralelos', type: 'int', min: 1, max: 5, def: 2 },
    { key: 'chispas', label: 'Chispas', type: 'number', min: 0, max: 1, def: 0.6, step: 0.01 },
    { key: 'humo', label: 'Humo', type: 'number', min: 0, max: 1, def: 0.35, step: 0.01 },
    { key: 'persistencia', label: 'Persistencia', type: 'number', min: 0, max: 1, def: 0.85, step: 0.01 },
    { key: 'material', label: 'Material', type: 'choice', def: 'acero', options: [
      { id: 'acero', label: 'Acero' }, { id: 'laton', label: 'Latón' }, { id: 'madera', label: 'Madera' },
    ] },
    { key: 'figura', label: 'Figura', type: 'choice', def: 'serie', options: [
      { id: 'serie', label: 'Una distinta cada vez' }, { id: 'poligono', label: 'Polígono' }, { id: 'estrella', label: 'Estrella' },
      { id: 'espirografo', label: 'Espirógrafo' }, { id: 'rosa', label: 'Rosa' }, { id: 'lissajous', label: 'Lissajous' },
    ] },
    { key: 'ciclo', label: 'Al terminar', type: 'choice', def: 'continuo', options: [
      { id: 'continuo', label: 'Enfría y sigue grabando' }, { id: 'una', label: 'Una vez y se queda (construcción)' },
    ] },
  ],
  presets: [
    { id: 'tu-palabra', name: 'Tu palabra grabada', uses: ['tipo/texturas', 'terminal/consola'], aka: ['grabado del texto', 'contorno de letras'],
      params: { origen: 'texto', palabra: 'GLYPHOS', velocidad: 0.55, grosor: 1, pasadas: 3, chispas: 0.7, humo: 0.35, persistencia: 0.9, material: 'acero', figura: 'serie', ciclo: 'continuo' },
      look: { stops: ['#05070a', '#2b3440', '#9fb3c8', '#f2f6fb'], bg: '#05070a', charset: ' .,:;-=+*#%@', cell: 8, colorMode: 'source', vivid: 0.55 }, res: 128 },
    { id: 'geometria', name: 'Geometría', uses: ['arte/geometricas', 'terminal/figuras'], aka: ['figuras grabadas', 'espirógrafo grabado'],
      params: { origen: 'forma', palabra: 'GLYPHOS', velocidad: 0.8, grosor: 1.1, pasadas: 2, chispas: 0.9, humo: 0.25, persistencia: 0.45, material: 'laton', figura: 'serie', ciclo: 'continuo' },
      look: { stops: ['#0a0603', '#3d2a10', '#d9a441', '#fff1c9'], bg: '#080502', charset: ' .:-=+*o#%@', colorMode: 'source', vivid: 0.6 } },
    { id: 'firma', name: 'Firma', uses: ['arte/curvas', 'terminal/figuras'], aka: ['firma pirograbada', 'escritura cursiva'],
      params: { origen: 'curva', palabra: 'GLYPHOS', velocidad: 0.4, grosor: 1.3, pasadas: 1, chispas: 0.35, humo: 0.75, persistencia: 0.8, material: 'madera', figura: 'serie', ciclo: 'continuo' },
      // a light wood background: the burn is dense glyphs in dark browns (by brightness, the stops go to dark too)
      look: { stops: ['#cfa877', '#8a5a30', '#4a2610', '#1a0b04'], bg: '#e2c59c', charset: ' .:-=+*#%@', cell: 8, colorMode: 'source', vivid: 0 } },
    { id: 'placa', name: 'Placa terminada', uses: ['tipo/texturas'], aka: ['grabado que se queda', 'construcción'],
      params: { origen: 'texto', palabra: 'GLYPHOS', velocidad: 0.7, grosor: 1.2, pasadas: 4, chispas: 0.6, humo: 0.3, persistencia: 0.85, material: 'laton', figura: 'serie', ciclo: 'una' },
      look: { stops: ['#080502', '#3d2a10', '#d9a441', '#fff1c9'], bg: '#080502', charset: ' .,:;-=+*#%@', cell: 8, colorMode: 'source', vivid: 0.6 }, res: 128 },
    { id: 'luz', name: 'Escritura de luz', uses: ['tipo/texturas', 'terminal/consola'], aka: ['estela que se apaga'],
      params: { origen: 'texto', palabra: 'GLYPHOS', velocidad: 0.9, grosor: 0.8, pasadas: 1, chispas: 1, humo: 0, persistencia: 0.12, material: 'acero', figura: 'serie', ciclo: 'continuo' },
      look: { stops: ['#020308', '#1c2340', '#ff8a3a', '#fff3d6'], bg: '#020308', charset: ' .:-=+*#%@', cell: 8, colorMode: 'source', vivid: 0.7 }, res: 128 },
  ],
  caps: {
    loop: false,
    time: { param: 'ciclo', values: { una: 'construccion' }, else: 'continuo' },
    basic: 'full',
    checkpoint: true,
  },
  budget: { res: [48, 160, 96], rate: 30, warmup: 12, resNote: 'Más filas: surcos más finos y letras pequeñas mejor leídas; más trabajo por paso.' },
};
