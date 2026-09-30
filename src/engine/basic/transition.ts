/**
 * Transitions of the basic engine: the same cells as transCell() in COMPOSE_FS (../glsl/programs.ts),
 * without sending the frame through the slow per-pixel path:
 *  - glyph cells (ramp glyphs in the accent over the background) are written into the frame's pixels
 *    before they go to the canvas, so the canvas overlays (scanlines, vignette) fall on them too, a small
 *    difference from the shader, which draws them after its screen effects;
 *  - the old frame is a canvas copy of what was on screen (nothing is read back), drawn over the finished
 *    frame through a mask of the cells still old (one pixel per cell, scaled up without smoothing);
 *  - Mosaico redraws the new frame block by block, each block showing its centre cell magnified.
 */
import { hash12 } from './core';
import { TRANSITION_INDEX, mosaicBlock, type TransitionSpec } from '../transitions';
import type { GlyphAtlas } from './compose';

export const T_NEW = 0, T_OLD = 1, T_GLYPH = 2;

export interface TransitionGrid { cols: number; rows: number; cw: number; ch: number; W: number; H: number; n: number }

/**
 * State of every cell of the screen grid at progress p (0..1): mode[i] is T_NEW, T_OLD or T_GLYPH, and
 * glyph[i] the ramp glyph of a T_GLYPH cell. `realT` drives the scrambled glyphs, as uTime in the shader.
 */
export function transitionCells(spec: TransitionSpec, p: number, g: TransitionGrid, realT: number, mode: Uint8Array, glyph: Uint16Array) {
  const { cols, rows, cw, ch, W, H } = g;
  const N1 = Math.max(g.n - 1, 1);
  const kind = TRANSITION_INDEX[spec.kind] ?? 0;
  const seed = spec.seed ?? 0, back = (spec.dir ?? 1) < 0;
  const t30 = Math.floor(realT * 30), t24 = Math.floor(realT * 24);
  // lluvia
  const tail = Math.max(3, Math.floor(rows * 0.12));
  // iris
  const ox = (spec.origin?.[0] ?? 0.5) * W, oy = (spec.origin?.[1] ?? 0.5) * H;
  const mx = Math.max(ox, W - ox), my = Math.max(oy, H - oy);
  const rad = p * (Math.sqrt(mx * mx + my * my) / cw + 1 + 2.5);
  // mosaico
  const B = mosaicBlock(p);
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let u = (c + 0.5) / cols;
      if (back) u = 1 - u;
      let m = T_NEW, gi = 0;
      if (kind === 1) {
        const s = hash12(c * 1.37 + 7.1, r * 1.37 + seed) * 0.7;
        const lp = (p - s) / 0.3;
        if (lp < 0) m = T_OLD;
        else if (lp < 1) { m = T_GLYPH; gi = Math.floor((1 - lp) * N1 + 0.5); }
      } else if (kind === 2) {
        const d = hash12(c * 1.7 + seed, 3.1) * 0.45;
        const q = (p - d) / 0.55;
        const front = (q < 0 ? 0 : q > 1 ? 1 : q) * (rows + tail);
        if (r >= front) m = T_OLD;
        else if (r >= front - tail) { m = T_GLYPH; gi = r >= front - 1 ? N1 : 1 + Math.floor(hash12(c + t24, r + t24) * N1); }
      } else if (kind === 3) {
        const dx = (c + 0.5) * cw - ox, dy = (r + 0.5) * ch - oy;
        const d = Math.sqrt(dx * dx + dy * dy) / cw;
        if (d >= rad) m = T_OLD;
        else if (d >= rad - 2.5) { m = T_GLYPH; gi = 1 + Math.floor(hash12(c + t30, r + t30) * N1); }
      } else if (kind === 4) {
        const h = u * 0.7 + v * 0.3, front = p * 1.14;
        if (h >= front) m = T_OLD;
        else if (h >= front - 0.14) { m = T_GLYPH; gi = Math.floor(((h - front + 0.14) / 0.14) * N1 + 0.5); }
      } else if (kind === 5) {
        if (p < 0.2 && hash12(Math.floor(c / B) * 1.31 + seed, Math.floor(r / B) * 1.31 + seed) > p * 5) m = T_OLD;
      } else {
        const h = hash12(c * 1.13 + seed, r * 1.13 + seed) * 0.3 + u * 0.55 + v * 0.15;
        const prog = p * 1.3 - 0.15;
        if (h > prog + 0.07) m = T_OLD;
        else if (h > prog) { m = T_GLYPH; gi = 1 + Math.floor(hash12(c + t30, r + t30) * N1); }
      }
      mode[i] = m;
      glyph[i] = gi;
    }
  }
}

// int32 on purpose, as in compose.ts: Uint32Array stores the same bits
const pack = (r: number, g: number, b: number) => -16777216 | (b << 16) | (g << 8) | r;

export interface TransitionFrame extends TransitionGrid {
  spec: TransitionSpec;
  p: number;
  realT: number;
  /** Glyph coverage of the atlas (the same the frame is drawn with). */
  atlas: GlyphAtlas;
  bg: [number, number, number];
  accent: [number, number, number];
}

/** What the basic engine keeps for its transitions: the old frame, the cells of this frame, scratch canvases. */
export class TransitionLayer {
  private prev: HTMLCanvasElement | null = null;
  private scratch: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private maskImg: ImageData | null = null;
  private mode = new Uint8Array(1);
  private glyph = new Uint16Array(1);
  private olds = 0;
  private glyphs = 0;

  /** Keeps a copy of what `src` shows now (a canvas-to-canvas copy: nothing is read back). */
  capture(src: HTMLCanvasElement) {
    const c = (this.prev ??= document.createElement('canvas'));
    if (c.width !== src.width) c.width = src.width;
    if (c.height !== src.height) c.height = src.height;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(src, 0, 0);
  }

  get ready() { return !!this.prev; }

  release() { this.prev = null; this.scratch = null; this.mask = null; this.maskImg = null; }

  private scratchFor(W: number, H: number) {
    const c = (this.scratch ??= document.createElement('canvas'));
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    return c;
  }

  /** Works out the state of every cell for this frame (call first). */
  cells(f: TransitionFrame) {
    const n = f.cols * f.rows;
    if (this.mode.length < n) { this.mode = new Uint8Array(n); this.glyph = new Uint16Array(n); }
    transitionCells(f.spec, f.p, f, f.realT, this.mode, this.glyph);
    let olds = 0, glyphs = 0;
    for (let i = 0; i < n; i++) { const m = this.mode[i]; if (m === T_OLD) olds++; else if (m === T_GLYPH) glyphs++; }
    this.olds = olds; this.glyphs = glyphs;
  }

  /** Glyph cells into the frame's pixels (W × H, opaque): mix(bg, accent, coverage), as the shader. */
  paintGlyphs(dst: Uint32Array, f: TransitionFrame) {
    if (!this.glyphs) return;
    const { W, H, cw, ch, cols, rows, atlas } = f;
    const bR = f.bg[0] * 255, bG = f.bg[1] * 255, bB = f.bg[2] * 255;
    const dR = f.accent[0] * 255 - bR, dG = f.accent[1] * 255 - bG, dB = f.accent[2] * 255 - bB;
    const cov = atlas.cov, aw = atlas.w, acols = atlas.cols;
    for (let r = 0; r < rows; r++) {
      const y0 = r * ch, y1 = Math.min(H, y0 + ch);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (this.mode[i] !== T_GLYPH) continue;
        const g = this.glyph[i];
        const ax0 = (g % acols) * cw, ay0 = Math.floor(g / acols) * ch;
        const has = ay0 + ch <= atlas.h;
        const x0 = c * cw, x1 = Math.min(W, x0 + cw);
        for (let y = y0; y < y1; y++) {
          let o = y * W + x0, a = (ay0 + y - y0) * aw + ax0;
          for (let x = x0; x < x1; x++, o++, a++) {
            const k = has ? cov[a] / 255 : 0;
            dst[o] = pack((bR + dR * k + 0.5) | 0, (bG + dG * k + 0.5) | 0, (bB + dB * k + 0.5) | 0);
          }
        }
      }
    }
  }

  /** Mosaico, before the overlays: each block of the frame on `ctx` shows its centre cell, magnified. */
  mosaic(ctx: CanvasRenderingContext2D, f: TransitionFrame) {
    const B = mosaicBlock(f.p);
    if (B <= 1) return;
    const { W, H, cw, ch, cols, rows } = f;
    const s = this.scratchFor(W, H), sx = s.getContext('2d')!;
    sx.globalCompositeOperation = 'copy';
    sx.drawImage(ctx.canvas, 0, 0);
    sx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // the blocks are opaque: drawing over is the same as replacing (and 'copy' would clear the rest)
    ctx.globalCompositeOperation = 'source-over';
    const half = Math.floor(B / 2);
    for (let by = 0; by < rows; by += B) {
      const cy = Math.min(by + half, rows - 1);
      for (let bx = 0; bx < cols; bx += B) {
        const cx = Math.min(bx + half, cols - 1);
        ctx.drawImage(s, cx * cw, cy * ch, cw, ch, bx * cw, by * ch, cw * B, ch * B);
      }
    }
    ctx.restore();
  }

  /** The old frame, over the finished new one, in the cells still old. */
  drawOld(ctx: CanvasRenderingContext2D, f: TransitionFrame) {
    if (!this.olds || !this.prev) return;
    const { W, H, cw, ch, cols, rows } = f;
    const n = cols * rows;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // (scaled to the frame: the stage may have changed size since the old frame was kept)
    if (this.olds === n) ctx.drawImage(this.prev, 0, 0, W, H);
    else {
      // through a one-pixel-per-cell mask, scaled up to the cells without smoothing
      const m = (this.mask ??= document.createElement('canvas'));
      if (m.width !== cols || m.height !== rows || !this.maskImg) {
        m.width = cols; m.height = rows;
        this.maskImg = m.getContext('2d')!.createImageData(cols, rows);
      }
      const d = new Uint32Array(this.maskImg.data.buffer);
      for (let i = 0; i < n; i++) d[i] = this.mode[i] === T_OLD ? -16777216 : 0;
      m.getContext('2d')!.putImageData(this.maskImg, 0, 0);
      const s = this.scratchFor(W, H), sx = s.getContext('2d')!;
      sx.save();
      sx.globalCompositeOperation = 'copy';
      sx.imageSmoothingEnabled = false;
      sx.drawImage(m, 0, 0, cols * cw, rows * ch);
      sx.globalCompositeOperation = 'source-in';
      sx.drawImage(this.prev, 0, 0, W, H);
      sx.restore();
      ctx.drawImage(s, 0, 0);
    }
    ctx.restore();
  }
}
