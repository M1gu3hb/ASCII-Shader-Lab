/**
 * The touch field: what the gesture modes leave on the cell grid (Rastro, Florecer, Anillos, Chispas,
 * Estirar, Revelar) and the view two of them move (Zoom con los dedos, Seguir). Plain JS shared by both
 * engines: the WebGL engine uploads `data` as a small texture, the basic engine reads the very same bytes,
 * so both draw the same thing, and the runtime of exported code carries it with them.
 *
 * Deterministic: it runs in fixed steps of 1/60 s and every input carries its time on the field's clock,
 * so the same gestures give the same field whatever the frame rate (a replay gives the same pixels).
 * The ghost pointer («Cursor automático») is a script per mode (a tap every so often, a press that holds,
 * a flick, a pinch…), a function of that clock: exports that render it frame by frame get the same motion.
 * Costs nothing when idle: `step()` says when nothing is left to draw, and the engines stop drawing.
 *
 * Coordinates: device pixels from the top-left of the canvas, like the engines' pointer. The view is a
 * map of the field's own coordinates (screen heights from the centre, y up): p → p·k + o.
 * Pure: no DOM.
 */
import type { InteractMode, Recipe, TouchGlyphs } from './recipe';

/** Length of one step of the field, in seconds. */
export const TOUCH_DT = 1 / 60;
/** Largest displacement Estirar keeps, in screen heights (the bytes B and A span ±this). */
export const DISP_MAX = 0.5;
/** How much a gesture's marks tint their cells' background (a soft glow behind the glyphs). */
export const TOUCH_TILE = 0.3;

/** Modes the field runs. */
export const TOUCH_MODES: readonly InteractMode[] = ['trail', 'blossom', 'rings', 'sparks', 'stretch', 'reveal', 'zoom', 'follow'];
/** Modes that write the cell grid (`data`). */
export const GRID_MODES: readonly InteractMode[] = ['trail', 'blossom', 'rings', 'sparks', 'stretch', 'reveal'];
/** Modes whose touches choose the glyph and the colour of the cells they reach (the select pass reads R and G). */
export const MARK_MODES: readonly InteractMode[] = ['trail', 'blossom', 'rings', 'sparks'];
/** Modes that move the whole view (`view`). */
export const VIEW_MODES: readonly InteractMode[] = ['zoom', 'follow'];

export const isTouchMode = (m: InteractMode) => TOUCH_MODES.includes(m);
export const isMarkMode = (m: InteractMode) => MARK_MODES.includes(m);

/** The pointer settings with every optional one resolved (see Recipe.interact). */
export interface TouchSettings {
  mode: InteractMode;
  strength: number;
  radius: number;
  auto: boolean;
  decay: number;
  ink: number;
  glyphs: TouchGlyphs;
}

export function touchSettings(it: Recipe['interact']): TouchSettings {
  return {
    mode: it.mode, strength: it.strength, radius: it.radius, auto: it.auto,
    decay: it.decay ?? 0.5, ink: it.ink ?? 0.6, glyphs: it.glyphs ?? 'dense',
  };
}

/** Index of a glyph behaviour as the passes read it: 0 dense, 1 random, 2 the piece's own. */
export const GLYPHS_INDEX: Record<TouchGlyphs, number> = { dense: 0, random: 1, piece: 2 };

/**
 * How long a trace lasts (time constant, seconds) for a «Duración» of `d` (0..1): 0.25 s to 4 s, 1 s in
 * the middle.
 */
export const traceTau = (d: number) => 0.25 * Math.pow(16, d);
/**
 * Pincel and Borrador's fade rates for a «Duración» of `d`: at 0.5 exactly what they always did
 * (Pincel e^(−0.9 t), Borrador −0.22 per second), four times faster at 0 and four times slower at 1.
 */
export const paintRate = (d: number) => 0.9 * Math.pow(4, 1 - 2 * d);
export const eraseRate = (d: number) => 0.22 * Math.pow(4, 1 - 2 * d);

export type TouchKind = 'down' | 'move' | 'up' | 'cancel' | 'leave';
export type PointerType = 'mouse' | 'pen' | 'touch';

/** A pointer event on the field's clock (`t`, seconds; see TouchField.clock). */
export interface TouchInput {
  kind: TouchKind;
  id: number;
  x: number;
  y: number;
  t: number;
  /** 0..1 (pens; ignored for mouse and touch). */
  pressure?: number;
  type?: PointerType;
}

interface Ptr {
  id: number;
  type: PointerType;
  x: number; y: number;
  /** Where it was at the end of the last step (a stroke is drawn from there). */
  px: number; py: number;
  down: boolean;
  pressure: number;
  t0: number; x0: number; y0: number;
  /** Farthest it went from where it was pressed. */
  moved: number;
  /** Seconds it has been held for Florecer (shrinks when the finger moves). */
  held: number;
  /** The last positions, for a flick's speed. */
  hist: Array<[number, number, number]>;
  ghost: boolean;
}

interface Ring { x: number; y: number; t0: number; amp: number; seed: number }
interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number; hint: number }
/** Two pointers pinching (or one dragging): the pattern point under their middle, and how far apart they were. */
interface Grab { ids: number[]; qx: number; qy: number; d0: number; k0: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A small integer hash to [0, 1): the same numbers in both engines (it is the same code). */
export function hashU(a: number, b: number): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The ghost's roaming path (fractions of the canvas), the one the older modes' ghost follows too. */
export function wander(s: number): [number, number] {
  return [0.5 + 0.32 * Math.sin(s * 1.3), 0.5 + 0.28 * Math.sin(s * 1.7 + 1.2)];
}

/** A spot for the k-th gesture of a ghost: spread over the canvas, away from its edges. */
const spot = (k: number, lo = 0.2, hi = 0.8): [number, number] => [lo + (hi - lo) * hashU(k, 11), lo + (hi - lo) * hashU(k, 29)];

export interface GhostPose { x: number; y: number; down: boolean }

/**
 * The ghost's pointers at time g for each mode (fractions of the canvas): what someone would do with it.
 * Rastro and Revelar roam, Estirar drags and lets go, Florecer presses and holds, Anillos taps, Chispas
 * flicks, Zoom pinches with two fingers, Seguir drifts slowly.
 */
export function ghostPoses(mode: InteractMode, g: number): GhostPose[] {
  switch (mode) {
    case 'trail': case 'reveal': {
      const [x, y] = wander(g * 0.35 * 1.1);
      return [{ x, y, down: mode === 'trail' }];
    }
    case 'follow': {
      const [x, y] = wander(g * 0.35 * 0.8);
      return [{ x, y, down: false }];
    }
    case 'stretch': {
      const P = 2.6, k = Math.floor(g / P), ph = g - k * P;
      const [sx, sy] = spot(k, 0.3, 0.7);
      const a = hashU(k, 5) * Math.PI * 2, u = Math.min(1, ph / 1.1), e = u * u * (3 - 2 * u);
      return [{ x: sx + Math.cos(a) * 0.24 * e, y: sy + Math.sin(a) * 0.2 * e, down: ph < 1.4 }];
    }
    case 'blossom': {
      const P = 3.6, k = Math.floor(g / P), ph = g - k * P;
      const [ax, ay] = spot(k - 1, 0.25, 0.75), [bx, by] = spot(k, 0.25, 0.75);
      const u = Math.min(1, ph / 0.8), e = u * u * (3 - 2 * u);
      return [{ x: ax + (bx - ax) * e, y: ay + (by - ay) * e, down: ph >= 0.8 && ph < 3.1 }];
    }
    case 'rings': {
      const P = 0.85, k = Math.floor(g / P), ph = g - k * P;
      const [x, y] = spot(k, 0.15, 0.85);
      return [{ x, y, down: ph < 0.1 }];
    }
    case 'sparks': {
      const P = 1.5, k = Math.floor(g / P), ph = g - k * P;
      const [sx, sy] = spot(k, 0.3, 0.7);
      const a = -Math.PI / 2 + (hashU(k, 7) - 0.5) * 2.4;
      const u = clamp01((ph - 0.55) / 0.12);
      return [{ x: sx + Math.cos(a) * 0.2 * u, y: sy + Math.sin(a) * 0.2 * u, down: ph >= 0.55 && ph < 0.67 }];
    }
    case 'zoom': {
      const [cx, cy] = wander(g * 0.2);
      const half = 0.1 + 0.07 * (1 - Math.cos(g * 0.9));
      const a = 0.6 + g * 0.15;
      const mx = 0.5 + (cx - 0.5) * 0.4, my = 0.5 + (cy - 0.5) * 0.4;
      return [
        { x: mx + Math.cos(a) * half * 0.6, y: my + Math.sin(a) * half, down: true },
        { x: mx - Math.cos(a) * half * 0.6, y: my - Math.sin(a) * half, down: true },
      ];
    }
    default: return [];
  }
}

/** Seconds without a real pointer before the ghost takes over (as the older modes). */
export const GHOST_AFTER = 2.5;
const FLICK = 0.9;          // screen heights per second: faster than this at release is a flick
const MAX_SPARKS = 240;
const MAX_RINGS = 12;
const MAX_STEPS = 20;

export class TouchField {
  cols = 0; rows = 0; cw = 1; ch = 1; W = 1; H = 1;
  /** RGBA per cell: R intensity, G glyph hint (0: none), B and A displacement (128: none). */
  data = new Uint8Array(4);
  /** Bumped whenever `data` changes (the WebGL engine uploads it then). */
  version = 0;
  /** The view: field point p shows the pattern at p·k + (ox, oy). */
  view: [number, number, number] = [1, 0, 0];
  /** The field's clock (seconds): simulated time, a whole number of steps. */
  clock = 0;
  /** Time given to step() so far (seconds): real input is timestamped on this. */
  now = 0;
  /** Exports: the ghost plays from the first frame (when the piece has «Cursor automático»). */
  demo = false;
  s: TouchSettings = touchSettings({ mode: 'none', strength: 0.4, radius: 0.18, auto: false });

  private heat = new Float32Array(0);
  private hint = new Float32Array(0);
  private live = new Float32Array(0);
  private liveHint = new Float32Array(0);
  private dx = new Float32Array(0); private dy = new Float32Array(0);
  private vx = new Float32Array(0); private vy = new Float32Array(0);
  /** Estirar: how much a pressed pointer holds each cell this step (its spring waits meanwhile). */
  private hold = new Float32Array(0);
  private holding = false;
  private ptrs = new Map<number, Ptr>();
  private queue: TouchInput[] = [];
  private rings: Ring[] = [];
  private sparks: Spark[] = [];
  private grab: Grab | null = null;
  private k = 1; private ox = 0; private oy = 0;
  private fx = 0; private fy = 0; private fon = 0;
  private followMoving = false;
  private lastReal = -1e9;
  private heatMax = 0;
  private dispMax = 0;
  private steps = 0;
  private sparkSeed = 0;
  private ringSeed = 0;
  private wasActive = false;
  private key = '';

  /** Settings and grid for this frame: a new grid or another mode starts from nothing. */
  configure(s: TouchSettings, cols: number, rows: number, cw: number, ch: number, W: number, H: number) {
    const key = `${s.mode}|${cols}x${rows}|${cw}x${ch}|${W}x${H}`;
    this.s = s;
    if (key === this.key) return;
    const grid = cols !== this.cols || rows !== this.rows;
    this.key = key;
    this.cols = cols; this.rows = rows; this.cw = cw; this.ch = ch; this.W = W; this.H = H;
    if (grid) {
      const n = cols * rows;
      this.data = new Uint8Array(n * 4);
      this.heat = new Float32Array(n); this.hint = new Float32Array(n);
      this.live = new Float32Array(n); this.liveHint = new Float32Array(n);
      this.dx = new Float32Array(n); this.dy = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
      this.hold = new Float32Array(n);
    }
    this.clear();
  }

  /** Forgets every trace (not the pointers: a finger still down keeps drawing). */
  clear() {
    this.heat.fill(0); this.hint.fill(0); this.live.fill(0); this.liveHint.fill(0);
    this.dx.fill(0); this.dy.fill(0); this.vx.fill(0); this.vy.fill(0);
    this.rings = []; this.sparks = []; this.grab = null;
    this.k = 1; this.ox = 0; this.oy = 0; this.fx = 0; this.fy = 0; this.fon = 0; this.followMoving = false;
    this.view = [1, 0, 0];
    this.heatMax = 0; this.dispMax = 0;
    this.encode();
  }

  /** Back to a clean start: no traces, no pointers, the clock at 0 (exports and replays). */
  reset() {
    this.ptrs.clear();
    this.queue = [];
    this.clock = 0; this.now = 0; this.steps = 0; this.lastReal = -1e9; this.pinned = -1e9;
    this.wasActive = false;
    this.sparkSeed = 0; this.ringSeed = 0;
    this.clear();
  }

  /** A pointer event (its time on this field's clock; events are applied in the step they fall in). */
  input(e: TouchInput) {
    if (e.id >= 0) this.lastReal = Math.max(this.lastReal, e.t);
    this.queue.push(e);
    if (this.queue.length > 512) this.queue.splice(0, this.queue.length - 512);
  }

  /** A wheel (or a trackpad pinch) over the canvas at x, y: zooms in «Zoom con los dedos». */
  wheel(deltaY: number, x: number, y: number) {
    if (this.s.mode !== 'zoom') return;
    this.lastReal = this.clock;
    const [px, py] = this.fieldPt(x, y);
    const qx = px * this.k + this.ox, qy = py * this.k + this.oy;
    this.k = this.clampK(this.k * Math.exp(deltaY * 0.0015));
    this.ox = qx - px * this.k; this.oy = qy - py * this.k;
    this.view = [this.k, this.ox, this.oy];
    this.pinned = this.clock;
    this.wasActive = true;
  }
  /** When the wheel last moved the view (it holds a moment before returning). */
  private pinned = -1e9;

  /** Whether a real pointer is on the canvas, or was a moment ago. */
  private get realNear() { return [...this.ptrs.values()].some(p => !p.ghost) || this.clock - this.lastReal < GHOST_AFTER; }
  private get ghostOn() { return this.s.auto && (this.demo || !this.realNear); }

  /**
   * Advances the field by dt seconds (in steps of TOUCH_DT). Returns whether something is still moving
   * or visible (the engines keep drawing while it is).
   */
  step(dt: number): boolean {
    if (!TOUCH_MODES.includes(this.s.mode)) { this.queue = []; return false; }
    const target = this.now = this.now + Math.max(0, dt);
    // nothing on it, nothing coming: the clock moves on, nothing else runs
    if (!this.wasActive && !this.queue.length && !this.ghostOn && ![...this.ptrs.values()].some(p => p.down)) {
      this.steps = Math.floor(target / TOUCH_DT + 1e-9);
      this.clock = this.steps * TOUCH_DT;
      return false;
    }
    let n = 0;
    while (this.steps * TOUCH_DT + TOUCH_DT <= target + 1e-9 && n < MAX_STEPS) {
      this.sub((this.steps + 1) * TOUCH_DT);
      this.steps++; n++;
    }
    // a long pause (a hidden tab): skip ahead instead of catching up
    if (n >= MAX_STEPS && this.steps * TOUCH_DT + TOUCH_DT <= target) this.steps = Math.floor(target / TOUCH_DT);
    this.clock = this.steps * TOUCH_DT;
    const active = this.busy;
    if (n > 0 && (active || this.wasActive)) this.encode();
    this.wasActive = active;
    return active;
  }

  /** Something to draw or to move: traces, rings, sparks, a stretched grid, a moved view, a pointer on it, the ghost. */
  get busy(): boolean {
    if (!TOUCH_MODES.includes(this.s.mode)) return false;
    if (this.ghostOn) return true;
    for (const p of this.ptrs.values()) if (p.down) return true;
    if (this.followMoving) return true;
    if (this.queue.length) return true;
    return this.heatMax > 0.5 / 255 || this.rings.length > 0 || this.sparks.length > 0 || this.dispMax > 1e-4
      || Math.abs(this.k - 1) > 1e-4 || Math.abs(this.ox) + Math.abs(this.oy) > 1e-5
      || Math.abs(this.fx) + Math.abs(this.fy) > 1e-5 || this.fon > 1e-3;
  }

  /** Canvas pixels → field coordinates (screen heights from the centre, y up). */
  private fieldPt(x: number, y: number): [number, number] {
    return [(x - 0.5 * this.W) / this.H, (0.5 * this.H - y) / this.H];
  }

  private clampK(k: number) {
    const zmax = 1.5 + 6 * this.s.strength, zmin = 0.7;
    return Math.min(1 / zmin, Math.max(1 / zmax, k));
  }

  private pressureK(p: Ptr) { return p.type === 'pen' ? Math.min(1.75, Math.max(0.25, 0.25 + 1.5 * p.pressure)) : 1; }
  private radiusK(p: Ptr) { return p.type === 'pen' ? 0.55 + 0.9 * p.pressure : 1; }
  private brushR(p: Ptr) { return Math.max(4, this.s.radius * this.H * 0.5) * this.radiusK(p); }

  /* ---------------------------------------------------------------- */
  /* One step                                                          */
  /* ---------------------------------------------------------------- */

  private sub(tEnd: number) {
    // 1. the events of this step, in order
    let i = 0;
    while (i < this.queue.length && this.queue[i].t <= tEnd + 1e-9) this.apply(this.queue[i++], tEnd);
    if (i) this.queue.splice(0, i);
    // 2. the ghost, when nobody is there
    this.driveGhost(tEnd);
    // 3. the mode
    const s = this.s, dt = TOUCH_DT;
    if (s.mode === 'trail' || s.mode === 'reveal' || s.mode === 'blossom' || s.mode === 'sparks') this.fade(Math.exp(-dt / (s.mode === 'sparks' ? 0.2 + 0.5 * s.decay : traceTau(s.decay))));
    if (s.mode === 'trail' || s.mode === 'reveal') this.strokes(tEnd);
    else if (s.mode === 'blossom') this.blossoms(dt);
    else if (s.mode === 'sparks') this.moveSparks(dt, tEnd);
    else if (s.mode === 'rings') this.rings = this.rings.filter(r => tEnd - r.t0 < this.ringLife());
    else if (s.mode === 'stretch') this.stretch(dt);
    else if (s.mode === 'zoom') this.zoom(dt, tEnd);
    else if (s.mode === 'follow') this.follow(dt);
    for (const p of this.ptrs.values()) { p.px = p.x; p.py = p.y; }
  }

  private apply(e: TouchInput, tEnd: number) {
    let p = this.ptrs.get(e.id);
    const type = e.type ?? 'mouse';
    if (e.kind === 'cancel' || e.kind === 'leave') {
      if (p) { this.ptrs.delete(e.id); this.release(p, tEnd, false); }
      return;
    }
    if (!p) {
      // a touch only exists while it is down; a mouse or a pen hovering is there too
      if (e.kind === 'up' || (type === 'touch' && e.kind === 'move')) return;
      p = { id: e.id, type, x: e.x, y: e.y, px: e.x, py: e.y, down: false, pressure: 0.5, t0: e.t, x0: e.x, y0: e.y, moved: 0, held: 0, hist: [], ghost: e.id < 0 };
      this.ptrs.set(e.id, p);
    }
    p.x = e.x; p.y = e.y;
    if (e.pressure !== undefined) p.pressure = e.pressure;
    p.hist.push([e.t, e.x, e.y]);
    if (p.hist.length > 8) p.hist.shift();
    if (e.kind === 'down' && !p.down) {
      p.down = true; p.t0 = e.t; p.x0 = e.x; p.y0 = e.y; p.moved = 0; p.held = 0; p.px = e.x; p.py = e.y;
      p.hist = [[e.t, e.x, e.y]];
      this.pressed(p, e.t);
    } else if (e.kind === 'up') {
      const was = p.down;
      p.down = false;
      if (was) this.release(p, e.t, true);
      if (type === 'touch') this.ptrs.delete(e.id);
    }
    p.moved = Math.max(p.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
  }

  private pressed(p: Ptr, t: number) {
    const s = this.s;
    if (s.mode === 'rings') {
      this.rings.push({ x: p.x, y: p.y, t0: t, amp: (0.6 + 0.4 * s.strength) * Math.min(1.3, this.pressureK(p)), seed: this.ringSeed++ });
      if (this.rings.length > MAX_RINGS) this.rings.shift();
    }
    if (s.mode === 'zoom') this.regrab();
  }

  private release(p: Ptr, t: number, up: boolean) {
    const s = this.s;
    if (s.mode === 'sparks' && up) {
      // speed over the last tenth of a second of the gesture
      const h = p.hist, last = h[h.length - 1];
      let first = h[0];
      for (const q of h) if (last[0] - q[0] <= 0.1) { first = q; break; }
      const T = Math.max(1 / 120, last[0] - first[0]);
      const vx = (last[1] - first[1]) / T, vy = (last[2] - first[2]) / T;
      const v = Math.hypot(vx, vy) / this.H;
      if (v > FLICK && last[0] - first[0] > 0) this.launch(p.x, p.y, vx, vy, false);
      else if (p.moved < 0.03 * this.H) this.launch(p.x, p.y, 0, 0, true);
    }
    if (s.mode === 'zoom') this.regrab();
    void t;
  }

  /** Sparks: a spray along a flick, or a small burst all around for a tap. */
  private launch(x: number, y: number, vx: number, vy: number, burst: boolean) {
    const s = this.s, H = this.H;
    const n = Math.round((burst ? 4 : 6) + (burst ? 10 : 20) * s.strength);
    const reach = 0.5 + 2.5 * s.radius;
    const sp = Math.min(3 * H, Math.hypot(vx, vy)) * reach;
    const dir = Math.atan2(vy, vx);
    for (let i = 0; i < n; i++) {
      const k = this.sparkSeed++;
      const a = burst ? (i / n) * Math.PI * 2 + hashU(k, 3) * 0.6 : dir + (hashU(k, 3) - 0.5) * 0.8;
      const v = burst ? (0.3 + 1.2 * s.radius) * H * (0.6 + 0.5 * hashU(k, 5)) : sp * (0.55 + 0.6 * hashU(k, 5));
      this.sparks.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0,
        life: (0.4 + 1.8 * s.decay) * (0.55 + 0.45 * hashU(k, 9)), hint: 0.85 + 0.15 * hashU(k, 13),
      });
    }
    if (this.sparks.length > MAX_SPARKS) this.sparks.splice(0, this.sparks.length - MAX_SPARKS);
  }

  private ringLife() { return 0.6 + 2.4 * this.s.decay; }

  /* ---------------------------------------------------------------- */
  /* Ghost                                                             */
  /* ---------------------------------------------------------------- */

  private driveGhost(t: number) {
    const ghosts = [...this.ptrs.values()].filter(p => p.ghost);
    if (!this.ghostOn) {
      for (const p of ghosts) this.apply({ kind: 'cancel', id: p.id, x: p.x, y: p.y, t }, t);
      return;
    }
    const poses = ghostPoses(this.s.mode, t);
    poses.forEach((q, i) => {
      const id = -1 - i, x = q.x * this.W, y = q.y * this.H;
      const p = this.ptrs.get(id);
      if (!p) this.apply({ kind: q.down ? 'down' : 'move', id, x, y, t, type: 'mouse' }, t);
      else if (q.down && !p.down) this.apply({ kind: 'down', id, x, y, t, type: 'mouse' }, t);
      else if (!q.down && p.down) { this.apply({ kind: 'move', id, x, y, t, type: 'mouse' }, t); this.apply({ kind: 'up', id, x, y, t, type: 'mouse' }, t); }
      else this.apply({ kind: 'move', id, x, y, t, type: 'mouse' }, t);
    });
    for (const p of ghosts) if (-1 - p.id >= poses.length) this.apply({ kind: 'cancel', id: p.id, x: p.x, y: p.y, t }, t);
  }

  /* ---------------------------------------------------------------- */
  /* Traces on the grid                                                */
  /* ---------------------------------------------------------------- */

  private fade(k: number) {
    const h = this.heat;
    let mx = 0;
    for (let i = 0; i < h.length; i++) {
      let v = h[i];
      if (v === 0) continue;
      v *= k;
      if (v < 0.25 / 255) v = 0;
      h[i] = v;
      if (v > mx) mx = v;
    }
    this.heatMax = mx;
  }

  /**
   * Deposits a brush along a segment: each cell keeps the larger of what it has and the brush; where the
   * brush wins, the cell takes `hint` (or a fresh random dense glyph when hint < 0).
   */
  private deposit(ax: number, ay: number, bx: number, by: number, R: number, amp: number, hint: number) {
    if (amp <= 0) return;
    const { cols, rows, cw, ch, heat } = this;
    const reach = R * 1.6;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / cw)), c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + reach) / cw));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - reach) / ch)), r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + reach) / ch));
    const bax = bx - ax, bay = by - ay, bb = Math.max(bax * bax + bay * bay, 1e-6);
    for (let r = r0; r <= r1; r++) {
      const py = (r + 0.5) * ch;
      for (let c = c0; c <= c1; c++) {
        const px = (c + 0.5) * cw;
        const pax = px - ax, pay = py - ay;
        let u = (pax * bax + pay * bay) / bb; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const dx = pax - bax * u, dy = pay - bay * u;
        const dd = (dx * dx + dy * dy) / (R * R);
        if (dd > 2.56) continue;
        const v = amp * Math.exp(-dd * 2.5);
        const i = r * cols + c;
        if (v > heat[i]) {
          if (v > heat[i] + 0.04 || this.hint[i] === 0) this.hint[i] = hint >= 0 ? hint : 0.8 + 0.2 * hashU(i, this.steps);
          heat[i] = v > 1 ? 1 : v;
          if (heat[i] > this.heatMax) this.heatMax = heat[i];
        }
      }
    }
  }

  /** Rastro and Revelar: every pointer draws its path (a mouse or a pen hovering too). */
  private strokes(_t: number) {
    const s = this.s;
    for (const p of this.ptrs.values()) {
      const hover = !p.down && (p.type === 'mouse' || p.type === 'pen');
      if (!p.down && !hover) continue;
      // a resting cursor leaves nothing new (and costs nothing); a finger held still keeps its spot
      if (hover && p.x === p.px && p.y === p.py) continue;
      const base = s.mode === 'reveal' ? 0.45 + 0.55 * s.strength : 0.55 + 0.45 * s.strength;
      const amp = base * (p.down ? this.pressureK(p) : 1);
      const R = this.brushR(p);
      this.deposit(p.px, p.py, p.x, p.y, R, amp, s.mode === 'reveal' ? 0 : -1);
    }
  }

  /** Florecer: a pressed pointer grows a flower of glyphs under it; moving it shrinks the flower. */
  private blossoms(dt: number) {
    const s = this.s, H = this.H;
    for (const p of this.ptrs.values()) {
      if (!p.down) continue;
      const Rmax = Math.max(this.cw * 2, s.radius * H * (0.9 + 1.3 * s.strength)) * this.radiusK(p);
      const mv = Math.hypot(p.x - p.px, p.y - p.py);
      p.held = Math.max(0, p.held + dt - (mv / Rmax) * 1.5);
      const grow = 0.7 + 1.3 * s.strength;
      const R = Rmax * (1 - Math.exp(-p.held * grow));
      if (R < 1) continue;
      this.flower(p.x, p.y, R, p.held, this.pressureK(p));
    }
  }

  private flower(x: number, y: number, R: number, held: number, amp: number) {
    const { cols, rows, cw, ch, heat } = this;
    const petals = 6, spin = held * 0.5;
    const edgeW = Math.max(cw, ch) * 0.9;
    const reach = R + edgeW * 2;
    const c0 = Math.max(0, Math.floor((x - reach) / cw)), c1 = Math.min(cols - 1, Math.floor((x + reach) / cw));
    const r0 = Math.max(0, Math.floor((y - reach) / ch)), r1 = Math.min(rows - 1, Math.floor((y + reach) / ch));
    for (let r = r0; r <= r1; r++) {
      const dy = (r + 0.5) * ch - y;
      for (let c = c0; c <= c1; c++) {
        const dx = (c + 0.5) * cw - x;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > reach) continue;
        const a = Math.atan2(dy, dx);
        const re = R * (0.68 + 0.32 * Math.cos(petals * a + spin));
        // the petals' outline bright, their inside dim, a bright heart: a flower that reads on any background
        const rim = re > 0 ? Math.min(1, d / re) : 1;
        const edge = d <= re ? 0.22 + 0.78 * Math.pow(rim, 5) : Math.exp(-((d - re) * (d - re)) / (edgeW * edgeW));
        const core = Math.exp(-(d * d) / Math.max(1, (0.16 * R) * (0.16 * R)));
        let v = Math.max(edge, core * 0.95) * amp;
        if (v > 1) v = 1;
        if (v < 0.01) continue;
        const i = r * cols + c;
        if (v > heat[i]) {
          heat[i] = v;
          this.hint[i] = v > 0.6 ? 1 : 0.55;
          if (v > this.heatMax) this.heatMax = v;
        }
      }
    }
  }

  /** Chispas: particles fly with a little drag and gravity, drawing short streaks. */
  private moveSparks(dt: number, _t: number) {
    const H = this.H, W = this.W, drag = Math.exp(-dt * 1.6), grav = 0.35 * H;
    const out: Spark[] = [];
    const R = Math.max(this.cw * 1.1, this.s.radius * H * 0.1);
    for (const q of this.sparks) {
      const ax = q.x, ay = q.y;
      q.vx *= drag; q.vy = q.vy * drag + grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.age += dt;
      const f = 1 - q.age / q.life;
      if (f <= 0 || q.x < -W * 0.2 || q.x > W * 1.2 || q.y > H * 1.2 || q.y < -H * 0.5) continue;
      this.deposit(ax, ay, q.x, q.y, R, Math.min(1, 1.2 * Math.pow(f, 0.6)), q.hint * (0.7 + 0.3 * f));
      out.push(q);
    }
    this.sparks = out;
  }

  /** Estirar: a pressed pointer drags the grid with it; each cell springs back, with a little wobble. */
  private stretch(dt: number) {
    const s = this.s, { cols, rows, cw, ch, H, dx, dy, vx, vy, hold } = this;
    if (this.holding) { hold.fill(0); this.holding = false; }
    for (const p of this.ptrs.values()) {
      if (!p.down) continue;
      const mx = (p.x - p.px) / H, my = -(p.y - p.py) / H;
      const R = this.brushR(p) * 1.4, reach = R * 1.8;
      const gain = (0.55 + 0.7 * s.strength) * Math.min(1.3, this.pressureK(p));
      const c0 = Math.max(0, Math.floor((p.x - reach) / cw)), c1 = Math.min(cols - 1, Math.floor((p.x + reach) / cw));
      const r0 = Math.max(0, Math.floor((p.y - reach) / ch)), r1 = Math.min(rows - 1, Math.floor((p.y + reach) / ch));
      for (let r = r0; r <= r1; r++) {
        const ey = (r + 0.5) * ch - p.y;
        for (let c = c0; c <= c1; c++) {
          const ex = (c + 0.5) * cw - p.x;
          const dd = (ex * ex + ey * ey) / (R * R);
          if (dd > 3.24) continue;
          const w = Math.exp(-dd * 2);
          const i = r * cols + c;
          dx[i] += mx * w * gain; dy[i] += my * w * gain;
          // held under the finger: the spring waits until it lets go
          vx[i] *= 1 - w; vy[i] *= 1 - w;
          if (w > hold[i]) hold[i] = w;
          this.holding = true;
        }
      }
    }
    const K = 150 * Math.pow(0.04, s.decay), C = 2 * 0.28 * Math.sqrt(K);
    let mx = 0;
    for (let i = 0; i < dx.length; i++) {
      let x = dx[i], y = dy[i], u = vx[i], w = vy[i];
      if (x === 0 && y === 0 && u === 0 && w === 0) continue;
      const free = 1 - hold[i];
      u += (-K * x - C * u) * dt * free; w += (-K * y - C * w) * dt * free;
      x += u * dt; y += w * dt;
      const m = Math.abs(x) + Math.abs(y);
      if (m > DISP_MAX) { const k = DISP_MAX / m; x *= k; y *= k; }
      if (m < 2e-5 && Math.abs(u) + Math.abs(w) < 2e-4) { x = y = u = w = 0; }
      dx[i] = x; dy[i] = y; vx[i] = u; vy[i] = w;
      const e = Math.abs(x) + Math.abs(y) + (Math.abs(u) + Math.abs(w)) * 0.1;
      if (e > mx) mx = e;
    }
    this.dispMax = mx;
  }

  /* ---------------------------------------------------------------- */
  /* The view                                                          */
  /* ---------------------------------------------------------------- */

  /** Starts (again) a pinch or a drag with the pointers down now: the pattern point under them stays under them. */
  private regrab() {
    const down = [...this.ptrs.values()].filter(p => p.down).slice(0, 2);
    if (!down.length) { this.grab = null; return; }
    const [mx, my] = this.mid(down);
    this.grab = {
      ids: down.map(p => p.id), qx: mx * this.k + this.ox, qy: my * this.k + this.oy,
      d0: down.length > 1 ? Math.max(4, Math.hypot(down[0].x - down[1].x, down[0].y - down[1].y)) : 0, k0: this.k,
    };
  }

  private mid(ps: Ptr[]): [number, number] {
    let x = 0, y = 0;
    for (const p of ps) { x += p.x; y += p.y; }
    return this.fieldPt(x / ps.length, y / ps.length);
  }

  private zoom(dt: number, t: number) {
    const g = this.grab;
    const down = [...this.ptrs.values()].filter(p => p.down).slice(0, 2);
    if (g && down.length && down.length === g.ids.length && down.every((p, i) => p.id === g.ids[i])) {
      if (down.length > 1) this.k = this.clampK(g.k0 * g.d0 / Math.max(4, Math.hypot(down[0].x - down[1].x, down[0].y - down[1].y)));
      const [mx, my] = this.mid(down);
      this.ox = g.qx - mx * this.k; this.oy = g.qy - my * this.k;
    } else if (down.length) this.regrab();
    else {
      this.grab = null;
      // let go: back to the piece as it was, unless «Duración» is at its top
      if (this.s.decay < 0.98 && t - this.pinned > 0.6) {
        const f = 1 - Math.exp(-dt / (0.35 * Math.pow(10, this.s.decay)));
        this.k += (1 - this.k) * f; this.ox -= this.ox * f; this.oy -= this.oy * f;
        // (a thousandth of a zoom is not to be seen)
        if (Math.abs(this.k - 1) < 1e-3 && Math.abs(this.ox) + Math.abs(this.oy) < 1e-3) { this.k = 1; this.ox = 0; this.oy = 0; }
      }
    }
    // a view that shows at most half a screen of empty pattern-space beyond the zoomed-out edge is fine: the patterns tile
    this.view = [this.k, this.ox, this.oy];
  }

  /** Seguir: the whole piece leans toward the pointer, slowly. */
  private follow(dt: number) {
    const s = this.s;
    const ps = [...this.ptrs.values()];
    let tx = 0, ty = 0, on = 0;
    if (ps.length) {
      const [x, y] = this.mid(ps);
      tx = x; ty = y; on = 1;
    }
    const f = 1 - Math.exp(-dt / (0.25 + 2.5 * s.decay));
    const amt = 0.18 * s.strength;
    this.fx += (tx * amt - this.fx) * f; this.fy += (ty * amt - this.fy) * f;
    this.fon += (on - this.fon) * f;
    if (!ps.length && Math.abs(this.fx) + Math.abs(this.fy) < 1e-5) { this.fx = this.fy = 0; }
    if (this.fon < 1e-3 && !ps.length) this.fon = 0;
    const k = 1 - 0.06 * s.strength * this.fon;
    this.followMoving = Math.abs(tx * amt - this.fx) + Math.abs(ty * amt - this.fy) > 1e-4 || Math.abs(on - this.fon) > 1e-3;
    this.view = [k, -this.fx, -this.fy];
  }

  /* ---------------------------------------------------------------- */
  /* Output                                                            */
  /* ---------------------------------------------------------------- */

  /** Rings (a function of the clock) into the live layer. */
  private drawRings() {
    const { cols, rows, cw, ch, H, live, liveHint } = this;
    live.fill(0);
    if (!this.rings.length) return false;
    const L = this.ringLife(), Rend = this.s.radius * H * 3, w = Math.max(cw, ch) * 1.1 + 0.015 * H;
    for (const g of this.rings) {
      const age = this.clock - g.t0;
      if (age < 0 || age >= L) continue;
      const u = age / L, fade = Math.pow(1 - u, 1.2) * g.amp;
      const rr = Rend * (1 - (1 - u) * (1 - u));
      const echo = rr * 0.62;
      const reach = rr + w * 2;
      const c0 = Math.max(0, Math.floor((g.x - reach) / cw)), c1 = Math.min(cols - 1, Math.floor((g.x + reach) / cw));
      const r0 = Math.max(0, Math.floor((g.y - reach) / ch)), r1 = Math.min(rows - 1, Math.floor((g.y + reach) / ch));
      for (let r = r0; r <= r1; r++) {
        const dy = (r + 0.5) * ch - g.y;
        for (let c = c0; c <= c1; c++) {
          const dx = (c + 0.5) * cw - g.x;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = (d - rr) / w, b = (d - echo) / w;
          const v = fade * (Math.exp(-a * a * 2) + 0.45 * Math.exp(-b * b * 2));
          if (v < 0.01) continue;
          const i = r * cols + c;
          if (v > live[i]) {
            live[i] = v > 1 ? 1 : v;
            const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 28);
            liveHint[i] = 0.45 + 0.55 * hashU(seg, g.seed);
          }
        }
      }
    }
    return true;
  }

  /** Writes `data` (R intensity, G glyph hint, B/A displacement). */
  private encode() {
    const n = this.cols * this.rows, d = this.data, m = this.s.mode;
    // (the view modes write no grid: only say that something changed)
    if (!GRID_MODES.includes(m)) { this.version++; return; }
    if (d.length !== n * 4) return;
    const rings = m === 'rings' && this.drawRings();
    const { heat, hint, live, liveHint, dx, dy } = this;
    const disp = m === 'stretch';
    const q = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
    for (let i = 0; i < n; i++) {
      let a = heat[i] || 0, g = a > 0 ? hint[i] : 0;
      if (rings && live[i] > a) { a = live[i]; g = liveHint[i]; }
      const o = i * 4;
      const qa = q(a);
      d[o] = qa;
      d[o + 1] = qa > 0 && g > 0 ? Math.max(1, q(g)) : 0;
      if (disp) {
        d[o + 2] = Math.max(1, Math.min(255, 128 + Math.round((dx[i] / DISP_MAX) * 127)));
        d[o + 3] = Math.max(1, Math.min(255, 128 + Math.round((dy[i] / DISP_MAX) * 127)));
      } else { d[o + 2] = 128; d[o + 3] = 128; }
    }
    this.version++;
  }
}

/** Displacement stored in a byte (B or A of `data`), in screen heights. */
export const dispOf = (byte: number) => ((byte - 128) / 127) * DISP_MAX;
