import { buildAtlas, uniqueChars, type Atlas } from '../atlas';
import { BLENDS, INTERACT, cloneRecipe, type Recipe } from '../recipe';
import { fontById } from '../catalog';
import { bakeGradient, hexToRgb, sampleGradient } from '../color';
import { createFontLoader, type FontLoader } from '../fonts';
import type { EngineOptions, EngineStats, GestureInput, GridSnapshot, MediaKind } from '../engine';
import { TOUCH_TILE, VIEW_MODES, TouchField, isMarkMode, isTouchMode, touchSettings } from '../touch';
import { PointerHub, SIM_MODES, legacyGhost, pressureGain, pressureRadius, simSettle } from '../pointer';
import type { PatternLibrary } from '../glsl/patterns';
import type { MediaEl, PreviewQuality, Renderer } from '../renderer';
import { DEFAULT_TRANSITION, transitionOf, type TransitionSpec } from '../transitions';
import { drawTextSource, layoutMessage, messageCycle, messageState, textAnimated, type MsgLayout } from '../text';
import { animateMessage, movedCell, msgColorAnim, msgColorTime, scramblePool } from '../letters';
import { fold, loopTime, morphPeriod, ondularTimes, pieceTime } from '../loop';
import { activeXforms, trailDecay, trailStage, xformStages } from '../xform';
import { XformState } from './xform';
import { blurGrid, grainPass, needsPixelPost, postPass, shadePass, type ComposeFrame, type GlyphAtlas } from './compose';
import { drawOverlays, hasOverlays, type OverlayCache } from './overlays';
import {
  FieldBuffers, MediaMap, fieldLayers, pulseAt, runField,
  type FieldSource, type MediaBuffer, type TextBuffer,
} from './field';
import { SelectBuffers, runSelect } from './select';
import { SimGrid } from './sim';
import { TransitionLayer } from './transition';

/** Longest a live change with a transition waits for its fonts (the old piece keeps moving meanwhile). */
const PREP_BUDGET_MS = 700;

/** Same options as AsciiEngine; the GLSL pattern library is not needed (patterns are compiled in). */
export type BasicEngineOptions = Omit<EngineOptions, 'library'> & { library?: PatternLibrary };

export interface BasicTimings { field: number; select: number; compose: number; total: number }

/** Live rendering is capped at this rate, and drops to SLOW_FPS when frames are expensive. */
const FPS = 30;
const SLOW_FPS = 15;
/** The CPU composes every pixel, so live canvases are kept under this many device pixels. */
export const BASIC_MAX_PIXELS = 2_100_000;
const MAX_DIM = 8192;

/**
 * Pixels of a canvas we draw text or glyphs into. Chrome moves a canvas to CPU rasterisation after it is
 * read back a few times, and CPU and GPU rasterise text slightly differently; reading through a copy keeps
 * the source canvas rasterised like the one the WebGL engine uploads, and the result stable over time.
 */
function readPixels(src: HTMLCanvasElement, via: HTMLCanvasElement): Uint8ClampedArray {
  const w = src.width, h = src.height;
  if (via.width !== w) via.width = w;
  if (via.height !== h) via.height = h;
  const cx = via.getContext('2d', { willReadFrequently: true })!;
  cx.clearRect(0, 0, w, h);
  cx.drawImage(src, 0, 0);
  return cx.getImageData(0, 0, w, h).data;
}

const SRC_OF = (r: Recipe, hasMedia: boolean): FieldSource =>
  r.source === 'text' ? 'text' : r.source === 'pattern' ? 'pattern' : hasMedia ? 'media' : 'pattern';

/**
 * Canvas 2D renderer for browsers without WebGL 2. It runs the same pipeline as AsciiEngine on the CPU
 * (field → select → compose, see ./field.ts, ./select.ts, ./compose.ts) and draws the result with
 * putImageData, so the character grid (readGrid) and the look match the GPU engine. Post effects that do
 * not move pixels are canvas operations (./overlays.ts); curvature, aberration and transitions run per pixel.
 * Same constructor and options as AsciiEngine (the GLSL library and preserveDrawingBuffer are not needed;
 * the canvas always has an alpha channel). Differences:
 *  - live frames are capped at 30 fps, and at 15 fps while frames are slow (`adaptive`); the grid and the
 *    resolution never change;
 *  - live canvases stay under BASIC_MAX_PIXELS device pixels (the pixel ratio is lowered, not below 1);
 *  - `stats.ms` is the CPU cost of a frame (the GPU engine reports the frame interval);
 *  - film grain uses a different random sequence, and is added before scanlines and vignette;
 *  - transitions are drawn with canvas operations over the finished frame (./transition.ts).
 */
export class BasicEngine implements Renderer {
  readonly kind = 'basic' as const;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private o: BasicEngineOptions;
  private r: Recipe;
  private fonts: FontLoader;

  // sizes
  private cssW = 1; private cssH = 1; private pr = 1;
  private W = 1; private H = 1; private cw = 8; private ch = 11; private cols = 1; private rows = 1;

  // buffers
  private field = new FieldBuffers(1);
  private sel = new SelectBuffers(1);
  private img: ImageData | null = null;
  private out32 = new Uint32Array(1);
  private flat: Uint32Array | null = null;
  private bloomBuf = new Float32Array(3);
  private bloomTmp = new Float32Array(3);
  private sim = new SimGrid();
  private simMode = '';

  // glyphs, text, message, words, gradient
  private atlas: Atlas | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private atlasKey = '';
  private glyphs: GlyphAtlas = { cov: new Uint8Array(1), w: 1, h: 1, cols: 1, n: 1 };
  private textCanvas: HTMLCanvasElement | null = null;
  private textKey = '';
  private textBuf: TextBuffer | null = null;
  private msg: MsgLayout | null = null;
  private msgKey = '';
  /** The message's grid as the select pass reads it (its letters moved, when they move). */
  private msgData: Uint8Array | null = null;
  private msgAnimKey = '';
  /** Transformations of the source (see ../xform.ts): grids and Estela's state. */
  private xf = new XformState();
  /** Bumped when a media element changes (a new picture starts a new trail). */
  private mediaGen = 0;
  private wordsKey = '';
  private words = new Uint16Array(1);
  private gradKey = '';
  private grad: Uint8Array = new Uint8Array(4);

  // media
  private media: Partial<Record<MediaKind, MediaEl | null>> = {};
  private mediaEl: MediaEl | null = null;
  private mediaFailed: MediaEl | null = null;
  private mediaTime = -1;
  private mediaKey = '';
  private mediaOK = false;
  private mediaBuf: MediaBuffer | null = null;
  private mediaCanvas: HTMLCanvasElement | null = null;
  private revealKey = '';
  private revealCanvas: HTMLCanvasElement | null = null;
  private mediaPx: Uint32Array | null = null;
  private overlayCache: OverlayCache = {};

  private t = 0;
  private realT = 0;
  private playing: boolean;
  private raf = 0;
  private lastFrame = 0;
  private alive = true;
  private visible = true;
  private needsRender = true;
  private sizeDirty = true;
  private trans = -1;
  /** realT of the transition's first frame (NaN until that frame is drawn). */
  private transStart = NaN;
  /** Seconds of transition shown on a live canvas (see AsciiEngine.transElapsed). */
  private transElapsed = 0;
  private transSpec: TransitionSpec = DEFAULT_TRANSITION;
  private transLayer = new TransitionLayer();
  /** A change with a transition waiting for its fonts (see set()). */
  private pending: { r: Recipe; trans: TransitionSpec; since: number; fonts: boolean } | null = null;
  private q: PreviewQuality = {};
  private adaptiveHold = 0;
  private rendered = false;
  private frames = 0; private fps = 0; private fpsT = 0; private ema = 8; private slow = 0; private fast = 0;
  private fpsCap = FPS;
  private fontGen = 0;
  private lastErr = 0;
  /** Cost of the last frame in ms, per pass (dev tools). */
  timings: BasicTimings = { field: 0, select: 0, compose: 0, total: 0 };

  private ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, px: -1e4, py: -1e4, on: 0, targetOn: 0, down: false, lastReal: -1e9, impulse: 0, moved: 0, pressure: -1 };
  /** The gesture modes' field (../touch.ts): the same code, and the same bytes, as the WebGL engine. */
  private touch = new TouchField();
  private hub: PointerHub | null = null;
  /** realT of the last frame the pointer simulation had something to do (see AsciiEngine.simLast). */
  private simLast = -1e9;
  /** Fixed-size engines: realT of the last renderAt (see AsciiEngine.demo). */
  private demoT = NaN;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private cleanup: Array<() => void> = [];

  /** Export engines can render with a transparent background. */
  transparent = false;
  /** Live input (e.g. microphone level, 0..1) that drives the pulse instead of the BPM clock. */
  externalPulse = 0;

  constructor(canvas: HTMLCanvasElement, recipe: Recipe, opts: BasicEngineOptions) {
    this.canvas = canvas;
    this.o = opts;
    this.r = cloneRecipe(recipe);
    this.fonts = opts.fonts ?? createFontLoader({ google: opts.googleFonts ?? true });
    this.playing = (opts.autoplay ?? true) && !opts.reducedMotion;
    // an offscreen engine read back often (thumbnails) keeps its canvas in memory: reading it then never waits for a GPU
    const ctx = canvas.getContext('2d', opts.readback ? { alpha: true, willReadFrequently: true } : { alpha: true });
    if (!ctx) throw new Error('canvas2d');
    this.ctx = ctx;
    if (opts.fixedSize) this.resize();
    void this.requestFonts();
    this.watchLateFonts();

    if (!opts.fixedSize && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { this.sizeDirty = true; this.needsRender = true; });
      this.ro.observe(canvas);
    }
    if (opts.observeVisibility && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(es => { this.visible = es.some(e => e.isIntersecting); if (this.visible) this.needsRender = true; });
      this.io.observe(canvas);
    }
    if (opts.interactive ?? true) this.bindPointer();
    if (!opts.fixedSize) this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------------------------------------------------------- */
  /* Public API                                                        */
  /* ---------------------------------------------------------------- */

  /** The recipe last given to set() (it may still be getting ready to show). */
  get recipe(): Recipe { return cloneRecipe(this.pending?.r ?? this.r); }
  get time() { return this.t; }
  set time(v: number) { this.t = v; this.needsRender = true; }
  get isPlaying() { return this.playing; }
  get stats(): EngineStats {
    return { cols: this.cols, rows: this.rows, fps: this.fps, pixelRatio: this.pr, width: this.W, height: this.H, ms: this.ema };
  }
  get glyphChars(): string[] { return this.atlas ? this.atlas.chars.slice() : []; }
  /** Current live frame-rate cap (30, or 15 when frames are slow). */
  get fpsLimit() { return this.fpsCap; }
  get busy() { return !!this.pending || this.trans >= 0; }

  /**
   * A live change with a transition waits (at most PREP_BUDGET_MS, drawing the current piece) until the
   * new piece's fonts are loaded, so its glyphs do not change halfway; the transition's clock starts with
   * the first frame of the new piece.
   */
  set(next: Recipe, o: { transition?: boolean | TransitionSpec } = {}) {
    const trans = this.o.reducedMotion ? null : transitionOf(o.transition);
    const r = cloneRecipe(next);
    const p = this.pending;
    if (!this.o.fixedSize && this.rendered && (trans || p)) {
      if (p) { p.r = r; p.trans = trans ?? p.trans; p.fonts = false; }
      const want = p ?? (this.pending = { r, trans: trans!, since: performance.now(), fonts: false });
      void this.fontsFor(r).then(() => { if (this.pending === want && want.r === r) want.fonts = true; });
      this.needsRender = true;
      return;
    }
    if (trans && this.rendered) this.captureTransition(trans);
    this.applyRecipe(r);
  }

  private applyRecipe(next: Recipe) {
    const prev = this.r;
    this.r = next;
    // (a shared thumbnail engine renders many recipes: a trail never passes from one to the next)
    if (this.o.fixedSize) { this.xf.have = false; this.touch.reset(); this.demoT = NaN; }
    if (prev.glyph.cell !== next.glyph.cell || prev.glyph.aspect !== next.glyph.aspect) this.sizeDirty = true;
    if (prev.glyph.font !== next.glyph.font || prev.glyph.weight !== next.glyph.weight || prev.glyph.charset !== next.glyph.charset
      || prev.glyph.words !== next.glyph.words || prev.msg.text !== next.msg.text || prev.source !== next.source
      || prev.text.font !== next.text.font || prev.text.weight !== next.text.weight || prev.text.italic !== next.text.italic
      || prev.text.content !== next.text.content) void this.requestFonts();
    if (prev.source !== next.source) { this.mediaEl = null; this.mediaOK = false; }
    this.needsRender = true;
  }

  private applyPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.captureTransition(p.trans);
    this.applyRecipe(p.r);
  }

  private fontsFor(r: Recipe): Promise<unknown> {
    const sample = uniqueChars(r.glyph.charset + (r.msg.on ? r.msg.text : '') + (r.glyph.mode === 'words' ? r.glyph.words : '')).join('').slice(0, 200) || 'Aa';
    const jobs = [this.fonts.ensure(r.glyph.font, r.glyph.weight, false, sample)];
    if (r.source === 'text') jobs.push(this.fonts.ensure(r.text.font, r.text.weight, r.text.italic, r.text.content.slice(0, 120) || 'Aa'));
    return Promise.all(jobs).catch(() => undefined);
  }

  setFixedSize(width: number, height: number, pixelRatio: number) {
    const f = this.o.fixedSize;
    if (!f || (f.width === width && f.height === height && f.pixelRatio === pixelRatio)) return;
    this.o = { ...this.o, fixedSize: { width, height, pixelRatio } };
    this.sizeDirty = true;
    this.needsRender = true;
  }

  holdAdaptive(until: number) { this.adaptiveHold = until; }

  setQuality(q: PreviewQuality) {
    this.q = { ...q };
    this.fpsCap = this.maxFps();
    this.sizeDirty = true;
    this.needsRender = true;
  }

  /** Live frame-rate cap before slow frames lower it. */
  private maxFps() { return Math.max(SLOW_FPS, Math.min(FPS, this.q.maxFps || FPS)); }

  play() { if (!this.playing) { this.playing = true; this.needsRender = true; } }
  pause() { this.playing = false; this.needsRender = true; }

  setMedia(kind: MediaKind, el: MediaEl | null) {
    if (this.media[kind] !== el) this.mediaGen++;
    this.media[kind] = el;
    this.mediaEl = null;
    this.mediaFailed = null;
    this.mediaOK = false;
    this.needsRender = true;
  }
  hasMedia(kind: MediaKind) { return !!this.media[kind]; }

  async ready(): Promise<void> {
    await this.requestFonts();
    this.atlasKey = '';
    this.textKey = '';
  }

  renderAt(t: number, realT = t) {
    this.applyPending();
    this.t = t;
    const dt = realT - this.demoT;
    this.realT = realT;
    this.demoT = realT;
    this.render(this.demo(dt));
  }

  /** Fixed-size engines with «Cursor automático»: the ghost plays over frames that follow each other (see AsciiEngine.demo). */
  private demo(dt: number): number {
    const it = this.r.interact;
    if (!this.o.fixedSize || it.mode === 'none') return 0;
    this.touch.demo = it.auto;
    if (!(dt > 0 && dt <= 0.5)) {
      if (it.auto) {
        this.touch.reset(); this.sim.reset();
        Object.assign(this.ptr, { on: 0, targetOn: 0, lastReal: -1e9, impulse: 0, down: false });
        this.stepPointer(0, true);
        this.ptr.on = 1;
      }
      return 0;
    }
    this.stepPointer(dt, it.auto);
    this.stepTouch(dt);
    return dt;
  }

  /** A pointer event given by code (see AsciiEngine.gesture). */
  gesture(e: GestureInput) {
    const t = e.t ?? this.touch.now;
    const x = e.x * this.W, y = e.y * this.H;
    if ((e.id ?? 1) === 1) {
      const P = this.ptr;
      if (e.kind === 'down') { P.down = true; P.impulse = 1; }
      if (e.kind === 'up' || e.kind === 'cancel') P.down = false;
      if (e.kind === 'leave' || e.kind === 'cancel') P.targetOn = 0;
      else { if (P.targetOn === 0) { P.x = P.px = x; P.y = P.py = y; } P.tx = x; P.ty = y; P.targetOn = 1; }
      P.lastReal = this.realT;
      P.pressure = e.type === 'pen' ? e.pressure ?? 0.5 : -1;
    }
    this.touch.input({ kind: e.kind, id: e.id ?? 1, x, y, t, pressure: e.pressure, type: e.type ?? 'touch' });
    this.needsRender = true;
  }

  renderNow() { this.applyPending(); this.render(0); }

  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.renderNow();
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  readGrid(): GridSnapshot {
    this.renderNow();
    const n = this.cols * this.rows, s = this.sel;
    const table = this.atlas?.chars ?? [' '];
    const chars: string[] = new Array(n);
    for (let i = 0; i < n; i++) chars[i] = table[s.idx[i]] ?? ' ';
    return {
      cols: this.cols, rows: this.rows, chars, rgb: s.rgb.slice(0, n * 3), alpha: s.alpha.slice(0, n), lum: s.lum.slice(0, n),
      flags: s.flags.slice(0, n), bg: this.r.color.bg, cw: this.cw, ch: this.ch,
    };
  }

  /** Pixels of a region of the last frame (see AsciiEngine.snapshot). */
  async snapshot(sx: number, sy: number, sw: number, sh: number): Promise<ImageData | null> {
    sx = Math.max(0, Math.min(this.W - 1, Math.round(sx))); sy = Math.max(0, Math.min(this.H - 1, Math.round(sy)));
    sw = Math.max(1, Math.min(this.W - sx, Math.round(sw))); sh = Math.max(1, Math.min(this.H - sy, Math.round(sh)));
    try { return this.ctx.getImageData(sx, sy, sw, sh); } catch { return null; }
  }

  accent(): string {
    const c = sampleGradient(this.grad, 1);
    return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  setPointer(x: number, y: number, on: boolean) {
    this.ptr.tx = x * this.W; this.ptr.ty = y * this.H; this.ptr.targetOn = on ? 1 : 0; this.ptr.lastReal = this.realT;
  }

  destroy() {
    this.alive = false;
    this.pending = null;
    this.transLayer.release();
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.cleanup.forEach(f => f());
    this.cleanup = [];
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private requestFonts(): Promise<void> {
    const r = this.r;
    const gen = ++this.fontGen;
    const sample = uniqueChars(r.glyph.charset + (r.msg.on ? r.msg.text : '') + (r.glyph.mode === 'words' ? r.glyph.words : '')).join('').slice(0, 200) || 'Aa';
    const jobs = [this.fonts.ensure(r.glyph.font, r.glyph.weight, false, sample)];
    if (r.source === 'text') jobs.push(this.fonts.ensure(r.text.font, r.text.weight, r.text.italic, r.text.content.slice(0, 120) || 'Aa'));
    return Promise.all(jobs).then(() => {
      if (gen !== this.fontGen && this.alive) return;
      this.atlasKey = '';
      this.textKey = '';
      this.needsRender = true;
    });
  }

  /** A web font that lands after requestFonts() stopped waiting is drawn when it arrives (see engine.ts). */
  private watchLateFonts() {
    const set = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!set || typeof set.addEventListener !== 'function') return;
    const landed = () => { this.atlasKey = this.textKey = this.msgKey = this.wordsKey = ''; this.needsRender = true; };
    set.addEventListener('loadingdone', landed);
    this.cleanup.push(() => set.removeEventListener('loadingdone', landed));
  }

  private bindPointer() {
    this.hub = new PointerHub(this.canvas, {
      target: this.o.pointerTarget ?? 'canvas',
      wheelZoom: !!this.o.wheelZoom,
      size: () => [this.W, this.H],
      mode: () => this.r.interact.mode,
      ptr: this.ptr,
      touch: this.touch,
      realT: () => this.realT,
      wake: () => { this.needsRender = true; },
    });
    this.cleanup.push(() => this.hub?.destroy());
  }

  /* ---------------------------------------------------------------- */
  /* Frame loop                                                        */
  /* ---------------------------------------------------------------- */

  private loop = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) { this.lastFrame = 0; return; }
    if (this.pending && (this.pending.fonts || performance.now() - this.pending.since > PREP_BUDGET_MS)) this.applyPending();
    const interval = 1000 / this.fpsCap;
    if (this.lastFrame && now - this.lastFrame < interval - 2) return;
    const raw = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    const dt = Math.min(0.1, raw);
    this.lastFrame = now;
    this.realT += dt;
    if (this.trans >= 0 && !Number.isNaN(this.transStart)) this.transElapsed += Math.min(0.2, raw);
    if (this.playing) this.t += dt * this.r.motion.speed;
    const interactive = this.stepPointer(dt);
    const touching = this.stepTouch(dt);
    const video = this.r.source === 'video' || this.r.source === 'camera';
    const sim = SIM_MODES.includes(this.r.interact.mode) && this.realT - this.simLast < simSettle(this.r.interact);
    if (this.playing || this.needsRender || interactive || touching || video || sim || this.trans >= 0) {
      this.needsRender = false;
      const t0 = performance.now();
      const inTrans = this.trans >= 0;
      try {
        this.render(dt);
      } catch (e) {
        if (now - this.lastErr > 4000) { this.lastErr = now; this.o.onError?.((e as Error).message); }
      }
      this.measure(now, performance.now() - t0, inTrans);
    }
  };

  private measure(now: number, ms: number, inTrans = false) {
    this.frames++;
    if (now - this.fpsT > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0; this.fpsT = now;
      this.o.onStats?.(this.stats);
    }
    // the frames of a transition (the first one builds the new piece's glyphs) say nothing about the piece
    if (inTrans) return;
    this.ema = this.ema * 0.9 + ms * 0.1;
    if (!(this.q.adaptive ?? this.o.adaptive ?? true) || !this.playing) return;
    if (performance.now() < this.adaptiveHold) { this.slow = 0; return; }
    // never touch the grid or the resolution: only how often frames are drawn
    const top = this.maxFps();
    if (this.ema > 22) { this.slow++; this.fast = 0; } else if (this.ema < 12) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
    if (this.slow > 20 && this.fpsCap !== SLOW_FPS) { this.fpsCap = SLOW_FPS; this.slow = 0; }
    if (this.fast > 90 && this.fpsCap !== top) { this.fpsCap = top; this.fast = 0; }
  }

  /** The older pointer modes' pointer (see AsciiEngine.stepPointer). */
  private stepPointer(dt: number, demo = false): boolean {
    const P = this.ptr, it = this.r.interact;
    if (it.mode === 'none' || isTouchMode(it.mode)) return false;
    if (it.auto && (demo || this.realT - P.lastReal > 2.5)) {
      const [gx, gy] = legacyGhost(this.realT);
      P.tx = this.W * gx; P.ty = this.H * gy;
      P.targetOn = 1;
    }
    const sim = SIM_MODES.includes(it.mode);
    P.px = P.x; P.py = P.y;
    if (sim || P.on < 0.01) { P.x = P.tx; P.y = P.ty; }
    else { const k = Math.min(1, dt * 12); P.x += (P.tx - P.x) * k; P.y += (P.ty - P.y) * k; }
    P.moved = Math.hypot(P.x - P.px, P.y - P.py);
    const prevOn = P.on;
    P.on += (P.targetOn - P.on) * Math.min(1, dt * 7);
    return Math.abs(P.on - prevOn) > 0.001 || P.moved > 0.05 || P.impulse > 0;
  }

  /** The gesture modes' field, one frame on (see AsciiEngine.stepTouch). */
  private stepTouch(dt: number): boolean {
    const it = this.r.interact;
    if (!isTouchMode(it.mode)) return false;
    this.touch.configure(touchSettings(it), this.cols, this.rows, this.cw, this.ch, this.W, this.H);
    const busy = this.touch.step(dt);
    this.hub?.stepped();
    return busy || this.touch.version !== this.touchDrawn;
  }
  /** The touch field's version the last frame drew. */
  private touchDrawn = -1;

  /* ---------------------------------------------------------------- */
  /* Resource updates                                                  */
  /* ---------------------------------------------------------------- */

  private resize() {
    this.sizeDirty = false;
    const g = this.r.glyph;
    let pr: number;
    if (this.o.fixedSize) {
      this.cssW = this.o.fixedSize.width; this.cssH = this.o.fixedSize.height;
      pr = this.o.fixedSize.pixelRatio;
    } else {
      this.cssW = Math.max(1, this.canvas.clientWidth || 300);
      this.cssH = Math.max(1, this.canvas.clientHeight || 150);
      pr = Math.min(this.q.maxPixelRatio ?? 2, this.o.maxPixelRatio ?? 2, Math.max(1, window.devicePixelRatio || 1));
      const budget = Math.sqrt(BASIC_MAX_PIXELS / (this.cssW * this.cssH));
      if (pr > budget) pr = Math.max(Math.min(1, pr), budget);
    }
    if (this.cssW * pr > MAX_DIM || this.cssH * pr > MAX_DIM) pr = Math.min(MAX_DIM / this.cssW, MAX_DIM / this.cssH);
    this.pr = pr;
    const W = Math.max(1, Math.round(this.cssW * pr)), H = Math.max(1, Math.round(this.cssH * pr));
    if (W !== this.W || H !== this.H || !this.img) {
      this.W = W; this.H = H;
      if (this.canvas.width !== W) this.canvas.width = W;
      if (this.canvas.height !== H) this.canvas.height = H;
      this.img = this.ctx.createImageData(W, H);
      this.out32 = new Uint32Array(this.img.data.buffer);
      this.flat = null;
      this.revealKey = '';
      this.trans = -1;
    }
    this.cw = Math.max(2, Math.round(g.cell * pr));
    this.ch = Math.max(2, Math.round(g.cell * g.aspect * pr));
    const cols = Math.max(1, Math.ceil(this.W / this.cw)), rows = Math.max(1, Math.ceil(this.H / this.ch));
    if (cols !== this.cols || rows !== this.rows || this.field.n !== cols * rows) {
      this.cols = cols; this.rows = rows;
      const n = cols * rows;
      this.field = new FieldBuffers(n);
      this.sel = new SelectBuffers(n);
      this.bloomBuf = new Float32Array(n * 3); this.bloomTmp = new Float32Array(n * 3);
      this.sim.resize(cols, rows);
      this.msgKey = '';
      this.mediaKey = '';
    }
    this.textKey = '';
  }

  private updateAtlas() {
    const r = this.r, g = r.glyph;
    const extras = (r.msg.on ? r.msg.text : '') + (g.mode === 'words' ? g.words : '');
    const key = [g.charset, g.sort, g.font, g.weight, g.scale, this.cw, this.ch, uniqueChars(extras).sort().join('')].join('\u0001');
    if (key === this.atlasKey && this.atlas) return;
    this.atlasKey = key;
    this.atlas = buildAtlas({
      charset: g.charset, sort: g.sort, stack: this.fonts.stack(g.font), weight: g.weight, scale: g.scale * (fontById(g.font).fit ?? 1),
      cw: this.cw, ch: this.ch, extras, maxTex: MAX_DIM,
    }, this.atlasCanvas ?? undefined);
    this.atlasCanvas = this.atlas.canvas;
    const cv = this.atlas.canvas, w = cv.width, h = cv.height;
    const data = readPixels(cv, this.readCanvas());
    const cov = new Uint8Array(w * h);
    for (let i = 0; i < cov.length; i++) cov[i] = data[i * 4 + 3];
    this.glyphs = { cov, w, h, cols: this.atlas.cols, n: this.atlas.n };
    this.msgKey = '';
    this.wordsKey = '';
  }

  private updateGrad() {
    const key = this.r.color.stops.join(',');
    if (key === this.gradKey) return;
    this.gradKey = key;
    this.grad = bakeGradient(this.r.color.stops, 256);
  }

  private updateText() {
    if (this.r.source !== 'text') { this.textBuf = null; return; }
    const t = this.r.text;
    // letters that move are drawn again at each moment (see AsciiEngine.updateText)
    const anim = textAnimated(t) ? { time: pieceTime(this.t, this.r.motion), cols: this.cols, loop: this.r.motion.loop } : undefined;
    const key = JSON.stringify(t) + this.W + 'x' + this.H + (anim ? `|${anim.cols}|${anim.time}|${anim.loop}` : '');
    if (key === this.textKey && this.textBuf) return;
    this.textKey = key;
    this.textCanvas ??= document.createElement('canvas');
    drawTextSource(this.textCanvas, this.W, this.H, t, this.fonts.stack(t.font), anim);
    const { width: w, height: h } = this.textCanvas;
    const d = readPixels(this.textCanvas, this.readCanvas());
    const red = new Uint8Array(w * h);
    for (let i = 0; i < red.length; i++) red[i] = d[i * 4];
    this.textBuf = { data: red, w, h };
  }

  private updateMsg() {
    const m = this.r.msg;
    if (!m.on || !this.atlas) { this.msg = null; this.msgData = null; return; }
    const key = [m.text, m.mode === 'marquee', m.x, m.y, m.align, this.cols, this.rows, this.atlasKey].join('|');
    if (key !== this.msgKey || !this.msg) {
      this.msgKey = key;
      const idx = this.atlas.index;
      this.msg = layoutMessage(m.text, this.cols, this.rows, m.x, m.y, m.align, m.mode === 'marquee', c => idx.get(c) ?? this.atlas!.spaceIdx);
      this.msgAnimKey = '';
    }
    // letters that move are placed again at each moment (see AsciiEngine.updateMsg)
    const a = m.anim && m.anim.kind !== 'color' ? m.anim : null;
    const tq = pieceTime(this.t, this.r.motion), loop = this.r.motion.loop;
    const akey = a ? `${key}|${a.kind}|${a.amount}|${a.speed}|${tq}|${loop}` : key;
    if (akey === this.msgAnimKey && this.msgData) return;
    this.msgAnimKey = akey;
    this.msgData = a ? animateMessage(this.msg, a, tq, this.rows, scramblePool(this.atlas.n), loop) : this.msg.data;
  }

  private updateWords() {
    const g = this.r.glyph;
    if (g.mode !== 'words' || !this.atlas) return;
    const key = g.words + '|' + this.atlasKey;
    if (key === this.wordsKey) return;
    this.wordsKey = key;
    const chars = Array.from(g.words.replace(/\s+/g, ' ')).filter(c => c !== '\n');
    const list = chars.length ? chars : ['#'];
    this.words = Uint16Array.from(list, c => this.atlas!.index.get(c) ?? this.atlas!.spaceIdx);
  }

  private currentMedia(): MediaEl | null {
    const s = this.r.source;
    if (s === 'image' || s === 'video' || s === 'camera') return this.media[s] ?? null;
    return null;
  }

  /** Keeps a (downscaled) RGBA copy of the picture or the current video frame for the field pass. */
  private updateMedia() {
    const el = this.currentMedia();
    if (!el) { this.mediaOK = false; this.mediaBuf = null; return; }
    const isVideo = typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement;
    let natW: number, natH: number;
    if (isVideo) {
      if (el.readyState < 2 || !el.videoWidth) return;
      natW = el.videoWidth; natH = el.videoHeight;
    } else {
      const anyEl = el as { naturalWidth?: number; width: number; naturalHeight?: number; height: number };
      natW = anyEl.naturalWidth || anyEl.width || 1;
      natH = anyEl.naturalHeight || anyEl.height || 1;
    }
    // Pictures are copied once, at up to 2048 px like the GPU texture sees them (the four taps per cell then
    // alias the same way); video frames are copied every frame, so they get enough texels for the taps only.
    const want = isVideo
      ? Math.min(1024, Math.max(256, 4 * Math.max(this.cols, this.rows) * Math.max(1, this.r.media.zoom)))
      : 2048;
    const k = Math.min(1, want / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * k)), h = Math.max(1, Math.round(natH * k));
    const key = `${w}x${h}`;
    if (this.mediaEl === el && this.mediaOK && key === this.mediaKey && (!isVideo || (el as HTMLVideoElement).currentTime === this.mediaTime)) return;
    // a picture that cannot be read (cross-origin without CORS) fails the same way every frame: report once
    if (this.mediaFailed === el) return;
    try {
      this.mediaCanvas ??= document.createElement('canvas');
      const cv = this.mediaCanvas;
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      cx.clearRect(0, 0, w, h);
      cx.drawImage(el as CanvasImageSource, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      this.mediaBuf = { data, w, h, natW, natH };
      this.mediaEl = el;
      this.mediaKey = key;
      this.mediaTime = isVideo ? (el as HTMLVideoElement).currentTime : -1;
      this.mediaOK = true;
      this.revealKey = '';
    } catch (e) {
      this.mediaOK = false;
      this.mediaBuf = null;
      this.mediaEl = el;
      this.mediaFailed = el;
      this.o.onError?.('media: ' + (e as Error).message);
    }
  }

  /** The picture at canvas resolution, for media.reveal and erase-to-reveal. */
  private updateReveal(): Uint32Array | null {
    const r = this.r;
    const want = this.mediaOK && !this.transparent && ['image', 'video', 'camera'].includes(r.source)
      && (r.media.reveal > 0 || r.interact.mode === 'erase' || r.interact.mode === 'reveal');
    if (!want || !this.mediaBuf) { this.mediaPx = null; return null; }
    const el = this.mediaEl!, m = r.media;
    const key = [this.mediaKey, this.mediaTime, this.W, this.H, m.fit, m.zoom, m.panX, m.panY, m.mirror].join('|');
    if (key === this.revealKey && this.mediaPx) return this.mediaPx;
    this.revealKey = key;
    const { W, H } = this;
    this.revealCanvas ??= document.createElement('canvas');
    const cv = this.revealCanvas;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.fillStyle = '#000';
    cx.fillRect(0, 0, W, H);
    const map = new MediaMap().set(W, H, this.mediaBuf.natW, this.mediaBuf.natH, m.fit === 'cover' ? 0 : m.fit === 'contain' ? 1 : 2, m.zoom, m.panX, m.panY, m.mirror);
    const rc = map.rect(W, H);
    cx.imageSmoothingEnabled = true;
    if (rc.mirror) { cx.translate(rc.x + rc.w, rc.y); cx.scale(-1, 1); cx.drawImage(el as CanvasImageSource, 0, 0, rc.w, rc.h); }
    else cx.drawImage(el as CanvasImageSource, rc.x, rc.y, rc.w, rc.h);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    try {
      this.mediaPx = new Uint32Array(cx.getImageData(0, 0, W, H).data.buffer);
    } catch {
      this.mediaPx = null;
    }
    return this.mediaPx;
  }

  private reader: HTMLCanvasElement | null = null;
  /** Scratch canvas made for reading back (see readPixels). */
  private readCanvas(): HTMLCanvasElement {
    if (!this.reader) {
      this.reader = document.createElement('canvas');
      this.reader.getContext('2d', { willReadFrequently: true });
    }
    return this.reader;
  }

  /** Keeps the frame on screen (overlays and an ongoing transition included) to dissolve from. */
  private captureTransition(spec: TransitionSpec) {
    if (!this.img) return;
    this.transLayer.capture(this.canvas);
    this.trans = 0;
    this.transStart = NaN;
    this.transSpec = spec;
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  private runSim(dt: number) {
    const mode = this.r.interact.mode;
    if (mode !== this.simMode) { this.simMode = mode; this.sim.reset(); }
    if (!SIM_MODES.includes(mode)) return;
    const P = this.ptr, it = this.r.interact;
    const m = INTERACT.indexOf(mode);
    const auto = it.auto && this.realT - P.lastReal > 2.5;
    const active = Math.min(1.2, P.on > 0.2 ? (Math.min(1, P.moved / Math.max(2, this.cw * 0.5)) + (P.down ? 0.6 : 0) + (auto ? 0.5 : 0)) * pressureGain(P.pressure) : 0);
    const impulse = P.impulse * (P.on > 0.2 ? 1 : 0);
    if (active > 0 || impulse > 0) this.simLast = this.realT;
    const brushR = Math.max(4, it.radius * this.H * 0.5) * pressureRadius(P.pressure);
    // the GPU steps once per 1/60 s too (see AsciiEngine.runSim)
    const steps = dt > 0 ? Math.max(1, Math.min(4, Math.round(dt * 60))) : 1;
    const sdt = (dt || 1 / 60) / steps;
    const d = it.decay ?? 0.5;
    for (let s = 0; s < steps; s++) {
      this.sim.step(m, this.cw, this.ch, [P.px, P.py, P.x, P.y], brushR, it.strength, s === 0 ? active : 0, s === 0 ? impulse : 0, sdt, d);
    }
  }

  private render(dt: number) {
    const T0 = performance.now();
    if (this.sizeDirty) this.resize();
    this.updateAtlas();
    this.updateGrad();
    this.updateText();
    this.updateMsg();
    this.updateWords();
    this.updateMedia();
    if (this.trans >= 0) {
      // the clock starts with the first frame of the new piece
      if (Number.isNaN(this.transStart)) { this.transStart = this.realT; this.transElapsed = 0; }
      const shown = this.o.fixedSize ? this.realT - this.transStart : this.transElapsed;
      this.trans = shown / this.transSpec.duration;
      if (this.trans >= 1 || this.trans < 0) this.trans = -1;
    }
    this.runSim(dt);
    const r = this.r, P = this.ptr, it = this.r.interact;
    const src = SRC_OF(r, this.mediaOK);
    // the piece's time (stop motion, and with «Bucle perfecto» the loop's time: see loop.ts)
    const tq = pieceTime(this.t, r.motion), loop = r.motion.loop;
    const imode = INTERACT.indexOf(it.mode);
    const td = this.touch.data.length === this.cols * this.rows * 4 && isTouchMode(it.mode) ? this.touch.data : null;
    this.touchDrawn = this.touch.version;
    const ts = touchSettings(it);
    const pulse = pulseAt(r.motion, tq, this.externalPulse);
    const simOn = imode === 2 || imode === 6 || imode === 7;
    // transformations of the source (../xform.ts), with Estela's clock as the WebGL engine keeps it
    const stages = xformStages(activeXforms(r, src), this.cols, this.rows, this.ch / this.cw);
    const trail = trailStage(stages);
    let decay = 1;
    if (trail) {
      const key = `${src}|${this.mediaGen}`;
      if (key !== this.xf.key) { this.xf.key = key; this.xf.have = false; }
      const dt = this.xf.have ? Math.min(0.25, Math.max(0, this.realT - this.xf.t)) : 0;
      this.xf.t = this.realT;
      decay = trailDecay(dt, trail.k);
    } else this.xf.have = false;
    runField({
      W: this.W, H: this.H, cw: this.cw, ch: this.ch, cols: this.cols, rows: this.rows,
      time: tq, loop: r.motion.loop, layers: fieldLayers(r),
      warp: r.motion.warp, warpScale: r.motion.warpScale, pulse,
      src, mediaMix: r.media.mix, mediaBlend: Math.max(0, BLENDS.indexOf(r.media.blend)), morph: morphPeriod(r.text.morph, loop),
      media: this.mediaBuf, fit: r.media.fit === 'cover' ? 0 : r.media.fit === 'contain' ? 1 : 2,
      zoom: r.media.zoom, panX: r.media.panX, panY: r.media.panY, mirror: r.media.mirror,
      text: this.textBuf,
      imode, ptrX: P.x, ptrY: P.y, ptrOn: P.on, istr: it.strength, irad: it.radius, ptrDown: P.down ? 1 : 0,
      sim: simOn ? { h: this.sim.h, tr: this.sim.tr } : null,
      view: VIEW_MODES.includes(it.mode) ? this.touch.view : null,
      disp: it.mode === 'stretch' ? td : null,
      xform: stages.length ? { stages, state: this.xf, decay, times: ondularTimes(tq, loop) } : null,
    }, this.field);
    const T1 = performance.now();

    const a = this.atlas!, m = r.msg, lay = this.msg;
    let prog = 0, shift = 0, cursorX = -9, cursorY = -9, cursorOn = false;
    if (m.on && lay) {
      // with a loop, a whole number of the message's cycles fits in it
      const st = messageState(m, lay.count, loop > 0 ? loopTime(this.t, loop, messageCycle(m, lay.count, lay.width)) : this.t, lay.spans);
      prog = st.prog; shift = Math.floor(st.shift);
      if (st.cursorOn && st.cursor >= 0 && lay.cells.length) {
        const home = lay.cells[Math.min(lay.cells.length - 1, st.cursor)];
        const cell = m.anim ? movedCell(lay, m.anim, tq, this.rows, home, st.cursor, loop) : home;
        cursorX = cell[0]; cursorY = cell[1]; cursorOn = cell[0] >= 0;
      }
    }
    const ca = msgColorAnim(m);
    runSelect({
      cols: this.cols, rows: this.rows, time: tq, loop, r,
      fa: this.field.a, fr: this.field.r, fg: this.field.g, fb: this.field.b, isMedia: src === 'media',
      grad: this.grad, n: a.n, edgeBase: a.edgeBase, blockIdx: a.blockIdx, words: this.words,
      msg: {
        on: !!(m.on && lay), mode: ['static', 'type', 'decode', 'marquee', 'words'].indexOf(m.mode), prog, win: 6, shift,
        data: (lay && this.msgData) ?? new Uint8Array(4), width: lay?.width ?? 1, cursorX, cursorY, cursorOn,
        color: m.color ? hexToRgb(m.color) : null,
        anim: ca ? { speed: ca.speed, amount: ca.amount, time: msgColorTime(m, tq, loop) } : null,
      },
      imode, ptrCellX: P.x / this.cw, ptrCellY: P.y / this.ch, ptrOn: P.on, istr: it.strength, iradCells: (it.radius * this.H) / this.cw,
      touch: isMarkMode(it.mode) && td ? { data: td, mark: ts.glyphs === 'piece' ? 2 : 1, ink: ts.ink } : null,
      aspect: this.ch / this.cw,
    }, this.sel);
    const T2 = performance.now();

    // simplified preview (quality «Ligera»): none of the effects that cost a pass over every pixel
    const fx = this.q.simplify && !this.o.fixedSize ? { ...r.fx, curve: 0, chroma: 0, bloom: 0, grain: 0 } : r.fx;
    const bloom = fx.bloom > 0 && !this.transparent;
    if (bloom) blurGrid(this.sel, this.cols, this.rows, fx.bloom, this.bloomBuf, this.bloomTmp);
    const mediaPx = this.updateReveal();
    const hasMedia = this.mediaOK && ['image', 'video', 'camera'].includes(r.source);
    const ac = sampleGradient(this.grad, 1);
    const frame: ComposeFrame = {
      W: this.W, H: this.H, cw: this.cw, ch: this.ch, cols: this.cols, rows: this.rows,
      sel: this.sel, atlas: this.glyphs, bg: hexToRgb(r.color.bg), accent: ac, fx,
      msgBox: m.on ? m.box : 0, transparent: this.transparent,
      reveal: hasMedia ? r.media.reveal : 0, eraseReveal: hasMedia && it.mode === 'erase', simTr: this.sim.tr,
      touchReveal: it.mode === 'reveal' && td ? td : null, hasMedia,
      touchTile: isMarkMode(it.mode) && td ? { data: td, k: TOUCH_TILE } : null,
      mediaPx: hasMedia ? mediaPx : null, bloom: bloom ? this.bloomBuf : null,
      // (flicker and grain: the piece's time, or with a loop the loop's time, as COMPOSE_FS's uFxTime)
      realT: loop > 0 ? fold(this.t, loop) : this.t,
    };
    const pixelPost = needsPixelPost(frame);
    if (pixelPost) {
      // effects that move pixels: the whole post chain runs on the CPU
      if (!this.flat || this.flat.length !== this.W * this.H) this.flat = new Uint32Array(this.W * this.H);
      shadePass(frame, this.flat);
      postPass(frame, this.flat, this.out32);
    } else {
      shadePass(frame, this.out32);
      if (fx.grain > 0) grainPass(frame, this.out32);
    }
    const tf = this.trans >= 0 && this.transLayer.ready ? {
      W: this.W, H: this.H, cw: this.cw, ch: this.ch, cols: this.cols, rows: this.rows, n: a.n,
      spec: this.transSpec, p: this.trans, realT: this.realT, atlas: this.glyphs, bg: frame.bg, accent: ac,
    } : null;
    if (tf) { this.transLayer.cells(tf); this.transLayer.paintGlyphs(this.out32, tf); }
    this.ctx.putImageData(this.img!, 0, 0);
    if (tf?.spec.kind === 'mosaico') this.transLayer.mosaic(this.ctx, tf);
    if (!pixelPost && hasOverlays(frame)) drawOverlays(this.ctx, frame, this.overlayCache);
    if (tf) this.transLayer.drawOld(this.ctx, tf);
    this.rendered = true;
    this.ptr.impulse = 0;
    const T3 = performance.now();
    this.timings = { field: T1 - T0, select: T2 - T1, compose: T3 - T2, total: T3 - T0 };
  }
}
