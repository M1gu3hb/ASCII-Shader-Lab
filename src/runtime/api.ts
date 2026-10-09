/**
 * GLYPHOS runtime — the engine packaged for other websites (shared by both bundles, see entry.ts and
 * entry-basic.ts; scripts/runtime-plugin.ts bundles and minifies them and the studio inlines one into
 * exported code).
 *   Glyphos.register(patterns)            add GLSL pattern chunks
 *   Glyphos.mount(canvasOrElementOrSelector, recipe, options) → controller
 *   <glyphos-field recipe='{…}' poster="imagen.png" scrim="gradient"></glyphos-field>
 * It never throws into the host page. Without WebGL 2 it draws with the basic engine (Canvas 2D) when the
 * bundle carries it (entry-basic.ts, plus the CPU patterns the piece uses); otherwise it shows the recipe's
 * background colour and, when given, the poster image (options.poster / poster attribute), and returns a
 * controller that does nothing.
 * options.scrim (attributes scrim, scrim-color, scrim-opacity, scrim-blur) adds the «zona protegida»: a
 * layer over the whole background ('full') or fading from where text usually sits ('gradient').
 * Touch: a piece that listens on its own canvas gets touch-action: pan-y (unless the page set another), so
 * a vertical swipe still scrolls the page while taps, sideways drags, pinches and pens reach the piece
 * (engine/pointer.ts). The wheel is never taken: only Ctrl + wheel over the canvas zooms «Zoom con los dedos».
 */
import { AsciiEngine } from '../engine/engine';
import { PATTERN_IDS } from '../engine/catalog';
import { normalizeRecipe, type Recipe } from '../engine/recipe';
import type { PatternLibrary } from '../engine/glsl/patterns';
import type { Renderer } from '../engine/renderer';
import type { BasicEngineOptions } from '../engine/basic/engine';
import { gradientSide, scrimCss } from '../shared/scrim';

/** The protected zone: colour, opacity (0..1), backdrop blur in px and shape. */
interface ScrimOption { color: string; opacity: number; blur: number; shape: 'full' | 'gradient' }

interface MountOptions {
  patterns?: PatternLibrary;
  interactive?: boolean;
  pointer?: 'canvas' | 'window';
  media?: string;
  paused?: boolean;
  /** Image shown when neither WebGL 2 nor the basic engine can draw. */
  poster?: string;
  /** A layer between the background and the page's text, which darkens (or lightens) and blurs the glyphs. */
  scrim?: ScrimOption | null;
  /** false: never use the basic engine, even when the bundle carries it (poster or colour instead). */
  basic?: boolean;
}

export interface Controller {
  engine: Renderer | null;
  /** Which engine draws: 'webgl2', 'basic' (Canvas 2D) or null (poster / background colour). */
  kind: 'webgl2' | 'basic' | null;
  play(): void;
  pause(): void;
  set(next: unknown): void;
  destroy(): void;
}

/** What entry-basic.ts adds: the Canvas 2D engine, the helpers its patterns use and their registry. */
export interface BasicSupport {
  Engine: new (canvas: HTMLCanvasElement, recipe: Recipe, opts: BasicEngineOptions) => Renderer;
  core: Record<string, unknown>;
  add(id: string, p: unknown): void;
  has(id: string): boolean;
}

interface Api {
  version: string;
  register(p: PatternLibrary): void;
  mount: typeof mount;
  __basic?: BasicSupport;
}

const VERSION = '2.4.0';
const registry: PatternLibrary = {};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const win = () => window as unknown as { Glyphos?: Api; Monotrama?: Api };

function toCanvas(target: HTMLCanvasElement | HTMLElement | string): { canvas: HTMLCanvasElement; created: boolean } | null {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return null;
  if (el instanceof HTMLCanvasElement) return { canvas: el, created: false };
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  c.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(c);
  return { canvas: c, created: true };
}

/**
 * Adds the protected zone over the canvas (inside the same box). A gradient fades from the left in a
 * wide box and from the bottom in a tall one, and follows the box as it resizes. Returns its remover.
 */
function addScrim(canvas: HTMLCanvasElement, s: ScrimOption | null | undefined): () => void {
  if (!s || (s.shape !== 'full' && s.shape !== 'gradient') || !(s.opacity > 0 || s.blur > 0)) return () => {};
  const box = canvas.parentElement ?? ((canvas.getRootNode() as ShadowRoot).host as HTMLElement | undefined);
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const z = { color: String(s.color || '#000000'), opacity: Math.max(0, Math.min(1, +s.opacity || 0)), blur: Math.max(0, Math.min(40, +s.blur || 0)), shape: s.shape };
  const paint = () => { el.style.cssText = 'position:absolute;inset:0;pointer-events:none;' + scrimCss(z, gradientSide(box?.clientWidth || 1, box?.clientHeight || 1)); };
  paint();
  canvas.after(el);
  const ro = z.shape === 'gradient' && box && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
  if (ro && box) ro.observe(box);
  return () => { ro?.disconnect(); el.remove(); };
}

/**
 * The basic engine on this canvas, or null when the bundle does not carry it (or it cannot start).
 * A canvas that got a WebGL context before the engine failed cannot give a 2D one: a clean copy takes its
 * place (same attributes and style). Returns the canvas it ended up drawing on.
 */
function startBasic(canvas: HTMLCanvasElement, r: Recipe, opts: BasicEngineOptions): { engine: Renderer; canvas: HTMLCanvasElement } | null {
  const B = win().Glyphos?.__basic;
  if (!B) return null;
  let c = canvas;
  try {
    if (!c.getContext('2d')) {
      const fresh = c.cloneNode(false) as HTMLCanvasElement;
      c.replaceWith(fresh);
      c = fresh;
    }
    return { engine: new B.Engine(c, r, opts), canvas: c };
  } catch {
    return null;
  }
}

function mount(target: HTMLCanvasElement | HTMLElement | string, recipe: unknown, o: MountOptions = {}): Controller | null {
  const patterns = new Set([...PATTERN_IDS, ...Object.keys(registry), ...Object.keys(o.patterns ?? {})]);
  let r: Recipe;
  try { r = normalizeRecipe(recipe, patterns); }
  catch (error) { console.warn('GLYPHOS:', error instanceof Error ? error.message : 'Receta incompatible'); return null; }
  const found = toCanvas(target);
  if (!found) {
    console.warn('GLYPHOS: no encuentro el elemento', target);
    return null;
  }
  const { created } = found;
  let canvas = found.canvas;
  const still = reduced() || !!o.paused;
  const calm = (x: Recipe) => { if (reduced()) x.interact.auto = false; return x; }; // no wandering ghost pointer when motion is reduced
  // a vertical swipe scrolls the page; every other gesture on the canvas reaches the piece
  if ((o.interactive ?? true) && (o.pointer ?? 'window') === 'canvas' && !canvas.style.touchAction) canvas.style.touchAction = 'pan-y';
  const unscrim = addScrim(canvas, o.scrim);
  const remove = () => { unscrim(); if (created) canvas.remove(); };
  const common = {
    googleFonts: true, interactive: o.interactive ?? true, pointerTarget: o.pointer ?? 'window',
    observeVisibility: true, autoplay: !still, reducedMotion: reduced(), adaptive: true,
  } as const;
  let engine: Renderer;
  let kind: 'webgl2' | 'basic';
  try {
    engine = new AsciiEngine(canvas, calm(r), { ...common, library: { ...registry, ...(o.patterns ?? {}) }, maxPixelRatio: 1.5 });
    kind = 'webgl2';
  } catch {
    // no WebGL 2 (or it failed to start): the basic engine when this bundle has it, at 1 device pixel per
    // CSS pixel (the processor draws every pixel)…
    const b = o.basic === false ? null : startBasic(canvas, calm(r), { ...common, maxPixelRatio: 1 });
    if (!b) {
      // …or the page's look with the background colour and the poster
      canvas.style.background = o.poster ? `${r.color.bg} url(${JSON.stringify(o.poster)}) center / cover no-repeat` : r.color.bg;
      return { engine: null, kind: null, play() {}, pause() {}, set() {}, destroy: remove };
    }
    engine = b.engine;
    canvas = b.canvas;
    kind = 'basic';
  }
  let releaseMedia = () => {};
  let mediaVideo: HTMLVideoElement | null = null;
  if (o.media && (r.source === 'image' || r.source === 'video')) {
    if (r.source === 'image') {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => engine.setMedia('image', im);
      im.onerror = () => console.warn('GLYPHOS: no se pudo cargar la imagen (¿ruta o CORS?)', o.media);
      im.src = o.media;
      releaseMedia = () => { im.onload = null; im.onerror = null; im.removeAttribute('src'); };
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = !still;
      v.setAttribute('playsinline', '');
      v.src = o.media;
      mediaVideo = v;
      v.playbackRate = r.media.rate;
      if (!still) void v.play().catch(() => undefined);
      engine.setMedia('video', v);
      releaseMedia = () => { v.pause(); v.removeAttribute('src'); v.load(); };
    }
  }
  let unwatch = () => {};
  const ctl: Controller = {
    engine,
    kind,
    play: () => { engine.play(); if (mediaVideo) void mediaVideo.play().catch(() => undefined); },
    pause: () => { engine.pause(); mediaVideo?.pause(); },
    set: (next: unknown) => {
      try {
        const recipe = calm(normalizeRecipe(next, patterns));
        engine.set(recipe, { transition: true });
        if (mediaVideo) mediaVideo.playbackRate = recipe.media.rate;
      }
      catch { console.warn('GLYPHOS: receta incompatible; se conserva la pieza actual.'); }
    },
    destroy: () => { unwatch(); releaseMedia(); engine.destroy(); remove(); },
  };
  // a pasted block that its page takes away (a site that changes views without reloading) has nobody to
  // call destroy(): once its canvas has left the document for a moment, it stops and lets go of the context
  // (the Web Component and the React component clean up on their own)
  if (!created && !(canvas.getRootNode() instanceof ShadowRoot)) unwatch = watchRemoval(canvas, () => ctl.destroy());
  return ctl;
}

function watchRemoval(canvas: HTMLCanvasElement, done: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  let t: ReturnType<typeof setTimeout> | null = null;
  const mo = new MutationObserver(() => {
    if (canvas.isConnected || t) return;
    // moved rather than removed: it is back before the check
    t = setTimeout(() => { t = null; if (!canvas.isConnected) done(); }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  return () => { mo.disconnect(); if (t) clearTimeout(t); };
}

class GlyphosField extends HTMLElement {
  static observedAttributes = ['recipe', 'src', 'paused', 'static', 'pointer', 'poster', 'no-basic', 'scrim', 'scrim-color', 'scrim-opacity', 'scrim-blur'];
  private updateQueued = false;
  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (old === value || !this.isConnected) return;
    if (name === 'paused' && this.ctl) { if (value === null) this.ctl.play(); else this.ctl.pause(); return; }
    if (name === 'recipe') {
      try {
        const patterns = new Set([...PATTERN_IDS, ...Object.keys(registry)]);
        const next = normalizeRecipe(JSON.parse(value ?? this.querySelector('script[type="application/json"]')?.textContent ?? '{}'), patterns);
        // A changed source must rebind src; an invalid recipe must retain the current scene.
        if (this.ctl?.engine && this.ctl.engine.recipe.source === next.source) { this.ctl.set(next); return; }
      } catch { console.warn('GLYPHOS: el atributo recipe no contiene una receta compatible.'); return; }
    }
    if (this.queued) return; // The first mount already reads the latest attributes.
    if (this.updateQueued) return;
    this.updateQueued = true;
    queueMicrotask(() => {
      this.updateQueued = false;
      if (!this.isConnected) return;
      this.disconnectedCallback(); this.start();
    });
  }
  private ctl: Controller | null = null;
  private queued = false;
  connectedCallback() {
    // an element already on the page is upgraded while the runtime defines it, before the rest of its
    // script has registered the piece's patterns: start once that script has run
    if (this.ctl || this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; if (this.isConnected && !this.ctl) this.start(); });
  }
  private start() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:relative;min-height:120px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y}</style>';
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    root.appendChild(cv);
    let recipe: unknown = {};
    const attr = this.getAttribute('recipe');
    const script = this.querySelector('script[type="application/json"]');
    try { recipe = JSON.parse(attr ?? script?.textContent ?? '{}'); } catch { /* defaults */ }
    this.ctl = mount(cv, recipe, {
      pointer: this.getAttribute('pointer') === 'window' ? 'window' : 'canvas',
      interactive: !this.hasAttribute('static'),
      media: this.getAttribute('src') || undefined,
      paused: this.hasAttribute('paused'),
      poster: this.getAttribute('poster') || undefined,
      scrim: this.scrim(),
      basic: !this.hasAttribute('no-basic'),
    });
  }
  disconnectedCallback() {
    this.ctl?.destroy();
    this.ctl = null;
    // the shadow root keeps only its style: a later connect draws on a new canvas
    this.shadowRoot?.querySelectorAll('canvas, div').forEach(el => el.remove());
  }
  private scrim(): ScrimOption | null {
    const shape = this.getAttribute('scrim');
    if (shape !== 'full' && shape !== 'gradient') return null;
    const num = (name: string, fb: number) => { const v = parseFloat(this.getAttribute(name) ?? ''); return Number.isFinite(v) ? v : fb; };
    return { shape, color: this.getAttribute('scrim-color') || '#000000', opacity: num('scrim-opacity', 0.6), blur: num('scrim-blur', 4) };
  }
}

/**
 * Defines window.Glyphos and <glyphos-field> once per page. When another export already did, the
 * first engine stays in charge (its mount is the one every snippet calls); a bundle with the basic engine
 * still lends it to a page that lacks it, since mount looks for it when a piece starts.
 */
export function install(basic?: BasicSupport) {
  const w = win();
  if (!w.Glyphos) {
    const api: Api = { version: VERSION, register: (p: PatternLibrary) => { Object.assign(registry, p); }, mount };
    if (basic) api.__basic = basic;
    w.Glyphos = api;
    if (typeof customElements !== 'undefined') {
      if (!customElements.get('glyphos-field')) customElements.define('glyphos-field', GlyphosField);
      // the names from before the rename (Monotrama): pages written for them keep working with this file
      if (!customElements.get('monotrama-field')) customElements.define('monotrama-field', class extends GlyphosField {});
    }
    if (!w.Monotrama) w.Monotrama = api;
  } else {
    w.Glyphos.register = w.Glyphos.register ?? ((p: PatternLibrary) => { Object.assign(registry, p); });
    if (basic && !w.Glyphos.__basic) w.Glyphos.__basic = basic;
  }
}
