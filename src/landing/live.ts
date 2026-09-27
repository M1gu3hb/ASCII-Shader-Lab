/**
 * Live canvases of the landing. The engine is its own chunk (./engines), requested when the first canvas
 * needs it and never in the way of the first paint. It picks WebGL 2 when it works and the basic engine
 * (Canvas 2D) otherwise, so no canvas stays empty. Every canvas pauses while it is off screen.
 */
import type { Recipe } from '../engine/recipe';
import type { Renderer } from '../engine/renderer';
import type { TransitionKind, TransitionSpec } from '../engine/transitions';
import type { GLStatus } from '../engine/support';
import { level } from './motion';

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

type Engines = typeof import('./engines');
let chunk: Promise<Engines> | null = null;
export const engines = () => (chunk ??= import('./engines'));

/**
 * «Pausar animaciones» (the button in the header) stops every live canvas, video and text player of the
 * page; with «reduce motion» the page starts that way and the same button lets you animate it.
 */
export interface Pausable { pause(): void; play(): void }
let paused = reduced;
const tracked = new Set<Pausable>();
const listeners = new Set<(paused: boolean) => void>();
export const isPaused = () => paused;
export function onPause(fn: (paused: boolean) => void) { listeners.add(fn); fn(paused); }
export function setPaused(v: boolean) {
  paused = v;
  tracked.forEach(p => (v ? p.pause() : p.play()));
  listeners.forEach(fn => fn(v));
}

/** A renderer that follows the page's pause: stopped, and without the wandering pointer, while paused. */
export function track(e: Renderer) {
  tracked.add({
    pause() { e.pause(); if (e.recipe.interact.auto) e.set({ ...e.recipe, interact: { ...e.recipe.interact, auto: false } }); },
    play() { e.play(); const r = e.recipe; if (!r.interact.auto && r.interact.mode !== 'none') e.set({ ...r, interact: { ...r.interact, auto: true } }); },
  });
  if (paused) e.pause();
}

/** While the page is paused (or motion is reduced), a canvas is a still frame: no wandering pointer. */
export function still(r: Recipe): Recipe {
  if (paused) r.interact.auto = false;
  return r;
}

type Opts = import('./engines').LandingOptions;
let onBasic: ((status: GLStatus, words: Engines['basicWords']) => void) | null = null;
export const whenBasic = (fn: typeof onBasic) => { onBasic = fn; };

export async function live(canvas: HTMLCanvasElement, r: Recipe, o: Opts = {}): Promise<Renderer | null> {
  canvas.style.background = r.color.bg;
  const m = await engines();
  const basic = m.basicHere();
  const made = await m.mount(canvas, still(r), {
    observeVisibility: true, reducedMotion: reduced, autoplay: !paused, maxPixelRatio: 1.25, pointerTarget: 'canvas', ...o,
    // the CPU draws every pixel in basic mode: keep the canvases at 1 device pixel per CSS pixel
    ...(basic ? { maxPixelRatio: 1 } : {}),
  });
  if (made?.renderer.kind === 'basic') onBasic?.(made.status, m.basicWords);
  return made?.renderer ?? null;
}

/**
 * A transition that fits the change and the device: full motion gets the asked kind; low motion a short
 * dissolve (never the costly mosaic); no motion, none (the engines also skip it under reduced motion).
 */
export function morph(kind: TransitionKind, duration = 0.85, extra: Partial<TransitionSpec> = {}): TransitionSpec | false {
  if (level === 'none') return false;
  if (level === 'low') return { kind: kind === 'mosaico' ? 'disolucion' : kind, duration: Math.min(0.45, duration), ...extra };
  return { kind, duration, seed: Math.floor(Math.random() * 1000), ...extra };
}

/** Runs `start` once when `el` comes within `margin` of the viewport. */
export function near(el: Element, start: () => void, margin = '400px') {
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: margin });
  io.observe(el);
}

/** Resolves when the renderer has shown the last change asked of it (its transition included). */
export function settled(e: Renderer, maxMs = 2500): Promise<void> {
  const t0 = performance.now();
  return new Promise(res => {
    const check = () => (!e.busy || performance.now() - t0 > maxMs ? res() : requestAnimationFrame(check));
    requestAnimationFrame(check);
  });
}
