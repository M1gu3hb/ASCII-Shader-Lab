/**
 * QA page of the library ported from the pattern-library branch: every new pattern, particle motion, recipe, scene,
 * palette, character set and letter animation, drawn by both engines side by side at the same size and time.
 * Not part of the production build (like dev/patterns.html and dev/basic.html).
 *   ?motor=basico | ?motor=webgl   only one engine;  ?solo=patrones,escenas   only those sections
 *   ?t=3.3   time;  ?ids=medusa,caliz   only these items
 * window.__lib drives scripts that take screenshots and measure (snap, bench).
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import {
  AsciiEngine, BasicEngine, CHARSETS, LETTER_ANIMS, LIBRARY, PATTERN_GLSL, charsetById, createFontLoader, defaultRecipe, patternById,
  type LetterAnimKind, type Recipe, type Renderer,
} from '../src/engine';
import { PALETTE_GALLERY, PALETTE_MOODS } from '../src/random/palette-gallery';
import { PRESETS } from '../src/studio/presets';
import { SCENES, makeScene } from '../src/studio/scenes';

const fonts = createFontLoader({ google: false });
const params = new URLSearchParams(location.search);
const T = parseFloat(params.get('t') ?? '3.3');
const motor = params.get('motor');
const ENGINES: Array<'gl' | 'basic'> = motor === 'basico' ? ['basic'] : motor === 'webgl' ? ['gl'] : ['gl', 'basic'];
const only = params.get('solo')?.split(',');
const onlyIds = params.get('ids')?.split(',');
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));

/* ---------- inputs ---------- */

/** A synthetic portrait (gradients, a face-like shape, stripes), so Imagen scenes have a picture to work on. */
function portrait(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 640;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 960, 640);
  g.addColorStop(0, '#1b3a5c'); g.addColorStop(0.5, '#d9825b'); g.addColorStop(1, '#f5e6c8');
  x.fillStyle = g; x.fillRect(0, 0, 960, 640);
  const rg = x.createRadialGradient(480, 290, 20, 480, 290, 240);
  rg.addColorStop(0, '#ffe2c4'); rg.addColorStop(0.7, '#b0643c'); rg.addColorStop(1, 'rgba(40,20,10,0)');
  x.fillStyle = rg; x.beginPath(); x.ellipse(480, 300, 180, 230, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1a0f0a';
  x.beginPath(); x.arc(420, 260, 22, 0, Math.PI * 2); x.arc(540, 260, 22, 0, Math.PI * 2); x.fill();
  x.fillRect(430, 380, 100, 14);
  for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? '#2a6f4f' : '#e8f0d0'; x.fillRect(760 + i * 18, 60, 9, 520); }
  return c;
}
const IMAGE = portrait();

/* ---------- items ---------- */

interface Item {
  section: string; id: string; title: string; sub: string;
  recipe: () => Recipe;
  /** times drawn (one or three moments) */
  times: number[];
  extra?: () => HTMLElement;
  size: [number, number];
}

const INK = ['#1c1a17', '#8c857a', '#ede6da'];
function patternRecipe(id: string, stops = INK, bg = '#0c0b0a'): Recipe {
  const r = defaultRecipe();
  r.glyph.cell = 6;
  r.color.stops = stops.slice(); r.color.bg = bg;
  r.interact.mode = 'none';
  r.layers = [{ ...r.layers[0], pattern: id }];
  return r;
}
const withoutPointer = (r: Recipe) => { r.interact.auto = false; return r; };
const swatches = (stops: string[], bg: string) => () => {
  const d = document.createElement('div');
  d.className = 'sw';
  d.innerHTML = [bg, ...stops].map(c => `<i style="background:${c}"></i>`).join('');
  return d;
};
const text = (s: string, cls = 'chars') => () => { const d = document.createElement('div'); d.className = cls; d.textContent = s; return d; };

const items: Item[] = [];
const T3 = [T, T + 0.9, T + 1.8];
for (const id of [...LIBRARY.fields, ...LIBRARY.solids]) {
  const p = patternById(id);
  items.push({ section: 'patrones', id, title: p.name, sub: `${p.family} · a: ${p.a} · b: ${p.b}`, recipe: () => patternRecipe(id), times: [T], size: [480, 270] });
}
for (const id of LIBRARY.particles) {
  const p = patternById(id);
  items.push({ section: 'particulas', id, title: p.name, sub: `a: ${p.a} · b: ${p.b}`, recipe: () => patternRecipe(id), times: T3, size: [320, 180] });
}
const LIB_RECIPES = new Set(['ondas-sismografo', 'luna-de-lago', 'mareas-de-seda', 'arena-zen', 'niebla-en-capas', 'luciernagas-noche', 'lluvia-estanque',
  'bambu-tinta', 'aire-respira', 'estuarios', 'corrientes-de-aire', 'curvas-terreno', 'dunas-de-viento', 'tela-quieta', 'placa-electronica',
  'infinito-de-bern', 'gielis', 'pendulo-de-tinta', 'cadenas-suspendidas', 'circulos-anidados', 'flor-harmonica', 'estrella-de-mar', 'simbiosis-viva',
  'pendulos-cineticos', 'cinta-luminosa', 'jade-palpitante', 'caliz-ceramico', 'medusa-biologica', 'orbitales-pacificas', 'espiral-semillas',
  'mandelbrot-azul', 'tapiz-infinito', 'cinco-ejes', 'curvas-de-tinta', 'obelisco-de-tinta', 'prisma-de-luz', 'arena-en-suspension',
  'tipo-orbita', 'tipo-enjambre', 'tipo-cascada', 'terminal-teletipo', 'terminal-cifras', 'terminal-prisma', 'terminal-obelisco', 'terminal-espirografo']);
for (const [space, list] of Object.entries(PRESETS)) for (const p of list) {
  if (!LIB_RECIPES.has(p.id)) continue;
  items.push({ section: 'recetas', id: `${space}/${p.id}`, title: p.name, sub: `${space} · ${p.make().layers.map(l => l.pattern).join(' + ')}`, recipe: () => withoutPointer(p.make()), times: [T], size: [640, 400] });
}
for (const s of SCENES) {
  items.push({ section: 'escenas', id: s.id, title: s.name, sub: `${s.space} · ${PALETTE_MOODS[s.mood]} · ${s.layers.map(l => l.pattern).join(' + ')}`, recipe: () => withoutPointer(makeScene(s)), times: [T], size: [640, 400] });
}
for (const p of PALETTE_GALLERY) {
  items.push({
    section: 'paletas', id: p.id, title: p.name, sub: PALETTE_MOODS[p.mood] + (p.light ? ' · papel' : ''), times: [T], size: [320, 180],
    recipe: () => { const r = patternRecipe('nube', p.stops, p.bg); r.glyph.cell = 7; r.glyph.charset = charsetById('detallado')!.chars; return r; },
    extra: swatches(p.stops, p.bg),
  });
}
for (const id of LIBRARY.charsets) {
  const c = charsetById(id)!;
  items.push({
    section: 'alfabetos', id, title: c.name, sub: c.ascii ? 'ASCII' : 'Unicode', times: [T], size: [320, 180],
    recipe: () => { const r = patternRecipe('esfera'); r.glyph.cell = 12; r.glyph.charset = c.chars; r.layers[0].scale = 1.3; return r; },
    extra: text(c.chars),
  });
}
for (const kind of LIBRARY.letterAnims as LetterAnimKind[]) {
  const info = LETTER_ANIMS[kind];
  const preset = PRESETS.tipo.find(p => p.id === 'tipo-' + kind);
  items.push({
    section: 'letras', id: 'texto-' + kind, title: info.name + ' · texto', sub: info.desc, times: T3, size: [480, 270],
    recipe: () => { const r = preset ? preset.make() : defaultRecipe(); r.source = 'text'; r.text.content = 'GLYPHOS'; r.text.anim = { kind, amount: 0.7, speed: 1 }; return withoutPointer(r); },
  });
  items.push({
    section: 'letras', id: 'mensaje-' + kind, title: info.name + ' · mensaje', sub: 'en la rejilla del mensaje', times: T3, size: [480, 270],
    recipe: () => {
      const r = patternRecipe('mareas_lentas', ['#163538', '#71ad9f', '#e1dbc2'], '#081c22');
      r.glyph.cell = 9;
      r.msg = { ...r.msg, on: true, text: 'hola desde la biblioteca', mode: 'static', y: 0.5, box: 0.9, anim: { kind, amount: 0.8, speed: 1 } };
      return r;
    },
  });
}

/* ---------- engines ---------- */

interface Pair { gl: AsciiEngine | null; basic: BasicEngine | null }
const pairs = new Map<string, Pair>();
function pairFor(w: number, h: number): Pair {
  const key = `${w}x${h}`;
  let p = pairs.get(key);
  if (!p) {
    const common = { fonts, fixedSize: { width: w, height: h, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false } as const;
    p = {
      gl: ENGINES.includes('gl') ? new AsciiEngine(document.createElement('canvas'), defaultRecipe(), { ...common, library: PATTERN_GLSL, preserveDrawingBuffer: true, onError: m => errors.push(`${key}: ${m}`) }) : null,
      basic: ENGINES.includes('basic') ? new BasicEngine(document.createElement('canvas'), defaultRecipe(), common) : null,
    };
    for (const e of [p.gl, p.basic]) e?.setMedia('image', IMAGE);
    pairs.set(key, p);
  }
  return p;
}
const engineOf = (p: Pair, which: 'gl' | 'basic'): Renderer | null => (which === 'gl' ? p.gl : p.basic);

async function draw(e: Renderer, r: Recipe, t: number, into: HTMLCanvasElement) {
  e.set(r);
  await e.ready();
  // twice: the first frame of a new piece may start its transition or warm-up
  e.renderAt(t - 1 / 30); e.renderAt(t);
  into.width = e.canvas.width; into.height = e.canvas.height;
  into.getContext('2d')!.drawImage(e.canvas, 0, 0);
}

/* ---------- page ---------- */

const SECTIONS: Array<[string, string, string]> = [
  ['patrones', 'Patrones (35, diez sólidos)', 'Tinta sobre hueso, celda 6, una capa con a y b en su valor inicial.'],
  ['particulas', 'Partículas (12 movimientos)', 'Tres momentos seguidos (0,9 s) de cada motor.'],
  ['recetas', 'Recetas (45)', 'Cada receta tal como abre en su espacio.'],
  ['escenas', 'Escenas compuestas (28)', 'Las de Imagen, sobre un retrato sintético.'],
  ['paletas', 'Paletas (40)', 'Nubes con cada paleta; debajo, el fondo y sus colores.'],
  ['alfabetos', 'Alfabetos (10)', 'Una esfera con cada juego de caracteres.'],
  ['letras', 'Animaciones de letras (3)', 'Texto grande y mensaje, tres momentos seguidos.'],
];

const main = document.getElementById('main')!;
const tiles: Array<{ item: Item; canvases: HTMLCanvasElement[] }> = [];
for (const [id, title, note] of SECTIONS) {
  if (only && !only.includes(id)) continue;
  const list = items.filter(i => i.section === id && (!onlyIds || onlyIds.includes(i.id)));
  if (!list.length) continue;
  const h = document.createElement('h2'); h.id = id; h.textContent = title;
  const p = document.createElement('p'); p.className = 'note'; p.textContent = note;
  const grid = document.createElement('div'); grid.className = 'grid';
  const wide = list[0].times.length > 1;
  grid.style.setProperty('--tile', wide ? '620px' : ENGINES.length > 1 ? '420px' : '260px');
  main.append(h, p, grid);
  for (const item of list) {
    const fig = document.createElement('figure');
    const n = item.times.length * ENGINES.length;
    const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--n', String(n));
    const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.style.setProperty('--n', String(n));
    const canvases: HTMLCanvasElement[] = [];
    for (const which of ENGINES) for (const t of item.times) {
      const c = document.createElement('canvas');
      c.style.aspectRatio = `${item.size[0]} / ${item.size[1]}`;
      row.append(c); canvases.push(c);
      const s = document.createElement('span'); s.textContent = `${which === 'gl' ? 'WebGL' : 'básico'} · t ${t.toFixed(1)}`; lbl.append(s);
    }
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<span><b></b> <code></code></span><span class="sub"></span>`;
    cap.querySelector('b')!.textContent = item.title;
    cap.querySelector('code')!.textContent = item.id;
    cap.querySelector('.sub')!.textContent = item.sub;
    fig.append(row, lbl, cap);
    if (item.extra) fig.append(item.extra());
    grid.append(fig);
    tiles.push({ item, canvases });
  }
}

const status = document.getElementById('status')!;
async function run() {
  let k = 0;
  for (const { item, canvases } of tiles) {
    const p = pairFor(item.size[0], item.size[1]);
    let c = 0;
    for (const which of ENGINES) for (const t of item.times) {
      const e = engineOf(p, which)!;
      const before = errors.length;
      await draw(e, item.recipe(), t, canvases[c++]);
      if (errors.length > before) canvases[c - 1].parentElement!.parentElement!.querySelector('figcaption')!.classList.add('bad');
    }
    status.textContent = `${++k} / ${tiles.length}`;
  }
  status.textContent = `${tiles.length} piezas · ${errors.length ? errors.length + ' errores' : 'sin errores'}`;
}

/** Average cost of one frame of the basic engine (ms), after a warm-up: lab numbers, this machine only. */
async function bench(r: Recipe, o: { w?: number; h?: number; frames?: number } = {}) {
  const w = o.w ?? 1920, h = o.h ?? 1080, frames = o.frames ?? 12;
  const e = new BasicEngine(document.createElement('canvas'), r, { fonts, fixedSize: { width: w, height: h, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false });
  e.setMedia('image', IMAGE);
  await e.ready();
  for (let i = 0; i < 4; i++) e.renderAt(T - 1 + i / 30);
  const flush = e.canvas.getContext('2d')!;
  let total = 0, field = 0;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    e.renderAt(T + i / 30);
    flush.getImageData(0, 0, 1, 1);
    total += performance.now() - t0;
    field += e.timings.field;
  }
  const out = { cols: e.stats.cols, rows: e.stats.rows, total: total / frames, field: field / frames };
  e.destroy();
  return out;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  if (va === 0 || vb === 0) return va === vb ? 1 - Math.abs(ma - mb) / 255 : 0;
  return cov / Math.sqrt(va * vb);
}
function pixels(c: HTMLCanvasElement) {
  const s = document.createElement('canvas');
  s.width = c.width; s.height = c.height;
  const x = s.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(c, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
}
/** Both engines on one item: correlation of the cells' luminance, same glyphs, mean pixel difference (0..255). */
async function compare(item: Item, o: { w?: number; h?: number; t?: number } = {}) {
  const p = pairFor(o.w ?? item.size[0], o.h ?? item.size[1]);
  if (!p.gl || !p.basic) throw new Error('compare needs both engines');
  const r = item.recipe(), t = o.t ?? T;
  p.gl.set(r); p.basic.set(r);
  await Promise.all([p.gl.ready(), p.basic.ready()]);
  p.gl.renderAt(t - 1 / 30); p.gl.renderAt(t);
  p.basic.renderAt(t - 1 / 30); p.basic.renderAt(t);
  const a = p.gl.readGrid(), b = p.basic.readGrid();
  let same = 0;
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] === b.chars[i]) same++;
  const pa = pixels(p.gl.canvas), pb = pixels(p.basic.canvas);
  let mad = 0;
  for (let i = 0; i < pa.length; i++) mad += Math.abs(pa[i] - pb[i]);
  return { r: pearson(a.lum, b.lum), glyphs: same / a.chars.length, pixelMad: mad / pa.length, ink: a.lum.reduce((s, v) => s + v, 0) / a.lum.length };
}

declare global { interface Window { __lib: unknown } }
window.__lib = {
  done: false,
  errors,
  items: items.map(i => ({ section: i.section, id: i.id, title: i.title })),
  charsets: CHARSETS.length,
  /** One item drawn by one engine at any size, as a PNG data URL. */
  snap: async (section: string, id: string, o: { w: number; h: number; t?: number; engine: 'gl' | 'basic' }) => {
    const item = items.find(i => i.section === section && i.id === id);
    if (!item) throw new Error('no item ' + section + '/' + id);
    const p = pairFor(o.w, o.h);
    const e = engineOf(p, o.engine);
    if (!e) throw new Error('engine off: ' + o.engine);
    const c = document.createElement('canvas');
    await draw(e, item.recipe(), o.t ?? T, c);
    return c.toDataURL('image/png');
  },
  recipeOf: (section: string, id: string) => items.find(i => i.section === section && i.id === id)?.recipe(),
  compare: (section: string, id: string, o?: { w?: number; h?: number; t?: number }) => compare(items.find(i => i.section === section && i.id === id)!, o),
  /** Basic engine, one pattern alone at 1080p (cell 12 by default). */
  benchPattern: (id: string, o: { w?: number; h?: number; cell?: number; frames?: number } = {}) => {
    const r = patternRecipe(id); r.glyph.cell = o.cell ?? 12;
    return bench(r, o);
  },
  benchItem: (section: string, id: string, o: { w?: number; h?: number; frames?: number } = {}) => bench(items.find(i => i.section === section && i.id === id)!.recipe(), o),
};
await run();
(window.__lib as { done: boolean }).done = true;
