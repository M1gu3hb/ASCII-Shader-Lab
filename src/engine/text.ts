import type { Recipe } from './recipe';
import { letterPose, textAnimated, type LetterSlot } from './letters';

export { textAnimated };

/**
 * Rasterises the big text source (white on black) at the canvas aspect ratio. With `anim` (the text has
 * letters that move, see letters.ts), each letter is drawn where it is at `anim.time`, at a resolution
 * the cells need (three pixels per column): it is drawn again at every frame.
 */
export function drawTextSource(cv: HTMLCanvasElement, W: number, H: number, t: Recipe['text'], stack: string, anim?: { time: number; cols: number }) {
  const w = Math.round(Math.max(256, Math.min(1600, W * 0.75, anim && t.anim ? anim.cols * 3 : Infinity)));
  const h = Math.max(64, Math.round((w * H) / Math.max(W, 1)));
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  const lines = String(t.content || '').split('\n');
  const style = `${t.italic ? 'italic ' : ''}${t.weight} `;
  const track = t.tracking;
  const measure = (line: string, px: number) => {
    c.font = style + px + 'px ' + stack;
    const base = c.measureText(line).width;
    return base + Math.max(0, Array.from(line).length - 1) * track * px;
  };
  let mw = 1;
  for (const l of lines) mw = Math.max(mw, measure(l, 100));
  const lh = t.leading * 1.02;
  const fs = Math.max(4, Math.min((100 * w * 0.9) / mw, (h * 0.86) / (lines.length * lh)) * t.size);
  c.font = style + fs + 'px ' + stack;
  c.fillStyle = '#fff';
  c.textBaseline = 'middle';
  const margin = w * 0.05;
  const y0 = h / 2 - ((lines.length - 1) * fs * lh) / 2;
  if (anim && t.anim) { drawLetters(c, lines, t, fs, lh, y0, margin, w, h, measure, anim.time); return; }
  lines.forEach((line, i) => {
    const lw = measure(line, fs);
    let x = t.align === 'left' ? margin : t.align === 'right' ? w - margin - lw : (w - lw) / 2;
    const y = y0 + i * fs * lh;
    if (track === 0) {
      c.textAlign = 'left';
      c.fillText(line, x, y);
    } else {
      c.textAlign = 'left';
      for (const ch of Array.from(line)) {
        c.fillText(ch, x, y);
        x += c.measureText(ch).width + track * fs;
      }
    }
  });
}

/**
 * The big text letter by letter, each where its animation puts it. Letters keep the line's kerning (each
 * starts where the line up to it ends) and the tracking of the static text.
 */
interface Placed { ch: string; x: number; y: number; cw: number; word: number }
/** Letter places of the last few texts (they only change with the text, its font or the canvas size). */
const placesCache = new Map<string, Placed[]>();

function drawLetters(
  c: CanvasRenderingContext2D, lines: string[], t: Recipe['text'], fs: number, lh: number, y0: number, margin: number,
  w: number, h: number, measure: (line: string, px: number) => number, time: number,
) {
  const a = t.anim!;
  const key = [t.content, c.font, t.align, t.tracking, t.leading, w, h].join('\u0001');
  let placed = placesCache.get(key);
  if (!placed) {
    placed = [];
    let word = 0;
    lines.forEach((line, i) => {
      const lw = measure(line, fs);
      const x0 = t.align === 'left' ? margin : t.align === 'right' ? w - margin - lw : (w - lw) / 2;
      const y = y0 + i * fs * lh;
      let x = x0, prevSpace = true, prefix = '';
      for (const ch of Array.from(line)) {
        const cw = c.measureText(ch).width;
        const at = t.tracking === 0 ? x0 + c.measureText(prefix).width : x;
        if (/\s/.test(ch)) prevSpace = true;
        else {
          if (prevSpace && placed!.length) word++;
          prevSpace = false;
          placed!.push({ ch, x: at, y, cw, word });
        }
        prefix += ch;
        x += cw + t.tracking * fs;
      }
    });
    placesCache.set(key, placed);
    if (placesCache.size > 6) placesCache.delete(placesCache.keys().next().value!);
  }
  if (!placed.length) return;
  let mx = 0, my = 0;
  for (const p of placed) { mx += p.x + p.cw / 2; my += p.y; }
  mx /= placed.length; my /= placed.length;
  const words = placed[placed.length - 1].word + 1, reach = Math.max(w, h) * 0.35;
  c.textAlign = 'center';
  placed.forEach((p, k) => {
    const cx = p.x + p.cw / 2;
    const slot: LetterSlot = { k, n: placed!.length, word: p.word, words, cx: cx - mx, cy: p.y - my };
    const pose = letterPose(a, time, slot, fs, reach);
    if (pose.grey <= 0.004) return;
    const g = Math.round(Math.min(1, pose.grey) * 255);
    c.fillStyle = `rgb(${g},${g},${g})`;
    const cs = pose.scale * Math.cos(pose.rot), sn = pose.scale * Math.sin(pose.rot);
    c.setTransform(cs, sn, -sn, cs, cx + pose.dx, p.y + pose.dy);
    c.fillText(pose.glyph ?? p.ch, 0, 0);
  });
  c.setTransform(1, 0, 0, 1, 0, 0);
}

export interface MsgLayout {
  data: Uint8Array;   // width*rows*4: RG = glyph index + 1, BA = order
  width: number;
  count: number;      // number of cells (typing order length)
  cells: Array<[number, number]>;
  /** Typing positions of each word, [first, past the last) (the «Palabra a palabra» mode shows them whole). */
  spans: Array<[number, number]>;
}

/** Word spans of a sequence of characters typed in order from `ord0`. */
function spansOf(chars: string[], ord0: number, out: Array<[number, number]>) {
  let start = -1;
  chars.forEach((ch, i) => {
    const sp = /\s/.test(ch);
    if (!sp && start < 0) start = ord0 + i;
    if (sp && start >= 0) { out.push([start, ord0 + i]); start = -1; }
  });
  if (start >= 0) out.push([start, ord0 + chars.length]);
}

/** Word-wraps and places a message in the character grid. */
export function layoutMessage(
  text: string, cols: number, rows: number, x: number, y: number, align: 'left' | 'center' | 'right',
  marquee: boolean, glyphIndex: (c: string) => number,
): MsgLayout {
  const cells: Array<[number, number]> = [];
  if (marquee) {
    const line = Array.from(text.replace(/\s*\n\s*/g, '   ')) as string[];
    const gap = 6;
    const width = Math.max(cols, line.length + gap);
    const row = Math.max(0, Math.min(rows - 1, Math.round((rows - 1) * y)));
    const data = new Uint8Array(width * rows * 4);
    line.forEach((ch, i) => {
      const k = (row * width + i) * 4;
      const gi = glyphIndex(ch) + 1;
      data[k] = gi & 255; data[k + 1] = gi >> 8; data[k + 2] = i & 255; data[k + 3] = i >> 8;
      cells.push([i, row]);
    });
    const spans: Array<[number, number]> = [];
    spansOf(line, 0, spans);
    return { data, width, count: line.length, cells, spans };
  }
  const maxW = Math.max(4, cols - 2);
  const lines: string[][] = [];
  for (const raw of String(text).split('\n')) {
    let cur: string[] = [];
    for (const tok of raw.split(/(\s+)/).filter(Boolean)) {
      const tc = Array.from(tok);
      if (/^\s+$/.test(tok)) {
        if (cur.length && cur.length + tc.length <= maxW) cur.push(...tc.map(() => ' '));
        continue;
      }
      if (cur.length + tc.length > maxW) {
        if (cur.length) { lines.push(trimEnd(cur)); cur = []; }
        while (tc.length > maxW) lines.push(tc.splice(0, maxW));
      }
      cur.push(...tc);
    }
    lines.push(trimEnd(cur));
  }
  const vis = lines.slice(0, Math.max(1, rows - 1));
  const bw = Math.max(...vis.map(l => l.length), 1);
  const bh = vis.length;
  const left = Math.round((cols - bw) * x);
  const top = Math.round((rows - bh) * y);
  const data = new Uint8Array(cols * rows * 4);
  const spans: Array<[number, number]> = [];
  let ord = 0;
  vis.forEach((line, r) => {
    spansOf(line, ord, spans);
    const off = align === 'left' ? 0 : align === 'right' ? bw - line.length : Math.floor((bw - line.length) / 2);
    const row = top + r;
    line.forEach((ch, i) => {
      const col = left + off + i;
      if (col < 0 || col >= cols || row < 0 || row >= rows) { ord++; return; }
      const k = (row * cols + col) * 4;
      const gi = glyphIndex(ch) + 1;
      data[k] = gi & 255; data[k + 1] = gi >> 8; data[k + 2] = ord & 255; data[k + 3] = ord >> 8;
      cells.push([col, row]);
      ord++;
    });
    // newline costs one "keystroke" so the cursor pauses at line ends
    ord++;
    cells.push([Math.min(cols - 1, left + off + line.length), row]);
  });
  return { data, width: cols, count: ord, cells, spans };
}

function trimEnd(a: string[]): string[] {
  let n = a.length;
  while (n && /\s/.test(a[n - 1])) n--;
  return a.slice(0, n);
}

export interface MsgState { prog: number; cursor: number; cursorOn: boolean; shift: number }

/**
 * Typing / decoding timeline for message overlays. Pure function of time. «Palabra a palabra» types like
 * the typewriter but shows whole words: one appears as soon as typing reaches it and goes as soon as
 * erasing does (`spans`: the layout's words).
 */
export function messageState(msg: Recipe['msg'], count: number, t: number, spans?: Array<[number, number]>): MsgState {
  const n = Math.max(1, count);
  const sp = Math.max(0.5, msg.speed);
  const blink = (t * 1.7) % 1 < 0.55;
  if (msg.mode === 'static') return { prog: n + 1, cursor: n, cursorOn: msg.cursor && blink, shift: 0 };
  if (msg.mode === 'marquee') return { prog: n + 1, cursor: -1, cursorOn: false, shift: t * sp };
  const tType = n / sp, tHold = msg.hold, tErase = n / (sp * (msg.mode === 'decode' ? 4 : 2.6)), tGap = 0.7;
  const cycle = tType + tHold + tErase + tGap;
  const tt = ((t % cycle) + cycle) % cycle;
  let prog: number, holding = false;
  if (tt < tType) prog = tt * sp;
  else if (tt < tType + tHold) { prog = n; holding = true; }
  else if (tt < tType + tHold + tErase) prog = n - (tt - tType - tHold) * sp * (msg.mode === 'decode' ? 4 : 2.6);
  else { prog = 0; holding = true; }
  if (msg.mode === 'words' && spans) {
    const at = Math.floor(prog), typing = tt < tType;
    const w = spans.find(s => at >= s[0] && at < s[1]);
    if (w) prog = typing ? w[1] : w[0];
    return { prog, cursor: -1, cursorOn: false, shift: 0 };
  }
  const cursor = Math.min(n - 1, Math.floor(prog));
  return { prog, cursor, cursorOn: msg.mode === 'type' && msg.cursor && (!holding || blink), shift: 0 };
}
