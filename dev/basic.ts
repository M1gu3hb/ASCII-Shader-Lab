/**
 * Dev page: the Canvas 2D basic engine next to the WebGL 2 engine, for every pattern and preset.
 * Also drives the parity check (scripts/basic-parity.mjs) through window.__basic.
 * Not part of the production build (like dev/patterns.html).
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-300.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import {
  AsciiEngine, BasicEngine, PATTERNS, PATTERN_GLSL, createFontLoader, defaultRecipe, explainWebGL, probeWebGL,
  unsupportedFeatures, type GridSnapshot, type Recipe, type Renderer,
} from '../src/engine';
import { PRESETS } from '../src/studio/presets';

const fonts = createFontLoader({ google: false });
const params = new URLSearchParams(location.search);
const T = parseFloat(params.get('t') ?? '3.3');
const PARITY = params.has('parity');
const $ = (s: string) => document.querySelector(s) as HTMLElement;

/* ---------- test inputs ---------- */

/** Synthetic photo: gradients, a face-like blob, text and stripes, so media presets have something to chew on. */
function syntheticImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 640;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 960, 640);
  g.addColorStop(0, '#1b3a5c'); g.addColorStop(0.5, '#d9825b'); g.addColorStop(1, '#f5e6c8');
  x.fillStyle = g; x.fillRect(0, 0, 960, 640);
  const rg = x.createRadialGradient(420, 300, 20, 420, 300, 230);
  rg.addColorStop(0, '#ffe2c4'); rg.addColorStop(0.7, '#b0643c'); rg.addColorStop(1, 'rgba(40,20,10,0)');
  x.fillStyle = rg; x.beginPath(); x.ellipse(420, 300, 180, 230, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#1a0f0a';
  x.beginPath(); x.arc(360, 260, 22, 0, Math.PI * 2); x.arc(480, 260, 22, 0, Math.PI * 2); x.fill();
  x.fillRect(370, 380, 110, 16);
  for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#2a6f4f' : '#e8f0d0'; x.fillRect(720 + i * 20, 80, 10, 480); }
  x.fillStyle = '#fff'; x.font = '900 90px sans-serif'; x.fillText('MONO', 40, 600);
  return c;
}
const IMAGE = syntheticImage();

function patternRecipe(id: string): Recipe {
  const r = defaultRecipe();
  r.glyph.cell = 6;
  r.color.stops = ['#10131a', '#6ee7ff', '#fff4d6'];
  r.color.bg = '#05060a';
  r.interact.mode = 'none';
  r.layers = [{ ...r.layers[0], pattern: id }];
  return r;
}

const PRESET_LIST = Object.entries(PRESETS).flatMap(([space, list]) => list.map(p => ({ key: `${space}/${p.id}`, name: p.name, make: p.make })));
function presetRecipe(key: string): Recipe {
  const p = PRESET_LIST.find(x => x.key === key)!;
  const r = p.make();
  r.interact.auto = false;
  return r;
}

/* ---------- engines ---------- */

interface Pair { gl: AsciiEngine; basic: BasicEngine; w: number; h: number }
const pairs = new Map<string, Pair>();
function pairFor(w: number, h: number, transparent = false): Pair {
  const key = `${w}x${h}${transparent ? 't' : ''}`;
  let p = pairs.get(key);
  if (!p) {
    const common = { fonts, fixedSize: { width: w, height: h, pixelRatio: 1 }, autoplay: false, interactive: false, adaptive: false } as const;
    const gl = new AsciiEngine(document.createElement('canvas'), defaultRecipe(), { ...common, library: PATTERN_GLSL, preserveDrawingBuffer: true, alpha: true });
    const basic = new BasicEngine(document.createElement('canvas'), defaultRecipe(), common);
    gl.transparent = basic.transparent = transparent;
    for (const e of [gl, basic] as Renderer[]) e.setMedia('image', IMAGE);
    p = { gl, basic, w, h };
    pairs.set(key, p);
  }
  return p;
}

function pearson(a: Uint8Array, b: Uint8Array): number {
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
  if (va === 0 || vb === 0) return va === vb && ma === mb ? 1 : va === 0 && vb === 0 ? 1 - Math.abs(ma - mb) / 255 : 0;
  return cov / Math.sqrt(va * vb);
}
function mad(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / Math.max(1, a.length);
}

const scratch = document.createElement('canvas');
function pixels(c: HTMLCanvasElement): Uint8ClampedArray {
  scratch.width = c.width; scratch.height = c.height;
  const x = scratch.getContext('2d', { willReadFrequently: true })!;
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(c, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
}

export interface Comparison {
  id: string; cols: number; rows: number;
  r: number; lumMad: number; glyphs: number; visibleGlyphs: number; rgbMad: number; pixelMad: number;
  msGl: number; msBasic: number; gaps: string[];
}

async function compare(id: string, recipe: Recipe, o: { w?: number; h?: number; t?: number; transparent?: boolean; show?: HTMLCanvasElement[] } = {}): Promise<Comparison> {
  const p = pairFor(o.w ?? 480, o.h ?? 270, o.transparent);
  const t = o.t ?? T;
  p.gl.set(recipe); p.basic.set(recipe);
  await Promise.all([p.gl.ready(), p.basic.ready()]);
  let t0 = performance.now();
  p.gl.renderAt(t);
  const ga: GridSnapshot = p.gl.readGrid();
  const msGl = performance.now() - t0;
  t0 = performance.now();
  p.basic.renderAt(t);
  const msBasic = performance.now() - t0;
  const gb: GridSnapshot = p.basic.readGrid();
  const n = ga.cols * ga.rows;
  let same = 0, vis = 0, visSame = 0;
  for (let i = 0; i < n; i++) {
    if (ga.chars[i] === gb.chars[i]) same++;
    const va = ga.alpha[i] > 40 && ga.chars[i] !== ' ', vb = gb.alpha[i] > 40 && gb.chars[i] !== ' ';
    if (va || vb) { vis++; if (va && vb && ga.chars[i] === gb.chars[i]) visSame++; }
  }
  const pa = pixels(p.gl.canvas), pb = pixels(p.basic.canvas);
  if (o.show) {
    for (const [i, e] of [p.gl, p.basic].entries()) {
      const c = o.show[i];
      c.width = p.w; c.height = p.h;
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, p.w, p.h);
      x.drawImage(e.canvas, 0, 0);
    }
  }
  return {
    id, cols: ga.cols, rows: ga.rows,
    r: pearson(ga.lum, gb.lum), lumMad: mad(ga.lum, gb.lum), glyphs: same / n, visibleGlyphs: vis ? visSame / vis : 1,
    rgbMad: mad(ga.rgb, gb.rgb), pixelMad: mad(pa, pb), msGl, msBasic,
    gaps: unsupportedFeatures(recipe).map(g => g.label),
  };
}

/** Average cost of the basic engine over `frames` consecutive frames of a fixed-size canvas. */
async function bench(recipe: Recipe, o: { w?: number; h?: number; frames?: number; pixelRatio?: number } = {}) {
  const w = o.w ?? 1280, h = o.h ?? 720, frames = o.frames ?? 30;
  const e = new BasicEngine(document.createElement('canvas'), recipe, {
    fonts, fixedSize: { width: w, height: h, pixelRatio: o.pixelRatio ?? 1 }, autoplay: false, interactive: false, adaptive: false,
  });
  e.setMedia('image', IMAGE);
  await e.ready();
  // warm-up: let the JIT settle before measuring
  for (let i = 0; i < 12; i++) e.renderAt(T - 1 + i / 30);
  const acc = { field: 0, select: 0, compose: 0, total: 0 };
  const all: number[] = [];
  // the 2D canvas defers drawing: read one pixel so overlays are rasterised inside the timed region
  const flush = e.canvas.getContext('2d')!;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    e.renderAt(T + i / 30);
    flush.getImageData(0, 0, 1, 1);
    const total = performance.now() - t0, tm = e.timings;
    acc.field += tm.field; acc.select += tm.select; acc.compose += total - tm.field - tm.select; acc.total += total;
    all.push(total);
  }
  e.destroy();
  all.sort((a, b) => a - b);
  const k = 1 / frames;
  return {
    cols: e.stats.cols, rows: e.stats.rows,
    field: acc.field * k, select: acc.select * k, compose: acc.compose * k, total: acc.total * k,
    median: all[Math.floor(all.length / 2)], p90: all[Math.floor(all.length * 0.9)],
  };
}

/* ---------- page ---------- */

const f2 = (v: number) => v.toFixed(2);
function figure(parent: HTMLElement, title: string) {
  const fig = document.createElement('figure');
  const pair = document.createElement('div');
  pair.className = 'pair';
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  pair.append(a, b);
  const cap = document.createElement('figcaption');
  cap.textContent = title;
  fig.append(pair, cap);
  parent.append(fig);
  return { show: [a, b], cap };
}
function caption(cap: HTMLElement, title: string, c: Comparison) {
  const cls = c.r >= 0.9 ? 'ok' : 'bad';
  cap.innerHTML = `<span>${title}</span><span class="${cls}">r ${f2(c.r)} · glifos ${(c.glyphs * 100).toFixed(0)}% · píxeles Δ${c.pixelMad.toFixed(1)}</span>`
    + `<span>ms webgl ${c.msGl.toFixed(1)} · básico ${c.msBasic.toFixed(1)}${c.gaps.length ? ' · falta: ' + c.gaps.join(', ') : ''}</span>`;
}

async function runPage() {
  const results: Comparison[] = [];
  for (const p of PATTERNS) {
    const { show, cap } = figure($('#patterns'), p.id);
    const c = await compare(p.id, patternRecipe(p.id), { show });
    caption(cap, `${p.id} · ${p.name}`, c);
    results.push(c);
  }
  for (const p of PRESET_LIST) {
    const { show, cap } = figure($('#presets'), p.key);
    const c = await compare(p.key, presetRecipe(p.key), { show, w: 640, h: 360 });
    caption(cap, `${p.key} · ${p.name}`, c);
    results.push(c);
  }
  $('#status').textContent = `listo · r medio ${f2(results.reduce((s, c) => s + c.r, 0) / results.length)}`;
  return results;
}

function live() {
  const canvas = $('#live') as HTMLCanvasElement;
  const pick = $('#pick') as HTMLSelectElement;
  for (const p of PATTERNS) pick.add(new Option('patrón · ' + p.id, 'p:' + p.id));
  for (const p of PRESET_LIST) pick.add(new Option('preset · ' + p.key, 's:' + p.key));
  const recipeOf = (v: string) => {
    if (v.startsWith('p:')) { const r = patternRecipe(v.slice(2)); r.glyph.cell = 10; r.interact.mode = 'light'; return r; }
    return presetRecipe(v.slice(2));
  };
  const first = defaultRecipe();
  const eng = new BasicEngine(canvas, first, {
    fonts, maxPixelRatio: 1, adaptive: true,
    onStats: s => {
      const tm = eng.timings;
      $('#livestats').textContent = `${s.cols}×${s.rows} · ${s.fps} fps (tope ${eng.fpsLimit}) · cuadro ${s.ms.toFixed(1)} ms`
        + ` (campo ${tm.field.toFixed(1)}, selección ${tm.select.toFixed(1)}, composición ${tm.compose.toFixed(1)})`;
    },
  });
  eng.setMedia('image', IMAGE);
  pick.addEventListener('change', () => eng.set(recipeOf(pick.value), { transition: true }));
  return eng;
}

const st = probeWebGL();
$('#probe').textContent = `probe: ${st.reason}${st.software ? ' (software)' : ''}${st.renderer ? ' · ' + st.renderer : ''} — ${explainWebGL(st).title}`;

declare global { interface Window { __basic: unknown } }
window.__basic = {
  patterns: PATTERNS.map(p => p.id),
  presets: PRESET_LIST.map(p => p.key),
  comparePattern: (id: string, t = T) => compare(id, patternRecipe(id), { t }),
  comparePreset: (key: string, t = T) => compare(key, presetRecipe(key), { t, w: 640, h: 360 }),
  compareRecipe: (r: Recipe, o: Parameters<typeof compare>[2] = {}) => compare('recipe', r, o),
  benchPattern: (id: string, o?: Parameters<typeof bench>[1]) => { const r = patternRecipe(id); r.glyph.cell = 10; return bench(r, o); },
  benchPreset: (key: string, o?: Parameters<typeof bench>[1]) => bench(presetRecipe(key), o),
  benchRecipe: bench,
  /** Raw luminance grids of both engines, for debugging a mismatch. */
  grids: async (id: string, t = T) => {
    const preset = id.includes('/');
    const p = preset ? pairFor(640, 360) : pairFor(480, 270);
    const r = preset ? presetRecipe(id) : patternRecipe(id);
    p.gl.set(r); p.basic.set(r);
    await Promise.all([p.gl.ready(), p.basic.ready()]);
    p.gl.renderAt(t); p.basic.renderAt(t);
    const a = p.gl.readGrid(), b = p.basic.readGrid();
    return {
      cols: a.cols, rows: a.rows, gl: Array.from(a.lum), basic: Array.from(b.lum),
      glChars: a.chars.join(''), basicChars: b.chars.join(''), glFlags: Array.from(a.flags), basicFlags: Array.from(b.flags),
    };
  },
  /** Checksums of both engines' text-source canvases (debugging text parity). */
  textSums: () => [...pairs.values()].map(p => [p.gl, p.basic].map(e => {
    const cv = (e as unknown as { textCanvas: HTMLCanvasElement | null }).textCanvas;
    if (!cv) return null;
    const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i];
    return `${cv.width}x${cv.height}:${s}`;
  })),
  defaultRecipe,
  probe: st,
};

if (PARITY) {
  $('#status').textContent = 'modo paridad';
} else {
  live();
  void runPage();
}
