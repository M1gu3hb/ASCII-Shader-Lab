/**
 * «Haz arte ASCII», woven: the hero headline shows what the studio does with words. The <h1> keeps its
 * real text the whole time (screen readers, search, selection, copy); an aria-hidden canvas laid exactly
 * over it draws the same letters as ASCII art — blocks, braille, halftone dots, outline and the character
 * ramp — following the score in ./titulo-plan.ts. While the score says «legible», nothing is drawn: the
 * page shows the DOM text itself.
 *
 * Cost: nothing between the animated moments (one timer, no frames), nothing off screen, in a hidden tab,
 * while the page is paused, under «reduce motion», or while the headline is selected (someone is reading
 * it). No layout: the canvas is absolutely positioned inside the heading's own box.
 */
import { RAMP } from '../shared/glyphfx';
import { frameAt, h01, nextActive, timeline, TIMING, type Frame, type LetterState, type Style } from './titulo-plan';

type Drawn = Exclude<Style, 'solido'>;

interface Cell {
  x: number; y: number; w: number; h: number;
  cov: number;
  /** braille: 8 dots (bit = row * 2 + col); contorno/rampa: the character; bloques: shade level 1–4 */
  bits: number;
  ch: string;
  line: number;
  weave: number;
}

interface Letter {
  ch: string;
  x: number;
  base: number;
  cells: Record<Drawn, Cell[]>;
}

interface Layout {
  width: number; height: number; bleed: number;
  font: string;
  /** the character styles' own font size (px) */
  fs: Record<'contorno' | 'rampa', number>;
  u: number;
  letters: Letter[];
}

const DRAWN: Drawn[] = ['bloques', 'braille', 'puntos', 'contorno', 'rampa'];

/** Coverage of a letter, read from its own raster through a summed-area table. */
class Mask {
  private sat: Float64Array;
  constructor(private w: number, private h: number, private x0: number, private y0: number, private m: number, alpha: Uint8ClampedArray) {
    const sat = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += alpha[(y * w + x) * 4 + 3] / 255;
        sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
      }
    }
    this.sat = sat;
  }
  /** Mean coverage (0–1) of a rectangle in canvas CSS pixels. */
  cov(ax: number, ay: number, bx: number, by: number): number {
    const { w, h, m } = this;
    const x0 = Math.max(0, Math.min(w, Math.round((ax - this.x0) * m))), x1 = Math.max(0, Math.min(w, Math.round((bx - this.x0) * m)));
    const y0 = Math.max(0, Math.min(h, Math.round((ay - this.y0) * m))), y1 = Math.max(0, Math.min(h, Math.round((by - this.y0) * m)));
    const area = Math.max(1, (bx - ax) * (by - ay) * m * m);
    if (x1 <= x0 || y1 <= y0) return 0;
    const W = w + 1, s = this.sat;
    return Math.max(0, Math.min(1, (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / area));
  }
}

/** Grid pitch of each style, in units of u (≈ a 25th of the font size). */
const GRID: Record<Drawn, [number, number]> = {
  bloques: [2.5, 2.5],
  braille: [2, 4],
  puntos: [2.3, 2.3],
  contorno: [1.8, 3],
  rampa: [1.55, 2.6],
};

function edgeChar(c: (dx: number, dy: number) => number): string {
  const gx = c(1, 0) - c(-1, 0), gy = c(0, 1) - c(0, -1);
  const ax = Math.abs(gx), ay = Math.abs(gy);
  if (ax < 0.05 && ay < 0.05) return '+';
  if (ax > ay * 2.2) return '|';
  if (ay > ax * 2.2) return gy > 0 ? '_' : '-';
  return gx * gy > 0 ? '/' : '\\';
}

/** Measures the heading's letters where the browser laid them out, and weaves each style's cells over them. */
export function measure(h1: HTMLElement): Layout | null {
  const text = h1.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return null;
  const cs = getComputedStyle(h1);
  const F = parseFloat(cs.fontSize);
  const font = `${cs.fontWeight} ${F}px ${cs.fontFamily}`;
  const box = h1.getBoundingClientRect();
  if (!box.width || !F) return null;
  const bleed = Math.ceil(F * 0.22);
  const width = Math.ceil(box.width + bleed * 2), height = Math.ceil(box.height + bleed * 2);
  const u = Math.max(2.1, F / 25);
  const fs = { contorno: GRID.contorno[1] * u * 0.96, rampa: GRID.rampa[1] * u * 0.98 };

  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const range = document.createRange();
  const s = text.textContent ?? '';
  const raw: Array<{ ch: string; x: number; base: number }> = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    range.setStart(text, i);
    range.setEnd(text, i + 1);
    const r = range.getClientRects()[0];
    if (!r) continue;
    const m = probe.measureText(ch);
    raw.push({ ch, x: r.left - box.left + bleed, base: r.top - box.top + bleed + m.fontBoundingBoxAscent });
  }
  if (!raw.length) return null;

  // reading order: lines by baseline, then x; a sweep runs through line 1, then line 2
  const lines: Array<{ base: number; x0: number; x1: number; off: number }> = [];
  for (const l of raw) {
    let line = lines.find(k => Math.abs(k.base - l.base) < F * 0.3);
    if (!line) lines.push(line = { base: l.base, x0: Infinity, x1: -Infinity, off: 0 });
    const w = probe.measureText(l.ch).width;
    line.x0 = Math.min(line.x0, l.x);
    line.x1 = Math.max(line.x1, l.x + w);
  }
  lines.sort((a, b) => a.base - b.base);
  let total = 0;
  for (const l of lines) { l.off = total; total += l.x1 - l.x0; }

  const scale = F < 70 ? 3 : 2;
  const letters: Letter[] = raw.map((l, li) => {
    const m = probe.measureText(l.ch);
    const pad = 2;
    const x0 = Math.floor(l.x - m.actualBoundingBoxLeft - pad), x1 = Math.ceil(l.x + m.actualBoundingBoxRight + pad);
    const y0 = Math.floor(l.base - m.actualBoundingBoxAscent - pad), y1 = Math.ceil(l.base + m.actualBoundingBoxDescent + pad);
    const mw = (x1 - x0) * scale, mh = (y1 - y0) * scale;
    const c = document.createElement('canvas');
    c.width = mw; c.height = mh;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.scale(scale, scale);
    x.font = font;
    x.fillStyle = '#000';
    x.fillText(l.ch, l.x - x0, l.base - y0);
    const mask = new Mask(mw, mh, x0, y0, scale, x.getImageData(0, 0, mw, mh).data);
    const line = lines.find(k => Math.abs(k.base - l.base) < F * 0.3)!;

    const cells = {} as Record<Drawn, Cell[]>;
    for (const st of DRAWN) {
      const cw = GRID[st][0] * u, ch = GRID[st][1] * u;
      const list: Cell[] = [];
      const c0 = Math.floor(x0 / cw), c1 = Math.ceil(x1 / cw), r0 = Math.floor(y0 / ch), r1 = Math.ceil(y1 / ch);
      const at = (col: number, row: number) => mask.cov(col * cw, row * ch, (col + 1) * cw, (row + 1) * ch);
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          const cx = col * cw, cy = row * ch;
          const cov = at(col, row);
          let bits = 0, glyph = '';
          if (st === 'braille') {
            for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) {
              if (mask.cov(cx + i * u, cy + j * u, cx + (i + 1) * u, cy + (j + 1) * u) > 0.42) bits |= 1 << (j * 2 + i);
            }
            if (!bits && cov < 0.01) continue;
          } else if (st === 'bloques') {
            bits = cov > 0.6 ? 4 : cov > 0.4 ? 3 : cov > 0.22 ? 2 : cov > 0.08 ? 1 : 0;
            if (!bits && cov < 0.01) continue;
          } else if (st === 'contorno') {
            // only the edge is drawn: the inside of the letter stays empty (it still counts for the sweep)
            const n = (dx: number, dy: number) => at(col + dx, row + dy);
            const border = cov > 0.14 && (cov < 0.86 || n(1, 0) < 0.14 || n(-1, 0) < 0.14 || n(0, 1) < 0.14 || n(0, -1) < 0.14);
            if (border) glyph = edgeChar(n);
            if (!glyph && cov < 0.01) continue;
          } else if (st === 'rampa') {
            glyph = RAMP[Math.min(RAMP.length - 1, Math.round(Math.pow(cov, 0.8) * (RAMP.length - 1)))].trim();
            if (!glyph && cov < 0.01) continue;
          } else if (cov < 0.01) continue;
          const xn = (line.off + (cx + cw / 2 - line.x0)) / Math.max(1, total);
          const yl = (cy + ch / 2 - y0) / Math.max(1, y1 - y0);
          const seed = li * 7919 + row * 131 + col * 17 + DRAWN.indexOf(st) * 3;
          list.push({
            x: cx, y: cy, w: cw, h: ch, cov, bits, ch: glyph,
            line: Math.max(0, Math.min(1, xn * 0.8 + h01(seed) * 0.2)),
            weave: Math.max(0, Math.min(1, (1 - yl) * 0.55 + h01(seed + 1) * 0.45)),
          });
        }
      }
      cells[st] = list;
    }
    return { ch: l.ch, x: l.x, base: l.base, cells };
  });
  return { width, height, bleed, font, fs, u, letters };
}

/* ------------------------------------------------------------------ drawing */

const shades = new Map<string, CanvasPattern | null>();
/** ░▒▓ as real dither patterns (anchored to the canvas, so neighbouring cells tile seamlessly). */
function shade(ctx: CanvasRenderingContext2D, level: number, color: string, dot: number): CanvasPattern | string {
  if (level >= 4) return color;
  const key = `${level}|${color}|${dot}`;
  if (!shades.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = dot * 4;
    const x = c.getContext('2d')!;
    x.fillStyle = color;
    // ordered 4×4: level 1 → 4 of 16 dots, 2 → 8, 3 → 12
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let i = 0; i < 16; i++) if (bayer[i] < level * 4) x.fillRect((i % 4) * dot, Math.floor(i / 4) * dot, dot, dot);
    shades.set(key, ctx.createPattern(c, 'repeat'));
  }
  return shades.get(key) ?? color;
}

function drawCells(ctx: CanvasRenderingContext2D, L: Layout, st: Drawn, cells: Cell[], color: string, dpr: number) {
  if (!cells.length) return;
  const u = L.u;
  if (st === 'braille') {
    const r = u * 0.36;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const c of cells) {
      for (let b = 0; b < 8; b++) {
        if (!(c.bits & (1 << b))) continue;
        const cx = c.x + ((b % 2) + 0.5) * u, cy = c.y + (Math.floor(b / 2) + 0.5) * u;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  } else if (st === 'puntos') {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const c of cells) {
      if (c.cov < 0.05) continue;
      const r = c.w * 0.64 * Math.sqrt(c.cov);
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (st === 'bloques') {
    // device-pixel snapped, so blocks meet without seams
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const dot = Math.max(1, Math.round(u * 0.45 * dpr)) / dpr;
    for (let level = 1; level <= 4; level++) {
      ctx.fillStyle = shade(ctx, level, color, Math.max(1, Math.round(dot * dpr)));
      if (typeof ctx.fillStyle !== 'string') (ctx.fillStyle as unknown as CanvasPattern).setTransform?.(new DOMMatrix().scale(1 / dpr));
      ctx.beginPath();
      for (const c of cells) if (c.bits === level) ctx.rect(snap(c.x), snap(c.y), snap(c.x + c.w) - snap(c.x), snap(c.y + c.h) - snap(c.y));
      ctx.fill();
    }
  } else {
    ctx.fillStyle = color;
    const fs = L.fs[st];
    ctx.font = `500 ${fs.toFixed(2)}px "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of cells) if (c.ch) ctx.fillText(c.ch, c.x + c.w / 2, c.y + c.h / 2 + fs * 0.04);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, L: Layout, l: Letter, clip: Cell[] | null, color: string) {
  if (clip && !clip.length) return;
  ctx.save();
  if (clip) {
    ctx.beginPath();
    for (const c of clip) ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
  }
  ctx.font = L.font;
  ctx.fillStyle = color;
  ctx.fillText(l.ch, l.x, l.base);
  ctx.restore();
}

function drawLetter(ctx: CanvasRenderingContext2D, L: Layout, l: Letter, s: LetterState, ink: string, accent: string, dpr: number) {
  const color = s.solo ? accent : ink;
  if (s.a === 'solido' && s.b === 'solido') { drawSolid(ctx, L, l, null, ink); return; }
  const key = s.sweep === 'linea' ? 'line' : 'weave';
  const side = (st: Style, onB: boolean, other: Style) => {
    const grid: Drawn = st === 'solido' ? (other as Drawn) : st;
    const cells = l.cells[grid].filter(c => (c[key] < s.p) === onB);
    if (st === 'solido') drawSolid(ctx, L, l, cells, ink);
    else drawCells(ctx, L, st, cells, color, dpr);
  };
  if (s.p < 1) side(s.a, false, s.b);
  if (s.p > 0) side(s.b, true, s.a);
}

/* ------------------------------------------------------------------ the running headline */

export interface TitleControl {
  /** Draws the score at time t (seconds): for the QA page and the frame strip. */
  drawAt(t: number): Frame | null;
  destroy(): void;
}

export interface TitleOptions {
  isPaused: () => boolean;
  onPause: (fn: (paused: boolean) => void) => void;
  /** Only draws on demand (drawAt): the QA page. */
  manual?: boolean;
}

const fontsReady = (h1: HTMLElement) => {
  const cs = getComputedStyle(h1);
  const wait = Promise.all([
    document.fonts.load(`${cs.fontWeight} 64px ${cs.fontFamily}`, 'Haz arte ASCII'),
    document.fonts.load('500 16px "JetBrains Mono"', '|/\\_-.:=+*#%@'),
  ]).then(() => true, () => false);
  return Promise.race([wait, new Promise<boolean>(r => setTimeout(() => r(false), 4000))]);
};

export async function mountTitle(h1: HTMLElement, o: TitleOptions): Promise<TitleControl | null> {
  if (!(await fontsReady(h1))) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'ht-glyphs';
  canvas.setAttribute('aria-hidden', 'true');
  h1.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let L: Layout | null = null;
  let dpr = 1;

  const layout = () => {
    L = measure(h1);
    if (!L) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.left = canvas.style.top = `${-L.bleed}px`;
    canvas.style.width = `${L.width}px`;
    canvas.style.height = `${L.height}px`;
    canvas.width = Math.round(L.width * dpr);
    canvas.height = Math.round(L.height * dpr);
  };
  layout();
  if (!L) { canvas.remove(); return null; }

  let ink = '#ede6da';
  const accent = '#ff5b1f';
  const readInk = () => { ink = getComputedStyle(h1).color; };
  readInk();
  let showing = false;
  const show = (on: boolean) => {
    h1.classList.toggle('ht-on', on);
    if (on) canvas.classList.remove('ht-fade');
    else if (showing) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    showing = on;
  };

  const drawAt = (t: number): Frame | null => {
    if (!L) return null;
    const f = frameAt(t, L.letters.length);
    h1.dataset.glyph = f.legible ? 'legible' : f.phase;
    if (f.legible) { show(false); return f; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.width, L.height);
    L.letters.forEach((l, i) => drawLetter(ctx, L!, l, f.letters[i], ink, accent, dpr));
    show(true);
    return f;
  };

  if (o.manual) return { drawAt, destroy: () => canvas.remove() };

  /* the clock only runs while someone can see the headline and nothing asks it to hold */
  let anim = 0;
  let raf = 0, timer = 0, last = 0;
  let visible = false, reading = false, destroyed = false;
  const running = () => visible && !reading && !document.hidden && !o.isPaused() && !destroyed && !!L;

  const stop = () => {
    cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0;
    if (!L) return;
    const f = frameAt(anim, L.letters.length);
    if (!f.legible) {
      // recompose at once (the real text is back, the glyphs fade over it), and wait out a hold
      const tl = timeline(L.letters.length);
      anim = TIMING.firstHold + f.cycle * tl.period + tl.active;
      h1.dataset.glyph = 'legible';
    }
    if (showing) {
      h1.classList.remove('ht-on');
      canvas.classList.add('ht-fade');
      window.setTimeout(() => { if (!h1.classList.contains('ht-on')) show(false); }, 220);
    }
  };
  const frame = (now: number) => {
    raf = 0;
    if (!running()) return;
    // real time, so a slow device skips frames but keeps the rhythm (a hidden tab or an off-screen hero stops the clock)
    anim += Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    const f = drawAt(anim);
    if (f?.legible) {
      const next = nextActive(anim, L!.letters.length);
      if (next > anim + 0.05) {
        // sleep through the hold: no frames until the next woven moment
        timer = window.setTimeout(() => { timer = 0; anim = next; readInk(); last = performance.now(); raf = requestAnimationFrame(frame); }, (next - anim) * 1000);
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  };
  const start = (fresh = false) => {
    if (!running() || raf || timer) return;
    if (fresh && L) {
      // back on screen or on the tab: the legible headline first, the next woven moment soon after
      const next = nextActive(anim, L.letters.length);
      if (frameAt(anim, L.letters.length).legible) anim = Math.max(anim, next - 1.8);
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const update = (fresh = false) => (running() ? start(fresh) : stop());

  const io = new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); update(true); });
  io.observe(h1);
  const onVis = () => update(true);
  document.addEventListener('visibilitychange', onVis);
  // someone selecting the headline is reading it: it holds, legible
  const onSel = () => {
    const sel = document.getSelection();
    const inside = !!sel && !sel.isCollapsed && sel.rangeCount > 0 && h1.contains(sel.getRangeAt(0).commonAncestorContainer);
    if (inside !== reading) { reading = inside; update(true); }
  };
  document.addEventListener('selectionchange', onSel);
  o.onPause(() => update(true));

  let resizeTimer = 0;
  let size = `${h1.clientWidth}x${h1.clientHeight}`;
  const ro = new ResizeObserver(() => {
    const now = `${h1.clientWidth}x${h1.clientHeight}`;
    if (now === size) return;
    size = now;
    stop();
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { layout(); update(); }, 160);
  });
  ro.observe(h1);

  return {
    drawAt,
    destroy() {
      destroyed = true;
      stop();
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('selectionchange', onSel);
      canvas.remove();
      h1.classList.remove('ht-on');
    },
  };
}
