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
 *  - weaveIntro()    the studio's opening: the interface regions woven out of the ramp (outlines in
 *                    box-drawing characters first) until the real interface underneath shows; the piece
 *                    itself is never covered; any key, click or touch ends it; never blocks input.
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
  /** where the veil lives (default: the page). Inside an open modal <dialog>, pass the dialog: the page is under its top layer. */
  host?: Element;
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
  cv.className = 'mt-curtain';
  cv.width = Math.ceil(r.width * dpr); cv.height = Math.ceil(r.height * dpr);
  cv.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:2147483000;margin:0;border:0;padding:0`;
  const ctx = cv.getContext('2d');
  if (!ctx) return nothing();
  (o.host ?? document.body).appendChild(cv);
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
  // the first frame is drawn now (fully covered): called before paint, the new content never shows bare
  frame(performance.now());
  return { cancel: finish, done };
}

export interface WeaveTarget {
  rect: DOMRect;
  /** 'panel': a surface (sparser weave, no accent); 'control': a button or field (its outline may catch the accent) */
  kind?: 'panel' | 'control' | 'text';
  /** the surface's own colour: covered cells are painted with it, so the region reads as itself being woven */
  bg?: string;
}

export interface WeaveOptions {
  /** ms for the whole opening at full motion (≈2400); low motion halves it */
  duration?: number;
  ink?: string;
  accent?: string;
  /** colour of covered cells for targets without their own */
  bg?: string;
  /** cell width in CSS px */
  cell?: number;
}

/**
 * The studio's opening (≈2–3 s). Only the interface regions are woven: each target is covered by cells
 * of its own colour whose glyphs thicken through the ramp ( .:-=+*#%@) and then give way, cell by cell,
 * top to bottom, to the real interface underneath; box-drawing threads trace each target's outline first
 * and fade once it has formed. Everything outside the targets (the piece on the stage) is never covered.
 * The canvas takes no pointer events: the interface works from the first frame, and any key, click,
 * touch or wheel ends the opening at once. The first frame is drawn synchronously (call it before paint).
 */
export function weaveIntro(targets: WeaveTarget[], o: WeaveOptions = {}): Effect {
  const level = motionLevel();
  if (level === 'none' || !targets.length || typeof document === 'undefined') return nothing();
  const duration = (o.duration ?? 2400) * (level === 'low' ? 0.5 : 1);
  const cw = o.cell ?? 9, ch = Math.round(cw * 1.5);
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  const cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  cv.className = 'mt-weave';
  cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;margin:0;border:0;padding:0';
  const ctx = cv.getContext('2d');
  if (!ctx) return nothing();
  document.body.appendChild(cv);
  ctx.scale(dpr, dpr);
  ctx.font = `500 ${Math.round(cw * 1.2)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ink = o.ink ?? '#ede6da', accent = o.accent ?? '#ff5b1f', bg0 = o.bg ?? '#0c0b0a';
  const seed = Math.floor(Math.random() * 1e6);

  // the veil: every cell whose centre lies in a target (the innermost one gives its colour)
  const owner = new Int16Array(cols * rows).fill(-1);
  const area = (r: DOMRect) => r.width * r.height;
  const order = targets.map((_, i) => i).sort((a, b) => area(targets[b].rect) - area(targets[a].rect));
  for (const ti of order) {
    const r = targets[ti].rect;
    if (r.width < 2 || r.height < 2) continue;
    const x0 = Math.max(0, Math.floor(r.left / cw)), x1 = Math.min(cols - 1, Math.floor((r.right - 0.01) / cw));
    const y0 = Math.max(0, Math.floor(r.top / ch)), y1 = Math.min(rows - 1, Math.floor((r.bottom - 0.01) / ch));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) owner[y * cols + x] = ti;
  }
  type Cell = { x: number; y: number; at: number; t: number };
  const veil: Cell[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ti = owner[y * cols + x];
    if (ti < 0) continue;
    const h = hash01(seed + y * 7919 + x * 104729);
    // top to bottom, a little left to right, with a loose weft: 0.28 … 0.9 of the timeline
    const at = 0.28 + ((y + 0.5) / rows) * 0.36 + ((x + 0.5) / cols) * 0.08 + h * 0.18;
    veil.push({ x: x * cw, y: y * ch, at, t: ti });
  }
  // the threads: each target's outline in box-drawing characters, drawn early, gone once it has formed
  type Thread = { x: number; y: number; g: string; at: number; end: number; accent: boolean };
  const threads: Thread[] = [];
  const formed = new Float32Array(targets.length);
  for (const c of veil) formed[c.t] = Math.max(formed[c.t], c.at);
  targets.forEach((t, ti) => {
    const r = t.rect;
    if (r.width < 2 || r.height < 2) return;
    const x0 = Math.floor(r.left / cw), x1 = Math.max(x0 + 1, Math.floor((r.right - 0.01) / cw));
    const y0 = Math.floor(r.top / ch), y1 = Math.max(y0 + 1, Math.floor((r.bottom - 0.01) / ch));
    const start = 0.02 + (Math.max(0, r.top) / H) * 0.22;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ex = x === x0 || x === x1, ey = y === y0 || y === y1;
      if (!ex && !ey) continue;
      const g = ex && ey ? (y === y0 ? (x === x0 ? '┌' : '┐') : (x === x0 ? '└' : '┘')) : ex ? '│' : '─';
      const h = hash01(seed * 3 + ti * 7907 + y * 131 + x);
      // traced along the outline from its top-left corner
      const along = ((x - x0) + (y - y0)) / Math.max(1, (x1 - x0) + (y1 - y0));
      threads.push({ x: x * cw + cw / 2, y: y * ch + ch / 2, g, at: start + along * 0.16 + h * 0.04, end: (formed[ti] || 0.6) + 0.06, accent: t.kind === 'control' && h < 0.06 });
    }
  });

  // the clock advances at most ~3 frames at a time: a busy main thread (a shader compiling as the page
  // opens) slows the weave down instead of skipping it
  let raf = 0, stopped = false, last0 = 0, elapsed = 0, resolve!: () => void;
  const done = new Promise<void>(res => { resolve = res; });
  const finish = () => {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); cv.remove();
    removeEventListener('keydown', finish, true); removeEventListener('pointerdown', finish, true);
    removeEventListener('wheel', finish, true); removeEventListener('resize', finish);
    resolve();
  };
  // any key, click, touch or wheel ends it at once (the interface under it is already live)
  addEventListener('keydown', finish, true); addEventListener('pointerdown', finish, true);
  addEventListener('wheel', finish, { capture: true, passive: true }); addEventListener('resize', finish);
  const last = RAMP.length - 1;
  const frame = (now: number) => {
    if (stopped) return;
    if (last0) elapsed += Math.min(50, now - last0);
    last0 = now;
    const p = elapsed / duration;
    ctx.clearRect(0, 0, W, H);
    const tick = Math.floor(elapsed / 70);
    for (const c of veil) {
      const left = c.at - p;
      if (left <= -0.06) continue;                       // formed: the real interface shows
      const x = c.x, y = c.y;
      if (left > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = targets[c.t].bg ?? bg0;
        ctx.fillRect(x, y, cw + 0.5, ch + 0.5);
        // the weave thickens as the cell nears its turn: a sparse weft of dots first, dense glyphs last
        const k = Math.max(0, Math.min(1, 1 - left / 0.32));
        const h = hash01(seed + x * 13 + y * 7);
        if (k < 0.55 && h < 0.45) continue;
        const jitter = hash01(seed + x * 13 + y * 7 + tick) < 0.1 ? 1 : 0;
        const g = RAMP[Math.min(last, Math.round(k * k * (last - 1)) + jitter)];
        if (g !== ' ') { ctx.globalAlpha = 0.2 + k * 0.5; ctx.fillStyle = ink; ctx.fillText(g, x + cw / 2, y + ch / 2); }
      } else {
        // just formed: a faint glyph lingers for a moment over the real cell
        ctx.globalAlpha = ((0.06 + left) / 0.06) * 0.35;
        ctx.fillStyle = ink;
        ctx.fillText(RAMP[1 + Math.floor(hash01(x + y * 3 + seed) * 4)], x + cw / 2, y + ch / 2);
      }
    }
    for (const t of threads) {
      if (p < t.at || p > t.end + 0.12) continue;
      const a = p < t.at + 0.05 ? (p - t.at) / 0.05 : p > t.end ? 1 - (p - t.end) / 0.12 : 1;
      ctx.globalAlpha = Math.max(0, a) * 0.85;
      ctx.fillStyle = t.accent ? accent : ink;
      ctx.fillText(t.g, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if (p >= 1.02) finish(); else raf = requestAnimationFrame(frame);
  };
  frame(performance.now());
  return { cancel: finish, done };
}
