/**
 * Monotrama's motion language, «descomponer y recomponer»: content that changes resolves out of the
 * character ramp. Shared by the site and the studio. Framework-agnostic and cheap:
 *
 *  - motionLevel()   'full' | 'low' | 'none' — reduced motion always wins; 'low' for weak devices,
 *                    Save-Data or an explicit data-motion="low" on <html> (the studio's quality setting).
 *  - scrambleFrame() pure: the string shown at progress p while a label resolves (React hooks and DOM
 *                    helpers build on it; screen readers should get the final text, never the frames).
 *  - glyphCurtain()  a short overlay of ramp glyphs that dissolves away over an element whose content has
 *                    ALREADY changed (nothing waits for it: the new content is usable at once).
 *  - weaveIntro()    the studio's opening: the layout drawn in box-drawing characters that settles
 *                    into the real interface underneath, skippable, never blocking input.
 *
 * Every effect is decoration on top of an immediate state change and resolves to nothing under
 * prefers-reduced-motion.
 */

export const RAMP = ' .:-=+*#%@';
export type MotionLevel = 'full' | 'low' | 'none';

export function motionLevel(): MotionLevel {
  if (typeof window === 'undefined') return 'none';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'none';
  const forced = document.documentElement.dataset.motion;
  if (forced === 'none' || forced === 'low') return forced;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData || (nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2) return 'low';
  return 'full';
}

/** Small deterministic PRNG so a scramble looks the same frame to frame (no flicker noise). */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * The text shown at progress p (0 → 1) while `final` resolves out of `glyphs`, left to right with a
 * little jitter. Spaces stay spaces so the word shapes read early; at p = 1 it is exactly `final`.
 * `seed` changes which glyphs appear; `tick` changes them over time (pass a frame counter).
 */
export function scrambleFrame(final: string, p: number, o: { glyphs?: string; seed?: number; tick?: number; spread?: number } = {}): string {
  if (p >= 1) return final;
  const glyphs = o.glyphs ?? '#%*+=-:.01';
  const spread = o.spread ?? 0.35;
  const chars = [...final];
  const n = chars.length || 1;
  let out = '';
  chars.forEach((c, i) => {
    if (c === ' ' || c === '\n') { out += c; return; }
    const at = (i / n) * (1 - spread) + hash01((o.seed ?? 0) * 131 + i) * spread;
    if (p >= at + 0.001 && p > 0) { out += c; return; }
    const g = Math.floor(hash01((o.seed ?? 0) * 977 + i * 31 + (o.tick ?? 0) * 7) * glyphs.length);
    out += glyphs[g] ?? '#';
  });
  return out;
}

/** Ease used by every effect: quick start, soft landing. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export interface CurtainOptions {
  /** ms; ≈150–320 for interface swaps. Low motion halves it. */
  duration?: number;
  /** cell width in CSS px */
  cell?: number;
  /** colour that hides the content under a covered cell (the container's background) */
  bg?: string;
  /** glyph colour */
  ink?: string;
  ramp?: string;
  /** where the reveal starts */
  origin?: 'left' | 'right' | 'top' | 'center' | { x: number; y: number };
  /** how much the origin orders the reveal vs randomness (0..1) */
  order?: number;
}

export interface Effect { cancel(): void; done: Promise<void> }
const nothing = (): Effect => ({ cancel() { /* nothing */ }, done: Promise.resolve() });

/**
 * Dissolves a veil of ramp glyphs over `el` (whose content has already been replaced), revealing it
 * cell by cell. pointer-events: none and aria-hidden: the element is usable from the first frame.
 */
export function glyphCurtain(el: Element, o: CurtainOptions = {}): Effect {
  const level = motionLevel();
  if (level === 'none' || typeof document === 'undefined') return nothing();
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return nothing();
  const duration = (o.duration ?? 240) * (level === 'low' ? 0.5 : 1);
  const cw = Math.max(6, o.cell ?? 10), ch = Math.round(cw * 1.45);
  const cols = Math.ceil(r.width / cw), rows = Math.ceil(r.height / ch);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.width = Math.ceil(r.width * dpr); cv.height = Math.ceil(r.height * dpr);
  cv.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:2147483000`;
  const ctx = cv.getContext('2d');
  if (!ctx) return nothing();
  document.body.appendChild(cv);
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${Math.round(cw * 1.15)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ramp = o.ramp ?? RAMP;
  const order = o.order ?? 0.55;
  const seed = Math.floor(Math.random() * 1e6);
  const at = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let d: number;
    const u = (x + 0.5) / cols, v = (y + 0.5) / rows, org = o.origin ?? 'left';
    if (org === 'left') d = u; else if (org === 'right') d = 1 - u; else if (org === 'top') d = v;
    else { const c = org === 'center' ? { x: 0.5, y: 0.5 } : org; d = Math.min(1, Math.hypot(u - c.x, (v - c.y) * (r.height / r.width)) * 1.6); }
    at[y * cols + x] = d * order + hash01(seed + y * 7919 + x) * (1 - order);
  }
  const bg = o.bg ?? getComputedStyle(el).backgroundColor ?? '#0c0b0a';
  const ink = o.ink ?? '#ede6da';
  let raf = 0, stopped = false, t0 = 0, resolve!: () => void;
  const done = new Promise<void>(res => { resolve = res; });
  const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); cv.remove(); resolve(); };
  const frame = (now: number) => {
    if (stopped) return;
    if (!t0) t0 = now;
    const p = easeOut((now - t0) / duration) * 1.25; // overshoot so the last cells clear
    ctx.clearRect(0, 0, r.width, r.height);
    for (let i = 0; i < at.length; i++) {
      const left = at[i] - p;                 // > 0: still covered
      if (left <= -0.12) continue;            // revealed
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      if (left > 0) { ctx.fillStyle = bg; ctx.fillRect(x, y, cw + 0.5, ch + 0.5); }
      const k = Math.max(0, Math.min(ramp.length - 1, Math.round((left + 0.12) / 0.5 * (ramp.length - 1))));
      const g = ramp[k];
      if (g !== ' ') { ctx.fillStyle = ink; ctx.globalAlpha = left > 0 ? 0.85 : 0.5; ctx.fillText(g, x + cw / 2, y + ch / 2); ctx.globalAlpha = 1; }
    }
    if (p >= 1.25) finish(); else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { cancel: finish, done };
}

export interface WeaveTarget { rect: DOMRect; kind?: 'panel' | 'control' | 'text' }

/**
 * The studio's opening (≈2–3 s): each target rectangle is drawn as a box of box-drawing characters
 * with ramp noise inside; the weave settles from top to bottom and fades into the real interface,
 * which is already interactive underneath. Any key, click or touch finishes it at once.
 */
export function weaveIntro(targets: WeaveTarget[], o: { duration?: number; ink?: string; accent?: string; bg?: string; cell?: number } = {}): Effect {
  const level = motionLevel();
  if (level === 'none' || !targets.length || typeof document === 'undefined') return nothing();
  const duration = (o.duration ?? 2400) * (level === 'low' ? 0.5 : 1);
  const cw = o.cell ?? 9, ch = Math.round(cw * 1.5);
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000';
  const ctx = cv.getContext('2d');
  if (!ctx) return nothing();
  document.body.appendChild(cv);
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${Math.round(cw * 1.2)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ink = o.ink ?? '#ede6da', accent = o.accent ?? '#ff5b1f', bg = o.bg ?? '#0c0b0a';
  const seed = Math.floor(Math.random() * 1e6);
  // cells to draw: box outlines and a sparse fill per target
  type Cell = { x: number; y: number; g: string; at: number; edge: boolean; accent: boolean };
  const cells: Cell[] = [];
  targets.forEach((t, ti) => {
    const x0 = Math.floor(t.rect.left / cw), y0 = Math.floor(t.rect.top / ch);
    const x1 = Math.max(x0 + 1, Math.floor(t.rect.right / cw)), y1 = Math.max(y0 + 1, Math.floor(t.rect.bottom / ch));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edgeX = x === x0 || x === x1, edgeY = y === y0 || y === y1;
      const edge = edgeX || edgeY;
      const h = hash01(seed + ti * 104729 + y * 7919 + x);
      if (!edge && h > (t.kind === 'panel' ? 0.16 : 0.45)) continue;
      const g = edge ? (edgeX && edgeY ? (y === y0 ? (x === x0 ? '┌' : '┐') : (x === x0 ? '└' : '┘')) : edgeX ? '│' : '─') : RAMP[1 + Math.floor(h * 1e3) % (RAMP.length - 1)];
      cells.push({ x: x * cw + cw / 2, y: y * ch + ch / 2, g, at: (y * ch) / H * 0.6 + h * 0.4, edge, accent: t.kind === 'control' && edge && h < 0.08 });
    }
  });
  let raf = 0, stopped = false, t0 = 0, fast = 0, resolve!: () => void;
  const done = new Promise<void>(res => { resolve = res; });
  const finish = () => {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); cv.remove();
    removeEventListener('keydown', skip, true); removeEventListener('pointerdown', skip, true); resolve();
  };
  const skip = () => { if (!fast) fast = performance.now(); };
  addEventListener('keydown', skip, true); addEventListener('pointerdown', skip, true);
  const frame = (now: number) => {
    if (stopped) return;
    if (!t0) t0 = now;
    let p = (now - t0) / duration;
    if (fast) p = Math.max(p, 0.75 + (now - fast) / 600);
    ctx.clearRect(0, 0, W, H);
    // the page behind shows through progressively: a veil that thins as the weave settles
    const veil = Math.max(0, 1 - easeOut(p * 1.15));
    if (veil > 0) { ctx.globalAlpha = veil * 0.92; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    for (const c of cells) {
      const k = (p - c.at * 0.7) / 0.35;      // 0: appearing, 1: settled, >1.2: gone
      if (k <= 0 || k > 1.6) continue;
      const a = k < 1 ? k : Math.max(0, 1 - (k - 1) / 0.6);
      ctx.globalAlpha = a * (c.edge ? 0.9 : 0.55);
      ctx.fillStyle = c.accent ? accent : ink;
      ctx.fillText(c.edge || k > 0.6 ? c.g : RAMP[1 + Math.floor(hash01(c.x * 31 + c.y + Math.floor(now / 60)) * 9)], c.x, c.y);
    }
    ctx.globalAlpha = 1;
    if (p >= 1.5) finish(); else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { cancel: finish, done };
}
