import { buildAtlas, uniqueChars, type Atlas } from '../atlas';
import { BLENDS, cloneRecipe, type Recipe } from '../recipe';
import { fontById } from '../catalog';
import { bakeGradient, hexToRgb, sampleGradient } from '../color';
import { createFontLoader, type FontLoader } from '../fonts';
import type { EngineOptions, EngineStats, GridSnapshot, MediaKind } from '../engine';
import type { PatternLibrary } from '../glsl/patterns';
import type { MediaEl, Renderer } from '../renderer';
import { drawTextSource, layoutMessage, messageState, type MsgLayout } from '../text';
import { blurGrid, grainPass, needsPixelPost, postPass, shadePass, type ComposeFrame, type GlyphAtlas } from './compose';
import { drawOverlays, hasOverlays, type OverlayCache } from './overlays';
import {
  FieldBuffers, INTERACT_MODES, MediaMap, fieldLayers, heldTime, pulseAt, runField,
  type FieldSource, type MediaBuffer, type TextBuffer,
} from './field';
import { SelectBuffers, runSelect } from './select';
import { SimGrid } from './sim';

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
 * putImageData, so the character grid (readGrid) and the look match the GPU engine.
 * Differences: live frames are capped at 30 fps (15 when slow, with `adaptive`), the canvas is kept
 * under BASIC_MAX_PIXELS device pixels, and film grain uses a different random sequence.
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
  private wordsKey = '';
  private words = new Uint16Array(1);
  private gradKey = '';
  private grad: Uint8Array = new Uint8Array(4);

  // media
  private media: Partial<Record<MediaKind, MediaEl | null>> = {};
  private mediaEl: MediaEl | null = null;
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
  private transStart = 0;
  private prevFrame: Uint32Array | null = null;
  private rendered = false;
  private frames = 0; private fps = 0; private fpsT = 0; private ema = 8; private slow = 0; private fast = 0;
  private fpsCap = FPS;
  private fontGen = 0;
  private lastErr = 0;
  /** Cost of the last frame in ms, per pass (dev tools). */
  timings: BasicTimings = { field: 0, select: 0, compose: 0, total: 0 };

  private ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, px: -1e4, py: -1e4, on: 0, targetOn: 0, down: false, lastReal: -1e9, impulse: 0, moved: 0 };
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
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('canvas2d');
    this.ctx = ctx;
    if (opts.fixedSize) this.resize();
    void this.requestFonts();

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

  get recipe(): Recipe { return cloneRecipe(this.r); }
  get time() { return this.t; }
  set time(v: number) { this.t = v; this.needsRender = true; }
  get isPlaying() { return this.playing; }
  get stats(): EngineStats {
    return { cols: this.cols, rows: this.rows, fps: this.fps, pixelRatio: this.pr, width: this.W, height: this.H, ms: this.ema };
  }
  get glyphChars(): string[] { return this.atlas ? this.atlas.chars.slice() : []; }
  /** Current live frame-rate cap (30, or 15 when frames are slow). */
  get fpsLimit() { return this.fpsCap; }

  set(next: Recipe, o: { transition?: boolean } = {}) {
    if (o.transition && !this.o.reducedMotion && this.rendered) this.captureTransition();
    const prev = this.r;
    this.r = cloneRecipe(next);
    if (prev.glyph.cell !== next.glyph.cell || prev.glyph.aspect !== next.glyph.aspect) this.sizeDirty = true;
    if (prev.glyph.font !== next.glyph.font || prev.glyph.weight !== next.glyph.weight || prev.glyph.charset !== next.glyph.charset
      || prev.glyph.words !== next.glyph.words || prev.msg.text !== next.msg.text || prev.source !== next.source
      || prev.text.font !== next.text.font || prev.text.weight !== next.text.weight || prev.text.italic !== next.text.italic
      || prev.text.content !== next.text.content) void this.requestFonts();
    if (prev.source !== next.source) { this.mediaEl = null; this.mediaOK = false; }
    this.needsRender = true;
  }

  play() { if (!this.playing) { this.playing = true; this.needsRender = true; } }
  pause() { this.playing = false; this.needsRender = true; }

  setMedia(kind: MediaKind, el: MediaEl | null) {
    this.media[kind] = el;
    this.mediaEl = null;
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
    this.t = t;
    this.realT = realT;
    this.render(0);
  }

  renderNow() { this.render(0); }

  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.render(0);
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  readGrid(): GridSnapshot {
    this.render(0);
    const n = this.cols * this.rows, s = this.sel;
    const table = this.atlas?.chars ?? [' '];
    const chars: string[] = new Array(n);
    for (let i = 0; i < n; i++) chars[i] = table[s.idx[i]] ?? ' ';
    return {
      cols: this.cols, rows: this.rows, chars, rgb: s.rgb.slice(0, n * 3), alpha: s.alpha.slice(0, n), lum: s.lum.slice(0, n),
      flags: s.flags.slice(0, n), bg: this.r.color.bg, cw: this.cw, ch: this.ch,
    };
  }

  accent(): string {
    const c = sampleGradient(this.grad, 1);
    return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  setPointer(x: number, y: number, on: boolean) {
    this.ptr.tx = x * this.W; this.ptr.ty = y * this.H; this.ptr.targetOn = on ? 1 : 0; this.ptr.lastReal = performance.now();
  }

  destroy() {
    this.alive = false;
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

  private bindPointer() {
    const target = this.o.pointerTarget ?? 'canvas';
    const pos = (e: PointerEvent) => {
      const rc = this.canvas.getBoundingClientRect();
      if (!rc.width || !rc.height) return null;
      const x = ((e.clientX - rc.left) * this.W) / rc.width, y = ((e.clientY - rc.top) * this.H) / rc.height;
      return { x, y, inside: x >= 0 && y >= 0 && x <= this.W && y <= this.H };
    };
    const move = (e: PointerEvent) => {
      const p = pos(e); if (!p) return;
      const P = this.ptr;
      if (P.targetOn === 0 && p.inside) { P.x = P.px = p.x; P.y = P.py = p.y; }
      P.tx = p.x; P.ty = p.y; P.targetOn = p.inside ? 1 : 0; P.lastReal = performance.now();
      if (this.r.interact.mode !== 'none') this.needsRender = true;
    };
    const down = (e: PointerEvent) => { move(e); this.ptr.down = true; this.ptr.impulse = 1; };
    const up = () => { this.ptr.down = false; };
    const leave = (e: PointerEvent) => { if (e.pointerType !== 'mouse') this.ptr.down = false; this.ptr.targetOn = 0; };
    const opts: AddEventListenerOptions = { passive: true };
    if (target === 'canvas') {
      const c = this.canvas;
      c.addEventListener('pointermove', move, opts);
      c.addEventListener('pointerdown', down, opts);
      c.addEventListener('pointerup', up, opts);
      c.addEventListener('pointercancel', leave, opts);
      c.addEventListener('pointerleave', leave, opts);
      this.cleanup.push(() => {
        c.removeEventListener('pointermove', move); c.removeEventListener('pointerdown', down);
        c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', leave); c.removeEventListener('pointerleave', leave);
      });
    } else {
      const out = (e: MouseEvent) => { if (!e.relatedTarget) this.ptr.targetOn = 0; };
      const blur = () => { this.ptr.targetOn = 0; };
      window.addEventListener('pointermove', move, opts);
      window.addEventListener('pointerdown', down, opts);
      window.addEventListener('pointerup', up, opts);
      document.addEventListener('mouseout', out);
      window.addEventListener('blur', blur);
      this.cleanup.push(() => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down);
        window.removeEventListener('pointerup', up); document.removeEventListener('mouseout', out); window.removeEventListener('blur', blur);
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Frame loop                                                        */
  /* ---------------------------------------------------------------- */

  private loop = (now: number) => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) { this.lastFrame = 0; return; }
    const interval = 1000 / this.fpsCap;
    if (this.lastFrame && now - this.lastFrame < interval - 2) return;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    this.realT += dt;
    if (this.playing) this.t += dt * this.r.motion.speed;
    const interactive = this.stepPointer(dt, now);
    const video = this.r.source === 'video' || this.r.source === 'camera';
    const sim = ['ripple', 'erase', 'paint'].includes(this.r.interact.mode);
    if (this.playing || this.needsRender || interactive || video || sim || this.trans >= 0) {
      this.needsRender = false;
      const t0 = performance.now();
      try {
        this.render(dt);
      } catch (e) {
        if (now - this.lastErr > 4000) { this.lastErr = now; this.o.onError?.((e as Error).message); }
      }
      this.measure(now, performance.now() - t0);
    }
  };

  private measure(now: number, ms: number) {
    this.frames++;
    this.ema = this.ema * 0.9 + ms * 0.1;
    if (now - this.fpsT > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0; this.fpsT = now;
      this.o.onStats?.(this.stats);
    }
    if (!(this.o.adaptive ?? true) || !this.playing) return;
    // never touch the grid or the resolution: only how often frames are drawn
    if (this.ema > 22) { this.slow++; this.fast = 0; } else if (this.ema < 12) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
    if (this.slow > 20 && this.fpsCap !== SLOW_FPS) { this.fpsCap = SLOW_FPS; this.slow = 0; }
    if (this.fast > 90 && this.fpsCap !== FPS) { this.fpsCap = FPS; this.fast = 0; }
  }

  private stepPointer(dt: number, now: number): boolean {
    const P = this.ptr, it = this.r.interact;
    if (it.mode === 'none') return false;
    if (it.auto && now - P.lastReal > 2500) {
      const s = this.realT * 0.35;
      P.tx = this.W * (0.5 + 0.32 * Math.sin(s * 1.3)); P.ty = this.H * (0.5 + 0.28 * Math.sin(s * 1.7 + 1.2));
      P.targetOn = 1;
    }
    const sim = it.mode === 'ripple' || it.mode === 'erase' || it.mode === 'paint';
    P.px = P.x; P.py = P.y;
    if (sim || P.on < 0.01) { P.x = P.tx; P.y = P.ty; }
    else { const k = Math.min(1, dt * 12); P.x += (P.tx - P.x) * k; P.y += (P.ty - P.y) * k; }
    P.moved = Math.hypot(P.x - P.px, P.y - P.py);
    const prevOn = P.on;
    P.on += (P.targetOn - P.on) * Math.min(1, dt * 7);
    return Math.abs(P.on - prevOn) > 0.001 || P.moved > 0.05 || P.impulse > 0;
  }

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
      pr = Math.min(this.o.maxPixelRatio ?? 2, Math.max(1, window.devicePixelRatio || 1));
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
      this.trans = -1; this.prevFrame = null;
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
    const key = JSON.stringify(t) + this.W + 'x' + this.H;
    if (key === this.textKey && this.textBuf) return;
    this.textKey = key;
    this.textCanvas ??= document.createElement('canvas');
    drawTextSource(this.textCanvas, this.W, this.H, t, this.fonts.stack(t.font));
    const { width: w, height: h } = this.textCanvas;
    const d = readPixels(this.textCanvas, this.readCanvas());
    const red = new Uint8Array(w * h);
    for (let i = 0; i < red.length; i++) red[i] = d[i * 4];
    this.textBuf = { data: red, w, h };
  }

  private updateMsg() {
    const m = this.r.msg;
    if (!m.on || !this.atlas) { this.msg = null; return; }
    const key = [m.text, m.mode === 'marquee', m.x, m.y, m.align, this.cols, this.rows, this.atlasKey].join('|');
    if (key === this.msgKey && this.msg) return;
    this.msgKey = key;
    const idx = this.atlas.index;
    this.msg = layoutMessage(m.text, this.cols, this.rows, m.x, m.y, m.align, m.mode === 'marquee', c => idx.get(c) ?? this.atlas!.spaceIdx);
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
      this.o.onError?.('media: ' + (e as Error).message);
    }
  }

  /** The picture at canvas resolution, for media.reveal and erase-to-reveal. */
  private updateReveal(): Uint32Array | null {
    const r = this.r;
    const want = this.mediaOK && !this.transparent && ['image', 'video', 'camera'].includes(r.source)
      && (r.media.reveal > 0 || r.interact.mode === 'erase');
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

  private captureTransition() {
    if (!this.img) return;
    this.prevFrame = this.out32.slice();
    this.trans = 0;
    this.transStart = this.realT;
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  private runSim(dt: number) {
    const mode = this.r.interact.mode;
    if (mode !== this.simMode) { this.simMode = mode; this.sim.reset(); }
    const simulate = mode === 'ripple' || mode === 'erase' || mode === 'paint';
    if (!simulate) return;
    const P = this.ptr, it = this.r.interact;
    const m = INTERACT_MODES.indexOf(mode);
    const auto = it.auto && performance.now() - P.lastReal > 2500;
    const active = Math.min(1.2, P.on > 0.2 ? Math.min(1, P.moved / Math.max(2, this.cw * 0.5)) + (P.down ? 0.6 : 0) + (auto ? 0.5 : 0) : 0);
    const impulse = P.impulse * (P.on > 0.2 ? 1 : 0);
    const brushR = Math.max(4, it.radius * this.H * 0.5);
    // the GPU steps once per displayed frame (~60 Hz); keep the same wave speed at 30 or 15 fps
    const steps = dt > 0 ? Math.max(1, Math.min(4, Math.round(dt * 60))) : 1;
    const sdt = (dt || 1 / 60) / steps;
    for (let s = 0; s < steps; s++) {
      this.sim.step(m, this.cw, this.ch, [P.px, P.py, P.x, P.y], brushR, it.strength, s === 0 ? active : 0, s === 0 ? impulse : 0, sdt);
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
      this.trans = (this.realT - this.transStart) / 0.85;
      if (this.trans >= 1) { this.trans = -1; this.prevFrame = null; }
    }
    this.runSim(dt);
    const r = this.r, P = this.ptr, it = this.r.interact;
    const src = SRC_OF(r, this.mediaOK);
    const tq = heldTime(this.t, r.motion.hold);
    const imode = INTERACT_MODES.indexOf(it.mode);
    const pulse = pulseAt(r.motion, tq, this.externalPulse);
    const simOn = imode === 2 || imode === 6 || imode === 7;
    runField({
      W: this.W, H: this.H, cw: this.cw, ch: this.ch, cols: this.cols, rows: this.rows,
      time: tq, loop: r.motion.loop, layers: fieldLayers(r),
      warp: r.motion.warp, warpScale: r.motion.warpScale, pulse,
      src, mediaMix: r.media.mix, mediaBlend: Math.max(0, BLENDS.indexOf(r.media.blend)), morph: r.text.morph,
      media: this.mediaBuf, fit: r.media.fit === 'cover' ? 0 : r.media.fit === 'contain' ? 1 : 2,
      zoom: r.media.zoom, panX: r.media.panX, panY: r.media.panY, mirror: r.media.mirror,
      text: this.textBuf,
      imode, ptrX: P.x, ptrY: P.y, ptrOn: P.on, istr: it.strength, irad: it.radius,
      sim: simOn ? { h: this.sim.h, tr: this.sim.tr } : null,
    }, this.field);
    const T1 = performance.now();

    const a = this.atlas!, m = r.msg, lay = this.msg;
    let prog = 0, shift = 0, cursorX = -9, cursorY = -9, cursorOn = false;
    if (m.on && lay) {
      const st = messageState(m, lay.count, this.t);
      prog = st.prog; shift = Math.floor(st.shift);
      if (st.cursorOn && st.cursor >= 0 && lay.cells.length) {
        const cell = lay.cells[Math.min(lay.cells.length - 1, st.cursor)];
        cursorX = cell[0]; cursorY = cell[1]; cursorOn = true;
      }
    }
    runSelect({
      cols: this.cols, rows: this.rows, time: tq, r,
      fa: this.field.a, fr: this.field.r, fg: this.field.g, fb: this.field.b, isMedia: src === 'media',
      grad: this.grad, n: a.n, edgeBase: a.edgeBase, blockIdx: a.blockIdx, words: this.words,
      msg: {
        on: !!(m.on && lay), mode: ['static', 'type', 'decode', 'marquee'].indexOf(m.mode), prog, win: 6, shift,
        data: lay?.data ?? new Uint8Array(4), width: lay?.width ?? 1, cursorX, cursorY, cursorOn,
        color: m.color ? hexToRgb(m.color) : null,
      },
      imode, ptrCellX: P.x / this.cw, ptrCellY: P.y / this.ch, ptrOn: P.on, istr: it.strength, iradCells: (it.radius * this.H) / this.cw,
      aspect: this.ch / this.cw,
    }, this.sel);
    const T2 = performance.now();

    const fx = r.fx;
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
      mediaPx: hasMedia ? mediaPx : null, bloom: bloom ? this.bloomBuf : null,
      realT: this.realT, trans: this.prevFrame ? this.trans : -1, prev: this.prevFrame,
    };
    const pixelPost = needsPixelPost(frame);
    if (pixelPost) {
      // effects that move pixels: the whole post chain runs on the CPU
      if (!this.flat || this.flat.length !== this.W * this.H) this.flat = new Uint32Array(this.W * this.H);
      shadePass(frame, this.flat);
      postPass(frame, this.flat, this.out32);
    } else {
      shadePass(frame, this.out32);
      if (r.fx.grain > 0) grainPass(frame, this.out32);
    }
    this.ctx.putImageData(this.img!, 0, 0);
    if (!pixelPost && hasOverlays(frame)) drawOverlays(this.ctx, frame, this.overlayCache);
    this.rendered = true;
    this.ptr.impulse = 0;
    const T3 = performance.now();
    this.timings = { field: T1 - T0, select: T2 - T1, compose: T3 - T2, total: T3 - T0 };
  }
}
