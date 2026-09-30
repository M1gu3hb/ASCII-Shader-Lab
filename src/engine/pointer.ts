/**
 * Pointer events of a live canvas, for both engines: the older modes' single pointer (Linterna, Lupa,
 * Ondas, Pincel…) and the gesture modes' touch field (engine/touch.ts), which takes every finger, the pen's
 * pressure and the wheel.
 *  - Only the primary pointer moves the older modes' pointer: a second finger no longer makes it jump.
 *  - Events carry their time on the touch field's clock, so gestures replay the same at any frame rate.
 *  - With the canvas as target, a mouse or pen that presses keeps its gesture when it leaves the canvas
 *    (pointer capture); a finger always does. The page never scrolls from the canvas in the studio
 *    (touch-action: none there); pasted code sets touch-action: pan-y (see runtime/api.ts), so a page keeps
 *    scrolling vertically and every other gesture reaches the piece.
 *  - The wheel zooms only in «Zoom con los dedos», over the canvas, with Ctrl (a trackpad pinch) or where
 *    the host said the canvas never scrolls (wheelZoom): a page with the piece in it keeps its wheel.
 */
import type { InteractMode, Recipe } from './recipe';
import { TouchField, eraseRate, isTouchMode, paintRate, wander, type PointerType, type TouchKind } from './touch';

/** The modes run by the pointer simulation of the engines (ripples and trails on the GPU / in sim.ts). */
export const SIM_MODES: readonly InteractMode[] = ['ripple', 'erase', 'paint'];

/** The older modes' ghost: where it is at real time t (fractions of the canvas). */
export const legacyGhost = (realT: number) => wander(realT * 0.35);

/**
 * Seconds the pointer simulation keeps changing after its last input: the ripples fade under one level
 * in 255 after 6 s (×0.985 per step), Pincel's trail after 5.6 time constants, Borrador's after its ramp.
 */
export function simSettle(it: Recipe['interact']): number {
  const d = it.decay ?? 0.5;
  if (it.mode === 'ripple') return 6;
  if (it.mode === 'paint') return 5.6 / paintRate(d) + 0.2;
  if (it.mode === 'erase') return 1 / eraseRate(d) + 0.2;
  return 0;
}

/** Pressure of a pen (0..1), or -1 for anything else (the older modes then use their usual strength). */
export const penPressure = (e: PointerEvent) => (e.pointerType === 'pen' ? Math.max(0, Math.min(1, e.pressure)) : -1);

/** How much a pen's pressure scales the older modes' brush (Pincel, Borrador, Ondas): 1 without a pen. */
export const pressureGain = (p: number) => (p < 0 ? 1 : Math.min(1.75, Math.max(0.25, 0.25 + 1.5 * p)));
export const pressureRadius = (p: number) => (p < 0 ? 1 : 0.55 + 0.9 * p);

export interface LegacyPtr {
  x: number; y: number; tx: number; ty: number; px: number; py: number;
  on: number; targetOn: number; down: boolean;
  /** realT (seconds) of the last real pointer event. */
  lastReal: number;
  impulse: number; moved: number;
  /** Pen pressure 0..1, -1 without a pen. */
  pressure: number;
}

export interface HubHost {
  target: 'canvas' | 'window';
  wheelZoom: boolean;
  /** Canvas size in device pixels. */
  size(): [number, number];
  mode(): InteractMode;
  ptr: LegacyPtr;
  touch: TouchField;
  realT(): number;
  wake(): void;
}

export class PointerHub {
  /** performance.now() when the touch field was last stepped (its `now` then). */
  private wall = typeof performance !== 'undefined' ? performance.now() : 0;
  private off: Array<() => void> = [];
  /** The mouse's pointer id (for when it leaves the window). */
  private mouseId = 1;

  constructor(private canvas: HTMLCanvasElement, private h: HubHost) {
    const opts: AddEventListenerOptions = { passive: true };
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: never) => void, o: AddEventListenerOptions | boolean = opts) => {
      el.addEventListener(type, fn as EventListener, o);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, o));
    };
    const el: EventTarget = h.target === 'canvas' ? canvas : window;
    on(el, 'pointermove', (e: PointerEvent) => this.move(e));
    on(el, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(el, 'pointerup', (e: PointerEvent) => this.up(e));
    on(el, 'pointercancel', (e: PointerEvent) => this.leave(e, 'cancel'));
    if (h.target === 'canvas') {
      on(canvas, 'pointerleave', (e: PointerEvent) => this.leave(e, 'leave'));
      on(canvas, 'wheel', (e: WheelEvent) => this.wheel(e), { passive: false });
    } else {
      on(document, 'mouseout', (e: MouseEvent) => { if (!e.relatedTarget) this.gone(); });
      on(window, 'blur', () => this.gone());
    }
  }

  /** The touch field was just stepped: event times count from now. */
  stepped() { this.wall = performance.now(); }

  destroy() { this.off.forEach(f => f()); this.off = []; }

  private pos(e: PointerEvent | WheelEvent) {
    const rc = this.canvas.getBoundingClientRect();
    if (!rc.width || !rc.height) return null;
    const [W, H] = this.h.size();
    const x = ((e.clientX - rc.left) * W) / rc.width, y = ((e.clientY - rc.top) * H) / rc.height;
    return { x, y, inside: x >= 0 && y >= 0 && x <= W && y <= H };
  }

  /** The event's time on the touch field's clock. */
  private t(e: Event) {
    const T = this.h.touch.now;
    const t = T + (e.timeStamp - this.wall) / 1000;
    return Math.max(T - 0.05, Math.min(T + 0.1, Number.isFinite(t) ? t : T));
  }

  private feed(kind: TouchKind, e: PointerEvent, x: number, y: number) {
    if (!isTouchMode(this.h.mode())) return;
    const type: PointerType = e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (type === 'mouse') this.mouseId = e.pointerId;
    this.h.touch.input({ kind, id: e.pointerId, x, y, t: this.t(e), pressure: type === 'pen' ? e.pressure : undefined, type });
    this.h.wake();
  }

  private move(e: PointerEvent) {
    const p = this.pos(e); if (!p) return;
    if (e.isPrimary !== false) {
      const P = this.h.ptr;
      if (P.targetOn === 0 && p.inside) { P.x = P.px = p.x; P.y = P.py = p.y; }
      P.tx = p.x; P.ty = p.y; P.targetOn = p.inside ? 1 : 0; P.lastReal = this.h.realT();
      P.pressure = penPressure(e);
      if (this.h.mode() !== 'none') this.h.wake();
    }
    this.feed('move', e, p.x, p.y);
  }

  private down(e: PointerEvent) {
    const p = this.pos(e); if (!p) return;
    this.move(e);
    if (e.isPrimary !== false) { this.h.ptr.down = true; this.h.ptr.impulse = 1; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // a mouse or a pen keeps its drag outside the canvas (a finger always does)
    if (this.h.target === 'canvas' && e.pointerType !== 'touch' && isTouchMode(this.h.mode())) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
    }
    this.feed('down', e, p.x, p.y);
  }

  private up(e: PointerEvent) {
    if (e.isPrimary !== false) this.h.ptr.down = false;
    const p = this.pos(e);
    if (p) this.feed('up', e, p.x, p.y);
  }

  private leave(e: PointerEvent, kind: 'leave' | 'cancel') {
    if (e.isPrimary !== false) {
      if (e.pointerType !== 'mouse') this.h.ptr.down = false;
      this.h.ptr.targetOn = 0;
    }
    const p = this.pos(e);
    this.feed(kind, e, p?.x ?? 0, p?.y ?? 0);
  }

  /** The pointer left the window (window target). */
  private gone() {
    this.h.ptr.targetOn = 0;
    if (isTouchMode(this.h.mode())) {
      const t = this.h.touch.now;
      this.h.touch.input({ kind: 'leave', id: this.mouseId, x: 0, y: 0, t });
    }
  }

  private wheel(e: WheelEvent) {
    if (this.h.mode() !== 'zoom' || !(e.ctrlKey || this.h.wheelZoom)) return;
    const p = this.pos(e); if (!p) return;
    e.preventDefault();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1) * (e.ctrlKey ? 4 : 1);
    this.h.touch.wheel(dy, p.x, p.y);
    this.h.wake();
  }
}
