import type { Recipe } from './recipe';

/** Rasterises the big text source (white on black) at the canvas aspect ratio. */
export function drawTextSource(cv: HTMLCanvasElement, W: number, H: number, t: Recipe['text'], stack: string) {
  const w = Math.round(Math.max(256, Math.min(1600, W * 0.75)));
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

export interface MsgLayout {
  data: Uint8Array;   // width*rows*4: RG = glyph index + 1, BA = order
  width: number;
  count: number;      // number of cells (typing order length)
  cells: Array<[number, number]>;
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
    return { data, width, count: line.length, cells };
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
  let ord = 0;
  vis.forEach((line, r) => {
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
  return { data, width: cols, count: ord, cells };
}

function trimEnd(a: string[]): string[] {
  let n = a.length;
  while (n && /\s/.test(a[n - 1])) n--;
  return a.slice(0, n);
}

export interface MsgState { prog: number; cursor: number; cursorOn: boolean; shift: number }

/** Typing / decoding timeline for message overlays. Pure function of time. */
export function messageState(msg: Recipe['msg'], count: number, t: number): MsgState {
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
  const cursor = Math.min(n - 1, Math.floor(prog));
  return { prog, cursor, cursorOn: msg.mode === 'type' && msg.cursor && (!holding || blink), shift: 0 };
}
