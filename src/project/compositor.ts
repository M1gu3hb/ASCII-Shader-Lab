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
 *   then     cell reveal and tiles of clips → finishes (fx/) → mask (destination-in) → masks of clips
 *            (`within`) → opacity + blend + transform.
 * Tiles (clips that move a layer's cells, clips.ts TileFx) cost nothing unless a clip asks for them: the
 * layer's picture is copied once and each moved cell is cleared and drawn again at its new place.
 *
 * ASCII engines: one per ASCII layer, kept in a pool by layer id (re-styled only when the style changes),
 * at most `maxEngines` (WebGL contexts are limited: a browser drops the oldest past about 16). Layers past
 * that budget share one more engine, re-styled for each (slower, same pixels) and the report says so.
 * Without WebGL 2 the engines are the Canvas 2D basic engine (engine/create.ts): same API, same output.
 *
 * Caches (never for sequences, nor past CACHE_MAX_PX): each layer keeps its last pictures per render size
 * (at most SIZES_PER_LAYER sizes, e.g. the light and the final view), and a layer whose evaluated state is
 * the same as when a picture was made is not drawn again, only composited: its content (after finishes) is
 * keyed by everything that draws it — the evaluated layer without its opacity, blend, transform and mask,
 * its source's picture and frame time, the composite under it when it reads 'below', the render size and
 * quality, and the time when it depends on time (ASCII engines and finishes over time always do) — and the
 * masked picture additionally by its mask and the clips' masks. Layers with per-cell hooks from clips
 * (functions) are never cached. So moving a mask redraws that one layer, and opacity or blend changes only
 * composite. Glyph grids are kept per scale too, so light and final views do not re-derive them.
 *
 * Memory: a layer that keeps nothing (no key, past CACHE_MAX_PX, a sequence) and text and shape layers
 * without finishes (cheaper to draw again than to keep: a poster has dozens) are drawn in a canvas of their
 * own that goes as soon as the layer is composited, instead of one kept per layer; their finishes share one
 * pool. After a render past CACHE_MAX_PX (print sizes: ~70 MB per canvas at A3 and 300 ppp) the other
 * canvases used only while drawing go too. So an A3 poster needs a few full-size canvases, not a few per layer.
 * (A fresh canvas each time, not one scratch canvas redrawn layer after layer: Chromium changes how a canvas
 * rasterises once it has been redrawn and drawn from a few times, so a reused one drew thin lines a little
 * differently from the export's fresh one; preview = export needs the same kind of canvas on both sides.)
 */
import { createRenderer } from '../engine/create';
import { createFontLoader, type FontLoader } from '../engine/fonts';
import { PATTERN_GLSL } from '../engine/glsl/patterns';
import { cloneRecipe, type MediaRef, type Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import { applyFinishes, finishesDependOnTime, releaseFinishes } from '../fx/index';
import { cellColors, drawGlyphs, ensureGlyphFont, glyphGridWith, sampleOf, type CellFx, type GlyphGrid } from '../glyphs/index';
import { cssAdjustCpu, cssFilter, fitRect, needsTone, toneCpu } from './adjust';
import type { CellGrid, TileFactory } from './clips';
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
 * Below it, cells would shrink to a few pixels, where glyphs are unreadable and no longer look like the
 * export's (they are fitted to the tiny cell): the engine renders at a ratio that keeps
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

/** Render sizes a layer keeps pictures for (the viewport's light and final views). */
export const SIZES_PER_LAYER = 2;
/** Renders bigger than this (px) keep nothing between frames (exports at print sizes). */
export const CACHE_MAX_PX = 4_200_000;
/** Glyph grids kept per layer (one per scale). */
const GRIDS_PER_LAYER = 3;

/** A layer's canvases at one render size, and what they hold. */
interface Slot {
  size: string;
  /** The layer's content (drawn), its content after finishes, and its masked picture. */
  lc: HTMLCanvasElement | null;
  pre: HTMLCanvasElement | null;
  mc: HTMLCanvasElement | null;
  out: HTMLCanvasElement | null;
  contentKey: string | null;
  outKey: string | null;
  used: number;
}

/** What makes a layer's picture: see «Caches» at the top. */
export interface LayerKeys { content: string; out: string }

/** Top-level fields of a layer that do not change its own picture (they act when it is composited). */
const COMPOSITE_ONLY = new Set(['opacity', 'blend', 'xf', 'name', 'locked', 'visible', 'span', 'clips', 'mask', 'depth']);

/* ------------------------------------------------------------------ compositor */

export class Compositor {
  readonly provider: SourceProvider;
  readonly fonts: FontLoader;
  readonly maxEngines: number;
  private force?: 'basic';
  private ownsProvider: boolean;
  private engines = new Map<Id, Engine>();
  private shared: Engine | null = null;
  /** Each layer's canvases per render size (see «Caches»). */
  private slots = new Map<Id, Slot[]>();
  /** Renders drawn with the caches (hits: layers composited from a kept picture). */
  readonly cacheStats = { layers: 0, hits: 0, contentHits: 0 };
  /** The picture under a glyph layer that reads 'below' (a copy: one at a time, drawn again each time). */
  private belowFeed: HTMLCanvasElement | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** The engine each ASCII layer of the frame being drawn uses (set by prepare). */
  private assigned = new Map<Id, Engine>();
  /** The last glyph grids of each glyph layer (one per scale) and what they were made from. */
  private grids = new Map<Id, Array<{ key: string; grid: GlyphGrid }>>();
  /** Where photo layers that need CPU passes are drawn (read back often: kept in memory). */
  private cpuCanvas: HTMLCanvasElement | null = null;
  /** A copy of a layer while its tiles move (clips), and the small canvas cell brightness is read from. */
  private tileCanvas: HTMLCanvasElement | null = null;
  private lumCanvas: HTMLCanvasElement | null = null;
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
    for (const list of this.slots.values()) for (const sl of list) freeSlot(sl);
    this.freeScratch();
    if (this.cpuCanvas) { this.cpuCanvas.width = this.cpuCanvas.height = 0; this.cpuCanvas = null; }
    if (this.tileCanvas) { this.tileCanvas.width = this.tileCanvas.height = 0; this.tileCanvas = null; }
    if (this.lumCanvas) { this.lumCanvas.width = this.lumCanvas.height = 0; this.lumCanvas = null; }
    for (const key of this.pooled) releaseFinishes(key);
    this.pooled.clear();
    this.slots.clear();
    this.grids.clear();
    if (this.ownsProvider) this.provider.release();
  }

  /** The canvases only used while a frame is drawn (and the finishes' shared pool). */
  private freeScratch() {
    for (const c of [this.belowFeed, this.cpuCanvas, this.tileCanvas]) if (c) { c.width = 0; c.height = 0; }
    this.belowFeed = this.cpuCanvas = this.tileCanvas = null;
    for (const key of this.pooled) if (key.startsWith(`${this.poolId}:~`)) { releaseFinishes(key); this.pooled.delete(key); }
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

    // what each layer's picture is made of (null: drawn anew every time), and which are kept already
    const cacheOn = !o.sequential && rw * rh <= CACHE_MAX_PX;
    // (the chain of 'below' keys counts every layer; cheap layers are drawn again instead of kept)
    const keys = (cacheOn ? this.frameKeys(state, frames, rw, rh, scale, quality, transparent) : frames.map(() => null))
      .map((k, i) => (k && worthKeeping(frames[i]) ? k : null));
    const size = `${rw}x${rh}`;
    const kept = frames.map((lf, i) => {
      const k = keys[i];
      if (!k) return false;
      const sl = this.slots.get(lf.layer.id)?.find(x => x.size === size);
      return !!sl && sl.outKey === k.out && !!sl.out && sl.out.width === rw && sl.out.height === rh;
    });

    await this.prepare(state, frames.filter((_, i) => !kept[i]), scale, report);

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
    for (let i = 0; i < frames.length; i++) {
      const lf = frames[i];
      const ts = performance.now();
      const note = this.drawLayer(lf, state, ctx, target, rw, rh, scale, quality, !!o.sequential, fit, keys[i]);
      report.layers.push({ id: lf.layer.id, kind: lf.layer.kind, ms: Math.round((performance.now() - ts) * 10) / 10, ...(note ? { note } : {}) });
    }
    for (const c of fitted.values()) if (c) { c.width = 0; c.height = 0; }
    // a print-size render keeps nothing: the canvases used while drawing go now instead of waiting for the next render
    if (rw * rh > CACHE_MAX_PX) this.freeScratch();
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
      if (l.kind === 'glyphs') jobs.push(ensureGlyphFont(l.glyphs.font, l.glyphs.weight, sampleOf(l.glyphs) + '█▌_' + lf.glyphs));
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
    for (const [id, list] of this.slots) if (!ids.has(id)) { for (const sl of list) freeSlot(sl); this.slots.delete(id); }
    for (const [id, e] of this.engines) if (!ids.has(id)) { e.eng.destroy(); this.engines.delete(id); }
    for (const id of this.grids.keys()) if (!ids.has(id)) this.grids.delete(id);
    // the finishes' canvases of deleted layers
    for (const key of this.pooled) if (!ids.has(key.slice(this.poolId.length + 1).split('|')[0])) { releaseFinishes(key); this.pooled.delete(key); }
  }

  /** The canvases of a layer at a render size (the size used longest ago goes when a new one comes). */
  private slot(id: Id, w: number, h: number): Slot {
    const size = `${w}x${h}`;
    let list = this.slots.get(id);
    if (!list) this.slots.set(id, list = []);
    let sl = list.find(x => x.size === size);
    if (!sl) {
      while (list.length >= SIZES_PER_LAYER) {
        list.sort((a, b) => a.used - b.used);
        const old = list.shift()!;
        freeSlot(old);
        const pk = `${this.poolId}:${id}|${old.size}`;
        if (this.pooled.delete(pk)) releaseFinishes(pk);
      }
      sl = { size, lc: null, pre: null, mc: null, out: null, contentKey: null, outKey: null, used: 0 };
      list.push(sl);
    }
    sl.used = ++this.clock;
    return sl;
  }

  /**
   * The keys of every layer of a frame (see «Caches»), bottom to top: a layer that reads 'below' is keyed by
   * the composite under it, which is known only while every layer under it has keys.
   */
  private frameKeys(state: FrameState, frames: LayerFrame[], rw: number, rh: number, scale: number, quality: string, transparent: boolean): Array<LayerKeys | null> {
    let below: string | null = `${transparent ? 'transparente' : state.bg}|${rw}x${rh}`;
    return frames.map(lf => {
      const k = layerKeys(lf, state, { rw, rh, scale, quality }, below, this.provider);
      below = below !== null && k ? `${below}\n${k.out}|${compositeKey(lf)}` : null;
      return k;
    });
  }

  /** Draws one layer onto the composite. Returns a note when it could not be drawn as asked. */
  private drawLayer(
    lf: LayerFrame, state: FrameState, ctx: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    quality: 'preview' | 'final', sequential: boolean, fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null,
    keys: LayerKeys | null,
  ): string | undefined {
    const l = lf.layer;
    if (l.opacity <= 0) return undefined;
    // a layer that keeps nothing is drawn in a canvas that goes once it is composited (see «Memory» at the top)
    const sl: Slot = keys ? this.slot(l.id, rw, rh) : { size: `${rw}x${rh}`, lc: null, pre: null, mc: null, out: null, contentKey: null, outKey: null, used: 0 };
    const note = this.drawLayerInto(sl, lf, state, ctx, target, rw, rh, scale, quality, sequential, fit, keys);
    if (!keys && sl.lc) { sl.lc.width = 0; sl.lc.height = 0; }
    return note;
  }

  private drawLayerInto(
    sl: Slot, lf: LayerFrame, state: FrameState, ctx: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    quality: 'preview' | 'final', sequential: boolean, fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null,
    keys: LayerKeys | null,
  ): string | undefined {
    const l = lf.layer;
    const fits = (c: HTMLCanvasElement | null): c is HTMLCanvasElement => !!c && c.width === rw && c.height === rh;
    let out: HTMLCanvasElement;
    if (keys) this.cacheStats.layers++;
    if (keys && sl.outKey === keys.out && fits(sl.out)) {
      // the same picture as last time at this size: only composited
      out = sl.out;
      this.cacheStats.hits++;
    } else {
      sl.outKey = null;
      let pre: HTMLCanvasElement;
      if (keys && sl.contentKey === keys.content && fits(sl.pre)) {
        pre = sl.pre;
        this.cacheStats.contentHits++;
      } else {
        sl.contentKey = null;
        const { c: lc, x: lx } = canvas2d(rw, rh, sl.lc ?? undefined);
        sl.lc = lc;
        let note: string | undefined;
        switch (l.kind) {
          case 'photo': note = this.drawPhoto(l, lf, lx, rw, rh, scale); break;
          case 'ascii': note = this.drawAscii(l, lf, lx, target, rw, rh, scale, state, sequential, fit); break;
          case 'glyphs': note = this.drawGlyphLayer(l, lf, lx, target, rw, rh, scale, fit, state); break;
          case 'text': drawText(lx, l, rw, rh); break;
          case 'shape': drawShape(lx, l, rw, rh, scale); break;
        }
        // what could not be drawn (a missing picture) leaves the composite as it was
        if (note) return note;
        if (lf.tiles && (l.kind === 'photo' || l.kind === 'text' || l.kind === 'shape')) {
          // square tiles of tileCell output px over the frame
          const cw = Math.max(1, lf.tileCell * scale);
          const cols = Math.max(1, Math.ceil(rw / cw)), rows = Math.max(1, Math.ceil(rh / cw));
          const g = this.gridOf(cols, rows, cw, cw, scale, state, undefined, () => this.cellLum(lc, cols, rows, cw, cw));
          this.applyTiles(lx, lc, lf.tiles, g, cols, rows, cw, cw, scale);
        }
        pre = lc;
        const on = l.finishes.filter(f => f.on && f.amount > 0);
        if (on.length) {
          const key = keys ? `${this.poolId}:${l.id}|${sl.size}` : `${this.poolId}:~scratch|${sl.size}`;
          this.pooled.add(key);
          pre = applyFinishes(lc, on, { t: state.t, seed: `${state.seed}|${l.id}`, scale, quality }, key);
        }
        sl.pre = pre;
        sl.contentKey = keys ? keys.content : null;
      }
      // a mask switched off (Mask.off) is kept with the layer but not applied
      const mask = l.mask && !l.mask.off ? l.mask : null;
      if (mask || lf.within.length) {
        // kept content stays as it is: the mask goes on a copy (without keys, on the content itself)
        if (keys) {
          const { c: mc, x: mx } = canvas2d(rw, rh, sl.mc ?? undefined);
          sl.mc = mc;
          mx.drawImage(pre, 0, 0);
          out = mc;
        } else {
          out = pre;
          sl.contentKey = null;
        }
        if (mask) {
          const m = maskCanvas(mask, {
            w: rw, h: rh, scale, t: state.t,
            raster: ref => { const img = this.provider.image(ref); return img ? coverageOfImage(img, rw, rh) : null; },
            pixels: id => {
              const s = state.project.sources.find(x => x.id === id) ?? null;
              const c = fit(s, fitOfSource(state, id), frameTimeOf(state, s));
              return c ? c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, rw, rh).data : null;
            },
            pixelsKey: id => { const s = state.project.sources.find(x => x.id === id) ?? null; return `${id}@${frameTimeOf(state, s)}|${fitOfSource(state, id)}`; },
          });
          clipTo(out, m.canvas);
        }
        for (const w of lf.within) {
          // clips' masks (an iris, a wipe) are shapes: nothing to read from sources or the media store
          const m = maskCanvas(w, { w: rw, h: rh, scale, t: state.t, raster: () => null, pixels: () => null, pixelsKey: id => id });
          clipTo(out, m.canvas);
        }
      } else if (keys && pre !== sl.lc) {
        // the finishes' canvas belongs to their pool (which may drop it): the kept picture is a copy of our own
        const { c: mc, x: mx } = canvas2d(rw, rh, sl.mc ?? undefined);
        sl.mc = mc;
        mx.drawImage(pre, 0, 0);
        out = mc;
      } else out = pre;
      sl.out = out;
      sl.outKey = keys ? keys.out : null;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
    ctx.globalCompositeOperation = BLEND[l.blend] ?? 'source-over';
    const xf = l.xf;
    const st = lf.stretch;
    if (xf.x || xf.y || xf.rot || xf.scale !== 1 || st) {
      ctx.translate(rw / 2 + xf.x * rw, rh / 2 + xf.y * rh);
      ctx.rotate((xf.rot * Math.PI) / 180);
      // a clip's stretch (squash and stretch, a TV switching off) is non-uniform, inside the layer's own scale
      ctx.scale(xf.scale * (st?.x ?? 1), xf.scale * (st?.y ?? 1));
      ctx.translate(-rw / 2, -rh / 2);
    }
    ctx.drawImage(out, 0, 0);
    ctx.restore();
    return undefined;
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
    if (lf.reveal || lf.tiles) {
      // the engine's own grid (its canvas may be larger than the layer: see enginePixelRatio), in layer px
      const ew = eng.canvas.width, eh = eng.canvas.height;
      const g = engineGrid(style, ew, eh, ew / state.w);
      const cw = (g.cw * rw) / ew, ch = (g.ch * rh) / eh;
      // brightness per cell, when a clip asks: the picture the layer reads (or its own drawing)
      const lumSrc = feed ?? x.canvas;
      const grid = this.gridOf(g.cols, g.rows, cw, ch, scale, state, undefined, () => this.cellLum(lumSrc, g.cols, g.rows, cw, ch));
      if (lf.reveal) applyReveal(x, lf.reveal(grid), g.cols, g.rows, cw, ch);
      if (lf.tiles) this.applyTiles(x, x.canvas, lf.tiles, grid, g.cols, g.rows, cw, ch, scale);
    }
    return undefined;
  }

  private drawGlyphLayer(
    l: GlyphsLayer, lf: LayerFrame, x: CanvasRenderingContext2D, target: HTMLCanvasElement, rw: number, rh: number, scale: number,
    fit: (s: Source | null, m: LayerFit, t: number) => HTMLCanvasElement | null, state: FrameState,
  ): string | undefined {
    let feed: HTMLCanvasElement | null;
    // what the picture is, when it is known: the grid is kept while only the clips' cell changes move on
    let version: string | undefined;
    if (l.source === 'below') {
      // a copy: the composite changes once this layer is drawn over it
      const { c, x: fx } = canvas2d(rw, rh, this.belowFeed ?? undefined);
      fx.drawImage(target, 0, 0);
      this.belowFeed = c;
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
    // (one per scale: the light and the final view each keep theirs)
    const kept = this.grids.get(l.id) ?? [];
    const hit = key ? kept.find(g => g.key === key) : undefined;
    let grid: GlyphGrid;
    if (hit) {
      grid = hit.grid;
      kept.splice(kept.indexOf(hit), 1);
      kept.push(hit);
    } else {
      grid = glyphGridWith(feed, style, { w: rw, h: rh }, version ? { version } : {});
      if (key) {
        kept.push({ key, grid });
        while (kept.length > GRIDS_PER_LAYER) kept.shift();
        this.grids.set(l.id, kept);
      }
    }
    const g = this.gridOf(grid.cols, grid.rows, grid.cw, grid.ch, scale, state, grid.chars, grid.lum);
    let colors: Uint32Array | undefined;
    Object.defineProperty(g, 'colors', { get: () => (colors ??= cellColors(grid, style)), enumerable: true });
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
    if (lf.tiles) this.applyTiles(x, x.canvas, lf.tiles, g, grid.cols, grid.rows, grid.cw, grid.ch, scale);
    return undefined;
  }

  /** The grid clips see: cells and frame in output px, brightness given or measured when first read. */
  private gridOf(
    cols: number, rows: number, cw: number, ch: number, scale: number, state: FrameState,
    chars: readonly string[] | undefined, lum: ArrayLike<number> | (() => ArrayLike<number>),
  ): CellGrid {
    const g: CellGrid = { cols, rows, cw: cw / scale, ch: ch / scale, w: state.w, h: state.h, ...(chars ? { chars } : {}) };
    if (typeof lum === 'function') {
      let v: ArrayLike<number> | undefined;
      Object.defineProperty(g, 'lum', { get: () => (v ??= lum()), enumerable: true });
    } else Object.defineProperty(g, 'lum', { value: lum, enumerable: true });
    return g;
  }

  /** Brightness 0..1 of each cell of a picture (cells of cw×ch px of `src`), times its alpha. */
  private cellLum(src: HTMLCanvasElement, cols: number, rows: number, cw: number, ch: number): Float32Array {
    const out = new Float32Array(cols * rows);
    try {
      const c = this.lumCanvas ??= memCanvas();
      const { x } = canvas2d(cols, rows, c);
      x.imageSmoothingQuality = 'medium';
      x.drawImage(src, 0, 0, src.width, src.height, 0, 0, src.width / cw, src.height / ch);
      const d = x.getImageData(0, 0, cols, rows).data;
      for (let i = 0; i < out.length; i++) {
        const o = i * 4;
        out[i] = ((d[o] * 0.2126 + d[o + 1] * 0.7152 + d[o + 2] * 0.0722) / 255) * (d[o + 3] / 255);
      }
    } catch { /* an unreadable picture: every cell reads as dark */ }
    return out;
  }

  /**
   * Moves the cells of a layer's picture (clips' tiles): the picture is copied, each moved cell is cleared
   * and drawn again from the copy with its offset, scale, rotation and alpha. Cells that stay are untouched.
   */
  private applyTiles(
    x: CanvasRenderingContext2D, from: HTMLCanvasElement, tiles: TileFactory, grid: CellGrid,
    cols: number, rows: number, cw: number, ch: number, scale: number,
  ) {
    const at = tiles(grid);
    const moved: number[] = [];
    const fxs: Array<NonNullable<ReturnType<typeof at>>> = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const f = at(c, r);
      if (!f) continue;
      if (!f.dx && !f.dy && (f.scale ?? 1) === 1 && (f.sy ?? 1) === 1 && !f.rot && (f.alpha ?? 1) >= 1) continue;
      moved.push(r * cols + c);
      fxs.push(f);
    }
    if (!moved.length) return;
    const w = from.width, h = from.height;
    const { c: copy, x: cx } = canvas2d(w, h, this.tileCanvas ?? undefined);
    this.tileCanvas = copy;
    cx.drawImage(from, 0, 0);
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    // cell edges on whole pixels, so neighbours neither overlap nor leave hairlines
    const X = (c: number) => Math.round(c * cw), Y = (r: number) => Math.round(r * ch);
    // neighbours in a row are cleared (and, when they move alike, drawn) as one strip: far fewer draw calls
    for (let k = 0; k < moved.length;) {
      const i = moved[k], c = i % cols, r = (i / cols) | 0;
      let n = 1;
      while (k + n < moved.length && moved[k + n] === i + n && ((i + n) / cols | 0) === r) n++;
      x.clearRect(X(c), Y(r), X(c + n) - X(c), Y(r + 1) - Y(r));
      k += n;
    }
    const plain = (f: NonNullable<ReturnType<typeof at>>) => (f.scale ?? 1) === 1 && (f.sy ?? 1) === 1 && !f.rot;
    const same = (a: NonNullable<ReturnType<typeof at>>, b: NonNullable<ReturnType<typeof at>>) =>
      Math.abs((a.dx ?? 0) - (b.dx ?? 0)) < 0.01 && Math.abs((a.dy ?? 0) - (b.dy ?? 0)) < 0.01 && Math.abs((a.alpha ?? 1) - (b.alpha ?? 1)) < 0.004;
    for (let k = 0; k < moved.length; k++) {
      const f = fxs[k];
      const a = Math.min(1, Math.max(0, f.alpha ?? 1));
      const s = f.scale ?? 1, sy = f.sy ?? 1;
      if (!(a > 0.003) || !(s > 0.001) || !(sy > 0.0005)) continue;
      const i = moved[k], c = i % cols, r = (i / cols) | 0;
      if (plain(f)) {
        let n = 1;
        while (k + n < moved.length && moved[k + n] === i + n && ((i + n) / cols | 0) === r && plain(fxs[k + n]) && same(f, fxs[k + n])) n++;
        if (n > 1) {
          const sx = X(c), sy0 = Y(r), sw = X(c + n) - sx, sh = Y(r + 1) - sy0;
          const tw = Math.min(sw, w - sx), th = Math.min(sh, h - sy0);
          if (tw > 0 && th > 0) {
            x.globalAlpha = a;
            x.imageSmoothingEnabled = true;
            x.setTransform(1, 0, 0, 1, sx + (f.dx ?? 0) * scale, sy0 + (f.dy ?? 0) * scale);
            x.drawImage(copy, sx, sy0, tw, th, 0, 0, tw, th);
          }
          k += n - 1;
          continue;
        }
      }
      const sx = X(c), sy0 = Y(r), sw = X(c + 1) - sx, sh = Y(r + 1) - sy0;
      if (sw <= 0 || sh <= 0 || sx >= w || sy0 >= h) continue;
      const tw = Math.min(sw, w - sx), th = Math.min(sh, h - sy0);
      const rad = ((f.rot ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad) * s, sin = Math.sin(rad) * s;
      x.globalAlpha = a;
      // a tile blown up (a single glyph filling the frame) stays crisp pixels instead of a blur
      x.imageSmoothingEnabled = s < 2;
      x.setTransform(cos, sin, -sin * sy, cos * sy, sx + sw / 2 + (f.dx ?? 0) * scale, sy0 + sh / 2 + (f.dy ?? 0) * scale);
      x.drawImage(copy, sx, sy0, tw, th, -sw / 2, -sh / 2, tw, th);
    }
    x.restore();
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

/* ------------------------------------------------------------------ caches */

/**
 * Whether keeping a layer's picture pays: text and shape layers without finishes are drawn again in less
 * time than a kept full-size canvas is worth (a poster has dozens of them).
 */
function worthKeeping(lf: LayerFrame): boolean {
  const l = lf.layer;
  if (l.kind !== 'text' && l.kind !== 'shape') return true;
  return l.finishes.some(f => f.on && f.amount > 0);
}

function freeSlot(sl: Slot) {
  for (const c of [sl.lc, sl.mc]) if (c) { c.width = 0; c.height = 0; }
  sl.lc = sl.mc = sl.pre = sl.out = null;
  sl.contentKey = sl.outKey = null;
}

/** Keeps only what the mask covers (destination-in). */
function clipTo(out: HTMLCanvasElement, m: HTMLCanvasElement) {
  const ox = out.getContext('2d')!;
  ox.save();
  ox.setTransform(1, 0, 0, 1, 0, 0);
  ox.globalAlpha = 1;
  ox.globalCompositeOperation = 'destination-in';
  ox.drawImage(m, 0, 0);
  ox.restore();
}

/** How a layer is put on the composite (its picture does not depend on it). */
export function compositeKey(lf: LayerFrame): string {
  const l = lf.layer;
  return JSON.stringify([l.opacity, l.blend, l.xf, lf.stretch]);
}

/** Whether a layer's own picture depends on the time beyond its source frame (see «Caches»). */
export function layerDependsOnTime(lf: LayerFrame): boolean {
  const l = lf.layer;
  return l.kind === 'ascii' || finishesDependOnTime(l.finishes);
}

/**
 * The keys of a layer's picture (see «Caches»), or null when it cannot be kept: per-cell hooks from clips
 * (functions), or a 'below' source over a composite that is not keyed.
 */
export function layerKeys(
  lf: LayerFrame, state: FrameState, r: { rw: number; rh: number; scale: number; quality: string }, below: string | null,
  provider?: Pick<SourceProvider, 'image'>,
): LayerKeys | null {
  if (lf.cells || lf.reveal || lf.tiles) return null;
  const l = lf.layer;
  // the layer's own fields, without those that only act when it is composited
  const own: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(l)) if (!COMPOSITE_ONLY.has(k)) own[k] = v;
  let src = '';
  if ('source' in l) {
    if (l.source === 'below') {
      if (below === null) return null;
      src = 'bajo:' + below;
    } else if (l.source === 'style') src = 'estilo';
    else src = lf.source ? `${lf.source.id}:${lf.source.media.map(m => m.id ?? '?').join(',')}@${lf.srcTime}` : 'sin fuente';
  }
  const time = layerDependsOnTime(lf) ? `t=${state.t}` : '';
  const content = [JSON.stringify(own), src, time, `${r.rw}x${r.rh}@${r.scale}|${r.quality}|${state.w}x${state.h}|${state.seed}`, lf.glyphs].join('\u0001');
  let masks = '';
  const mask = l.mask && !l.mask.off ? l.mask : null;
  if (mask || lf.within.length) {
    // a painted part reads a picture (kept only once it is there); colour parts read sources at t
    const avail = mask ? mask.parts.map(p => (p.kind === 'raster' ? (provider?.image(p.media) ? 1 : 0) : '-')).join('') : '';
    const timed = !!mask?.parts.some(p => (p.kind === 'raster' && p.frames?.length) || p.kind === 'color');
    masks = JSON.stringify([mask, lf.within, avail, timed ? state.t : 0]);
  }
  return { content, out: content + '\u0002' + masks };
}

/* ------------------------------------------------------------------ convenience */

let defaultCompositor: Compositor | null = null;

/** A compositor shared by callers that do not keep their own (dev pages, one-off exports). */
export function sharedCompositor(): Compositor {
  return (defaultCompositor ??= new Compositor());
}
