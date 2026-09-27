/**
 * Select pass on the CPU: tone, levels, dither, glyph choice (density / lines / scramble / words, contours),
 * colour (ramp maps, cycle, hue, saturation, source colour) and the message overlay.
 * A port of SELECT_FS in ../glsl/programs.ts; its outputs are exactly what GridSnapshot reports.
 * Pure: no DOM.
 */
import type { Recipe } from '../recipe';
import { PI, TAU, fbm, hash12 } from './core';

export interface SelectFrame {
  cols: number; rows: number;
  /** Held time (stop motion applied). */
  time: number;
  r: Recipe;
  /** Field outputs (8-bit). */
  fa: Uint8Array; fr: Uint8Array; fg: Uint8Array; fb: Uint8Array;
  isMedia: boolean;
  /** Baked 256×1 RGBA gradient. */
  grad: Uint8Array;
  n: number; edgeBase: number; blockIdx: number;
  /** Glyph indices of the words sequence. */
  words: Uint16Array;
  msg: {
    on: boolean; mode: number; prog: number; win: number; shift: number;
    /** layoutMessage data (RG = glyph index + 1, BA = typing order) and its width. */
    data: Uint8Array; width: number;
    cursorX: number; cursorY: number; cursorOn: boolean;
    color: [number, number, number] | null;
  };
  imode: number; ptrCellX: number; ptrCellY: number; ptrOn: number; istr: number; iradCells: number;
  /** Cell height / width. */
  aspect: number;
}

export class SelectBuffers {
  readonly n: number;
  readonly idx: Uint16Array;
  readonly rgb: Uint8Array;
  readonly lum: Uint8Array;
  readonly alpha: Uint8Array;
  readonly flags: Uint8Array;
  readonly tone: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.idx = new Uint16Array(n); this.rgb = new Uint8Array(n * 3); this.lum = new Uint8Array(n);
    this.alpha = new Uint8Array(n); this.flags = new Uint8Array(n); this.tone = new Float64Array(n);
  }
}

const bayer2 = (x: number, y: number) => { x = Math.floor(x); y = Math.floor(y); const v = x * 0.5 + y * y * 0.75; return v - Math.floor(v); };
const bayer4 = (x: number, y: number) => bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
const bayer8 = (x: number, y: number) => bayer4(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);
const tri = (x: number) => { const m = x - 2 * Math.floor(x / 2); return 1 - Math.abs(1 - m); };
const smooth = (e0: number, e1: number, x: number) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const q8 = (v: number) => Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);

/** texture(uGrad, vec2(g, .5)) on the 256-wide LINEAR gradient texture. Writes GC. */
const GC = new Float64Array(3);
export function gradAt(grad: Uint8Array, g: number) {
  const n = grad.length / 4;
  const x = g * n - 0.5;
  let i0 = Math.floor(x);
  const f = x - i0;
  let i1 = i0 + 1;
  if (i0 < 0) i0 = 0; else if (i0 > n - 1) i0 = n - 1;
  if (i1 < 0) i1 = 0; else if (i1 > n - 1) i1 = n - 1;
  for (let k = 0; k < 3; k++) GC[k] = (grad[i0 * 4 + k] * (1 - f) + grad[i1 * 4 + k] * f) / 255;
  return GC;
}

export function runSelect(s: SelectFrame, out: SelectBuffers) {
  const { cols, rows, r, time: T, n: N } = s;
  const tn = r.tone, gl = r.glyph, co = r.color;
  const contrast = tn.contrast, bright = tn.bright, gamma = tn.gamma, invert = tn.invert ? 1 : 0, levels = tn.levels;
  const tone = (v: number) => {
    let l = (v - 0.5) * contrast + 0.5 + bright;
    l = l < 0 ? 0 : l > 1 ? 1 : l;
    l = Math.pow(l, gamma);
    return l * (1 - invert) + (1 - l) * invert;
  };
  const TN = out.tone;
  for (let i = 0; i < cols * rows; i++) TN[i] = tone(s.fa[i] / 255);
  const L = (c: number, rr: number) => {
    c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
    rr = rr < 0 ? 0 : rr >= rows ? rows - 1 : rr;
    return TN[rr * cols + c];
  };
  const gmode = ['density', 'lines', 'scramble', 'words'].indexOf(gl.mode);
  const ditherK = gl.dither / Math.max(N - 1, 1), bayer = gl.ditherKind === 'bayer';
  const edge = gl.edge, jitter = gl.jitter;
  const cmap = ['luma', 'x', 'y', 'radial', 'angle', 'noise'].indexOf(co.map);
  const shade = co.shade, useSource = co.mode === 'source' && s.isMedia;
  const shift = co.shift + co.cycle * T;
  const hue = co.hue * TAU, ch = Math.cos(hue), sh = Math.sin(hue), sat = co.sat, vivid = co.vivid;
  const ax = cols / (rows * s.aspect);
  const wordsN = s.words.length;
  const wordsT = Math.floor(T * jitter * 8);
  const scrT = T * (1 + jitter * 14);
  const edgeTh = gmode === 1 ? (Math.max(edge, 0.35)) : edge;
  const edgeLim = 2.2 + (0.12 - 2.2) * edgeTh;
  const doEdge = edge > 0 || gmode === 1;
  const M = s.msg;
  const top = gradAt(s.grad, 1);
  const msgCol: [number, number, number] = M.color ?? [top[0], top[1], top[2]];
  const scrambleI = s.imode === 8;
  const tt18 = Math.floor(T * 18), tt24 = Math.floor(T * 24);
  const iRad2 = Math.max(s.iradCells * s.iradCells, 1);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      let l = TN[i];
      if (levels > 1.5) l = Math.floor(l * levels * 0.9999) / (levels - 1);
      const dth = bayer ? bayer8(col, row) : hash12(col * 1.37 + 11, row * 1.37 + 11);
      let lq = l + (dth - 0.5) * ditherK;
      lq = lq < 0 ? 0 : lq > 1 ? 1 : lq;
      let idx = Math.floor(lq * (N - 1) + 0.5);
      let alpha = 1, flags = 0;
      let inten = 1 * (1 - shade) + l * shade;

      if (gmode === 2) {
        const h = hash12(col * 1.31 + Math.floor(scrT + hash12(col, row) * 8) * 0.73, row * 1.31 + Math.floor(scrT + hash12(col, row) * 8) * 0.73);
        idx = l < 0.06 ? 0 : Math.floor(N * 0.35 + (N - 0.01 - N * 0.35) * h);
        inten = inten * 0.15 + l * 0.85;
      } else if (gmode === 3) {
        const k = row * cols + col + wordsT;
        idx = wordsN ? s.words[k - wordsN * Math.floor(k / wordsN)] : 0;
        alpha = smooth(0.03, 0.14, l);
        inten = inten * 0.15 + l * 0.85;
      } else if (gmode === 1) {
        idx = 0;
      }
      if (doEdge) {
        const tl = L(col - 1, row - 1), tc = L(col, row - 1), tr = L(col + 1, row - 1);
        const ml = L(col - 1, row), mr = L(col + 1, row);
        const bl = L(col - 1, row + 1), bc = L(col, row + 1), br = L(col + 1, row + 1);
        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
        const gy = tl + 2 * tc + tr - (bl + 2 * bc + br);
        if (Math.sqrt(gx * gx + gy * gy) > edgeLim) {
          let an = Math.atan2(gy, gx); if (an < 0) an += PI;
          const q = Math.floor(an / 0.7853982 + 0.5);
          idx = s.edgeBase + (q - 4 * Math.floor(q / 4));
          alpha = 1;
          if (gmode === 1) inten = 1;
        }
      }
      if (scrambleI) {
        const dx = col - s.ptrCellX, dy = (row - s.ptrCellY) * s.aspect;
        const k = s.ptrOn * Math.exp(-(dx * dx + dy * dy) / iRad2);
        if (hash12(col + tt18 * 1.7, row + tt18 * 1.7) < k * s.istr * 1.3) {
          idx = 1 + Math.floor(hash12(col * 0.7 + tt18, row * 0.7 + tt18) * Math.max(N - 1, 1));
          l = Math.max(l, 0.7); inten = Math.max(inten, 0.9); alpha = 1;
        }
      }

      let g = l;
      const ux = (col + 0.5) / cols, uy = (row + 0.5) / rows;
      if (cmap === 1) g = ux;
      else if (cmap === 2) g = 1 - uy;
      else if (cmap === 3) { const dx = (ux - 0.5) * ax, dy = uy - 0.5; g = Math.sqrt(dx * dx + dy * dy) * 1.5; }
      else if (cmap === 4) g = Math.atan2(uy - 0.5, (ux - 0.5) * ax) / TAU + 0.5;
      else if (cmap === 5) g = smooth(0.25, 0.75, fbm(ux * ax * 2.2 + T * 0.03, uy * 2.2 + T * 0.03));
      g = tri(g + shift);
      let br: number, bg: number, bb: number;
      if (useSource) {
        br = s.fr[i] / 255; bg = s.fg[i] / 255; bb = s.fb[i] / 255;
        const mx = Math.max(Math.max(br, bg), bb), d = Math.max(mx, 0.04);
        br = br * (1 - vivid) + (br / d) * vivid; bg = bg * (1 - vivid) + (bg / d) * vivid; bb = bb * (1 - vivid) + (bb / d) * vivid;
      } else {
        const c = gradAt(s.grad, g); br = c[0]; bg = c[1]; bb = c[2];
      }
      if (hue > 0) {
        // Rodrigues rotation around the grey axis
        const k = 0.57735, dk = k * (br + bg + bb) * k * (1 - ch);
        const cxr = k * (bb - bg), cxg = k * (br - bb), cxb = k * (bg - br);
        const nr = br * ch + cxr * sh + dk, ng = bg * ch + cxg * sh + dk, nb = bb * ch + cxb * sh + dk;
        br = nr; bg = ng; bb = nb;
      }
      const gr = br * 0.299 + bg * 0.587 + bb * 0.114;
      br = gr + (br - gr) * sat; bg = gr + (bg - gr) * sat; bb = gr + (bb - gr) * sat;
      br = br < 0 ? 0 : br > 1 ? 1 : br; bg = bg < 0 ? 0 : bg > 1 ? 1 : bg; bb = bb < 0 ? 0 : bb > 1 ? 1 : bb;

      if (M.on) {
        const mcx = Math.floor((col + M.shift) - M.width * Math.floor((col + M.shift) / M.width));
        const k = (row * M.width + mcx) * 4;
        const mi = M.data[k] + M.data[k + 1] * 256 - 1;
        if (mi >= 0) {
          const ord = M.data[k + 2] + M.data[k + 3] * 256;
          const fp = Math.floor(M.prog);
          const shown = M.mode === 0 || M.mode === 3 || ord < fp;
          const scr = M.mode === 2 && !shown && ord < fp + M.win;
          if (shown) { idx = mi; br = msgCol[0]; bg = msgCol[1]; bb = msgCol[2]; inten = 1; alpha = 1; flags = 1; }
          else if (scr) {
            idx = 1 + Math.floor(hash12(col + tt24, row + tt24) * Math.max(N - 1, 1));
            br = msgCol[0]; bg = msgCol[1]; bb = msgCol[2]; inten = 0.85; alpha = 1; flags = 1;
          }
        }
      }
      if (M.cursorOn && col === M.cursorX && row === M.cursorY) {
        idx = s.blockIdx; br = msgCol[0]; bg = msgCol[1]; bb = msgCol[2]; inten = 1; alpha = 1; flags = 1;
      }
      out.idx[i] = idx;
      out.rgb[i * 3] = q8(br * inten); out.rgb[i * 3 + 1] = q8(bg * inten); out.rgb[i * 3 + 2] = q8(bb * inten);
      out.lum[i] = q8(l);
      out.alpha[i] = q8(alpha);
      out.flags[i] = flags;
    }
  }
}
