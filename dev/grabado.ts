/**
 * QA page of «Grabado láser» (src/families/sims/grabado.ts), not part of the production build: the recipes the
 * library gives for it (each preset alone, in Texto over several texts, in Terminal) drawn by both engines at
 * the same size and moment, so the reading of the person's words can be judged and compared.
 *   ?t=8   the moment;  ?motor=basico|webgl   one engine;  ?keys=a,b   only these items;  ?big=1   1280 × 720
 * window.__g drives scripts/grabado-qa.mjs (compare, snap).
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-800.css';
import { AsciiEngine, BasicEngine, PATTERN_GLSL, createFontLoader, defaultRecipe, type Recipe, type Renderer } from '../src/engine';
import '../src/families/all';
import { familyRecipe } from '../src/families/recipes';
import { itemByKey } from '../src/studio/recipes/catalog';
import { normalizeRecipe } from '../src/engine/recipe';

const fonts = createFontLoader({ google: false });
const params = new URLSearchParams(location.search);
const T = parseFloat(params.get('t') ?? '8');
const motor = params.get('motor');
const ENGINES: Array<'gl' | 'basic'> = motor === 'basico' ? ['basic'] : motor === 'webgl' ? ['gl'] : ['gl', 'basic'];
const only = params.get('keys')?.split(',');
const big = params.get('big') === '1';
const W = big ? 1280 : 640, H = big ? 720 : 360;
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));

/** A piece of the Texto space with these words (what the library item is made over, as in the studio). */
const withText = (content: string): Recipe => {
  const b = defaultRecipe();
  b.source = 'text';
  b.text = { ...b.text, content };
  return normalizeRecipe(b);
};

interface Item { key: string; title: string; recipe: () => Recipe }
const items: Item[] = [];
const PRESETS = ['tu-palabra', 'geometria', 'firma', 'placa', 'luz'];
for (const p of PRESETS) items.push({ key: `solo:${p}`, title: `Solo · ${p}`, recipe: () => familyRecipe('grabado', p, defaultRecipe(), 'qa') });
const TEXTS: Array<[string, string]> = [
  ['glyphos', 'GLYPHOS'],
  ['nandu', 'Ñandú\nBOB'],
  ['acentos', 'ÁRBOL ÉPICO'],
  ['largo', 'LO QUE SE ESCRIBE\nTAMBIÉN SE GRABA'],
  ['vacio', ''],
];
const lib = (key: string) => () => {
  const it = itemByKey(key);
  if (!it) throw new Error('No está en la biblioteca: ' + key);
  return it;
};
/** The library item made over a piece with these words; with none, the person emptied the text afterwards. */
const over = (key: string, text: string) => () => {
  const r = lib(key)().make(withText(text));
  if (!text) r.text.content = '';
  return r;
};
for (const [id, text] of TEXTS) {
  for (const p of ['tu-palabra', 'placa', 'luz']) {
    items.push({ key: `texto:${p}:${id}`, title: `Texto · ${p} · «${text.replace('\n', ' / ')}»`, recipe: over(`tipo/familia:grabado:${p}`, text) });
  }
  items.push({ key: `receta:${id}`, title: `Texto · receta «Grabado láser» · «${text.replace('\n', ' / ')}»`, recipe: over('tipo/grabado-laser', text) });
}
items.push({ key: 'terminal:tu-palabra', title: 'Terminal · tu-palabra', recipe: () => lib('terminal/familia:grabado:tu-palabra')().make() });
items.push({ key: 'terminal:geometria', title: 'Terminal · geometria', recipe: () => lib('terminal/familia:grabado:geometria')().make() });
const shown = items.filter(i => !only || only.includes(i.key));

const common = { fonts, fixedSize: { width: W, height: H, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false };
const gl = ENGINES.includes('gl') ? new AsciiEngine(document.createElement('canvas'), defaultRecipe(), { ...common, library: PATTERN_GLSL, preserveDrawingBuffer: true, onError: m => errors.push(m) }) : null;
const basic = ENGINES.includes('basic') ? new BasicEngine(document.createElement('canvas'), defaultRecipe(), { ...common, onError: m => errors.push(m) }) : null;
const engineOf = (w: 'gl' | 'basic'): Renderer => (w === 'gl' ? gl! : basic!);

async function draw(e: Renderer, r: Recipe, t: number, into: HTMLCanvasElement) {
  e.set(r);
  await e.ready();
  e.renderAt(t);
  into.width = e.canvas.width; into.height = e.canvas.height;
  into.getContext('2d')!.drawImage(e.canvas, 0, 0);
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

async function compare(key: string, t = T) {
  const item = items.find(i => i.key === key);
  if (!item || !gl || !basic) throw new Error('compare needs both engines and a known item');
  const r = item.recipe();
  for (const e of [gl, basic]) { e.set(r); await e.ready(); e.renderAt(t); }
  const a = gl.readGrid(), b = basic.readGrid();
  let same = 0;
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] === b.chars[i]) same++;
  let drgb = 0;
  for (let i = 0; i < a.rgb.length; i++) drgb += Math.abs(a.rgb[i] - b.rgb[i]);
  return {
    r: pearson(a.lum, b.lum), glyphs: same / a.chars.length, ink: a.lum.reduce((s, v) => s + v, 0) / a.lum.length, inkBasic: b.lum.reduce((s, v) => s + v, 0) / b.lum.length,
    rgb: pearson(a.rgb, b.rgb), drgb: drgb / a.rgb.length,
  };
}

const main = document.getElementById('main')!;
const grid = document.createElement('div'); grid.className = 'grid';
grid.style.setProperty('--tile', big ? '1240px' : ENGINES.length > 1 ? '640px' : '420px');
main.append(grid);
const tiles = shown.map(item => {
  const fig = document.createElement('figure');
  const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--n', String(ENGINES.length));
  const canvases = ENGINES.map(() => { const c = document.createElement('canvas'); c.style.aspectRatio = `${W} / ${H}`; row.append(c); return c; });
  const cap = document.createElement('figcaption');
  cap.innerHTML = '<span><b></b> <code></code></span><span class="sub"></span>';
  cap.querySelector('b')!.textContent = item.title;
  cap.querySelector('code')!.textContent = item.key;
  fig.append(row, cap);
  grid.append(fig);
  return { item, canvases, cap };
});

const status = document.getElementById('status')!;
declare global { interface Window { __g: unknown } }
window.__g = {
  done: false, errors, items: shown.map(i => ({ key: i.key, title: i.title })), compare,
  /** What the engine's run of the item reads and plans (the host and the model are private: QA only). */
  probe: async (key: string, o: { engine: 'gl' | 'basic'; t?: number }) => {
    const item = items.find(i => i.key === key)!;
    const e = engineOf(o.engine), r = item.recipe();
    await draw(e, r, o.t ?? T, document.createElement('canvas'));
    const host = (e as unknown as { fam: { source: { kind: number; text?: string; version: number } | null; slots: Array<{ model?: { debug?: () => { route: { strokes: number; cut: number; box: number[] } | null; state: Record<string, number> } } } | null> } }).fam;
    const d = host.slots[0]?.model?.debug?.();
    return { source: r.source, text: r.text.content, mix: r.media.mix, hostSource: host.source && { kind: host.source.kind, text: host.source.text, version: host.source.version }, route: d?.route && { strokes: d.route.strokes, cut: d.route.cut, box: d.route.box }, state: d?.state };
  },
  snap: async (key: string, o: { engine: 'gl' | 'basic'; t?: number }) => {
    const item = items.find(i => i.key === key)!;
    const c = document.createElement('canvas');
    await draw(engineOf(o.engine), item.recipe(), o.t ?? T, c);
    return c.toDataURL('image/png');
  },
};
let k = 0;
for (const { item, canvases, cap } of tiles) {
  let c = 0;
  for (const w of ENGINES) {
    const before = errors.length;
    try { await draw(engineOf(w), item.recipe(), T, canvases[c++]); } catch (e) { errors.push(`${item.key}: ${(e as Error).message}`); }
    if (errors.length > before) cap.classList.add('bad');
  }
  status.textContent = `${++k} / ${tiles.length}`;
}
status.textContent = `${tiles.length} piezas · ${errors.length ? errors.length + ' errores' : 'sin errores'}`;
(window.__g as { done: boolean }).done = true;
