/**
 * Monotrama runtime — the engine packaged for other websites.
 * Bundled + minified by scripts/runtime-plugin.ts and inlined into exported code.
 *   Monotrama.register(patterns)            add GLSL pattern chunks
 *   Monotrama.mount(canvasOrElementOrSelector, recipe, options) → controller
 *   <monotrama-field recipe='{…}' poster="imagen.png"></monotrama-field>
 * It never throws into the host page: without WebGL 2 it shows the recipe's background colour and,
 * when given, the poster image (options.poster / poster attribute), and returns a controller that does nothing.
 */
import { AsciiEngine } from '../engine/engine';
import { normalizeRecipe, type Recipe } from '../engine/recipe';
import type { PatternLibrary } from '../engine/glsl/patterns';

interface MountOptions {
  patterns?: PatternLibrary;
  interactive?: boolean;
  pointer?: 'canvas' | 'window';
  media?: string;
  paused?: boolean;
  /** Image shown when WebGL 2 is not available. */
  poster?: string;
}

interface Controller {
  engine: AsciiEngine | null;
  play(): void;
  pause(): void;
  set(next: unknown): void;
  destroy(): void;
}

const registry: PatternLibrary = {};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

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

function mount(target: HTMLCanvasElement | HTMLElement | string, recipe: unknown, o: MountOptions = {}): Controller | null {
  const r: Recipe = normalizeRecipe(recipe);
  const found = toCanvas(target);
  if (!found) {
    console.warn('Monotrama: no encuentro el elemento', target);
    return null;
  }
  const { canvas, created } = found;
  const still = reduced() || !!o.paused;
  const calm = (x: Recipe) => { if (still) x.interact.auto = false; return x; }; // no wandering ghost pointer when motion is reduced
  const remove = () => { if (created) canvas.remove(); };
  let engine: AsciiEngine;
  try {
    engine = new AsciiEngine(canvas, calm(r), {
      library: { ...registry, ...(o.patterns ?? {}) }, googleFonts: true, interactive: o.interactive ?? true,
      pointerTarget: o.pointer ?? 'window', observeVisibility: true, reducedMotion: still,
      maxPixelRatio: 1.5, adaptive: true,
    });
  } catch {
    // no WebGL 2 (or it failed to start): keep the page's look with the background colour and the poster
    canvas.style.background = o.poster ? `${r.color.bg} url(${JSON.stringify(o.poster)}) center / cover no-repeat` : r.color.bg;
    return { engine: null, play() {}, pause() {}, set() {}, destroy: remove };
  }
  if (o.media && (r.source === 'image' || r.source === 'video')) {
    if (r.source === 'image') {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => engine.setMedia('image', im);
      im.onerror = () => console.warn('Monotrama: no se pudo cargar la imagen (¿ruta o CORS?)', o.media);
      im.src = o.media;
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = !still;
      v.setAttribute('playsinline', '');
      v.src = o.media;
      v.playbackRate = r.media.rate;
      if (!still) void v.play().catch(() => undefined);
      engine.setMedia('video', v);
    }
  }
  return {
    engine,
    play: () => engine.play(),
    pause: () => engine.pause(),
    set: (next: unknown) => engine.set(calm(normalizeRecipe(next)), { transition: true }),
    destroy: () => { engine.destroy(); remove(); },
  };
}

class MonotramaField extends HTMLElement {
  private ctl: Controller | null = null;
  connectedCallback() {
    // The exported file defines this element and registers its patterns right after: an element that is
    // already on the page (the usual `<script defer>`) is upgraded during the definition, before that
    // registration. Mounting a microtask later sees the patterns (without them the piece stays blank).
    queueMicrotask(() => { if (this.isConnected && !this.ctl) this.start(); });
  }
  private start() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>:host{display:block;position:relative;min-height:120px}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}</style>';
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
    });
  }
  disconnectedCallback() { this.ctl?.destroy(); this.ctl = null; }
}

const api = {
  version: '2.1.0',
  register: (p: PatternLibrary) => { Object.assign(registry, p); },
  mount,
};
const w = window as unknown as { Monotrama?: typeof api };
if (!w.Monotrama) {
  w.Monotrama = api;
  if (typeof customElements !== 'undefined' && !customElements.get('monotrama-field')) customElements.define('monotrama-field', MonotramaField);
} else {
  w.Monotrama.register = w.Monotrama.register ?? api.register;
}
