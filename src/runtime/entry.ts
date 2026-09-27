/**
 * Monotrama runtime — the engine packaged for other websites.
 * Bundled + minified by scripts/runtime-plugin.ts and inlined into exported code.
 *   Monotrama.register(patterns)            add GLSL pattern chunks
 *   Monotrama.mount(canvasOrSelector, recipe, options) → controller
 *   <monotrama-field recipe='{…}'></monotrama-field>
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
}

const registry: PatternLibrary = {};
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function toCanvas(target: HTMLCanvasElement | HTMLElement | string): HTMLCanvasElement {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) throw new Error('Monotrama: no encuentro el elemento ' + target);
  if (el instanceof HTMLCanvasElement) return el;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  c.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.appendChild(c);
  return c;
}

function mount(target: HTMLCanvasElement | HTMLElement | string, recipe: unknown, o: MountOptions = {}) {
  const r: Recipe = normalizeRecipe(recipe);
  const canvas = toCanvas(target);
  let engine: AsciiEngine;
  try {
    engine = new AsciiEngine(canvas, r, {
      library: { ...registry, ...(o.patterns ?? {}) }, googleFonts: true, interactive: o.interactive ?? true,
      pointerTarget: o.pointer ?? 'window', observeVisibility: true, reducedMotion: reduced() || !!o.paused,
      maxPixelRatio: 1.5, adaptive: true,
    });
  } catch {
    canvas.style.background = r.color.bg;
    return null;
  }
  if (o.media && (r.source === 'image' || r.source === 'video')) {
    if (r.source === 'image') {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => engine.setMedia('image', im);
      im.src = o.media;
    } else {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.src = o.media;
      v.playbackRate = r.media.rate;
      void v.play().catch(() => undefined);
      engine.setMedia('video', v);
    }
  }
  return {
    engine,
    play: () => engine.play(),
    pause: () => engine.pause(),
    set: (next: unknown) => engine.set(normalizeRecipe(next), { transition: true }),
    destroy: () => engine.destroy(),
  };
}

type Ctl = ReturnType<typeof mount>;

class MonotramaField extends HTMLElement {
  private ctl: Ctl = null;
  connectedCallback() {
    if (this.ctl) return;
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
      pointer: (this.getAttribute('pointer') as 'canvas' | 'window') ?? 'canvas',
      interactive: !this.hasAttribute('static'),
      media: this.getAttribute('src') ?? undefined,
      paused: this.hasAttribute('paused'),
    });
  }
  disconnectedCallback() { this.ctl?.destroy(); this.ctl = null; }
}

const api = {
  version: '2.0.0',
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
