/**
 * QA page of the visual families (src/families): every preset of every family drawn by both engines at the
 * same size and moment. Not part of the production build.
 *   ?motor=basico | ?motor=webgl   one engine only;  ?ids=a,b   only these families;  ?t=6   the moment
 * window.__fam drives scripts that compare the engines and take screenshots (compare, snap).
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import { AsciiEngine, BasicEngine, PATTERN_GLSL, createFontLoader, defaultRecipe, type Recipe, type Renderer } from '../src/engine';
import { FAMILIES } from '../src/families/registry';
import { familyRecipe } from '../src/families/recipes';
import { FAMILY_GROUP_NAMES } from '../src/families/types';
import { DEFAULT_CODE, htmlPage } from '../src/exporters/code';

const fonts = createFontLoader({ google: false });
const params = new URLSearchParams(location.search);
const T = parseFloat(params.get('t') ?? '6');
const motor = params.get('motor');
const ENGINES: Array<'gl' | 'basic'> = motor === 'basico' ? ['basic'] : motor === 'webgl' ? ['gl'] : ['gl', 'basic'];
const onlyIds = params.get('ids')?.split(',');
const W = 480, H = 270;
const errors: string[] = [];
addEventListener('error', e => errors.push(String(e.message)));

interface Item { family: string; preset: string; title: string; recipe: () => Recipe }
const items: Item[] = [];
for (const f of FAMILIES) {
  if (onlyIds && !onlyIds.includes(f.id)) continue;
  for (const p of f.presets) items.push({ family: f.id, preset: p.id, title: `${f.name} · ${p.name}`, recipe: () => { const r = familyRecipe(f.id, p.id, defaultRecipe(), 'qa'); r.glyph.cell = 7; r.interact.mode = 'none'; return r; } });
}

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

const main = document.getElementById('main')!;
const tiles: Array<{ item: Item; canvases: HTMLCanvasElement[]; cap: HTMLElement }> = [];
let group = '';
let grid: HTMLElement | null = null;
for (const item of items) {
  const f = FAMILIES.find(x => x.id === item.family)!;
  if (f.group !== group || !grid) {
    group = f.group;
    const h = document.createElement('h2'); h.textContent = FAMILY_GROUP_NAMES[f.group];
    grid = document.createElement('div'); grid.className = 'grid';
    grid.style.setProperty('--tile', ENGINES.length > 1 ? '520px' : '280px');
    main.append(h, grid);
  }
  const fig = document.createElement('figure');
  const row = document.createElement('div'); row.className = 'row'; row.style.setProperty('--n', String(ENGINES.length));
  const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.style.setProperty('--n', String(ENGINES.length));
  const canvases: HTMLCanvasElement[] = [];
  for (const w of ENGINES) {
    const c = document.createElement('canvas'); c.style.aspectRatio = `${W} / ${H}`;
    row.append(c); canvases.push(c);
    const s = document.createElement('span'); s.textContent = `${w === 'gl' ? 'WebGL' : 'básico'} · t ${T}`; lbl.append(s);
  }
  const cap = document.createElement('figcaption');
  cap.innerHTML = '<span><b></b> <code></code></span><span class="sub"></span>';
  cap.querySelector('b')!.textContent = item.title;
  cap.querySelector('code')!.textContent = `${item.family}/${item.preset}`;
  fig.append(row, lbl, cap);
  grid.append(fig);
  tiles.push({ item, canvases, cap });
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

/** Both engines on one preset: correlation of the cells' luminance, share of identical glyphs, mean ink. */
async function compare(family: string, preset: string, t = T) {
  const item = items.find(i => i.family === family && i.preset === preset);
  if (!item || !gl || !basic) throw new Error('compare needs both engines and a known item');
  const r = item.recipe();
  gl.set(r); basic.set(r);
  await Promise.all([gl.ready(), basic.ready()]);
  gl.renderAt(t); basic.renderAt(t);
  const a = gl.readGrid(), b = basic.readGrid();
  let same = 0;
  for (let i = 0; i < a.chars.length; i++) if (a.chars[i] === b.chars[i]) same++;
  return { r: pearson(a.lum, b.lum), glyphs: same / a.chars.length, ink: a.lum.reduce((s, v) => s + v, 0) / a.lum.length, inkBasic: b.lum.reduce((s, v) => s + v, 0) / b.lum.length };
}

const status = document.getElementById('status')!;
async function run() {
  let k = 0;
  for (const { item, canvases, cap } of tiles) {
    let c = 0;
    for (const w of ENGINES) {
      const before = errors.length;
      const t0 = performance.now();
      await draw(engineOf(w), item.recipe(), T, canvases[c++]);
      const ms = performance.now() - t0;
      cap.querySelector('.sub')!.textContent += `${w}: ${ms.toFixed(0)} ms `;
      if (errors.length > before) cap.classList.add('bad');
    }
    status.textContent = `${++k} / ${tiles.length}`;
  }
  status.textContent = `${tiles.length} presets · ${errors.length ? errors.length + ' errores' : 'sin errores'}`;
}

declare global { interface Window { __fam: unknown } }
window.__fam = {
  done: false,
  errors,
  items: items.map(i => ({ family: i.family, preset: i.preset, title: i.title })),
  compare,
  /** The exported HTML page of a preset (the code the studio's «Código» tab gives), with or without the basic engine. */
  codePage: (family: string, preset: string, fallback: 'basic' | 'poster' = 'basic') => {
    const item = items.find(i => i.family === family && i.preset === preset)!;
    return htmlPage(item.recipe(), { ...DEFAULT_CODE, fallback, interactive: false });
  },
  snap: async (family: string, preset: string, o: { engine: 'gl' | 'basic'; t?: number }) => {
    const item = items.find(i => i.family === family && i.preset === preset)!;
    const c = document.createElement('canvas');
    await draw(engineOf(o.engine), item.recipe(), o.t ?? T, c);
    return c.toDataURL('image/png');
  },
};
await run();
(window.__fam as { done: boolean }).done = true;
