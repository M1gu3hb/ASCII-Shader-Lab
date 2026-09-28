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
  AsciiEngine, BasicEngine, PATTERNS, PATTERN_GLSL, createFontLoader, createRendererWith, defaultRecipe, explainWebGL, probeWebGL,
  unsupportedFeatures, type GridSnapshot, type Recipe, type Renderer,
} from '../src/engine';
import { TRANSITIONS, type TransitionKind, type TransitionSpec } from '../src/engine/transitions';
import { MSG_ANIMS, TEXT_ANIMS, XFORM_KINDS, type LetterAnimKind, type Xform, type XformKind } from '../src/engine/recipe';
import { XFORMS } from '../src/engine/catalog';
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
let IMAGE: HTMLCanvasElement | HTMLImageElement = syntheticImage();

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

async function compare(id: string, recipe: Recipe, o: { w?: number; h?: number; t?: number; realT?: number; transparent?: boolean; show?: HTMLCanvasElement[]; keep?: boolean } = {}): Promise<Comparison> {
  const p = pairFor(o.w ?? 480, o.h ?? 270, o.transparent);
  const t = o.t ?? T;
  if (!o.keep) {
    p.gl.set(recipe); p.basic.set(recipe);
    await Promise.all([p.gl.ready(), p.basic.ready()]);
  }
  let t0 = performance.now();
  p.gl.renderAt(t, o.realT ?? t);
  const ga: GridSnapshot = p.gl.readGrid();
  const msGl = performance.now() - t0;
  t0 = performance.now();
  p.basic.renderAt(t, o.realT ?? t);
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

/**
 * A transition caught at progress p in both engines: from one preset to another, same spec, same clock
 * (the clock starts at the first frame of the new piece). Compares the canvases: mean difference per
 * channel, and the share of pixels showing the same thing (within 24 of 255 per channel).
 */
async function compareTransition(kind: TransitionKind, p: number, o: { from?: string; to?: string; show?: HTMLCanvasElement[] } = {}) {
  const pair = pairFor(480, 272);
  const a = presetRecipe(o.from ?? 'arte/vapor'), b = presetRecipe(o.to ?? 'fondos/bruma');
  const spec: TransitionSpec = { kind, duration: 1, seed: 0.37, origin: [0.3, 0.6], dir: 1 };
  const T0 = 40;
  for (const e of [pair.gl, pair.basic] as Renderer[]) { e.set(a); }
  await Promise.all([pair.gl.ready(), pair.basic.ready()]);
  // end any transition left from an earlier comparison, then show the old piece
  for (const e of [pair.gl, pair.basic] as Renderer[]) { e.renderAt(3, T0 - 20); e.renderAt(3, T0 - 10); e.renderAt(3, T0); }
  for (const e of [pair.gl, pair.basic] as Renderer[]) e.set(b, { transition: spec });
  await Promise.all([pair.gl.ready(), pair.basic.ready()]);
  for (const e of [pair.gl, pair.basic] as Renderer[]) { e.renderAt(3, T0); e.renderAt(3, T0 + p); }
  const pa = pixels(pair.gl.canvas), pb = pixels(pair.basic.canvas);
  let same = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) <= 24 && Math.abs(pa[i + 1] - pb[i + 1]) <= 24 && Math.abs(pa[i + 2] - pb[i + 2]) <= 24) same++;
  }
  if (o.show) {
    for (const [i, e] of [pair.gl, pair.basic].entries()) {
      const c = o.show[i];
      c.width = pair.w; c.height = pair.h;
      c.getContext('2d')!.drawImage(e.canvas, 0, 0);
    }
  }
  // how much of the frame is neither piece alone (so a match is not two finished frames)
  const refs = await Promise.all([a, b].map(async r => {
    pair.basic.set(r); await pair.basic.ready(); pair.basic.renderAt(3, T0 + 30); pair.basic.renderAt(3, T0 + 40);
    return pixels(pair.basic.canvas);
  }));
  let mixed = 0;
  for (let i = 0; i < pb.length; i += 4) {
    const d = (q: Uint8ClampedArray) => Math.abs(q[i] - pb[i]) + Math.abs(q[i + 1] - pb[i + 1]) + Math.abs(q[i + 2] - pb[i + 2]);
    if (d(refs[0]) > 30 && d(refs[1]) > 30) mixed++;
  }
  const n = pa.length / 4;
  return { kind, p, pixelMad: mad(pa, pb), same: same / n, changed: mixed / n };
}

/**
 * Pointer effects: both engines get the same pointer state (pressed and moving, at a fixed spot) and
 * render `frames` frames, so simulated modes (ripple, erase, paint) step their grids the same way.
 */
async function comparePointer(mode: Recipe['interact']['mode'], frames = 6, id = 'plasma') {
  const p = pairFor(480, 270);
  const r = id.includes('/') ? presetRecipe(id) : patternRecipe(id);
  r.interact = { mode, strength: 0.8, radius: 0.2, auto: false };
  p.gl.set(r); p.basic.set(r);
  await Promise.all([p.gl.ready(), p.basic.ready()]);
  let res: Comparison | null = null;
  for (let k = 0; k < frames; k++) {
    for (const e of [p.gl, p.basic]) {
      const P = (e as unknown as { ptr: Record<string, number | boolean> }).ptr;
      Object.assign(P, { x: 200 + k * 6, y: 120, px: 194 + k * 6, py: 118, tx: 200 + k * 6, ty: 120, on: 1, targetOn: 1, down: true, impulse: k === 0 ? 1 : 0, moved: 6.3 });
    }
    if (k < frames - 1) { p.gl.renderAt(3 + k / 60); p.basic.renderAt(3 + k / 60); }
    else res = await compare(`${mode}`, r, { t: 3 + k / 60, keep: true });
  }
  // how much the pointer changed the picture (so a match is not two untouched frames)
  const withPtr = p.basic.readGrid().lum;
  const none = { ...r, interact: { ...r.interact, mode: 'none' as const } };
  p.basic.set(none);
  p.basic.renderAt(3 + (frames - 1) / 60);
  const effect = mad(withPtr, p.basic.readGrid().lum) * (withPtr.length / Math.max(1, countDiff(withPtr, p.basic.readGrid().lum)));
  return { ...res!, effect, touched: countDiff(withPtr, p.basic.readGrid().lum) / withPtr.length };
}
const countDiff = (a: Uint8Array, b: Uint8Array) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

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

/* ---------- transformations and letters ---------- */

/** A photo piece (Retrato's glyphs, source colours) with these transformations. */
function xformRecipe(list: Array<Partial<Xform> & { kind: XformKind }>, source: 'image' | 'text' = 'image'): Recipe {
  const r = presetRecipe(source === 'text' ? 'tipo/trama' : 'media/retrato');
  r.interact.mode = 'none';
  r.glyph.edge = 0;
  if (source === 'text') { r.text.content = 'TEJE\nLUZ'; r.media.mix = 0.3; }
  r.media.xform = list.map(x => {
    const d = XFORMS.find(i => i.id === x.kind)!.defaults;
    return { on: true, amount: d.amount, p: d.p, ...x };
  });
  return r;
}

/** One transformation (or a stack) on the synthetic photo, or on the big text. */
function compareXform(kinds: XformKind | XformKind[], o: { t?: number; source?: 'image' | 'text'; amount?: number; p?: number } = {}) {
  const list = (Array.isArray(kinds) ? kinds : [kinds]).map(kind => ({ kind, ...(o.amount !== undefined ? { amount: o.amount } : {}), ...(o.p !== undefined ? { p: o.p } : {}) }));
  return compare(list.map(x => x.kind).join('+'), xformRecipe(list, o.source), { t: o.t ?? T, w: 640, h: 360 });
}

/**
 * Estela: both engines see the same sequence of frames (a bright square that moves across the synthetic
 * photo), with the same clock; the last frame is compared.
 */
async function compareTrail(frames = 8) {
  const p = pairFor(640, 360);
  const cv = document.createElement('canvas');
  cv.width = IMAGE.width; cv.height = IMAGE.height;
  const x = cv.getContext('2d')!;
  const r = xformRecipe([{ kind: 'estela', amount: 1, p: 0.6 }]);
  p.gl.set(r); p.basic.set(r);
  for (const e of [p.gl, p.basic] as Renderer[]) e.setMedia('image', cv);
  await Promise.all([p.gl.ready(), p.basic.ready()]);
  let res: Comparison | null = null;
  for (let k = 0; k < frames; k++) {
    x.drawImage(IMAGE, 0, 0);
    x.fillStyle = '#fff';
    x.fillRect(80 + k * 70, 220, 90, 160);
    for (const e of [p.gl, p.basic] as Renderer[]) e.setMedia('image', cv);
    if (k < frames - 1) { p.gl.renderAt(3, 10 + k / 15); p.basic.renderAt(3, 10 + k / 15); }
    else res = await compare('estela', r, { t: 3, w: 640, h: 360, keep: true, realT: 10 + k / 15 });
  }
  // how much of the frame is trail: the last frame again without it (so a match is not two frames without one)
  const withTrail = p.basic.readGrid().lum;
  p.basic.set({ ...r, media: { ...r.media, xform: [] } });
  p.basic.renderAt(3, 10 + (frames - 1) / 15);
  const plain = p.basic.readGrid().lum;
  let lit = 0;
  for (let i = 0; i < plain.length; i++) if (withTrail[i] - plain[i] > 12) lit++;
  for (const e of [p.gl, p.basic] as Renderer[]) e.setMedia('image', IMAGE);
  return { ...res!, lit: lit / plain.length };
}

/** The big text with a per-letter animation, at time t. */
function compareTextAnim(kind: LetterAnimKind, t = T, amount = 0.7) {
  const r = presetRecipe('tipo/trama');
  r.interact.mode = 'none';
  r.text.content = 'TEJE LUZ';
  r.text.anim = { kind, amount, speed: 1 };
  return compare('texto ' + kind, r, { t, w: 640, h: 360 });
}

/** The message with a per-letter animation (or «Palabra a palabra»), at time t. */
function compareMsgAnim(kind: LetterAnimKind | 'words', t = T) {
  const r = presetRecipe('tipo/maquina');
  r.interact.mode = 'none';
  r.msg = { ...r.msg, text: 'las letras también bailan\ncuando nadie las mira', mode: kind === 'words' ? 'words' : 'static', cursor: false, speed: 18 };
  if (kind !== 'words') r.msg.anim = { kind, amount: 0.8, speed: 1 };
  return compare('mensaje ' + kind, r, { t, w: 640, h: 360 });
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

/* ---------- diagnostics: probe, fallbacks and the live loop, checked in a real browser ---------- */

type Check = { name: string; ok: boolean; info: string };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Runs fn with getContext refusing the given WebGL context types (as a blocklisted GPU would). */
async function withoutContexts<T>(types: string[], fn: () => T | Promise<T>, message = 'Simulated: GPU blocklisted'): Promise<T> {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    if (types.includes(type)) {
      const ev = new Event('webglcontextcreationerror') as Event & { statusMessage?: string };
      Object.defineProperty(ev, 'statusMessage', { value: message });
      this.dispatchEvent(ev);
      return null;
    }
    return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
  } as typeof orig;
  try { return await fn(); } finally { HTMLCanvasElement.prototype.getContext = orig; }
}

/** Live frames per second of a BasicEngine on a 1280×720 canvas, measured after a warm-up. */
async function liveFps(recipe: Recipe, ms: number, o: { offscreen?: boolean; warm?: number } = {}) {
  const c = document.createElement('canvas');
  c.style.cssText = o.offscreen ? 'position:absolute;top:30000px;left:0;width:1280px;height:720px' : 'position:fixed;left:0;top:0;width:1280px;height:720px;opacity:.01';
  document.body.append(c);
  const e = new BasicEngine(c, recipe, { fonts, maxPixelRatio: 1, adaptive: true, observeVisibility: true });
  e.setMedia('image', IMAGE);
  await e.ready();
  await sleep(o.warm ?? 500);
  let frames = 0, last = e.timings;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    await new Promise(r => requestAnimationFrame(r));
    if (e.timings !== last) { frames++; last = e.timings; }
  }
  const fps = (frames * 1000) / (performance.now() - t0);
  const res = { fps, cap: e.fpsLimit, ms: e.stats.ms, cols: e.stats.cols, rows: e.stats.rows };
  e.destroy(); c.remove();
  return res;
}

async function diagnostics(): Promise<Check[]> {
  const out: Check[] = [];
  const add = (name: string, ok: boolean, info: unknown) => out.push({ name, ok, info: typeof info === 'string' ? info : JSON.stringify(info) });
  const probe = () => probeWebGL({ fresh: true });
  const mk = (force?: 'basic') => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; document.body.append(c);
    const res = createRendererWith(BasicEngine, c, defaultRecipe(), { library: PATTERN_GLSL, fonts, fixedSize: { width: 64, height: 36, pixelRatio: 1 }, autoplay: false, interactive: false }, force ? { force } : {});
    res.renderer.renderAt(1);
    const g = res.renderer.readGrid();
    const info = { kind: res.renderer.kind, reason: res.status.reason, detail: res.status.detail, grid: `${g.cols}x${g.rows}`, sameCanvas: res.renderer.canvas === c, inDom: res.renderer.canvas.isConnected };
    res.renderer.destroy(); res.renderer.canvas.remove(); c.remove();
    return info;
  };

  const real = probe();
  add('probe: this browser', real.reason === 'ok' && real.webgl2, real);
  add('createRenderer: WebGL 2 available → webgl2', mk().kind === 'webgl2', mk());
  add('createRenderer force basic → basic, reason forced', (() => { const i = mk('basic'); return i.kind === 'basic' && i.reason === 'forced'; })(), mk('basic'));
  try {
    localStorage.setItem('mt.motor', 'basico');
    const p = probeWebGL();
    const i = mk();
    add('localStorage mt.motor=basico → forced, basic', p.reason === 'forced' && p.webgl2 && i.kind === 'basic', { probe: p.reason, ...i });
  } finally { localStorage.removeItem('mt.motor'); }

  await withoutContexts(['webgl2', 'webgl', 'experimental-webgl'], () => {
    const p = probe();
    const i = mk();
    add('no WebGL contexts → blocked (detail captured), basic', p.reason === 'blocked' && !p.webgl1 && !!p.detail && i.kind === 'basic', { probe: p, ...i });
  });
  await withoutContexts(['webgl2'], () => {
    const p = probe();
    add('only WebGL 1 → no-webgl2', p.reason === 'no-webgl2' && p.webgl1 && !p.webgl2, p);
    add('no-webgl2 → basic', mk().kind === 'basic', mk());
  });
  {
    const w = window as unknown as Record<string, unknown>;
    const saved = w.WebGL2RenderingContext;
    delete w.WebGL2RenderingContext;
    try {
      const p = probe();
      add('no WebGL2RenderingContext → no-api', p.reason === 'no-api' && !p.webgl2, p);
      add('explain no-api mentions the browser version', /versión|actualiza/i.test(JSON.stringify(explainWebGL(p))), explainWebGL(p).title);
    } finally { w.WebGL2RenderingContext = saved; }
  }
  {
    // the WebGL engine claims the canvas and then fails (shader compiler broken): the canvas is swapped
    const proto = WebGL2RenderingContext.prototype as unknown as { createShader: unknown };
    const orig = proto.createShader;
    proto.createShader = () => { throw new Error('simulated shader failure'); };
    try {
      probe();
      const i = mk();
      add('WebGL fails after claiming the canvas → basic on a fresh canvas in the DOM', i.kind === 'basic' && i.reason === 'blocked' && !i.sameCanvas && i.inDom, i);
    } finally { proto.createShader = orig; probe(); }
  }
  for (const reason of ['ok', 'no-api', 'blocked', 'no-webgl2', 'forced'] as const) {
    const e = explainWebGL({ ...real, reason, software: false });
    const blamesBrowser = /versión|actualiza/i.test(e.title + e.body);
    add(`explain ${reason}`, !!e.title && !!e.body && (reason === 'ok' || e.steps.length > 0) && (reason === 'no-api' || !blamesBrowser), e.title);
  }
  add('explain software', explainWebGL({ ...real, reason: 'ok', software: true }).body.includes('lento'), explainWebGL({ ...real, reason: 'ok', software: true }).title);

  {
    // dissolve transition: mid-way it mixes both frames; once over, the frame is the new recipe's
    const a = presetRecipe('arte/vapor'), b = presetRecipe('fondos/bruma');
    const mkE = () => new BasicEngine(document.createElement('canvas'), a, { fonts, fixedSize: { width: 320, height: 180, pixelRatio: 1 }, autoplay: false, interactive: false });
    const e = mkE(), ref = mkE();
    await e.ready(); ref.set(b); await ref.ready();
    e.renderAt(2, 10);
    const px = (x: BasicEngine) => new Uint32Array(x.canvas.getContext('2d')!.getImageData(0, 0, 320, 180).data.buffer);
    const before = px(e);
    e.set(b, { transition: true });
    await e.ready();
    // the clock starts with the first frame of the new piece
    e.renderAt(2, 10);
    e.renderAt(2, 10.4);
    const mid = px(e);
    ref.renderAt(2, 11);
    e.renderAt(2, 11);
    const after = px(e), want = px(ref);
    // mid-transition frames take the per-pixel post path, settled ones the canvas overlays: allow rounding
    const close = (p: number, q: number) => Math.abs((p & 255) - (q & 255)) <= 3 && Math.abs(((p >>> 8) & 255) - ((q >>> 8) & 255)) <= 3
      && Math.abs(((p >>> 16) & 255) - ((q >>> 16) & 255)) <= 3;
    let fromOld = 0, fromNew = 0, same = 0;
    for (let i = 0; i < mid.length; i++) { if (close(mid[i], before[i])) fromOld++; if (close(mid[i], want[i])) fromNew++; if (close(after[i], want[i])) same++; }
    const n = mid.length;
    add('transition: dissolve mixes old and new, then settles on the new recipe', fromOld / n > 0.1 && fromNew / n > 0.1 && same / n > 0.99,
      { fromOld: +(fromOld / n).toFixed(2), fromNew: +(fromNew / n).toFixed(2), settled: +(same / n).toFixed(3) });
    e.destroy(); ref.destroy();
  }

  {
    // video / camera path: a canvas stream played through a <video>, frames change → the grid follows
    const src = document.createElement('canvas');
    src.width = 320; src.height = 180;
    const sx = src.getContext('2d')!;
    // repaint every animation frame so the stream keeps producing frames
    let boxX = 20, painting = true;
    const paint = () => {
      sx.fillStyle = '#000'; sx.fillRect(0, 0, 320, 180); sx.fillStyle = '#fff'; sx.fillRect(boxX, 40, 120, 100);
      if (painting) requestAnimationFrame(paint);
    };
    paint();
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.srcObject = src.captureStream(30);
    await Promise.race([v.play(), sleep(3000)]);
    const frameShown = () => Promise.race([
      new Promise(r => (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback?.(() => r(null))),
      sleep(400),
    ]);
    await frameShown();
    const r = presetRecipe('media/retrato');
    r.source = 'video';
    const e = new BasicEngine(document.createElement('canvas'), r, { fonts, fixedSize: { width: 320, height: 180, pixelRatio: 1 }, autoplay: false, interactive: false });
    e.setMedia('video', v);
    await e.ready();
    e.renderAt(1);
    const a = e.readGrid();
    boxX = 180;
    await frameShown(); await frameShown(); await frameShown();
    e.renderAt(1);
    const b = e.readGrid();
    const lit = (g: GridSnapshot, c0: number, c1: number) => { let s = 0, n = 0; for (let y = 0; y < g.rows; y++) for (let x = c0; x < c1; x++) { s += g.lum[y * g.cols + x]; n++; } return s / n; };
    const q = a.cols / 4;
    const info = { before: [lit(a, 0, q), lit(a, 3 * q, 4 * q)].map(Math.round), after: [lit(b, 0, q), lit(b, 3 * q, 4 * q)].map(Math.round) };
    add('video source: the grid follows the frames', info.before[0] > info.before[1] + 30 && info.after[1] > info.after[0] + 30, info);
    e.destroy(); v.pause(); v.srcObject = null; painting = false;
  }

  const light = defaultRecipe();
  const l = await liveFps(light, 2500);
  add('live: default recipe capped at 30 fps', l.fps <= 31.5 && l.fps > 20 && l.cap === 30, l);
  const heavy = presetRecipe('arte/bermellon');
  heavy.glyph.cell = 6; // make frames slow on purpose
  const h = await liveFps(heavy, 2000, { warm: 2500 });
  add('live: slow frames drop the cap to 15 fps (grid unchanged)', h.cap === 15 && h.fps <= 16.5, h);
  const off = await liveFps(light, 1500, { offscreen: true });
  add('live: off-screen canvas renders nothing (observeVisibility)', off.fps === 0, off);
  return out;
}

const st = probeWebGL();
$('#probe').textContent = `probe: ${st.reason}${st.software ? ' (software)' : ''}${st.renderer ? ' · ' + st.renderer : ''} — ${explainWebGL(st).title}`;

declare global { interface Window { __basic: unknown } }
window.__basic = {
  patterns: PATTERNS.map(p => p.id),
  presets: PRESET_LIST.map(p => p.key),
  comparePattern: (id: string, t = T) => compare(id, patternRecipe(id), { t }),
  comparePreset: (key: string, t = T, transparent = false) => compare(key, presetRecipe(key), { t, w: 640, h: 360, transparent }),
  comparePointer,
  compareTransition,
  transitions: TRANSITIONS.map(t => t.id),
  interactModes: ['light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'],
  compareRecipe: (r: Recipe, o: Parameters<typeof compare>[2] = {}) => compare('recipe', r, o),
  compareXform,
  xformRecipe,
  presetRecipe,
  /** Uses a real picture instead of the synthetic one (for looking at transformations). */
  useImage: async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    IMAGE = img;
    for (const p of pairs.values()) for (const e of [p.gl, p.basic] as Renderer[]) e.setMedia('image', img);
  },
  /** Both engines' canvases for a recipe, as PNG data URLs (to look at them). */
  snap: async (r: Recipe, o: { w?: number; h?: number; t?: number } = {}) => {
    const p = pairFor(o.w ?? 640, o.h ?? 360);
    p.gl.set(r); p.basic.set(r);
    await Promise.all([p.gl.ready(), p.basic.ready()]);
    p.gl.renderAt(o.t ?? T); p.basic.renderAt(o.t ?? T);
    return [p.gl.canvas.toDataURL('image/png'), p.basic.canvas.toDataURL('image/png')];
  },
  compareTrail,
  compareTextAnim,
  compareMsgAnim,
  xforms: XFORM_KINDS,
  textAnims: TEXT_ANIMS,
  msgAnims: MSG_ANIMS,
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
  diagnostics,
  defaultRecipe,
  probe: st,
};

if (PARITY) {
  $('#status').textContent = 'modo paridad';
} else {
  live();
  void runPage();
}
