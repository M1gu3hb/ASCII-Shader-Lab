import { buildAtlas, uniqueChars, type Atlas } from './atlas';
import { BLENDS, INTERACT, cloneRecipe, type Recipe } from './recipe';
import { figureFit, fontById } from './catalog';
import { bakeGradient, hexToRgb, sampleGradient } from './color';
import { createFontLoader, type FontLoader } from './fonts';
import {
  compileProgram, createTex, dropProgram, fboFor, finishProgram, halfFloatRenderable, loc, programDone, resizeTex, startProgram,
  type PendingProgram, type Program, type Tex,
} from './gl';
import { BLUR_FS, COMPOSE_FS, SELECT_FS, SIM_FS, VERT, buildFieldShader, fieldKey, type FieldSource } from './glsl/programs';
import type { PatternLibrary } from './glsl/patterns';
import { drawTextSource, layoutMessage, messageCycle, messageState, textAnimated, type MsgLayout } from './text';
import { XFORM_FS } from './glsl/xform';
import { XF_COPY, XF_MEDIA, XF_TEXT, XF_TRAIL, activeXforms, needsPattern, trailDecay, trailStage, xformStages, type XformStage } from './xform';
import { animateMessage, movedCell, msgColorAnim, msgColorTime, scramblePool } from './letters';
import { fold, morphPeriod, loopTime, ondularTimes, pieceTime, wordsRate } from './loop';
import type { PreviewQuality, Renderer } from './renderer';
import { DEFAULT_TRANSITION, TRANSITION_INDEX, transitionOf, type TransitionSpec } from './transitions';
import { GRID_MODES, TOUCH_TILE, VIEW_MODES, TouchField, eraseRate, isMarkMode, isTouchMode, paintRate, touchSettings } from './touch';
import { PointerHub, SIM_MODES, legacyGhost, pressureGain, pressureRadius, simSettle } from './pointer';

export type MediaKind = 'image' | 'video' | 'camera';
type MediaEl = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

export interface EngineOptions {
  /** GLSL pattern chunks available to this engine (see glsl/patterns.ts). */
  library: PatternLibrary;
  fonts?: FontLoader;
  /** Load missing fonts from Google Fonts (exported code). */
  googleFonts?: boolean;
  maxPixelRatio?: number;
  /** Lower the resolution automatically when frames are slow. */
  adaptive?: boolean;
  /** Offscreen/export engines have a fixed size instead of following the element. */
  fixedSize?: { width: number; height: number; pixelRatio: number };
  interactive?: boolean;
  pointerTarget?: 'canvas' | 'window';
  /**
   * «Zoom con los dedos»: a plain wheel over the canvas zooms too (the studio's stage, which never scrolls).
   * Without it only Ctrl + wheel (a trackpad pinch) does, and a page with the piece in it keeps scrolling.
   */
  wheelZoom?: boolean;
  autoplay?: boolean;
  reducedMotion?: boolean;
  preserveDrawingBuffer?: boolean;
  alpha?: boolean;
  /** Stop rendering while the canvas is scrolled out of view. */
  observeVisibility?: boolean;
  /** Offscreen engines read their frames back often (thumbnails): the basic engine then keeps its canvas in memory. */
  readback?: boolean;
  onError?: (msg: string) => void;
  onStats?: (s: EngineStats) => void;
}

export interface EngineStats { cols: number; rows: number; fps: number; pixelRatio: number; width: number; height: number; ms: number }

/** A pointer event given by code (see Renderer.gesture). */
export interface GestureInput {
  kind: 'down' | 'move' | 'up' | 'cancel' | 'leave';
  x: number;
  y: number;
  /** Seconds on the gesture clock (absent: now). */
  t?: number;
  /** Pointer id (1: the primary pointer, which the older modes follow too). */
  id?: number;
  type?: 'mouse' | 'pen' | 'touch';
  pressure?: number;
}

export interface GridSnapshot {
  cols: number;
  rows: number;
  chars: string[];      // per cell, row-major from top-left
  rgb: Uint8Array;      // per cell colour (3 bytes)
  alpha: Uint8Array;    // glyph visibility
  lum: Uint8Array;      // luminance (for cell fills)
  flags: Uint8Array;    // 1 = message cell
  bg: string;
  cw: number;
  ch: number;
}

const SRC_OF = (r: Recipe, hasMedia: boolean): FieldSource =>
  r.source === 'text' ? 'text' : r.source === 'pattern' ? 'pattern' : hasMedia ? 'media' : 'pattern';

/** Longest a live change waits for its shader and fonts before it is shown anyway (the old piece keeps moving meanwhile). */
const PREP_BUDGET_MS = 700;

/** A change a live engine is getting ready for (see set()). */
interface Pending {
  r: Recipe;
  trans: TransitionSpec | null;
  /** When the first change still waiting was asked for: the budget runs from there. */
  since: number;
  frames: number;
  key: string;
  prog: PendingProgram | null;
  /** Fence after the compile: once passed, asking for the program's status does not wait (without the extension). */
  compiled: WebGLSync | null;
  /** Fence after a first draw with the new program (drivers that compile at the first draw do it then). */
  warm: WebGLSync | null;
  fonts: boolean;
}

/** Whether the GPU got past a fence (never blocks; WebGL updates the status between tasks). */
const passed = (gl: WebGL2RenderingContext, sync: WebGLSync | null) => !sync || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED;

export class AsciiEngine implements Renderer {
  readonly kind = 'webgl2' as const;
  readonly canvas: HTMLCanvasElement;
  private gl!: WebGL2RenderingContext;
  private o: EngineOptions;
  private r: Recipe;
  private fonts: FontLoader;
  private lib: PatternLibrary;

  // gl resources
  private quad!: WebGLBuffer;
  private vao!: WebGLVertexArrayObject;
  private progs = new Map<string, Program>();
  /** Compilation failures belong to this GL context: never retry them on every frame. */
  private failedPrograms = new Set<string>();
  private pSim!: Program; private pSel!: Program; private pBlur!: Program; private pComp!: Program;
  private tField!: Tex; private fbField!: WebGLFramebuffer;
  private tSelC!: Tex; private tSelG!: Tex; private fbSel!: WebGLFramebuffer;
  private tSim: Tex[] = []; private fbSim: WebGLFramebuffer[] = []; private simIdx = 0;
  private tBloomA!: Tex; private tBloomB!: Tex; private fbBloomA!: WebGLFramebuffer; private fbBloomB!: WebGLFramebuffer;
  private tAtlas!: Tex; private tGrad!: Tex; private tMedia!: Tex; private tText!: Tex; private tMsg!: Tex; private tWords!: Tex;
  /** The frame a transition dissolves from; two, so a new transition can start from one in progress. */
  private prevT: Array<Tex | null> = [null, null]; private prevFb: Array<WebGLFramebuffer | null> = [null, null]; private prevIdx = 0;
  /** 1×1 target for warm-up draws of a new program. */
  private tWarm!: Tex; private fbWarm!: WebGLFramebuffer;
  /**
   * Transformations of the source (xform.ts): their program (compiled the first time a piece uses one),
   * two grids they write in turn, the pattern's values (Desplazar) and Estela's trail and last input.
   */
  private pXf: Program | null = null;
  private xf: { size: string; grid: Tex[]; fbGrid: WebGLFramebuffer[]; pat: Tex; fbPat: WebGLFramebuffer; trail: Tex[]; fbTrail: WebGLFramebuffer[]; prev: Tex[]; fbPrev: WebGLFramebuffer[] } | null = null;
  /** Estela's state: which trail and input buffers are current, whether they hold a frame yet, and when. */
  private trail = { i: 0, have: false, t: 0, key: '' };
  /** The transformation program did not compile here: pieces show their source untransformed. */
  private xfBroken = false;
  /** Bumped when a media element changes (a new picture starts a new trail). */
  private mediaGen = 0;
  private halfFloat = false;
  private maxTex = 4096;
  /** KHR_parallel_shader_compile, when the browser has it: shaders compile without blocking. */
  private parallel: unknown = null;
  private pending: Pending | null = null;
  private q: PreviewQuality = {};
  private adaptiveHold = 0;

  // sizes
  private cssW = 1; private cssH = 1; private pr = 1; private prCap = 1;
  private W = 1; private H = 1; private cw = 8; private ch = 11; private cols = 1; private rows = 1;

  // state
  private atlas: Atlas | null = null;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private atlasKey = '';
  private textCanvas: HTMLCanvasElement | null = null;
  private textKey = '';
  private msg: MsgLayout | null = null;
  private msgKey = '';
  /** The message as last uploaded when its letters move (see letters.ts). */
  private msgAnimKey = '';
  private wordsKey = '';
  private wordsN = 1;
  private gradKey = '';
  private grad: Uint8Array = new Uint8Array(4);
  private media: Partial<Record<MediaKind, MediaEl | null>> = {};
  private mediaUploaded: MediaEl | null = null;
  private mediaTime = -1;
  private mediaW = 1; private mediaH = 1; private mediaOK = false;
  private simMode = '';

  private t = 0;
  private realT = 0;
  private playing: boolean;
  private raf = 0;
  private last = 0;
  private lastDraw = 0;
  private alive = true;
  private lost = false;
  private visible = true;
  private needsRender = true;
  private sizeDirty = true;
  private trans = -1;
  /** realT of the transition's first frame (NaN until that frame is drawn). */
  private transStart = NaN;
  /**
   * Seconds of transition shown on a live canvas. Each frame adds its real interval up to 0.2 s: a slow
   * device still sees the transition in about its time, and one long stall cannot swallow it.
   */
  private transElapsed = 0;
  private transSpec: TransitionSpec = DEFAULT_TRANSITION;
  private frames = 0; private fps = 0; private fpsT = 0; private ema = 16; private slow = 0; private fast = 0;
  private fontGen = 0;

  private ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, px: -1e4, py: -1e4, on: 0, targetOn: 0, down: false, lastReal: -1e9, impulse: 0, moved: 0, pressure: -1 };
  /** The gesture modes' field (engine/touch.ts), shared code with the basic engine. */
  private touch = new TouchField();
  private tTouch!: Tex;
  private touchVer = -1;
  /** Pointer events → the legacy pointer and the touch field (engine/pointer.ts). */
  private hub: PointerHub | null = null;
  /** realT of the last frame the pointer simulation (Ondas, Borrador, Pincel) had something to do. */
  private simLast = -1e9;
  /** Fixed-size engines: realT of the last renderAt (the ghost plays when frames follow each other). */
  private demoT = NaN;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private cleanup: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions) {
    this.canvas = canvas;
    this.o = opts;
    this.lib = opts.library;
    this.r = cloneRecipe(recipe);
    this.fonts = opts.fonts ?? createFontLoader({ google: opts.googleFonts ?? true });
    this.playing = (opts.autoplay ?? true) && !opts.reducedMotion;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: opts.alpha ?? false, premultipliedAlpha: false, depth: false, stencil: false,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.initGL();
    if (opts.fixedSize) this.resize();
    this.requestFonts();
    this.watchLateFonts();

    const onLost = (e: Event) => {
      e.preventDefault();
      this.lost = true;
      // what was being prepared belongs to the context that went away: the recipe is kept, not its shader
      const p = this.pending;
      this.pending = null;
      this.trans = -1;
      if (p) this.applyRecipe(p.r);
    };
    const onRestored = () => { this.lost = false; this.progs.clear(); this.failedPrograms.clear(); this.initGL(); this.invalidate(); };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    this.cleanup.push(() => { canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored); });

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
  get busy() { return !!this.pending || this.trans >= 0; }

  /**
   * A live engine keeps drawing the current piece while the new one gets ready: its field shader compiles
   * (without blocking when KHR_parallel_shader_compile is there), is drawn once off screen so drivers that
   * compile at the first draw do it then, and, for a transition, its fonts load. Then the new piece shows
   * and the transition's clock starts with its first frame, so a slow compile never eats the transition.
   * Never waits longer than PREP_BUDGET_MS. Changes that arrive meanwhile replace the one waiting.
   */
  set(next: Recipe, o: { transition?: boolean | TransitionSpec } = {}) {
    const trans = this.o.reducedMotion ? null : transitionOf(o.transition);
    const r = cloneRecipe(next);
    if (this.o.fixedSize || this.lost || !this.atlas) {
      this.dropPending();
      if (trans && this.atlas && !this.lost) this.captureTransition(trans);
      this.applyRecipe(r);
      return;
    }
    const key = this.fieldKeyOf(r);
    const needProg = !this.progs.has(key) && !this.failedPrograms.has(key);
    let p = this.pending;
    if (!p && !trans && !needProg) { this.applyRecipe(r); return; }
    if (!p) p = this.pending = { r, trans, since: performance.now(), frames: 0, key, prog: null, compiled: null, warm: null, fonts: false };
    else {
      if (p.key !== key) { this.dropPendingGL(p); p.key = key; p.frames = 0; }
      p.r = r;
      p.trans = trans ?? p.trans;
      p.fonts = false;
    }
    if (needProg && !p.prog) {
      try {
        p.prog = startProgram(this.gl, VERT, this.fieldSource(r, key));
        p.compiled = this.fence();
      } catch (error) { this.failProgram(key, error); }
    }
    const want = p;
    void this.fontsFor(r).then(() => { if (this.pending === want && want.r === r) want.fonts = true; });
    this.needsRender = true;
  }

  private applyRecipe(next: Recipe) {
    const prev = this.r;
    this.r = next;
    // (a shared thumbnail engine renders many recipes: no trail, no gesture passes from one to the next)
    if (this.o.fixedSize) { this.trail.have = false; this.touch.reset(); this.demoT = NaN; }
    if (prev.glyph.cell !== next.glyph.cell || prev.glyph.aspect !== next.glyph.aspect) this.sizeDirty = true;
    if (prev.glyph.font !== next.glyph.font || prev.glyph.weight !== next.glyph.weight || prev.glyph.charset !== next.glyph.charset
      || prev.glyph.words !== next.glyph.words || prev.msg.text !== next.msg.text || prev.source !== next.source
      || prev.text.font !== next.text.font || prev.text.weight !== next.text.weight || prev.text.italic !== next.text.italic
      || prev.text.content !== next.text.content) this.requestFonts();
    if (prev.source !== next.source) { this.mediaUploaded = null; this.mediaOK = false; }
    this.needsRender = true;
  }

  private dropPendingGL(p: Pending) {
    if (p.prog) { try { dropProgram(this.gl, p.prog); } catch { /* context gone */ } p.prog = null; }
    for (const k of ['compiled', 'warm'] as const) {
      const f = p[k];
      if (f) { try { this.gl.deleteSync(f); } catch { /* context gone */ } p[k] = null; }
    }
  }

  private fence(): WebGLSync | null {
    const f = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.gl.flush();
    return f;
  }

  private dropPending() {
    if (this.pending) this.dropPendingGL(this.pending);
    this.pending = null;
  }

  /** Checks on the change being prepared (once per display frame) and shows it once it is ready. */
  private stepPending(now: number) {
    const p = this.pending!, gl = this.gl;
    const over = now - p.since > PREP_BUDGET_MS;
    p.frames++;
    if (p.prog) {
      // without the extension the status query blocks until the GPU process has compiled it: after the fence
      const done = this.parallel ? programDone(gl, p.prog, this.parallel) : passed(gl, p.compiled);
      if (!done && !over) return;
      this.adoptProgram(p);
      if (!over && !this.lost) p.warm = this.warmUp(p.key);
      if (!over) return;
    }
    if (p.warm && !over && !passed(gl, p.warm)) return;
    if (p.trans && !p.fonts && !over) return;
    this.applyPending();
  }

  /** The pending program, checked (this waits for the driver if it is not done yet) and cached. */
  private adoptProgram(p: Pending) {
    const pp = p.prog;
    if (!pp) return;
    p.prog = null;
    try {
      this.cacheProgram(p.key, finishProgram(this.gl, pp));
    } catch (e) {
      this.failProgram(p.key, e);
    }
  }

  /** One draw with a new program into a 1×1 target, and a fence to know when the GPU got through it. */
  private warmUp(key: string): WebGLSync | null {
    const prog = this.progs.get(key), gl = this.gl;
    if (!prog) return null;
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbWarm);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(prog.prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return sync;
  }

  /**
   * Fixed-size engines (exports, thumbnails): compiles the current recipe's field shader ahead of the
   * first render without blocking (see set()), so rendering does not wait for the driver (at most 2 s).
   */
  private async compileAhead() {
    if (this.lost) return;
    const gl = this.gl, key = this.fieldKeyOf(this.r);
    if (this.progs.has(key) || this.failedPrograms.has(key)) return;
    let pp: PendingProgram;
    try { pp = startProgram(gl, VERT, this.fieldSource(this.r, key)); } catch (error) { this.failProgram(key, error); return; }
    const compiled = this.fence();
    const t0 = performance.now(), later = () => new Promise(res => setTimeout(res, 16));
    await later();
    while (this.alive && !this.lost && (this.parallel ? !programDone(gl, pp, this.parallel) : !passed(gl, compiled)) && performance.now() - t0 < 2000) await later();
    if (compiled && !this.lost) gl.deleteSync(compiled);
    if (!this.alive || this.lost) return;
    if (this.progs.has(key)) { dropProgram(gl, pp); return; }
    // (no warm-up draw here: the render that follows is the first draw, and nothing waits on screen for it)
    try { this.cacheProgram(key, finishProgram(gl, pp)); } catch (e) { this.failProgram(key, e); }
  }

  /**
   * Pixels of a region of the last frame (top-left origin), read without making the page wait for the
   * GPU: into a pixel buffer, then copied out once a fence says the GPU is done. A live canvas's
   * region is copied before yielding, because presenting it discards its drawing buffer.
   * Null if the context went away (also before its event arrives:
   * a lost context reads as zeros, and a blank picture must never pass for the piece, e.g. as a thumbnail).
   */
  async snapshot(sx: number, sy: number, sw: number, sh: number): Promise<ImageData | null> {
    const gl = this.gl;
    const gone = () => !this.alive || this.lost || gl.isContextLost();
    if (gone()) return null;
    sx = Math.max(0, Math.min(this.W - 1, Math.round(sx))); sy = Math.max(0, Math.min(this.H - 1, Math.round(sy)));
    sw = Math.max(1, Math.min(this.W - sx, Math.round(sw))); sh = Math.max(1, Math.min(this.H - sy, Math.round(sh)));
    // Wait for drawing before issuing the read: some drivers stall even a PBO read otherwise.
    const wait = async (sync: WebGLSync | null) => {
      if (!sync) return false;
      const t0 = performance.now();
      while (!gone() && !passed(gl, sync) && performance.now() - t0 < 4000) await new Promise(res => setTimeout(res, 8));
      return !gone() && passed(gl, sync);
    };
    const size = sw * sh * 4;
    let copy: Tex | null = null, fb: WebGLFramebuffer | null = null;
    let drawn: WebGLSync | null = null, pbo: WebGLBuffer | null = null;
    let sync: WebGLSync | null = null;
    const raw = new Uint8Array(size);
    try {
      if (!this.o.preserveDrawingBuffer) {
        // Queue the copy in the same task as renderNow(), before the live buffer can be cleared.
        copy = createTex(gl, sw, sh);
        fb = fboFor(gl, copy);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);
        // Blitting also handles an opaque default buffer (RGB) into our RGBA target.
        gl.blitFramebuffer(sx, this.H - sy - sh, sx + sw, this.H - sy,
          0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      drawn = this.fence();
      if (!await wait(drawn)) return null;
      pbo = gl.createBuffer();
      if (!pbo) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
      gl.readPixels(fb ? 0 : sx, fb ? 0 : this.H - sy - sh, sw, sh, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      sync = this.fence();
      if (!await wait(sync)) return null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, raw);
    } finally {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      if (pbo) gl.deleteBuffer(pbo);
      if (fb) gl.deleteFramebuffer(fb);
      if (copy) gl.deleteTexture(copy.tex);
      if (drawn) gl.deleteSync(drawn);
      if (sync) gl.deleteSync(sync);
    }
    if (gone()) return null;
    // GL rows run bottom to top
    const out = new ImageData(sw, sh), row = sw * 4;
    for (let y = 0; y < sh; y++) out.data.set(raw.subarray((sh - 1 - y) * row, (sh - y) * row), y * row);
    return out;
  }

  /** Shows the change being prepared now (compiling its shader here if it is not ready yet). */
  private applyPending() {
    const p = this.pending;
    if (!p) return;
    this.adoptProgram(p);
    this.dropPendingGL(p);
    this.pending = null;
    if (p.trans && this.atlas && !this.lost) this.captureTransition(p.trans);
    this.applyRecipe(p.r);
  }

  private fontsFor(r: Recipe): Promise<unknown> {
    const sample = uniqueChars(r.glyph.charset + (r.msg.on ? r.msg.text : '') + (r.glyph.mode === 'words' ? r.glyph.words : '')).join('').slice(0, 200) || 'Aa';
    const jobs = [this.fonts.ensure(r.glyph.font, r.glyph.weight, false, sample)];
    if (r.source === 'text') jobs.push(this.fonts.ensure(r.text.font, r.text.weight, r.text.italic, r.text.content.slice(0, 120) || 'Aa'));
    return Promise.all(jobs).catch(() => undefined);
  }

  setFixedSize(width: number, height: number, pixelRatio: number) {
    if (!this.o.fixedSize) return;
    const f = this.o.fixedSize;
    if (f.width === width && f.height === height && f.pixelRatio === pixelRatio) return;
    this.o = { ...this.o, fixedSize: { width, height, pixelRatio } };
    this.sizeDirty = true;
    this.needsRender = true;
  }

  holdAdaptive(until: number) { this.adaptiveHold = until; }

  setQuality(q: PreviewQuality) {
    this.q = { ...q };
    this.sizeDirty = true;
    this.needsRender = true;
  }

  play() { if (!this.playing) { this.playing = true; this.needsRender = true; } }
  pause() { this.playing = false; this.needsRender = true; }

  setMedia(kind: MediaKind, el: MediaEl | null) {
    if (this.media[kind] !== el) this.mediaGen++;
    this.media[kind] = el;
    this.mediaUploaded = null;
    this.mediaOK = false;
    this.needsRender = true;
  }
  hasMedia(kind: MediaKind) { return !!this.media[kind]; }

  /** Resolves once fonts are loaded and the atlas has been rebuilt with them. */
  async ready(): Promise<void> {
    await this.requestFonts();
    this.atlasKey = '';
    this.textKey = '';
    if (this.o.fixedSize) await this.compileAhead();
  }

  /** Renders a frame synchronously at time t (export engines drive time themselves). */
  renderAt(t: number, realT = t) {
    this.applyPending();
    this.t = t;
    const dt = realT - this.demoT;
    this.realT = realT;
    this.demoT = realT;
    this.render(this.demo(dt));
  }

  /**
   * Fixed-size engines (exports) with «Cursor automático»: frames that follow each other (at most half a
   * second apart) play the ghost, as the stage shows it when nobody touches it; a first frame, or a jump,
   * starts it again from nothing. Returns the frame's dt.
   */
  private demo(dt: number): number {
    const it = this.r.interact;
    if (!this.o.fixedSize || it.mode === 'none') return 0;
    this.touch.demo = it.auto;
    if (!(dt > 0 && dt <= 0.5)) {
      if (it.auto) {
        this.touch.reset(); this.resetSim();
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

  renderNow() { this.applyPending(); this.render(0); }

  /** Draws the current frame into a 2D context (e.g. thumbnails). Synchronous. */
  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.renderNow();
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  /** Reads the character grid of the current frame (for text, ANSI and SVG export). */
  readGrid(): GridSnapshot {
    this.renderNow();
    const gl = this.gl, n = this.cols * this.rows;
    const bc = new Uint8Array(n * 4), bg = new Uint8Array(n * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbSel);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, bc);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, bg);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const chars: string[] = new Array(n);
    const rgb = new Uint8Array(n * 3), alpha = new Uint8Array(n), lum = new Uint8Array(n), flags = new Uint8Array(n);
    const table = this.atlas?.chars ?? [' '];
    for (let i = 0; i < n; i++) {
      const idx = bg[i * 4] + bg[i * 4 + 1] * 256;
      chars[i] = table[idx] ?? ' ';
      rgb[i * 3] = bc[i * 4]; rgb[i * 3 + 1] = bc[i * 4 + 1]; rgb[i * 3 + 2] = bc[i * 4 + 2];
      lum[i] = bc[i * 4 + 3];
      flags[i] = bg[i * 4 + 2];
      alpha[i] = bg[i * 4 + 3];
    }
    return { cols: this.cols, rows: this.rows, chars, rgb, alpha, lum, flags, bg: this.r.color.bg, cw: this.cw, ch: this.ch };
  }

  /** Colour of the densest glyph (useful for UI accents). */
  accent(): string {
    const c = sampleGradient(this.grad, 1);
    return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  }

  setPointer(x: number, y: number, on: boolean) {
    this.ptr.tx = x * this.W; this.ptr.ty = y * this.H; this.ptr.targetOn = on ? 1 : 0; this.ptr.lastReal = this.realT;
  }

  /**
   * A pointer event given by code (x, y: fractions of the canvas; t: seconds on the gesture clock, now when
   * absent): the gesture modes take it like a real one. Replays and tests: the same events give the same
   * frames, in this engine and in the basic one.
   */
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

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.dropPending();
    this.ro?.disconnect();
    this.io?.disconnect();
    this.cleanup.forEach(f => f());
    this.cleanup = [];
    try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private initGL() {
    const gl = this.gl;
    this.maxTex = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    this.halfFloat = halfFloatRenderable(gl);
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.pSim = compileProgram(gl, VERT, SIM_FS);
    this.pSel = compileProgram(gl, VERT, SELECT_FS);
    this.pBlur = compileProgram(gl, VERT, BLUR_FS);
    this.pComp = compileProgram(gl, VERT, COMPOSE_FS);

    this.tField = createTex(gl, 1, 1);
    this.fbField = fboFor(gl, this.tField);
    this.tSelC = createTex(gl, 1, 1);
    this.tSelG = createTex(gl, 1, 1);
    this.fbSel = fboFor(gl, this.tSelC, this.tSelG);
    const simOpts = this.halfFloat
      ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR }
      : { filter: gl.LINEAR };
    this.tSim = [createTex(gl, 1, 1, simOpts), createTex(gl, 1, 1, simOpts)];
    this.fbSim = this.tSim.map(t => fboFor(gl, t));
    this.tBloomA = createTex(gl, 1, 1, { filter: gl.LINEAR });
    this.tBloomB = createTex(gl, 1, 1, { filter: gl.LINEAR });
    this.fbBloomA = fboFor(gl, this.tBloomA);
    this.fbBloomB = fboFor(gl, this.tBloomB);
    this.tAtlas = createTex(gl, 1, 1);
    this.tGrad = createTex(gl, 256, 1, { filter: gl.LINEAR });
    this.tMedia = createTex(gl, 1, 1, { filter: gl.LINEAR });
    this.tText = createTex(gl, 1, 1, { filter: gl.LINEAR });
    this.tMsg = createTex(gl, 1, 1);
    this.tWords = createTex(gl, 1, 1);
    this.tWarm = createTex(gl, 1, 1);
    this.fbWarm = fboFor(gl, this.tWarm);
    this.tTouch = createTex(gl, 1, 1, { data: new Uint8Array([0, 0, 128, 128]) });
    this.touchVer = -1;
    this.prevT = [null, null]; this.prevFb = [null, null]; this.prevIdx = 0;
    this.trans = -1;
    // (a restored context lost them all: made again when a piece needs them)
    this.pXf = null; this.xf = null; this.xfBroken = false; this.trail.have = false;
  }

  private invalidate() {
    this.sizeDirty = true;
    this.atlasKey = this.textKey = this.msgKey = this.wordsKey = this.gradKey = '';
    this.mediaUploaded = null;
    this.simMode = '';
    this.touchVer = -1;
    this.needsRender = true;
  }

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

  /**
   * A web font that lands after requestFonts() stopped waiting (a slow connection: exported code fetches
   * its fonts) must still be drawn: glyphs, big text and message are drawn again when a font finishes
   * loading. Without this a piece on a slow page kept the fallback face for good (still more so when paused).
   */
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
    if (!this.visible || this.lost) { this.last = 0; return; }
    if (this.pending) this.stepPending(performance.now());
    // a frame-rate cap (preview quality): the frames in between are skipped
    const cap = this.q.maxFps ?? 0;
    if (cap > 0 && this.lastDraw && now - this.lastDraw < 1000 / cap - 2) return;
    const raw = this.last ? (now - this.last) / 1000 : 0;
    const dt = Math.min(0.1, raw);
    this.last = now;
    this.realT += dt;
    if (this.playing) this.t += dt * this.r.motion.speed;
    if (this.trans >= 0 && !Number.isNaN(this.transStart)) this.transElapsed += Math.min(0.2, raw);
    const interactive = this.stepPointer(dt);
    // (gestures keep their real pace on a slow device: up to a quarter of a second per frame)
    const touching = this.stepTouch(Math.min(0.25, raw));
    // a live video or camera redraws every frame, but only with its element: a piece whose media never came
    // (a shared link, a file still loading) is a still picture while paused
    const video = (this.r.source === 'video' || this.r.source === 'camera') && !!this.media[this.r.source];
    // Ondas, Borrador and Pincel draw until what the pointer left has settled (then an idle piece costs nothing)
    const sim = SIM_MODES.includes(this.r.interact.mode) && this.realT - this.simLast < simSettle(this.r.interact);
    if (this.playing || this.needsRender || interactive || touching || video || sim || this.trans >= 0) {
      this.needsRender = false;
      this.lastDraw = now;
      const t0 = performance.now();
      const inTrans = this.trans >= 0;
      this.render(dt);
      this.measure(now, performance.now() - t0, dt, inTrans);
    }
  };

  private measure(now: number, _cpu: number, dt: number, inTrans = false) {
    this.frames++;
    if (now - this.fpsT > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0; this.fpsT = now;
      this.o.onStats?.(this.stats);
    }
    // frames of a transition (the first frame of a new piece builds its glyphs) say nothing about the piece
    if (!this.playing || dt <= 0 || inTrans) return;
    this.ema = this.ema * 0.95 + dt * 1000 * 0.05;
    if (!(this.q.adaptive ?? this.o.adaptive ?? true)) return;
    if (performance.now() < this.adaptiveHold) { this.slow = 0; return; }
    if (this.ema > 26) { this.slow++; this.fast = 0; } else if (this.ema < 18) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
    if (this.slow > 90 && this.pr > 0.75) { this.pr = Math.max(0.75, this.pr * 0.8); this.slow = 0; this.sizeDirty = true; this.ema = 16; }
    if (this.fast > 300 && this.pr < this.prCap) { this.pr = Math.min(this.prCap, this.pr * 1.15); this.fast = 0; this.sizeDirty = true; }
  }

  /** The older pointer modes' pointer: eased toward where it is, the ghost when nobody moves it. */
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

  /** The gesture modes' field, one frame on (engine/touch.ts). True while it has something to show. */
  private stepTouch(dt: number): boolean {
    const it = this.r.interact;
    if (!isTouchMode(it.mode)) return false;
    this.touch.configure(touchSettings(it), this.cols, this.rows, this.cw, this.ch, this.W, this.H);
    const busy = this.touch.step(dt);
    this.hub?.stepped();
    return busy || this.touch.version !== this.touchVer;
  }

  /* ---------------------------------------------------------------- */
  /* Resource updates                                                  */
  /* ---------------------------------------------------------------- */

  private resize() {
    this.sizeDirty = false;
    const gl = this.gl, g = this.r.glyph;
    if (this.o.fixedSize) {
      this.cssW = this.o.fixedSize.width; this.cssH = this.o.fixedSize.height;
      this.pr = this.prCap = this.o.fixedSize.pixelRatio;
    } else {
      this.cssW = Math.max(1, this.canvas.clientWidth || 300);
      this.cssH = Math.max(1, this.canvas.clientHeight || 150);
      const cap = Math.min(this.q.maxPixelRatio ?? 2, this.o.maxPixelRatio ?? 2, Math.max(1, window.devicePixelRatio || 1));
      if (cap !== this.prCap) { this.prCap = cap; this.pr = cap; }
      if (this.pr > this.prCap) this.pr = this.prCap;
    }
    let pr = this.pr;
    const maxDim = Math.min(this.maxTex, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    if (this.cssW * pr > maxDim || this.cssH * pr > maxDim) pr = Math.min(maxDim / this.cssW, maxDim / this.cssH);
    this.W = Math.max(1, Math.round(this.cssW * pr));
    this.H = Math.max(1, Math.round(this.cssH * pr));
    if (this.canvas.width !== this.W) this.canvas.width = this.W;
    if (this.canvas.height !== this.H) this.canvas.height = this.H;
    this.cw = Math.max(2, Math.round(g.cell * pr));
    this.ch = Math.max(2, Math.round(g.cell * g.aspect * pr));
    const cols = Math.max(1, Math.ceil(this.W / this.cw)), rows = Math.max(1, Math.ceil(this.H / this.ch));
    if (cols !== this.cols || rows !== this.rows || this.tField.w !== cols) {
      this.cols = cols; this.rows = rows;
      resizeTex(gl, this.tField, cols, rows);
      resizeTex(gl, this.tSelC, cols, rows);
      resizeTex(gl, this.tSelG, cols, rows);
      resizeTex(gl, this.tBloomA, cols, rows);
      resizeTex(gl, this.tBloomB, cols, rows);
      this.resetSim();
      this.msgKey = '';
    }
    // (a transition under way goes on: the old frame is drawn at the new size, see uPrevScale. Dropping it
    // here was why a change that also resized the stage, a new view or terminal window, often showed none)
    this.textKey = '';
  }

  private resetSim() {
    const gl = this.gl;
    const n = this.cols * this.rows;
    let data: Uint8Array | null = null;
    if (!this.halfFloat) { data = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; } }
    for (const t of this.tSim) resizeTex(gl, t, this.cols, this.rows, data);
  }

  private updateAtlas() {
    const r = this.r, g = r.glyph;
    const extras = (r.msg.on ? r.msg.text : '') + (g.mode === 'words' ? g.words : '');
    const key = [g.charset, g.sort, g.font, g.weight, g.scale, this.cw, this.ch, uniqueChars(extras).sort().join('')].join('\u0001');
    if (key === this.atlasKey && this.atlas) return;
    this.atlasKey = key;
    this.atlas = buildAtlas({
      charset: g.charset, sort: g.sort, stack: this.fonts.stack(g.font), weight: g.weight, scale: g.scale * (fontById(g.font).fit ?? 1),
      cw: this.cw, ch: this.ch, extras, maxTex: this.maxTex,
    }, this.atlasCanvas ?? undefined);
    this.atlasCanvas = this.atlas.canvas;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tAtlas.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    this.msgKey = '';
    this.wordsKey = '';
  }

  private updateGrad() {
    const key = this.r.color.stops.join(',');
    if (key === this.gradKey) return;
    this.gradKey = key;
    this.grad = bakeGradient(this.r.color.stops, 256);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tGrad.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.grad);
  }

  private updateText() {
    if (this.r.source !== 'text') return;
    const t = this.r.text;
    // letters that move are drawn again at each moment (at a resolution the cells need, see text.ts)
    const anim = textAnimated(t) ? { time: this.timeQ(), cols: this.cols, loop: this.r.motion.loop } : undefined;
    const key = JSON.stringify(t) + this.W + 'x' + this.H + (anim ? `|${anim.cols}|${anim.time}|${anim.loop}` : '');
    if (key === this.textKey) return;
    this.textKey = key;
    this.textCanvas ??= document.createElement('canvas');
    drawTextSource(this.textCanvas, this.W, this.H, t, this.fonts.stack(t.font), anim);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tText.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
  }

  private updateMsg() {
    const m = this.r.msg;
    if (!m.on || !this.atlas) { this.msg = null; return; }
    const key = [m.text, m.mode === 'marquee', m.x, m.y, m.align, this.cols, this.rows, this.atlasKey].join('|');
    if (key !== this.msgKey || !this.msg) {
      this.msgKey = key;
      const idx = this.atlas.index;
      this.msg = layoutMessage(m.text, this.cols, this.rows, m.x, m.y, m.align, m.mode === 'marquee', c => idx.get(c) ?? this.atlas!.spaceIdx);
      this.msgAnimKey = '';
    }
    // letters that move are placed again at each moment (letters.ts); still ones are uploaded once
    const a = m.anim && m.anim.kind !== 'color' ? m.anim : null;
    const tq = this.timeQ();
    const loop = this.r.motion.loop;
    const akey = a ? `${key}|${a.kind}|${a.amount}|${a.speed}|${tq}|${loop}` : key;
    if (akey === this.msgAnimKey) return;
    this.msgAnimKey = akey;
    const data = a ? animateMessage(this.msg, a, tq, this.rows, scramblePool(this.atlas.n), loop) : this.msg.data;
    resizeTex(this.gl, this.tMsg, this.msg.width, this.rows, data);
  }

  private updateWords() {
    const g = this.r.glyph;
    if (g.mode !== 'words' || !this.atlas) return;
    const key = g.words + '|' + this.atlasKey;
    if (key === this.wordsKey) return;
    this.wordsKey = key;
    const chars = Array.from(g.words.replace(/\s+/g, ' ')).filter(c => c !== '\n');
    const list = chars.length ? chars : ['#'];
    this.wordsN = list.length;
    const data = new Uint8Array(list.length * 4);
    list.forEach((c, i) => {
      const gi = (this.atlas!.index.get(c) ?? this.atlas!.spaceIdx) + 1;
      data[i * 4] = gi & 255; data[i * 4 + 1] = gi >> 8;
    });
    resizeTex(this.gl, this.tWords, list.length, 1, data);
  }

  private currentMedia(): MediaEl | null { return this.currentMediaOf(this.r); }

  private currentMediaOf(r: Recipe): MediaEl | null {
    const s = r.source;
    if (s === 'image' || s === 'video' || s === 'camera') return this.media[s] ?? null;
    return null;
  }

  private updateMedia() {
    const el = this.currentMedia();
    if (!el) { this.mediaOK = false; return; }
    const gl = this.gl;
    const isVideo = typeof HTMLVideoElement !== 'undefined' && el instanceof HTMLVideoElement;
    if (isVideo) {
      if (el.readyState < 2 || !el.videoWidth) return;
      if (this.mediaUploaded === el && el.currentTime === this.mediaTime && this.mediaOK) return;
      this.mediaW = el.videoWidth; this.mediaH = el.videoHeight; this.mediaTime = el.currentTime;
    } else {
      if (this.mediaUploaded === el && this.mediaOK) return;
      const anyEl = el as { naturalWidth?: number; width: number; naturalHeight?: number; height: number };
      this.mediaW = anyEl.naturalWidth || anyEl.width || 1;
      this.mediaH = anyEl.naturalHeight || anyEl.height || 1;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tMedia.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, el as TexImageSource);
      this.mediaUploaded = el;
      this.mediaOK = true;
    } catch (e) {
      this.mediaOK = false;
      this.o.onError?.('media: ' + (e as Error).message);
    }
  }

  private static patternsOf(r: Recipe) {
    const layers = r.layers.filter(l => l.on).slice(0, 4);
    return layers.map(l => l.pattern);
  }

  /**
   * Program key of the field pass for a recipe. Without `src`, the one it will most likely need: a media
   * source counts as media once this engine has that kind of media.
   */
  private fieldKeyOf(r: Recipe, src?: FieldSource): string {
    const s = src ?? SRC_OF(r, r.source === this.r.source && this.mediaOK ? true : !!this.currentMediaOf(r));
    return fieldKey(AsciiEngine.patternsOf(r), s, r.motion.loop > 0);
  }

  private fieldSource(r: Recipe, key: string): string {
    const src = key.split('|')[0] as FieldSource;
    return buildFieldShader(AsciiEngine.patternsOf(r), src, r.motion.loop > 0, this.lib);
  }

  private cacheProgram(key: string, p: Program) {
    const old = this.progs.get(key);
    if (old && old !== p) this.gl.deleteProgram(old.prog);
    this.progs.set(key, p);
    if (this.progs.size > 48) {
      const first = this.progs.keys().next().value as string;
      if (first !== key) { this.gl.deleteProgram(this.progs.get(first)!.prog); this.progs.delete(first); }
    }
  }

  private fieldProgram(src: FieldSource): Program | null {
    const key = this.fieldKeyOf(this.r, src);
    if (this.failedPrograms.has(key)) return null;
    let p = this.progs.get(key);
    if (!p) {
      try {
        p = compileProgram(this.gl, VERT, this.fieldSource(this.r, key));
        this.cacheProgram(key, p);
      } catch (e) {
        this.failProgram(key, e);
        return null;
      }
    }
    return p;
  }

  private failProgram(key: string, error: unknown) {
    if (this.failedPrograms.has(key)) return;
    this.failedPrograms.add(key);
    this.o.onError?.(error instanceof Error ? error.message : String(error));
  }

  /**
   * Keeps the frame on screen (an ongoing transition included) to dissolve from. Two buffers: the new one
   * is written while the current one, which that frame may show in part, is read.
   */
  private captureTransition(spec: TransitionSpec) {
    const gl = this.gl, i = this.prevIdx ^ 1;
    let t = this.prevT[i];
    if (!t || t.w !== this.W || t.h !== this.H) {
      if (t) gl.deleteTexture(t.tex);
      if (this.prevFb[i]) gl.deleteFramebuffer(this.prevFb[i]);
      t = this.prevT[i] = createTex(gl, this.W, this.H);
      this.prevFb[i] = fboFor(gl, t);
    }
    const cur = this.prevT[this.prevIdx];
    this.compose(this.prevFb[i], cur ? this.trans : -1);
    this.prevIdx = i;
    this.trans = 0;
    this.transStart = NaN;
    this.transSpec = spec;
  }

  /* ---------------------------------------------------------------- */
  /* Render passes                                                     */
  /* ---------------------------------------------------------------- */

  private render(dt: number) {
    if (this.lost) return;
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
      if (this.trans >= 1 || this.trans < 0) {
        this.trans = -1;
        // the second buffer is only for a transition that starts during another: let it go
        const j = this.prevIdx ^ 1, spare = this.prevT[j];
        if (spare) { this.gl.deleteTexture(spare.tex); this.gl.deleteFramebuffer(this.prevFb[j]); this.prevT[j] = null; this.prevFb[j] = null; }
      }
    }
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    this.runSim(dt);
    const im = this.r.interact.mode;
    if (this.touch.version !== this.touchVer) {
      this.touchVer = this.touch.version;
      if (GRID_MODES.includes(im) && this.touch.data.length === this.cols * this.rows * 4) {
        const T = this.tTouch;
        if (T.w === this.cols && T.h === this.rows) {
          gl.bindTexture(gl.TEXTURE_2D, T.tex);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, this.touch.data);
        } else resizeTex(gl, T, this.cols, this.rows, this.touch.data);
      }
    }
    const src = SRC_OF(this.r, this.mediaOK);
    const fp = this.fieldProgram(src);
    if (!fp) return; // keep the last frame instead of selecting stale field textures
    const stages = fp && !this.xfBroken ? xformStages(activeXforms(this.r, src), this.cols, this.rows, this.ch / this.cw) : [];
    let grid: Tex | null = null;
    if (stages.length) {
      try {
        grid = this.runXforms(fp!, src, stages);
      } catch (e) {
        this.xfBroken = true;
        this.o.onError?.((e as Error).message);
      }
    }
    if (!stages.some(x => x.kind === 'estela')) this.trail.have = false;
    if (fp) this.runField(fp, src, grid);
    this.runSelect(src);
    if (this.r.fx.bloom > 0) this.runBloom();
    this.compose(null, this.trans);
    this.ptr.impulse = 0;
  }

  /** The piece's time as the passes read it: stop motion, and with «Bucle perfecto» the loop's time (loop.ts). */
  private timeQ(): number {
    return pieceTime(this.t, this.r.motion);
  }

  private runSim(dt: number) {
    const mode = this.r.interact.mode;
    const gl = this.gl;
    const simulate = SIM_MODES.includes(mode);
    if (mode !== this.simMode) { this.simMode = mode; this.resetSim(); }
    if (!simulate) return;
    const P = this.ptr, it = this.r.interact, p = this.pSim;
    const auto = it.auto && this.realT - P.lastReal > 2.5;
    // a pen presses harder or softer (engine/pointer.ts); mouse and fingers as always
    const active = P.on > 0.2 ? (Math.min(1, P.moved / Math.max(2, this.cw * 0.5)) + (P.down ? 0.6 : 0) + (auto ? 0.5 : 0)) * pressureGain(P.pressure) : 0;
    const impulse = P.impulse * (P.on > 0.2 ? 1 : 0);
    if (active > 0 || impulse > 0) this.simLast = this.realT;
    // one step per 1/60 s, as the basic engine does (the same waves at 30 fps, in exports and on 120 Hz screens)
    const steps = dt > 0 ? Math.max(1, Math.min(4, Math.round(dt * 60))) : 1;
    const sdt = (dt || 1 / 60) / steps;
    const d = it.decay ?? 0.5;
    gl.viewport(0, 0, this.cols, this.rows);
    gl.useProgram(p.prog);
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform2f(loc(gl, p, 'uCell'), this.cw, this.ch);
    gl.uniform4f(loc(gl, p, 'uSeg'), P.px, P.py, P.x, P.y);
    gl.uniform1f(loc(gl, p, 'uBrushR'), Math.max(4, it.radius * this.H * 0.5) * pressureRadius(P.pressure));
    gl.uniform1f(loc(gl, p, 'uStr'), it.strength);
    gl.uniform1f(loc(gl, p, 'uEnc'), this.halfFloat ? 0 : 1);
    gl.uniform1f(loc(gl, p, 'uDt'), sdt);
    gl.uniform1f(loc(gl, p, 'uEraseRate'), eraseRate(d));
    gl.uniform1f(loc(gl, p, 'uPaintRate'), paintRate(d));
    gl.uniform1i(loc(gl, p, 'uMode'), INTERACT.indexOf(mode));
    for (let k = 0; k < steps; k++) {
      const src = this.tSim[this.simIdx], dst = this.simIdx ^ 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbSim[dst]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(loc(gl, p, 'uPrev'), 0);
      gl.uniform1f(loc(gl, p, 'uActive'), k === 0 ? Math.min(1.2, active) : 0);
      gl.uniform1f(loc(gl, p, 'uImpulse'), k === 0 ? impulse : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.simIdx = dst;
    }
  }

  /**
   * The field pass. `grid`: the last transformation's grid, read instead of the picture or the text.
   * `patternInto`: draws only the pattern's values, into that target (for Desplazar).
   */
  private runField(p: Program, src: FieldSource, grid: Tex | null = null, patternInto: WebGLFramebuffer | null = null) {
    const gl = this.gl, r = this.r;
    gl.bindFramebuffer(gl.FRAMEBUFFER, patternInto ?? this.fbField);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.useProgram(p.prog);
    const tq = this.timeQ();
    gl.uniform2f(loc(gl, p, 'uRes'), this.W, this.H);
    gl.uniform2f(loc(gl, p, 'uCell'), this.cw, this.ch);
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform1f(loc(gl, p, 'uCellP'), this.ch / this.H);
    gl.uniform1f(loc(gl, p, 'uTime'), tq);
    gl.uniform1f(loc(gl, p, 'uLoop'), r.motion.loop);
    const layers = r.layers.filter(l => l.on).slice(0, 4);
    const A = new Float32Array(16), B = new Float32Array(16), C = new Float32Array(16);
    layers.forEach((l, i) => {
      A.set([l.scale * figureFit(l.pattern, this.W, this.H), (l.rot * Math.PI) / 180, l.x, l.y], i * 4);
      B.set([l.a, l.b, l.mix, l.speed], i * 4);
      C.set([l.invert ? 1 : 0, l.phase, Math.max(0, BLENDS.indexOf(l.blend)), 0], i * 4);
    });
    gl.uniform4fv(loc(gl, p, 'uLA'), A);
    gl.uniform4fv(loc(gl, p, 'uLB'), B);
    gl.uniform4fv(loc(gl, p, 'uLC'), C);
    gl.uniform1f(loc(gl, p, 'uWarp'), r.motion.warp);
    gl.uniform1f(loc(gl, p, 'uWarpScale'), r.motion.warpScale);
    gl.uniform1f(loc(gl, p, 'uPulse'), this.pulse(tq));
    gl.uniform1f(loc(gl, p, 'uMediaMix'), r.media.mix);
    gl.uniform1i(loc(gl, p, 'uMediaBlend'), Math.max(0, BLENDS.indexOf(r.media.blend)));
    gl.uniform1f(loc(gl, p, 'uMorph'), morphPeriod(r.text.morph, r.motion.loop));
    this.bindMediaUniforms(p, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tText.tex);
    gl.uniform1i(loc(gl, p, 'uText'), 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.tSim[this.simIdx].tex);
    gl.uniform1i(loc(gl, p, 'uSim'), 4);
    gl.uniform1f(loc(gl, p, 'uSimEnc'), this.halfFloat ? 0 : 1);
    // (never a texture this pass draws into: the gradient stands in when there is no grid)
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, (grid ?? this.tGrad).tex);
    gl.uniform1i(loc(gl, p, 'uXGrid'), 5);
    gl.uniform1i(loc(gl, p, 'uXOn'), grid ? 1 : 0);
    gl.uniform1i(loc(gl, p, 'uPatOnly'), patternInto ? 1 : 0);
    this.bindPointerUniforms(p);
    void src;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Grids for the transformations at the current grid size (made, or made again, when needed). */
  private ensureXf() {
    const gl = this.gl, size = `${this.cols}x${this.rows}`;
    this.pXf ??= compileProgram(gl, VERT, XFORM_FS);
    if (this.xf?.size === size) return;
    if (this.xf) {
      const X = this.xf;
      for (const t of [...X.grid, X.pat, ...X.trail, ...X.prev]) gl.deleteTexture(t.tex);
      for (const f of [...X.fbGrid, X.fbPat, ...X.fbTrail, ...X.fbPrev]) gl.deleteFramebuffer(f);
    }
    const mk = () => { const t = createTex(gl, this.cols, this.rows); return { t, fb: fboFor(gl, t) }; };
    const g = [mk(), mk()], pat = mk(), tr = [mk(), mk()], pr = [mk(), mk()];
    this.xf = {
      size, grid: g.map(x => x.t), fbGrid: g.map(x => x.fb), pat: pat.t, fbPat: pat.fb,
      trail: tr.map(x => x.t), fbTrail: tr.map(x => x.fb), prev: pr.map(x => x.t), fbPrev: pr.map(x => x.fb),
    };
    this.trail.have = false;
  }

  /**
   * Runs the transformations (xform.ts) on the cell grid and returns the last grid: the source averaged
   * per cell, then each stage in order, each reading the grid the previous one wrote.
   */
  private runXforms(fp: Program, src: FieldSource, stages: XformStage[]): Tex {
    const gl = this.gl;
    this.ensureXf();
    const X = this.xf!, p = this.pXf!;
    if (needsPattern(stages)) this.runField(fp, src, null, X.fbPat);
    gl.useProgram(p.prog);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform2f(loc(gl, p, 'uRes'), this.W, this.H);
    gl.uniform2f(loc(gl, p, 'uCell'), this.cw, this.ch);
    gl.uniform1f(loc(gl, p, 'uAspect'), this.ch / this.cw);
    // (Ondular's two waves: the piece's time, or with a loop each its own, see loop.ts)
    const [ta, tb] = ondularTimes(this.timeQ(), this.r.motion.loop);
    gl.uniform1f(loc(gl, p, 'uTime'), ta);
    gl.uniform1f(loc(gl, p, 'uTimeB'), tb);
    const bind = (unit: number, t: Tex, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(loc(gl, p, name), unit);
    };
    this.bindMediaUniforms(p, 5);
    bind(6, this.tText, 'uText');
    bind(1, X.pat, 'uPat');
    const ti = this.trail.i;
    bind(2, X.prev[ti], 'uPrevIn');
    bind(3, X.trail[ti], 'uTrail');
    const draw = (code: number, into: WebGLFramebuffer, input: Tex, s?: XformStage) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, into);
      bind(0, input, 'uIn');
      gl.uniform1i(loc(gl, p, 'uKind'), code);
      gl.uniform1f(loc(gl, p, 'uAmt'), s?.amount ?? 0);
      gl.uniform1f(loc(gl, p, 'uP'), s?.p ?? 0);
      gl.uniform1f(loc(gl, p, 'uK'), s?.k ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    draw(src === 'text' ? XF_TEXT : XF_MEDIA, X.fbGrid[0], X.grid[1]);
    let cur = 0;
    const trail = trailStage(stages);
    if (trail) {
      // a new source (another picture, another kind) starts a new trail
      const key = `${src}|${this.mediaGen}`;
      if (key !== this.trail.key) { this.trail.key = key; this.trail.have = false; }
      const dt = this.trail.have ? Math.min(0.25, Math.max(0, this.realT - this.trail.t)) : 0;
      this.trail.t = this.realT;
      gl.uniform1f(loc(gl, p, 'uDecay'), trailDecay(dt, trail.k));
      gl.uniform1f(loc(gl, p, 'uHave'), this.trail.have ? 1 : 0);
    }
    for (const s of stages) {
      if (s.kind === 'estela') {
        const i = this.trail.i, j = i ^ 1;
        // the trail, then this frame's input kept for the next one, then the stage itself
        draw(XF_TRAIL, X.fbTrail[j], X.grid[cur], s);
        draw(XF_COPY, X.fbPrev[j], X.grid[cur], s);
        bind(3, X.trail[j], 'uTrail');
        this.trail.i = j;
        this.trail.have = true;
      }
      draw(s.code, X.fbGrid[cur ^ 1], X.grid[cur], s);
      cur ^= 1;
    }
    return X.grid[cur];
  }

  private pulse(tq: number): number {
    const m = this.r.motion;
    if (this.externalPulse > 0) return Math.min(1, this.externalPulse);
    if (m.pulse <= 0) return 0;
    let bpm = m.bpm, t = tq;
    if (m.loop > 0) { const beats = Math.max(1, Math.round((m.loop * bpm) / 60)); bpm = (beats * 60) / m.loop; t = tq % m.loop; }
    const ph = (t * bpm) / 60;
    return m.pulse * Math.pow(1 - (ph - Math.floor(ph)), 3);
  }

  private bindMediaUniforms(p: Program, unit: number) {
    const gl = this.gl, m = this.r.media;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tMedia.tex);
    gl.uniform1i(loc(gl, p, 'uMedia'), unit);
    gl.uniform2f(loc(gl, p, 'uMediaSize'), this.mediaW, this.mediaH);
    gl.uniform1i(loc(gl, p, 'uFit'), m.fit === 'cover' ? 0 : m.fit === 'contain' ? 1 : 2);
    gl.uniform1f(loc(gl, p, 'uZoom'), m.zoom);
    gl.uniform2f(loc(gl, p, 'uPan'), m.panX, m.panY);
    gl.uniform1f(loc(gl, p, 'uMirror'), m.mirror ? 1 : 0);
  }

  private bindPointerUniforms(p: Program) {
    const gl = this.gl, it = this.r.interact, P = this.ptr;
    gl.uniform1i(loc(gl, p, 'uIMode'), INTERACT.indexOf(it.mode));
    gl.uniform2f(loc(gl, p, 'uPtr'), P.x, P.y);
    gl.uniform1f(loc(gl, p, 'uPtrOn'), P.on);
    gl.uniform1f(loc(gl, p, 'uIStr'), it.strength);
    gl.uniform1f(loc(gl, p, 'uIRad'), it.radius);
    gl.uniform1f(loc(gl, p, 'uPtrDown'), P.down ? 1 : 0);
    const v = VIEW_MODES.includes(it.mode) ? this.touch.view : [1, 0, 0];
    gl.uniform3f(loc(gl, p, 'uView'), v[0], v[1], v[2]);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.tTouch.tex);
    gl.uniform1i(loc(gl, p, 'uTouch'), 6);
    gl.uniform1i(loc(gl, p, 'uTouchDisp'), it.mode === 'stretch' ? 1 : 0);
  }

  private runSelect(src: FieldSource) {
    const gl = this.gl, r = this.r, p = this.pSel, a = this.atlas!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbSel);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tField.tex);
    gl.uniform1i(loc(gl, p, 'uField'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tGrad.tex);
    gl.uniform1i(loc(gl, p, 'uGrad'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tMsg.tex);
    gl.uniform1i(loc(gl, p, 'uMsg'), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tWords.tex);
    gl.uniform1i(loc(gl, p, 'uWords'), 3);
    const tq = this.timeQ();
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform1f(loc(gl, p, 'uTime'), tq);
    gl.uniform1f(loc(gl, p, 'uN'), a.n);
    gl.uniform1f(loc(gl, p, 'uEdgeBase'), a.edgeBase);
    gl.uniform1f(loc(gl, p, 'uEdge'), r.glyph.edge);
    gl.uniform1f(loc(gl, p, 'uDither'), r.glyph.dither);
    gl.uniform1i(loc(gl, p, 'uDitherKind'), r.glyph.ditherKind === 'bayer' ? 0 : 1);
    gl.uniform1f(loc(gl, p, 'uBright'), r.tone.bright);
    gl.uniform1f(loc(gl, p, 'uContrast'), r.tone.contrast);
    gl.uniform1f(loc(gl, p, 'uGamma'), r.tone.gamma);
    gl.uniform1f(loc(gl, p, 'uInvert'), r.tone.invert ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uLevels'), r.tone.levels);
    gl.uniform1i(loc(gl, p, 'uGMode'), ['density', 'lines', 'scramble', 'words'].indexOf(r.glyph.mode));
    const loop = r.motion.loop;
    // «Palabras» with a loop: a whole number of passes over the words in it (loop.ts)
    gl.uniform1f(loc(gl, p, 'uJitter'), loop > 0 && r.glyph.mode === 'words' ? wordsRate(r.glyph.jitter, this.wordsN, loop) / 8 : r.glyph.jitter);
    gl.uniform1f(loc(gl, p, 'uLoop'), loop > 0 ? loop : 0);
    gl.uniform1f(loc(gl, p, 'uWordsN'), this.wordsN);
    gl.uniform1i(loc(gl, p, 'uCMode'), r.color.mode === 'source' ? 1 : 0);
    gl.uniform1i(loc(gl, p, 'uMap'), ['luma', 'x', 'y', 'radial', 'angle', 'noise'].indexOf(r.color.map));
    gl.uniform1i(loc(gl, p, 'uIsMedia'), src === 'media' ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uEmptyField'), r.source === 'pattern' && !r.layers.some(l => l.on) ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uShift'), r.color.shift);
    gl.uniform1f(loc(gl, p, 'uCycle'), r.color.cycle);
    gl.uniform1f(loc(gl, p, 'uHue'), r.color.hue);
    gl.uniform1f(loc(gl, p, 'uSat'), r.color.sat);
    gl.uniform1f(loc(gl, p, 'uVivid'), r.color.vivid);
    gl.uniform1f(loc(gl, p, 'uShade'), r.color.shade);
    gl.uniform1f(loc(gl, p, 'uAspect'), this.ch / this.cw);
    const m = r.msg, lay = this.msg;
    gl.uniform1i(loc(gl, p, 'uMsgOn'), m.on && lay ? 1 : 0);
    let cursor: [number, number] = [-9, -9], cursorOn = 0;
    if (m.on && lay) {
      // with a loop, a whole number of the message's cycles fits in it
      const st = messageState(m, lay.count, loop > 0 ? loopTime(this.t, loop, messageCycle(m, lay.count, lay.width)) : this.t, lay.spans);
      gl.uniform1i(loc(gl, p, 'uMsgMode'), ['static', 'type', 'decode', 'marquee', 'words'].indexOf(m.mode));
      gl.uniform1f(loc(gl, p, 'uMsgProg'), st.prog);
      gl.uniform1f(loc(gl, p, 'uMsgWin'), 6);
      gl.uniform1f(loc(gl, p, 'uMsgShift'), Math.floor(st.shift));
      gl.uniform1f(loc(gl, p, 'uMsgW'), lay.width);
      if (st.cursorOn && st.cursor >= 0 && lay.cells.length) {
        const cell = lay.cells[Math.min(lay.cells.length - 1, st.cursor)];
        // the cursor goes where the letters it follows went
        cursor = m.anim ? movedCell(lay, m.anim, tq, this.rows, cell, st.cursor, loop) : cell;
        cursorOn = cursor[0] >= 0 ? 1 : 0;
      }
    }
    const ca = msgColorAnim(m);
    gl.uniform1i(loc(gl, p, 'uMsgAnim'), ca ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uMsgSp'), ca?.speed ?? 0);
    gl.uniform1f(loc(gl, p, 'uMsgAmt'), ca?.amount ?? 0);
    gl.uniform1f(loc(gl, p, 'uMsgTime'), msgColorTime(m, tq, loop));
    const mc = m.color ? hexToRgb(m.color) : [1, 1, 1];
    gl.uniform3f(loc(gl, p, 'uMsgColor'), mc[0], mc[1], mc[2]);
    gl.uniform1f(loc(gl, p, 'uMsgUseColor'), m.color ? 1 : 0);
    gl.uniform2f(loc(gl, p, 'uCursor'), cursor[0], cursor[1]);
    gl.uniform1f(loc(gl, p, 'uCursorOn'), cursorOn);
    gl.uniform1f(loc(gl, p, 'uBlockIdx'), a.blockIdx);
    const it = r.interact, P = this.ptr;
    gl.uniform1i(loc(gl, p, 'uIMode'), INTERACT.indexOf(it.mode));
    gl.uniform2f(loc(gl, p, 'uPtrCell'), P.x / this.cw, P.y / this.ch);
    gl.uniform1f(loc(gl, p, 'uPtrOn'), P.on);
    gl.uniform1f(loc(gl, p, 'uIStr'), it.strength);
    gl.uniform1f(loc(gl, p, 'uIRadCells'), (it.radius * this.H) / this.cw);
    const ts = touchSettings(it);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.tTouch.tex);
    gl.uniform1i(loc(gl, p, 'uTouch'), 4);
    gl.uniform1i(loc(gl, p, 'uTouchMark'), isMarkMode(it.mode) ? (ts.glyphs === 'piece' ? 2 : 1) : 0);
    gl.uniform1f(loc(gl, p, 'uTouchInk'), ts.ink);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private runBloom() {
    const gl = this.gl, p = this.pBlur;
    const step = 1 + Math.round(this.r.fx.bloom);
    gl.useProgram(p.prog);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbBloomA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tSelC.tex);
    gl.uniform1i(loc(gl, p, 'uSrc'), 0);
    gl.uniform2f(loc(gl, p, 'uDir'), step, 0);
    gl.uniform1f(loc(gl, p, 'uFromSelect'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbBloomB);
    gl.bindTexture(gl.TEXTURE_2D, this.tBloomA.tex);
    gl.uniform2f(loc(gl, p, 'uDir'), 0, step);
    gl.uniform1f(loc(gl, p, 'uFromSelect'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private compose(target: WebGLFramebuffer | null, trans: number) {
    const gl = this.gl, r = this.r, p = this.pComp, a = this.atlas!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.W, this.H);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tSelC.tex);
    gl.uniform1i(loc(gl, p, 'uC'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tSelG.tex);
    gl.uniform1i(loc(gl, p, 'uG'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tAtlas.tex);
    gl.uniform1i(loc(gl, p, 'uAtlas'), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tBloomB.tex);
    gl.uniform1i(loc(gl, p, 'uBloom'), 3);
    // the frame a transition dissolves from; never the texture being rendered into (feedback loop)
    const pt = this.prevT[this.prevIdx];
    const prevTex = pt && target !== this.prevFb[this.prevIdx] ? pt.tex : this.tField.tex;
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.uniform1i(loc(gl, p, 'uPrev'), 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.tSim[this.simIdx].tex);
    gl.uniform1i(loc(gl, p, 'uSimT'), 5);
    this.bindMediaUniforms(p, 6);
    gl.uniform2f(loc(gl, p, 'uRes'), this.W, this.H);
    gl.uniform2f(loc(gl, p, 'uCell'), this.cw, this.ch);
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform1f(loc(gl, p, 'uAtlasCols'), a.cols);
    gl.uniform1f(loc(gl, p, 'uN'), a.n);
    const bg = hexToRgb(r.color.bg);
    gl.uniform3f(loc(gl, p, 'uBg'), bg[0], bg[1], bg[2]);
    const ac = sampleGradient(this.grad, 1);
    gl.uniform3f(loc(gl, p, 'uAccent'), ac[0], ac[1], ac[2]);
    const fx = r.fx;
    gl.uniform1f(loc(gl, p, 'uCellBg'), fx.cellBg);
    gl.uniform1f(loc(gl, p, 'uGlow'), fx.glow);
    gl.uniform1f(loc(gl, p, 'uBloomAmt'), fx.bloom);
    gl.uniform1f(loc(gl, p, 'uScan'), fx.scan);
    gl.uniform1f(loc(gl, p, 'uVig'), fx.vig);
    gl.uniform1f(loc(gl, p, 'uCurve'), fx.curve);
    // simplified preview: no chromatic aberration (it samples every pixel three times)
    gl.uniform1f(loc(gl, p, 'uChroma'), this.q.simplify ? 0 : fx.chroma);
    gl.uniform1f(loc(gl, p, 'uGrain'), fx.grain);
    gl.uniform1f(loc(gl, p, 'uFlicker'), fx.flicker);
    gl.uniform1f(loc(gl, p, 'uGridAmt'), fx.grid);
    gl.uniform1f(loc(gl, p, 'uTime'), this.realT);
    // grain and flicker follow the piece's clock (with a loop, its time in the loop): a paused moment, a
    // link to it and an export of it are the very same picture
    gl.uniform1f(loc(gl, p, 'uFxTime'), r.motion.loop > 0 ? fold(this.t, r.motion.loop) : this.t);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, this.tTouch.tex);
    gl.uniform1i(loc(gl, p, 'uTouch'), 7);
    gl.uniform1f(loc(gl, p, 'uTouchReveal'), r.interact.mode === 'reveal' ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uTouchTile'), isMarkMode(r.interact.mode) ? TOUCH_TILE : 0);
    gl.uniform1f(loc(gl, p, 'uMsgBox'), r.msg.on ? r.msg.box : 0);
    gl.uniform1f(loc(gl, p, 'uTrans'), trans);
    const ts = this.transSpec;
    gl.uniform1i(loc(gl, p, 'uTransKind'), TRANSITION_INDEX[ts.kind] ?? 0);
    gl.uniform2f(loc(gl, p, 'uTransOrigin'), ts.origin?.[0] ?? 0.5, ts.origin?.[1] ?? 0.5);
    gl.uniform1f(loc(gl, p, 'uTransDir'), ts.dir ?? 1);
    gl.uniform1f(loc(gl, p, 'uTransSeed'), ts.seed ?? 0);
    gl.uniform2f(loc(gl, p, 'uPrevScale'), pt && pt.w ? pt.w / this.W : 1, pt && pt.h ? pt.h / this.H : 1);
    gl.uniform1f(loc(gl, p, 'uTransparent'), this.transparent ? 1 : 0);
    const hasMedia = this.mediaOK && ['image', 'video', 'camera'].includes(r.source);
    gl.uniform1f(loc(gl, p, 'uHasMedia'), hasMedia ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uReveal'), hasMedia ? r.media.reveal : 0);
    gl.uniform1f(loc(gl, p, 'uEraseReveal'), hasMedia && r.interact.mode === 'erase' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Export engines can render with a transparent background. */
  transparent = false;
  /** Live input (e.g. microphone level, 0..1) that drives the pulse instead of the BPM clock. */
  externalPulse = 0;
}

/** Creates an engine and reports a readable error instead of throwing. */
export function tryCreateEngine(canvas: HTMLCanvasElement, recipe: Recipe, opts: EngineOptions): AsciiEngine | null {
  try {
    return new AsciiEngine(canvas, recipe, opts);
  } catch (e) {
    opts.onError?.((e as Error).message);
    return null;
  }
}
