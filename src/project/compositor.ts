/**
 * The compositor draws a FrameState (evaluate.ts) into a canvas: the one renderer of the photo and video
 * studio. The stage calls it at a small scale, exports at scale 1 (quality 'final'): the same code, so what
 * is previewed is what is exported. Deterministic: the same state at the same scale gives the same pixels
 * (all randomness is seeded; engines are reset before each still, see RenderOptions.sequential).
 *
 * Per frame: first everything is got ready (async: pictures decoded, videos seeked, fonts loaded, ASCII
 * engines created and styled), then all layers are drawn at once (sync), bottom to top:
 *   content  photo (fit + adjustments) · ascii (an offscreen engine per layer, fed by the layer's source,
 *            the composite below, or its own pattern) · glyphs (real characters, glyphs/) · text · shape;
 *   then     finishes (fx/) → cell reveal of clips → mask (destination-in) → opacity + blend + transform.
 *
 * ASCII engines: one per ASCII layer, kept in a pool by layer id (re-styled only when the style changes),
 * at most `maxEngines` (WebGL contexts are limited: a browser drops the oldest past about 16). Layers past
 * that budget share one more engine, re-styled for each (slower, same pixels) and the report says so.
 * Without WebGL 2 the engines are the Canvas 2D basic engine (engine/create.ts): same API, same output.
 */
import { createRenderer } from '../engine/create';
import { createFontLoader, type FontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import { cloneRecipe, type MediaRef, type Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { applyFinishes, releaseFinishes } from '../fx/index';
import { drawGlyphs, ensureGlyphFont, glyphGridWith, sampleOf, type CellFx, type GlyphGrid } from '../glyphs/index';
import { cssAdjustCpu, cssFilter, fitRect, needsTone, toneCpu } from './adjust';
import type { CellGrid } from './clips';
import { drawShape, drawText, ensureFont } from './draw2d';
import type { FrameState, LayerFrame } from './evaluate';
import { coverageOfImage, maskCanvas } from './masks';
import { createSourceProvider, type Drawable, type SourceProvider } from './sources';
import type { AsciiLayer, CompositeBlend, GlyphsLayer, Id, Layer, LayerFit, LayerKind, PhotoLayer, Source } from './types';

export interface CompositorOptions {
  /** Where pictures come from (default: the media store, video frames from a video element). */
  provider?: SourceProvider;
  fonts?: FontLoader;
  /** ASCII engines kept at once (default 6). */
  maxEngines?: number;
  /** 'basic': draw ASCII layers with the Canvas 2D engine even where WebGL 2 works. */
  force?: 'basic';
}

export interface RenderOptions {
  /** Render px per output px (1 = the project's size). */
  scale?: number;
  /** Passed to the finishes (default 'final' at scale ≥ 1, 'preview' below). */
  quality?: 'preview' | 'final';
  /** Leave the background transparent (default: the project's canvas.transparent). */
  transparent?: boolean;
  /** Draw only these layers ('below' sources then see only what is drawn under them). */
  only?: Id[];
  /**
   * Frames of one sequence (the export loop): engines keep what they carry from frame to frame (Estela's
   * trails). Otherwise every render starts them clean, so a still never depends on what was drawn before.
   */
  sequential?: boolean;
}

export interface LayerReport { id: Id; kind: LayerKind; ms: number; note?: string }

export interface RenderReport {
  w: number;
  h: number;
  t: number;
  ms: number;
  layers: LayerReport[];
  /** In Spanish, for the studio. */
  warnings: string[];
  /** Media the frame needed and could not use. */
  missing: MediaRef[];
  engines: { webgl2: number; basic: number; shared: boolean };
}

const BLEND: Record<CompositeBlend, GlobalCompositeOperation> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light', 'soft-light': 'soft-light',
  difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity', add: 'lighter',
};

/* ------------------------------------------------------------------ canvas filter support */

let filterOK: boolean | null = null;
let compositors = 0;
/** Whether this browser's canvas applies ctx.filter (checked once by drawing through invert()). */
export function canvasFilterWorks(): boolean {
  if (filterOK !== null) return filterOK;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.filter = 'invert(1)';
    x.fillStyle = '#000';
    x.fillRect(0, 0, 2, 2);
    x.filter = 'none';
    filterOK = x.getImageData(0, 0, 1, 1).data[0] > 200;
  } catch { filterOK = false; }
  return filterOK;
}

/* ------------------------------------------------------------------ helpers */

function canvas2d(w: number, h: number, c?: HTMLCanvasElement): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  c ??= document.createElement('canvas');
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.filter = 'none';
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.clearRect(0, 0, w, h);
  return { c, x };
}

/** A canvas whose 2D context reads back fast (created with willReadFrequently before anything else). */
function memCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

/** The recipe an ASCII layer's engine draws: the layer's source instead of the recipe's own. */
export function engineStyle(l: AsciiLayer): Recipe {
  const r = cloneRecipe(l.style);
  delete r.media.ref;
  if (l.source === 'style') {
    if (r.source === 'image' || r.source === 'video' || r.source === 'camera') r.source = 'pattern';
  } else r.source = 'image';
  // interaction needs a pointer and a live clock: never in a project render
  r.interact = { ...r.interact, mode: 'none', auto: false };
  return r;
}

/** Smallest cell (device px) a preview draws its ASCII layers with. */
export const MIN_PREVIEW_CELL = 6;

/**
 * The pixel ratio an ASCII layer's engine renders at. At scale 1 and above: the scale (exports are exact).
 * Below it, cells would shrink to a few pixels, where glyphs are unreadable (and, in some WebGL
 * implementations, cells 2 or 4 px wide draw no glyphs at all): the engine renders at a ratio that keeps
 * cells at least MIN_PREVIEW_CELL px (never more detail than the final render), and the result is scaled
 * down — the final render made smaller, which is what a preview should be.
 */
export function enginePixelRatio(style: Recipe, scale: number): number {
  if (scale >= 1) return scale;
  return Math.min(1, Math.max(scale, MIN_PREVIEW_CELL / Math.max(1, style.glyph.cell)));
}

/** The engine's cell grid for a render of w×h device px (same formula as the engines' resize). */
function engineGrid(style: Recipe, w: number, h: number, pr: number) {
  const cw = Math.max(2, Math.round(style.glyph.cell * pr)), ch = Math.max(2, Math.round(style.glyph.cell * style.glyph.aspect * pr));
  return { cw, ch, cols: Math.max(1, Math.ceil(w / cw)), rows: Math.max(1, Math.ceil(h / ch)) };
}

interface Engine { eng: Renderer; key: string; size: string; lost: boolean; used: number; feed: HTMLCanvasElement | null }

/* ------------------------------------------------------------------ compositor */

export class Compositor {
  readonly provider: SourceProvider;
  readonly fonts: FontLoader;
  readonly maxEngines: number;
  private force?: 'basic';
  private ownsProvider: boolean;
  private engines = new Map<Id, Engine>();
  private shared: Engine | null = null;
  private layerCanvases = new Map<Id, HTMLCanvasElement>();
  private feeds = new Map<Id, HTMLCanvasElement>();
  private chain: Promise<unknown> = Promise.resolve();
  /** The engine each ASCII layer of the frame being drawn uses (set by prepare). */
  private assigned = new Map<Id, Engine>();
  /** The last glyph grid of each glyph layer and what it was made from. */
  private grids = new Map<Id, { key: string; grid: GlyphGrid }>();
  /** Where photo layers that need CPU passes are drawn (read back often: kept in memory). */
  private cpuCanvas: HTMLCanvasElement | null = null;
  private clock = 0;
  private destroyed = false;
  /** Prefix of this compositor's canvases in the finishes' pool (fx/canvas.ts), so it frees only its own. */
  private readonly poolId = `c${++compositors}`;
  private pooled = new Set<string>();

  constructor(o: CompositorOptions = {}) {
    this.ownsProvider = !o.provider;
    this.provider = o.provider ?? createSourceProvider({ video: 'preview' });
    this.fonts = o.fonts ?? createFontLoader({ google: false });
    this.maxEngines = Math.max(1, Math.min(12, o.maxEngines ?? 6));
    this.force = o.force;
  }

  /** Draws `state` into `target` (resized to the render size). Renders never overlap: they run in order. */
  render(state: FrameState, target: HTMLCanvasElement, o: RenderOptions = {}): Promise<RenderReport> {
    const run = () => this.renderNow(state, target, o);
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** Frees every engine, canvas and decoded picture (a provider it made itself too). */
  release(): void {
    for (const e of this.engines.values()) e.eng.destroy();
    this.engines.clear();
    this.shared?.eng.destroy();
    this.shared = null;
    for (const c of [...this.layerCanvases.values(), ...this.feeds.values()]) { c.width = 0; c.height = 0; }
    if (this.cpuCanvas) { this.cpuCanvas.width = this.cpuCanvas.height = 0; this.cpuCanvas = null; }
    for (const key of this.pooled) releaseFinishes(key);
    this.pooled.clear();
    this.layerCanvases.clear();
    this.feeds.clear();
    this.grids.clear();
    if (this.ownsProvider) this.provider.release();
  }

  /** release(), and no more renders. */
  destroy(): void {
    this.release();
    this.destroyed = true;
  }

  /* ---------------------------------------------------------------- */

  private async renderNow(state: FrameState, target: HTMLCanvasElement, o: RenderOptions): Promise<RenderReport> {
    if (this.destroyed) throw new Error('compositor destroyed');
    const t0 = performance.now();
    const scale = Math.min(8, Math.max(0.01, o.scale ?? 1));
    const rw = Math.max(1, Math.round(state.w * scale)), rh = Math.max(1, Math.round(state.h * scale));
    const quality = o.quality ?? (scale >= 1 ? 'final' : 'preview');
    const transparent = o.transparent ?? state.transparent;
    const frames = o.only ? state.layers.filter(l => o.only!.includes(l.layer.id)) : state.layers;
    const report: RenderReport = { w: rw, h: rh, t: state.t, ms: 0, layers: [], warnings: [], missing: [], engines: { webgl2: 0, basic: 0, shared: false } };

    await this.prepare(state, frames, scale, report);

    const { x: ctx } = canvas2d(rw, rh, target);
    if (!transparent) { ctx.fillStyle = state.bg; ctx.fillRect(0, 0, rw, rh); }
    const fitted = new Map<string, HTMLCanvasElement | null>();
    const fit = (src: Source | null, mode: LayerFit, t: number) => {
      if (!src) return null;
      const k = `${src.id}|${mode}`;
      if (fitted.has(k)) return fitted.get(k)!;
      const img = this.provider.frame(src, t);
      let c: HTMLCanvasElement | null = null;
      if (img) {
        c = canvas2d(rw, rh).c;
        const r = fitRect(img.width, img.height, rw, rh, mode);
        c.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h);
      }
      fitted.set(k, c);
      return c;
    };
    for (const lf of frames) {
      const ts = performance.now();
      const note = this.drawLayer(lf, state, ctx, target, rw, rh, scale, quality, !!o.sequential, fit);
      report.layers.push({ id: lf.layer.id, kind: lf.layer.kind, ms: Math.round((performance.now() - ts) * 10) / 10, ...(note ? { note } : {}) });
    }
    for (const c of fitted.values()) if (c) { c.width = 0; c.height = 0; }
    this.assigned.clear();
    this.sweep(state);
    const used = mediaIdsOfFrame(state, frames);
    report.missing = this.provider.missing().filter(m => used.has(m.id ?? '?'));
    if (report.missing.length) report.warnings.push(report.missing.length === 1 ? 'Falta un archivo de este proyecto en el navegador: esa capa no se dibuja.' : `Faltan ${report.missing.length} archivos de este proyecto en el navegador: esas capas no se dibujan.`);
    for (const e of [...this.engines.values(), ...(this.shared ? [this.shared] : [])]) report.engines[e.eng.kind]++;
    report.ms = Math.round(performance.now() - t0);
    return report;
  }

  /** Everything a frame needs, loaded and ready (pictures, fonts, engines). */
  private async prepare(state: FrameState, frames: LayerFrame[], scale: number, report: RenderReport) {
    const jobs: Array<Promise<unknown>> = [];
    const seen = new Set<string>();
    const needSource = (s: Source | null) => {
      if (!s || seen.has(s.id)) return;
      seen.add(s.id);
      jobs.push(this.provider.prepare(s, frameTimeOf(state, s)));
    };
    for (const lf of frames) {
      const l = lf.layer;
      if (l.kind === 'photo' || l.kind === 'ascii' || l.kind === 'glyphs') needSource(lf.source);
      for (const p of l.mask?.parts ?? []) {
        if (p.kind === 'raster') {
          for (const m of [p.media, ...(p.frames ?? []).map(f => f.media)]) {
            const k = m.id ?? '?';
            if (seen.has('m:' + k)) continue;
            seen.add('m:' + k);
            jobs.push(this.provider.prepareMedia(m));
          }
        } else if (p.kind === 'color') needSource(state.project.sources.find(s => s.id === p.source) ?? null);
      }
      if (l.kind === 'text') jobs.push(ensureFont(this.fonts, l.font, l.weight, l.italic, l.text));
      if (l.kind === 'shape' && l.label?.text) jobs.push(ensureFont(this.fonts, l.label.font, 500, false, l.label.text));
      // (plus the cursors the typing templates draw)
      if (l.kind === 'glyphs') jobs.push(ensureGlyphFont(l.glyphs.font, l.glyphs.weight, sampleOf(l.glyphs) + '█▌_'));
    }
    const ascii = frames.filter(f => f.layer.kind === 'ascii').map(f => f.layer as AsciiLayer);
    if (ascii.length > this.maxEngines) {
      report.warnings.push(`Hay ${ascii.length} capas ASCII: se dibujan ${this.maxEngines} con un motor cada una y las demás comparten uno, así que este cuadro tarda más.`);
      report.engines.shared = true;
    }
    await Promise.all(jobs);
    this.assigned.clear();
    for (let i = 0; i < ascii.length; i++) this.assigned.set(ascii[i].id, await this.ensureEngine(ascii[i], state, scale, i >= this.maxEngines));
  }

  /** The engine of an ASCII layer, created or re-styled and sized for this render. */
  private async ensureEngine(l: AsciiLayer, state: FrameState, scale: number, overflow: boolean): Promise<Engine> {
    const style = engineStyle(l);
    const key = JSON.stringify(style);
    const pr = enginePixelRatio(style, scale);
    const size = `${state.w}x${state.h}@${pr}`;
    let e = overflow ? this.shared : this.engines.get(l.id);
    if (e?.lost) { e.eng.destroy(); e = null; if (overflow) this.shared = null; else this.engines.delete(l.id); }
    if (!e) {
      if (!overflow) this.evictEngines();
      const canvas = document.createElement('canvas');
      const { renderer } = await createRenderer(canvas, style, {
        library: PATTERN_GLSL, fonts: this.fonts, fixedSize: { width: state.w, height: state.h, pixelRatio: pr },
        autoplay: false, interactive: false, adaptive: false, preserveDrawingBuffer: true, alpha: true,
      }, this.force ? { force: this.force } : {});
      const ne: Engine = { eng: renderer, key, size, lost: false, used: 0, feed: null };
      renderer.canvas.addEventListener('webglcontextlost', () => { ne.lost = true; });
      await renderer.ready();
      e = ne;
      if (overflow) this.shared = e; else this.engines.set(l.id, e);
    } else {
      if (e.size !== size) { e.eng.setFixedSize(state.w, state.h, pr); e.size = size; }
      if (e.key !== key) {
        e.eng.set(style);
        e.key = key;
        await e.eng.ready();
      }
    }
    if (overflow) {
      // a shared engine is re-styled while drawing: its fonts must be loaded by then, and its size right
      await this.fonts.ensure(style.glyph.font, style.glyph.weight, false, style.glyph.charset.slice(0, 200));
      if (e.size !== size) { e.eng.setFixedSize(state.w, state.h, pr); e.size = size; }
    }
    e.used = ++this.clock;
    return e;
  }

  /** Keeps the pool within budget: the engines used longest ago go first. */
  private evictEngines() {
    if (this.engines.size < this.maxEngines) return;
    const list = [...this.engines.entries()].sort((a, b) => a[1].used - b[1].used);
    while (this.engines.size >= this.maxEngines && list.length) {
      const [id, e] = list.shift()!;
      e.eng.destroy();
      this.engines.delete(id);
    }
  }

  /** Canvases of layers that no longer exist go away (engines stay until the budget needs them). */
  private sweep(state: FrameState) {
    const ids = new Set(state.project.layers.map(l => l.id));
    for (const [id, c] of this.layerCanvases) if (!ids.has(id)) { c.width = c.height = 0; this.layerCanvases.delete(id); }
    for (const [id, c] of this.feeds) if (!ids.has(id)) { c.width = c.height = 0; this.feeds.delete(id); }
    for (const [id, e] of this.engines) if (!ids.has(id)) { e.eng.destroy(); this.engines.delete(id); }
    for (const id of this.grids.keys()) if (!ids.has(id)) this.grids.delete(id);
    // the finishes' canvases of deleted layers
    for (const key of this.pooled) if (!ids.has(key.slice(this.poolId.length + 1))) { releaseFinishes(key); this.pooled.delete(key); }
  }

  private layerCanvas(id: Id, w: number, h: number) {
    const r = canvas2d(w, h, this.layerCanvases.get(id));
    this.layerCanvases.set(id, r.c);
    return r;
  }

  /** Draws one layer onto the composite. Returns a note when it could not be drawn as asked. */
  private drawLayer(
    lf: LayerFrame, state: FrameState, ctx: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    quality: 'preview' | 'final', sequential: boolean, fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null,
  ): string | undefined {
    const l = lf.layer;
    if (l.opacity <= 0) return undefined;
    const { c: lc, x: lx } = this.layerCanvas(l.id, rw, rh);
    let note: string | undefined;
    switch (l.kind) {
      case 'photo': note = this.drawPhoto(l, lf, lx, rw, rh, scale); break;
      case 'ascii': note = this.drawAscii(l, lf, lx, target, rw, rh, scale, state, sequential, fit); break;
      case 'glyphs': note = this.drawGlyphLayer(l, lf, lx, target, rw, rh, scale, fit); break;
      case 'text': drawText(lx, l, rw, rh); break;
      case 'shape': drawShape(lx, l, rw, rh, scale); break;
    }
    // what could not be drawn (a missing picture) leaves the composite as it was
    if (note) return note;
    let out: HTMLCanvasElement = lc;
    const on = l.finishes.filter(f => f.on && f.amount > 0);
    if (on.length) {
      const key = `${this.poolId}:${l.id}`;
      this.pooled.add(key);
      out = applyFinishes(lc, on, { t: state.t, seed: `${state.seed}|${l.id}`, scale, quality }, key);
    }
    if (l.mask) {
      const m = maskCanvas(l.mask, {
        w: rw, h: rh, scale, t: state.t,
        raster: ref => { const img = this.provider.image(ref); return img ? coverageOfImage(img, rw, rh) : null; },
        pixels: id => {
          const s = state.project.sources.find(x => x.id === id) ?? null;
          const c = fit(s, fitOfSource(state, id), frameTimeOf(state, s));
          return c ? c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, rw, rh).data : null;
        },
        pixelsKey: id => { const s = state.project.sources.find(x => x.id === id) ?? null; return `${id}@${frameTimeOf(state, s)}|${fitOfSource(state, id)}`; },
      });
      const ox = out.getContext('2d')!;
      ox.save();
      ox.setTransform(1, 0, 0, 1, 0, 0);
      ox.globalAlpha = 1;
      ox.globalCompositeOperation = 'destination-in';
      ox.drawImage(m.canvas, 0, 0);
      ox.restore();
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
    ctx.globalCompositeOperation = BLEND[l.blend] ?? 'source-over';
    const xf = l.xf;
    if (xf.x || xf.y || xf.rot || xf.scale !== 1) {
      ctx.translate(rw / 2 + xf.x * rw, rh / 2 + xf.y * rh);
      ctx.rotate((xf.rot * Math.PI) / 180);
      ctx.scale(xf.scale, xf.scale);
      ctx.translate(-rw / 2, -rh / 2);
    }
    ctx.drawImage(out, 0, 0);
    ctx.restore();
    return note;
  }

  private drawPhoto(l: PhotoLayer, lf: LayerFrame, x: CanvasRenderingContext2D, rw: number, rh: number, scale: number): string | undefined {
    const img: Drawable | null = lf.source ? this.provider.frame(lf.source, lf.srcTime) : null;
    if (!img) return lf.source ? 'Falta la imagen de esta capa.' : 'Esta capa no tiene imagen.';
    const r = fitRect(img.width, img.height, rw, rh, l.fit);
    const a = l.adjust;
    const css = cssFilter(a, scale);
    const gpu = css !== 'none' && canvasFilterWorks();
    const cpu = (css !== 'none' && !gpu) || needsTone(a);
    // the CPU passes read the pixels back: they work in a canvas kept in memory (no GPU readback)
    const target = cpu ? (this.cpuCanvas = canvas2d(rw, rh, this.cpuCanvas ?? memCanvas()).c).getContext('2d', { willReadFrequently: true })! : x;
    if (gpu) target.filter = css;
    target.drawImage(img, r.x, r.y, r.w, r.h);
    target.filter = 'none';
    if (cpu) {
      const data = target.getImageData(0, 0, rw, rh);
      if (css !== 'none' && !gpu) cssAdjustCpu(data.data, rw, rh, a, scale);
      if (needsTone(a)) toneCpu(data.data, rw, rh, a);
      target.putImageData(data, 0, 0);
      x.drawImage(target.canvas, 0, 0);
    }
    return undefined;
  }

  private drawAscii(
    l: AsciiLayer, lf: LayerFrame, x: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    state: FrameState, sequential: boolean, fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null,
  ): string | undefined {
    const e = this.assigned.get(l.id);
    if (!e || e.lost) return 'No hay motor para esta capa ASCII (el navegador retiró su contexto WebGL): se intenta de nuevo en el próximo cuadro.';
    const eng = e.eng;
    const style = engineStyle(l);
    const key = JSON.stringify(style);
    // a still starts from a clean engine (set() drops what earlier frames left, like Estela's trail)
    if (e.key !== key || !sequential) { eng.set(style); e.key = key; }
    // (a shared engine takes each layer's own size: its pixel ratio depends on the cell size)
    const pr = enginePixelRatio(style, scale);
    const size = `${state.w}x${state.h}@${pr}`;
    if (e.size !== size) { eng.setFixedSize(state.w, state.h, pr); e.size = size; }
    let feed: HTMLCanvasElement | null = null;
    if (l.source === 'below') feed = target;
    else if (l.source !== 'style') {
      feed = fit(lf.source, l.fit ?? 'cover', lf.srcTime);
      if (!feed) return lf.source ? 'Falta la imagen de esta capa.' : 'Esta capa no tiene imagen.';
    }
    // the same element again still uploads it anew (its pixels change from frame to frame)
    eng.setMedia('image', feed);
    eng.transparent = !l.opaque;
    eng.renderAt(state.t);
    x.drawImage(eng.canvas, 0, 0, rw, rh);
    if (lf.reveal) {
      // the engine's own grid (its canvas may be larger than the layer: see enginePixelRatio), in layer px
      const ew = eng.canvas.width, eh = eng.canvas.height;
      const g = engineGrid(style, ew, eh, ew / state.w);
      applyReveal(x, lf.reveal({ cols: g.cols, rows: g.rows }), g.cols, g.rows, (g.cw * rw) / ew, (g.ch * rh) / eh);
    }
    return undefined;
  }

  private drawGlyphLayer(
    l: GlyphsLayer, lf: LayerFrame, x: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null,
  ): string | undefined {
    let feed: HTMLCanvasElement | null;
    // what the picture is, when it is known: the grid is kept while only the clips' cell changes move on
    let version: string | undefined;
    if (l.source === 'below') {
      // a copy: the composite changes once this layer is drawn over it
      const { c, x: fx } = canvas2d(rw, rh, this.feeds.get(l.id));
      fx.drawImage(target, 0, 0);
      this.feeds.set(l.id, c);
      feed = c;
    } else {
      feed = fit(lf.source, l.fit ?? 'cover', lf.srcTime);
      const src = lf.source;
      if (src) version = `${src.id}:${src.media.map(m => m.id ?? '?').join(',')}@${src.kind === 'image' || src.kind === 'cutout' ? 0 : lf.srcTime}|${l.fit ?? 'cover'}|${rw}x${rh}`;
    }
    if (!feed) return lf.source ? 'Falta la imagen de esta capa.' : 'Esta capa no tiene imagen.';
    // cells are output px: at a smaller scale the same grid is drawn smaller
    const style = { ...l.glyphs, cell: l.glyphs.cell * scale };
    const key = version ? `${version}|${JSON.stringify(style)}` : '';
    const kept = this.grids.get(l.id);
    let grid: GlyphGrid;
    if (key && kept?.key === key) grid = kept.grid;
    else {
      grid = glyphGridWith(feed, style, { w: rw, h: rh }, version ? { version } : {});
      if (key) this.grids.set(l.id, { key, grid }); else this.grids.delete(l.id);
    }
    const g: CellGrid = { cols: grid.cols, rows: grid.rows, chars: grid.chars };
    const cells = lf.cells ? lf.cells(g) : null;
    const reveal = lf.reveal ? lf.reveal(g) : null;
    let fx: ((i: number, col: number, row: number) => CellFx | null) | undefined;
    if (cells || reveal) {
      fx = (i, col, row) => {
        let f = cells ? cells(i, col, row) : null;
        if (reveal) {
          const v = reveal(col, row);
          if (v < 1) f = { ...(f ?? {}), visible: (f?.visible ?? 1) * v };
        }
        if (f && scale !== 1 && (f.dx || f.dy)) f = { ...f, dx: (f.dx ?? 0) * scale, dy: (f.dy ?? 0) * scale };
        return f;
      };
    }
    drawGlyphs(x, grid, style, fx);
    return undefined;
  }
}

/** Keeps only the cells a reveal shows (each cell's alpha times its visibility), on the engine's grid. */
function applyReveal(x: CanvasRenderingContext2D, vis: (col: number, row: number) => number, cols: number, rows: number, cw: number, ch: number) {
  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sx = small.getContext('2d')!;
  const img = sx.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = Math.min(1, Math.max(0, vis(c, r)));
    const o = (r * cols + c) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = Math.round(v * 255);
  }
  sx.putImageData(img, 0, 0);
  x.save();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  x.imageSmoothingEnabled = false;
  x.drawImage(small, 0, 0, cols * cw, rows * ch);
  x.imageSmoothingEnabled = true;
  x.restore();
}

/** Media ids the drawn layers of a frame use (for the report of what is missing). */
function mediaIdsOfFrame(state: FrameState, frames: LayerFrame[]): Set<string> {
  const ids = new Set<string>();
  const addSource = (s: Source | null | undefined) => { for (const m of s?.media ?? []) ids.add(m.id ?? '?'); };
  for (const lf of frames) {
    addSource(lf.source);
    for (const p of lf.layer.mask?.parts ?? []) {
      if (p.kind === 'raster') { ids.add(p.media.id ?? '?'); for (const f of p.frames ?? []) ids.add(f.media.id ?? '?'); }
      else if (p.kind === 'color') addSource(state.project.sources.find(s => s.id === p.source));
    }
  }
  return ids;
}

/** Time of a source's frame in this state (the time its layers ask for). */
function frameTimeOf(state: FrameState, s: Source | null): number {
  if (!s) return 0;
  const lf = state.layers.find(l => l.source?.id === s.id);
  if (lf) return lf.srcTime;
  if (s.kind === 'video') {
    const d = s.duration ?? 0;
    return d > 0 ? ((state.t % d) + d) % d : state.t;
  }
  return state.t;
}

/** How a source is placed when a mask reads its colours: as the first layer showing it does, or cover. */
export function sourceFit(project: { layers: Layer[] }, id: string): LayerFit {
  const l = project.layers.find(x => 'source' in x && x.source === id) as (Layer & { fit?: LayerFit }) | undefined;
  return l?.fit ?? 'cover';
}
const fitOfSource = (state: FrameState, id: string) => sourceFit(state.project, id);

/* ------------------------------------------------------------------ convenience */

let defaultCompositor: Compositor | null = null;

/** A compositor shared by callers that do not keep their own (dev pages, one-off exports). */
export function sharedCompositor(): Compositor {
  return (defaultCompositor ??= new Compositor());
}
