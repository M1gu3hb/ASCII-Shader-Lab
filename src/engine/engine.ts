import { buildAtlas, uniqueChars, type Atlas } from './atlas';
import { BLENDS, cloneRecipe, type Recipe } from './recipe';
import { fontById } from './catalog';
import { bakeGradient, hexToRgb, sampleGradient } from './color';
import { createFontLoader, type FontLoader } from './fonts';
import { compileProgram, createTex, fboFor, halfFloatRenderable, loc, resizeTex, type Program, type Tex } from './gl';
import { BLUR_FS, COMPOSE_FS, SELECT_FS, SIM_FS, VERT, buildFieldShader, fieldKey, type FieldSource } from './glsl/programs';
import type { PatternLibrary } from './glsl/patterns';
import { drawTextSource, layoutMessage, messageState, type MsgLayout } from './text';
import type { Renderer } from './renderer';

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
  autoplay?: boolean;
  reducedMotion?: boolean;
  preserveDrawingBuffer?: boolean;
  alpha?: boolean;
  /** Stop rendering while the canvas is scrolled out of view. */
  observeVisibility?: boolean;
  onError?: (msg: string) => void;
  onStats?: (s: EngineStats) => void;
}

export interface EngineStats { cols: number; rows: number; fps: number; pixelRatio: number; width: number; height: number; ms: number }

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
  private pSim!: Program; private pSel!: Program; private pBlur!: Program; private pComp!: Program;
  private tField!: Tex; private fbField!: WebGLFramebuffer;
  private tSelC!: Tex; private tSelG!: Tex; private fbSel!: WebGLFramebuffer;
  private tSim: Tex[] = []; private fbSim: WebGLFramebuffer[] = []; private simIdx = 0;
  private tBloomA!: Tex; private tBloomB!: Tex; private fbBloomA!: WebGLFramebuffer; private fbBloomB!: WebGLFramebuffer;
  private tAtlas!: Tex; private tGrad!: Tex; private tMedia!: Tex; private tText!: Tex; private tMsg!: Tex; private tWords!: Tex;
  private tPrev: Tex | null = null; private fbPrev: WebGLFramebuffer | null = null;
  private halfFloat = false;
  private maxTex = 4096;

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
  private alive = true;
  private lost = false;
  private visible = true;
  private needsRender = true;
  private sizeDirty = true;
  private trans = -1;
  private transStart = 0;
  private frames = 0; private fps = 0; private fpsT = 0; private ema = 16; private slow = 0; private fast = 0;
  private fontGen = 0;

  private ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, px: -1e4, py: -1e4, on: 0, targetOn: 0, down: false, lastReal: -1e9, impulse: 0, moved: 0 };
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

    const onLost = (e: Event) => { e.preventDefault(); this.lost = true; };
    const onRestored = () => { this.lost = false; this.progs.clear(); this.initGL(); this.invalidate(); };
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

  get recipe(): Recipe { return cloneRecipe(this.r); }
  get time() { return this.t; }
  set time(v: number) { this.t = v; this.needsRender = true; }
  get isPlaying() { return this.playing; }
  get stats(): EngineStats {
    return { cols: this.cols, rows: this.rows, fps: this.fps, pixelRatio: this.pr, width: this.W, height: this.H, ms: this.ema };
  }
  get glyphChars(): string[] { return this.atlas ? this.atlas.chars.slice() : []; }

  set(next: Recipe, o: { transition?: boolean } = {}) {
    if (o.transition && !this.o.reducedMotion && this.atlas && !this.lost) this.captureTransition();
    const prev = this.r;
    this.r = cloneRecipe(next);
    if (prev.glyph.cell !== next.glyph.cell || prev.glyph.aspect !== next.glyph.aspect) this.sizeDirty = true;
    if (prev.glyph.font !== next.glyph.font || prev.glyph.weight !== next.glyph.weight || prev.glyph.charset !== next.glyph.charset
      || prev.glyph.words !== next.glyph.words || prev.msg.text !== next.msg.text || prev.source !== next.source
      || prev.text.font !== next.text.font || prev.text.weight !== next.text.weight || prev.text.italic !== next.text.italic
      || prev.text.content !== next.text.content) this.requestFonts();
    if (prev.source !== next.source) { this.mediaUploaded = null; this.mediaOK = false; }
    this.needsRender = true;
  }

  play() { if (!this.playing) { this.playing = true; this.needsRender = true; } }
  pause() { this.playing = false; this.needsRender = true; }

  setMedia(kind: MediaKind, el: MediaEl | null) {
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
  }

  /** Renders a frame synchronously at time t (export engines drive time themselves). */
  renderAt(t: number, realT = t) {
    this.t = t;
    this.realT = realT;
    this.render(0);
  }

  renderNow() { this.render(0); }

  /** Draws the current frame into a 2D context (e.g. thumbnails). Synchronous. */
  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.render(0);
    ctx.drawImage(this.canvas, 0, 0, w, h);
  }

  /** Reads the character grid of the current frame (for text, ANSI and SVG export). */
  readGrid(): GridSnapshot {
    this.render(0);
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
    this.ptr.tx = x * this.W; this.ptr.ty = y * this.H; this.ptr.targetOn = on ? 1 : 0; this.ptr.lastReal = performance.now();
  }

  destroy() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
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
    this.tPrev = null; this.fbPrev = null;
  }

  private invalidate() {
    this.sizeDirty = true;
    this.atlasKey = this.textKey = this.msgKey = this.wordsKey = this.gradKey = '';
    this.mediaUploaded = null;
    this.simMode = '';
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
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (!this.visible || this.lost) return;
    this.realT += dt;
    if (this.playing) this.t += dt * this.r.motion.speed;
    const interactive = this.stepPointer(dt, now);
    const video = this.r.source === 'video' || this.r.source === 'camera';
    const sim = ['ripple', 'erase', 'paint'].includes(this.r.interact.mode);
    if (this.playing || this.needsRender || interactive || video || sim || this.trans >= 0) {
      this.needsRender = false;
      const t0 = performance.now();
      this.render(dt);
      this.measure(now, performance.now() - t0, dt);
    }
  };

  private measure(now: number, _cpu: number, dt: number) {
    this.frames++;
    if (now - this.fpsT > 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0; this.fpsT = now;
      this.o.onStats?.(this.stats);
    }
    if (!this.playing || dt <= 0) return;
    this.ema = this.ema * 0.95 + dt * 1000 * 0.05;
    if (!(this.o.adaptive ?? true)) return;
    if (this.ema > 26) { this.slow++; this.fast = 0; } else if (this.ema < 18) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
    if (this.slow > 90 && this.pr > 0.75) { this.pr = Math.max(0.75, this.pr * 0.8); this.slow = 0; this.sizeDirty = true; this.ema = 16; }
    if (this.fast > 300 && this.pr < this.prCap) { this.pr = Math.min(this.prCap, this.pr * 1.15); this.fast = 0; this.sizeDirty = true; }
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
    const gl = this.gl, g = this.r.glyph;
    if (this.o.fixedSize) {
      this.cssW = this.o.fixedSize.width; this.cssH = this.o.fixedSize.height;
      this.pr = this.prCap = this.o.fixedSize.pixelRatio;
    } else {
      this.cssW = Math.max(1, this.canvas.clientWidth || 300);
      this.cssH = Math.max(1, this.canvas.clientHeight || 150);
      const cap = Math.min(this.o.maxPixelRatio ?? 2, Math.max(1, window.devicePixelRatio || 1));
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
    if (this.tPrev && (this.tPrev.w !== this.W || this.tPrev.h !== this.H)) { this.trans = -1; }
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
    const key = JSON.stringify(t) + this.W + 'x' + this.H;
    if (key === this.textKey) return;
    this.textKey = key;
    this.textCanvas ??= document.createElement('canvas');
    drawTextSource(this.textCanvas, this.W, this.H, t, this.fonts.stack(t.font));
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tText.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
  }

  private updateMsg() {
    const m = this.r.msg;
    if (!m.on || !this.atlas) { this.msg = null; return; }
    const key = [m.text, m.mode === 'marquee', m.x, m.y, m.align, this.cols, this.rows, this.atlasKey].join('|');
    if (key === this.msgKey && this.msg) return;
    this.msgKey = key;
    const idx = this.atlas.index;
    this.msg = layoutMessage(m.text, this.cols, this.rows, m.x, m.y, m.align, m.mode === 'marquee', c => idx.get(c) ?? this.atlas!.spaceIdx);
    const gl = this.gl;
    resizeTex(gl, this.tMsg, this.msg.width, this.rows, this.msg.data);
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

  private currentMedia(): MediaEl | null {
    const s = this.r.source;
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

  private fieldProgram(src: FieldSource): Program | null {
    const layers = this.r.layers.filter(l => l.on).slice(0, 4);
    const pats = layers.length ? layers.map(l => l.pattern) : ['nube'];
    const loop = this.r.motion.loop > 0;
    const key = fieldKey(pats, src, loop);
    let p = this.progs.get(key);
    if (!p) {
      try {
        p = compileProgram(this.gl, VERT, buildFieldShader(pats, src, loop, this.lib));
        this.progs.set(key, p);
        if (this.progs.size > 48) {
          const first = this.progs.keys().next().value as string;
          if (first !== key) { this.gl.deleteProgram(this.progs.get(first)!.prog); this.progs.delete(first); }
        }
      } catch (e) {
        this.o.onError?.((e as Error).message);
        return null;
      }
    }
    return p;
  }

  private captureTransition() {
    const gl = this.gl;
    if (!this.tPrev || this.tPrev.w !== this.W || this.tPrev.h !== this.H) {
      if (this.tPrev) { gl.deleteTexture(this.tPrev.tex); if (this.fbPrev) gl.deleteFramebuffer(this.fbPrev); }
      this.tPrev = createTex(gl, this.W, this.H);
      this.fbPrev = fboFor(gl, this.tPrev);
    }
    this.compose(this.fbPrev, -1);
    this.trans = 0;
    this.transStart = this.realT;
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
      this.trans = (this.realT - this.transStart) / 0.85;
      if (this.trans >= 1) this.trans = -1;
    }
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    this.runSim(dt);
    const src = SRC_OF(this.r, this.mediaOK);
    const fp = this.fieldProgram(src);
    if (fp) this.runField(fp, src);
    this.runSelect(src);
    if (this.r.fx.bloom > 0) this.runBloom();
    this.compose(null, this.trans);
    this.ptr.impulse = 0;
  }

  private timeQ(): number {
    const h = this.r.motion.hold;
    return h > 0 ? Math.floor(this.t * h) / h : this.t;
  }

  private runSim(dt: number) {
    const mode = this.r.interact.mode;
    const gl = this.gl;
    const simulate = mode === 'ripple' || mode === 'erase' || mode === 'paint';
    if (mode !== this.simMode) { this.simMode = mode; this.resetSim(); }
    if (!simulate) return;
    const P = this.ptr, it = this.r.interact, p = this.pSim;
    const src = this.tSim[this.simIdx], dst = this.simIdx ^ 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbSim[dst]);
    gl.viewport(0, 0, this.cols, this.rows);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(loc(gl, p, 'uPrev'), 0);
    gl.uniform2f(loc(gl, p, 'uGrid'), this.cols, this.rows);
    gl.uniform2f(loc(gl, p, 'uCell'), this.cw, this.ch);
    gl.uniform4f(loc(gl, p, 'uSeg'), P.px, P.py, P.x, P.y);
    gl.uniform1f(loc(gl, p, 'uBrushR'), Math.max(4, it.radius * this.H * 0.5));
    gl.uniform1f(loc(gl, p, 'uStr'), it.strength);
    const auto = it.auto && performance.now() - P.lastReal > 2500;
    const active = P.on > 0.2 ? Math.min(1, P.moved / Math.max(2, this.cw * 0.5)) + (P.down ? 0.6 : 0) + (auto ? 0.5 : 0) : 0;
    gl.uniform1f(loc(gl, p, 'uActive'), Math.min(1.2, active));
    gl.uniform1f(loc(gl, p, 'uImpulse'), P.impulse * (P.on > 0.2 ? 1 : 0));
    gl.uniform1f(loc(gl, p, 'uEnc'), this.halfFloat ? 0 : 1);
    gl.uniform1f(loc(gl, p, 'uDt'), dt || 1 / 60);
    gl.uniform1i(loc(gl, p, 'uMode'), ['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'].indexOf(mode));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.simIdx = dst;
  }

  private runField(p: Program, src: FieldSource) {
    const gl = this.gl, r = this.r;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbField);
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
    (layers.length ? layers : [{ ...r.layers[0], on: true }]).forEach((l, i) => {
      A.set([l.scale, (l.rot * Math.PI) / 180, l.x, l.y], i * 4);
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
    gl.uniform1f(loc(gl, p, 'uMorph'), r.text.morph);
    this.bindMediaUniforms(p, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tText.tex);
    gl.uniform1i(loc(gl, p, 'uText'), 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.tSim[this.simIdx].tex);
    gl.uniform1i(loc(gl, p, 'uSim'), 4);
    gl.uniform1f(loc(gl, p, 'uSimEnc'), this.halfFloat ? 0 : 1);
    this.bindPointerUniforms(p);
    void src;
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    gl.uniform1i(loc(gl, p, 'uIMode'), ['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'].indexOf(it.mode));
    gl.uniform2f(loc(gl, p, 'uPtr'), P.x, P.y);
    gl.uniform1f(loc(gl, p, 'uPtrOn'), P.on);
    gl.uniform1f(loc(gl, p, 'uIStr'), it.strength);
    gl.uniform1f(loc(gl, p, 'uIRad'), it.radius);
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
    gl.uniform1f(loc(gl, p, 'uJitter'), r.glyph.jitter);
    gl.uniform1f(loc(gl, p, 'uWordsN'), this.wordsN);
    gl.uniform1i(loc(gl, p, 'uCMode'), r.color.mode === 'source' ? 1 : 0);
    gl.uniform1i(loc(gl, p, 'uMap'), ['luma', 'x', 'y', 'radial', 'angle', 'noise'].indexOf(r.color.map));
    gl.uniform1i(loc(gl, p, 'uIsMedia'), src === 'media' ? 1 : 0);
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
      const st = messageState(m, lay.count, this.t);
      gl.uniform1i(loc(gl, p, 'uMsgMode'), ['static', 'type', 'decode', 'marquee'].indexOf(m.mode));
      gl.uniform1f(loc(gl, p, 'uMsgProg'), st.prog);
      gl.uniform1f(loc(gl, p, 'uMsgWin'), 6);
      gl.uniform1f(loc(gl, p, 'uMsgShift'), Math.floor(st.shift));
      gl.uniform1f(loc(gl, p, 'uMsgW'), lay.width);
      if (st.cursorOn && st.cursor >= 0 && lay.cells.length) {
        const cell = lay.cells[Math.min(lay.cells.length - 1, st.cursor)];
        cursor = cell; cursorOn = 1;
      }
    }
    const mc = m.color ? hexToRgb(m.color) : [1, 1, 1];
    gl.uniform3f(loc(gl, p, 'uMsgColor'), mc[0], mc[1], mc[2]);
    gl.uniform1f(loc(gl, p, 'uMsgUseColor'), m.color ? 1 : 0);
    gl.uniform2f(loc(gl, p, 'uCursor'), cursor[0], cursor[1]);
    gl.uniform1f(loc(gl, p, 'uCursorOn'), cursorOn);
    gl.uniform1f(loc(gl, p, 'uBlockIdx'), a.blockIdx);
    const it = r.interact, P = this.ptr;
    gl.uniform1i(loc(gl, p, 'uIMode'), ['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'].indexOf(it.mode));
    gl.uniform2f(loc(gl, p, 'uPtrCell'), P.x / this.cw, P.y / this.ch);
    gl.uniform1f(loc(gl, p, 'uPtrOn'), P.on);
    gl.uniform1f(loc(gl, p, 'uIStr'), it.strength);
    gl.uniform1f(loc(gl, p, 'uIRadCells'), (it.radius * this.H) / this.cw);
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
    // never sample the texture we are rendering into (feedback loop)
    const prevTex = this.tPrev && target !== this.fbPrev ? this.tPrev.tex : this.tField.tex;
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
    gl.uniform1f(loc(gl, p, 'uChroma'), fx.chroma);
    gl.uniform1f(loc(gl, p, 'uGrain'), fx.grain);
    gl.uniform1f(loc(gl, p, 'uFlicker'), fx.flicker);
    gl.uniform1f(loc(gl, p, 'uGridAmt'), fx.grid);
    gl.uniform1f(loc(gl, p, 'uTime'), this.realT);
    gl.uniform1f(loc(gl, p, 'uMsgBox'), r.msg.on ? r.msg.box : 0);
    gl.uniform1f(loc(gl, p, 'uTrans'), trans);
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
