/**
 * Compose pass on the CPU: turns the selected glyph grid into pixels, a port of BLUR_FS and COMPOSE_FS in
 * ../glsl/programs.ts. Glyph coverage comes from the same atlas the GPU samples (buildAtlas), so glyph
 * shapes are pixel-identical. Background, cell fills, glow, message plate, picture reveal, bloom, cell grid,
 * scanlines, vignette, flicker, CRT curvature and chromatic aberration follow the shader (transitions are
 * drawn over the finished frame, see transition.ts). Film grain uses a fast random generator instead of
 * the shader's hash (same amplitude).
 * Writes RGBA pixels into a Uint32 view of an ImageData buffer (little-endian byte order, which is what
 * every browser platform uses). Pure: no DOM.
 */
import type { Recipe } from '../recipe';
import { PI, V2, hash12, hash22, vnoise } from './core';
import type { SelectBuffers } from './select';

export interface GlyphAtlas {
  /** Alpha coverage, atlasW × atlasH. */
  cov: Uint8Array;
  w: number; h: number;
  /** Glyphs per atlas row. */
  cols: number;
  /** Number of ramp glyphs (uN). */
  n: number;
}

export interface ComposeFrame {
  W: number; H: number; cw: number; ch: number; cols: number; rows: number;
  sel: SelectBuffers;
  atlas: GlyphAtlas;
  /** Background and accent, 0..1. */
  bg: [number, number, number];
  accent: [number, number, number];
  fx: Recipe['fx'];
  /** Message plate strength (0 when the message is off). */
  msgBox: number;
  transparent: boolean;
  /** Picture reveal (0..1) and erase-to-reveal, only with media loaded. */
  reveal: number;
  eraseReveal: boolean;
  simTr: Float32Array | null;
  /** Media under the grid at canvas resolution (RGBA), for reveal. */
  mediaPx: Uint32Array | null;
  /** «Revelar»: the touch field's bytes (R: how much shows, ../touch.ts), null otherwise. */
  touchReveal?: Uint8Array | null;
  /** A picture is loaded (Revelar shows it; without one it shows each cell's colour as a tile). */
  hasMedia?: boolean;
  /** Marks of a gesture (Rastro, Florecer, Anillos, Chispas): the touch field's bytes, and how much they glow behind their glyphs. */
  touchTile?: { data: Uint8Array; k: number } | null;
  /** Blurred grid for bloom (cols × rows × 3, 0..1). */
  bloom: Float32Array | null;
  /** «Papel» (recipe.fxKind.grain): the still sheet's relief × 256 per pixel (paperField), null: film grain. */
  paper?: Int16Array | null;
  realT: number;
}

// int32 on purpose (no >>> 0): values above 2^31 would be boxed doubles; Uint32Array stores the same bits
const pack = (r: number, g: number, b: number, a: number) => (a << 24) | (b << 16) | (g << 8) | r;
const c8 = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0);

const W5 = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216];

/** Two-pass Gaussian blur of ink × luminance on the cell grid (BLUR_FS), quantised like its RGBA8 targets. */
export function blurGrid(sel: SelectBuffers, cols: number, rows: number, bloom: number, out: Float32Array, tmp: Float32Array) {
  const step = 1 + Math.round(bloom);
  const n = cols * rows;
  for (let i = 0; i < n; i++) {
    const l = sel.lum[i] / 255;
    out[i * 3] = (sel.rgb[i * 3] / 255) * l; out[i * 3 + 1] = (sel.rgb[i * 3 + 1] / 255) * l; out[i * 3 + 2] = (sel.rgb[i * 3 + 2] / 255) * l;
  }
  const q = (v: number) => Math.round((v > 1 ? 1 : v) * 255) / 255;
  const pass = (src: Float32Array, dst: Float32Array, dx: number, dy: number) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let a0 = 0, a1 = 0, a2 = 0;
        for (let k = -4; k <= 4; k++) {
          const w = W5[k < 0 ? -k : k];
          let cc = c + k * dx, rr = r + k * dy;
          cc = cc < 0 ? 0 : cc >= cols ? cols - 1 : cc;
          rr = rr < 0 ? 0 : rr >= rows ? rows - 1 : rr;
          const j = (rr * cols + cc) * 3;
          a0 += src[j] * w; a1 += src[j + 1] * w; a2 += src[j + 2] * w;
        }
        const o = (r * cols + c) * 3;
        dst[o] = q(a0); dst[o + 1] = q(a1); dst[o + 2] = q(a2);
      }
    }
  };
  pass(out, tmp, step, 0);
  pass(tmp, out, 0, step);
}

let blobKey = '';
let blob = new Float32Array(1);
/** Glow falloff inside one cell: exp(-|lc|² · 7) · .55 */
function glowBlob(cw: number, ch: number) {
  const key = cw + 'x' + ch;
  if (key !== blobKey) {
    blobKey = key;
    blob = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const lx = (x + 0.5) / cw - 0.5, ly = (y + 0.5) / ch - 0.5;
      blob[y * cw + x] = Math.exp(-(lx * lx + ly * ly) * 7) * 0.55;
    }
  }
  return blob;
}

let blobIKey = '';
let blobI = new Int32Array(1);
/** glowBlob × 4096, for the fixed-point glow path. */
function glowBlobI(cw: number, ch: number) {
  const key = cw + 'x' + ch;
  if (key !== blobIKey) {
    blobIKey = key;
    const b = glowBlob(cw, ch);
    blobI = Int32Array.from(b, v => Math.round(v * 4096));
  }
  return blobI;
}

/**
 * shade() for every pixel: background, cell fill, glow, plate, glyph, reveal.
 * Writes final RGBA (un-premultiplied when transparent) into `dst` (W × H).
 */
export function shadePass(f: ComposeFrame, dst: Uint32Array) {
  const { W, H, cw, ch, cols, rows, sel, atlas, fx } = f;
  const bgR = f.bg[0] * 255, bgG = f.bg[1] * 255, bgB = f.bg[2] * 255;
  const cellBg = fx.cellBg, glow = fx.glow, box = f.msgBox;
  const bl = glowBlob(cw, ch);
  const cov = atlas.cov, aw = atlas.w, acols = atlas.cols, ah = atlas.h;
  const media = f.mediaPx;
  const tr = f.eraseReveal ? f.simTr : null;
  const transparent = f.transparent;
  const trv = f.touchReveal ?? null, tiles = !f.hasMedia, tile = f.touchTile ?? null;

  for (let row = 0; row < rows; row++) {
    const y0 = row * ch;
    if (y0 >= H) break;
    const y1 = Math.min(H, y0 + ch);
    for (let col = 0; col < cols; col++) {
      const x0 = col * cw;
      if (x0 >= W) break;
      const x1 = Math.min(W, x0 + cw);
      const i = row * cols + col;
      const iR = sel.rgb[i * 3], iG = sel.rgb[i * 3 + 1], iB = sel.rgb[i * 3 + 2];
      const Lc = sel.lum[i] / 255;
      let fillA = cellBg * Lc;
      const tv = trv ? trv[i * 4] / 255 : 0;
      if (tv > 0 && tiles && tv * 0.9 > fillA) fillA = tv * 0.9;
      if (tile) { const k = (tile.data[i * 4] / 255) * tile.k; if (k > fillA) fillA = k; }
      const ga = sel.alpha[i] / 255;
      const plate = sel.flags[i] > 0 ? box : 0;
      const g = sel.idx[i];
      const ax0 = (g % acols) * cw, ay0 = Math.floor(g / acols) * ch;
      const hasGlyph = ga > 0 && ay0 + ch <= ah;
      const covK = hasGlyph ? ga / 255 : 0;
      let rv = media && !transparent ? f.reveal : 0;
      if (media && tr && !transparent) rv = Math.max(rv, tr[i]);
      if (media && tv > 0 && !transparent) rv = Math.max(rv, tv);
      const glowK = glow * Lc;
      // background of the cell before glow: mix(bg, ink, fillA)
      const fr = bgR + (iR - bgR) * fillA, fg = bgG + (iG - bgG) * fillA, fb = bgB + (iB - bgB) * fillA;

      if (!transparent && glowK === 0 && rv === 0) {
        // flat background per cell: the common, fast path
        const cr = fr + (bgR - fr) * plate, cg = fg + (bgG - fg) * plate, cb = fb + (bgB - fb) * plate;
        const cellPix = pack(c8(cr), c8(cg), c8(cb), 255);
        // mixes of in-range colours stay in 0..255: round without clamping
        const dr = iR - cr, dg = iG - cg, db = iB - cb, r0 = cr + 0.5, g0 = cg + 0.5, b0 = cb + 0.5;
        for (let y = y0; y < y1; y++) {
          let o = y * W + x0;
          if (!hasGlyph) { dst.fill(cellPix, o, o + (x1 - x0)); continue; }
          let a = (ay0 + y - y0) * aw + ax0;
          for (let x = x0; x < x1; x++, o++, a++) {
            const k = cov[a];
            if (k === 0) { dst[o] = cellPix; continue; }
            const c = k * covK;
            dst[o] = pack((r0 + dr * c) | 0, (g0 + dg * c) | 0, (b0 + db * c) | 0, 255);
          }
        }
        continue;
      }
      if (transparent) {
        for (let y = y0; y < y1; y++) {
          let o = y * W + x0, a = (ay0 + y - y0) * aw + ax0, bo = (y - y0) * cw;
          for (let x = x0; x < x1; x++, o++, a++, bo++) {
            const c = hasGlyph ? cov[a] * covK : 0;
            const gA = glowK * bl[bo];
            // premultiplied, as the shader's transparent branch
            let pr = iR * fillA, pg = iG * fillA, pb = iB * fillA, pa = fillA;
            pr += iR * gA * (1 - pa); pg += iG * gA * (1 - pa); pb += iB * gA * (1 - pa); pa += gA * (1 - pa);
            pr += (bgR - pr) * plate; pg += (bgG - pg) * plate; pb += (bgB - pb) * plate; pa += (1 - pa) * plate;
            pr = iR * c + pr * (1 - c); pg = iG * c + pg * (1 - c); pb = iB * c + pb * (1 - c); pa = c + pa * (1 - c);
            if (pa <= 0) { dst[o] = 0; continue; }
            const inv = 1 / Math.min(1, pa);
            dst[o] = pack(c8(pr * inv), c8(pg * inv), c8(pb * inv), c8(pa * 255));
          }
        }
        continue;
      }
      if (rv === 0) {
        // glow only, in 8.8 fixed point: bg' = mix(bg, ink, fillA) + ink · glow · blob, then plate, then glyph
        const fR = (fr * 256 + 0.5) | 0, fG = (fg * 256 + 0.5) | 0, fB = (fb * 256 + 0.5) | 0;
        const kR = (iR * glowK * 256 + 0.5) | 0, kG = (iG * glowK * 256 + 0.5) | 0, kB = (iB * glowK * 256 + 0.5) | 0;
        const pI = (plate * 256 + 0.5) | 0, bR8 = (bgR * 256 + 0.5) | 0, bG8 = (bgG * 256 + 0.5) | 0, bB8 = (bgB * 256 + 0.5) | 0;
        const iR8 = iR << 8, iG8 = iG << 8, iB8 = iB << 8;
        const covI = (covK * 65536 + 0.5) | 0;
        const blI = glowBlobI(cw, ch);
        for (let y = y0; y < y1; y++) {
          let o = y * W + x0, a = (ay0 + y - y0) * aw + ax0, bo = (y - y0) * cw;
          for (let x = x0; x < x1; x++, o++, a++, bo++) {
            const gb = blI[bo];
            let r = fR + ((kR * gb) >> 12), g = fG + ((kG * gb) >> 12), b = fB + ((kB * gb) >> 12);
            if (pI > 0) { r += ((bR8 - r) * pI) >> 8; g += ((bG8 - g) * pI) >> 8; b += ((bB8 - b) * pI) >> 8; }
            if (hasGlyph) {
              const c = (cov[a] * covI + 128) >> 8;
              r += ((iR8 - r) * c) >> 8; g += ((iG8 - g) * c) >> 8; b += ((iB8 - b) * c) >> 8;
            }
            r = (r + 128) >> 8; g = (g + 128) >> 8; b = (b + 128) >> 8;
            r -= (r - 255) & ((255 - r) >> 31); g -= (g - 255) & ((255 - g) >> 31); b -= (b - 255) & ((255 - b) >> 31);
            dst[o] = -16777216 | (b << 16) | (g << 8) | r;
          }
        }
        continue;
      }
      // reveal mixes the picture in (and skips the plate, like the shader)
      for (let y = y0; y < y1; y++) {
        let o = y * W + x0, a = (ay0 + y - y0) * aw + ax0, bo = (y - y0) * cw;
        for (let x = x0; x < x1; x++, o++, a++, bo++) {
          const c = hasGlyph ? cov[a] * covK : 0;
          const gA = glowK * bl[bo];
          let br = fr + iR * gA, bg = fg + iG * gA, bb = fb + iB * gA;
          if (rv > 0) {
            br += (iR - br) * c; bg += (iG - bg) * c; bb += (iB - bb) * c;
            const m = media![o];
            br += ((m & 255) - br) * rv; bg += (((m >>> 8) & 255) - bg) * rv; bb += (((m >>> 16) & 255) - bb) * rv;
          } else {
            br += (bgR - br) * plate; bg += (bgG - bg) * plate; bb += (bgB - bb) * plate;
            br += (iR - br) * c; bg += (iG - bg) * c; bb += (iB - bb) * c;
          }
          dst[o] = pack(c8(br), c8(bg), c8(bb), 255);
        }
      }
    }
  }
}


/* ---------------------------------------------------------------- */
/* Post: everything after shade() in COMPOSE_FS                      */
/* ---------------------------------------------------------------- */
/*
 * Two integer passes (fixed point is several times faster than float math per pixel here):
 *  A. bloom and the cell grid, which the shader samples at the (possibly curved) position, are added at
 *     the shaded pixel into a 10-bit-per-channel buffer (value × 4, so colours up to 4.0 survive until
 *     scanlines and vignette darken them);
 *  B. every output pixel gathers its shaded pixel (itself, or through the cached curvature map, plus the
 *     chromatic offsets) and applies scanlines, vignette, flicker, grain and the edge fade.
 * Sampling bloom / grid at the shaded pixel instead of the exact curved position moves them by less than
 * a pixel; the chromatic offset is rounded to whole pixels (exact without curvature).
 */

let curveKey = '';
let curveIdx = new Int32Array(0);
let curveEdge = new Uint16Array(0);
/** CRT curvature: which shaded pixel each output pixel shows (-1: outside) and its edge fade (× 256). */
function curveMap(W: number, H: number, curve: number) {
  const key = W + 'x' + H + ':' + curve;
  if (key === curveKey) return;
  curveKey = key;
  curveIdx = new Int32Array(W * H); curveEdge = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ux = ((x + 0.5) / W) * 2 - 1, uy = ((y + 0.5) / H) * 2 - 1;
      const k = 1 + curve * 0.14 * (ux * ux + uy * uy) - curve * 0.1;
      ux *= k; uy *= k;
      const mm = Math.max(Math.abs(ux), Math.abs(uy));
      let t = (mm - 1) / (0.985 - 1); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const o = y * W + x;
      curveEdge[o] = Math.round(t * t * (3 - 2 * t) * 256);
      const px = (ux * 0.5 + 0.5) * W, py = (uy * 0.5 + 0.5) * H;
      const xi = Math.floor(px), yi = Math.floor(py);
      curveIdx[o] = px < 0 || py < 0 || xi >= W || yi >= H ? -1 : yi * W + xi;
    }
  }
}

/**
 * Effects that move pixels (CRT curvature, chromatic aberration) need the per-pixel post passes below;
 * everything else is drawn by overlays.ts on the canvas.
 */
export function needsPixelPost(f: ComposeFrame): boolean {
  return f.fx.curve > 0 || f.fx.chroma > 0;
}

let tenBuf = new Int32Array(0);

/**
 * One grid row of the blurred grid, upsampled horizontally to W pixels (10-bit units × bloom amount).
 * A top-level function on purpose: a closure would move the hot loops' variables into a heap context.
 */
function bloomRow(B: Float32Array, j: number, cols: number, W: number, ci0: Int32Array, ci1: Int32Array, cfx: Float32Array, k: number, out: Int32Array) {
  const base = j * cols * 3;
  for (let x = 0; x < W; x++) {
    const p0 = base + ci0[x], p1 = base + ci1[x], t = cfx[x], o = x * 3;
    out[o] = ((B[p0] + (B[p1] - B[p0]) * t) * k + 0.5) | 0;
    out[o + 1] = ((B[p0 + 1] + (B[p1 + 1] - B[p0 + 1]) * t) * k + 0.5) | 0;
    out[o + 2] = ((B[p0 + 2] + (B[p1 + 2] - B[p0 + 2]) * t) * k + 0.5) | 0;
  }
}

/** Every effect after shade() on the CPU: reads the shaded frame from `src`, writes the finished frame to `dst`. */
export function postPass(f: ComposeFrame, src: Uint32Array, dst: Uint32Array) {
  if (f.fx.curve > 0) curveMap(f.W, f.H, f.fx.curve);
  if (f.transparent) { passB(f, null, src, dst); return; }
  if (tenBuf.length !== f.W * f.H) tenBuf = new Int32Array(f.W * f.H);
  passA(f, src, tenBuf);
  passBOpaque(f, tenBuf, dst);
}

/**
 * B for opaque frames (CRT curvature and/or chromatic aberration): the same math as passB in a lean loop,
 * with the darkening factors (scanlines × vignette × flicker × edge fade) turned into one integer per pixel
 * of the row first.
 */
function passBOpaque(f: ComposeFrame, F: Int32Array, dst: Uint32Array) {
  const { W, H, cw, fx } = f;
  const T = f.realT;
  const flick = fx.flicker > 0 ? 1 - fx.flicker * 0.12 * (0.5 + 0.5 * Math.sin(T * 53)) * hash12(Math.floor(T * 12), 3) : 1;
  const vx = new Float32Array(W), mrow = new Int32Array(W);
  for (let x = 0; x < W; x++) { const v = (x + 0.5) / W - 0.5; vx[x] = fx.vig * v * v * 2.2; }
  const map = fx.curve > 0 ? curveIdx : null, edge = fx.curve > 0 ? curveEdge : null;
  const off = fx.chroma > 0 ? Math.floor(0.5 + fx.chroma * cw * 0.45) : 0;
  const bgR = Math.round(f.bg[0] * 1020), bgG = Math.round(f.bg[1] * 1020), bgB = Math.round(f.bg[2] * 1020);
  const bg10 = bgR | (bgG << 10) | (bgB << 20);
  const paper = f.paper ?? null, gk = Math.round(fx.grain * 256);
  const grain4 = paper ? 0 : Math.round(fx.grain * 0.16 * 1020);
  let sd = (Math.imul(Math.floor(T * 240) + 7, 0x9e3779b1) | 1) >>> 0;
  for (let y = 0; y < H; y++) {
    const fcy = H - y - 0.5; // gl_FragCoord.y counts from the bottom
    const m0 = (fx.scan > 0 ? 1 - fx.scan * 0.45 * (0.5 + 0.5 * Math.cos(fcy * 1.5708)) : 1) * flick * 256;
    const v = fcy / H - 0.5, vyy = fx.vig * v * v * 2.2;
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let m = (m0 * (1 - vx[x] - vyy) + 0.5) | 0;
      if (m < 0) m = 0;
      mrow[x] = edge ? (m * edge[row + x]) >> 8 : m;
    }
    for (let x = 0, o = row; x < W; x++, o++) {
      const s = map ? map[o] : o;
      const p = s < 0 ? bg10 : F[s];
      let r = p & 1023, g = (p >> 10) & 1023, b = (p >> 20) & 1023;
      if (off > 0 && s >= 0) {
        const sx = s % W;
        r = sx + off < W ? F[s + off] & 1023 : bgR;
        b = sx - off >= 0 ? (F[s - off] >> 20) & 1023 : bgB;
      }
      const m = mrow[x];
      r = (r * m) >> 8; g = (g * m) >> 8; b = (b * m) >> 8;
      if (grain4 > 0) {
        // shader order: grain is added before the edge fade multiplies everything
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        const n = (((((sd & 0xffff) - 32768) * grain4) >> 16) * (edge ? edge[o] : 256)) >> 8;
        r += n; g += n; b += n;
      } else if (paper && gk > 0) {
        // «Papel»: the still sheet (10-bit units: 0.04 · 1020 ≈ 41), before the edge fade
        const k = (((paper[o] * gk) >> 8) * (edge ? edge[o] : 256)) >> 8;
        r += (k * (41 + ((r * 77) >> 8))) >> 8; g += (k * (41 + ((g * 77) >> 8))) >> 8; b += (k * (41 + ((b * 77) >> 8))) >> 8;
      }
      r = (r + 2) >> 2; g = (g + 2) >> 2; b = (b + 2) >> 2;
      r &= ~(r >> 31); g &= ~(g >> 31); b &= ~(b >> 31);
      r -= (r - 255) & ((255 - r) >> 31); g -= (g - 255) & ((255 - g) >> 31); b -= (b - 255) & ((255 - b) >> 31);
      dst[o] = -16777216 | (b << 16) | (g << 8) | r;
    }
  }
}

/**
 * «Destello anamórfico» (ANAMORPHIC_FS): the lights spread sideways, then a long horizontal streak with red
 * and blue pulled apart and a bokeh ring around each light. Same targets and quantisation as blurGrid.
 * `aspect`: cell height / width.
 */
export function blurGridAnamorphic(sel: SelectBuffers, cols: number, rows: number, bloom: number, aspect: number, out: Float32Array, tmp: Float32Array) {
  const s = 1 + Math.round(bloom), s3 = 3 * s, off = s + 1;
  const n = cols * rows;
  if (lightBuf.length !== n * 3) lightBuf = new Float32Array(n * 3);
  const L = lightBuf;
  // a light: what the select pass drew, only where it is bright
  for (let i = 0; i < n; i++) {
    const l = sel.lum[i] / 255;
    const r = (sel.rgb[i * 3] / 255) * l, g = (sel.rgb[i * 3 + 1] / 255) * l, b = (sel.rgb[i * 3 + 2] / 255) * l;
    const k = Math.max(r * 0.299 + g * 0.587 + b * 0.114 - 0.3, 0) / 0.7;
    L[i * 3] = r * k; L[i * 3 + 1] = g * k; L[i * 3 + 2] = b * k;
  }
  const q = (v: number) => Math.round((v > 1 ? 1 : v) * 255) / 255;
  const at = (c: number, r: number) => (r * cols + (c < 0 ? 0 : c >= cols ? cols - 1 : c)) * 3;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a0 = 0, a1 = 0, a2 = 0;
      for (let k = -4; k <= 4; k++) {
        const w = W5[k < 0 ? -k : k], j = at(c + k * s, r);
        a0 += L[j] * w; a1 += L[j + 1] * w; a2 += L[j + 2] * w;
      }
      const o = (r * cols + c) * 3;
      tmp[o] = q(a0); tmp[o + 1] = q(a1); tmp[o + 2] = q(a2);
    }
  }
  // the ring's 24 taps, in cells (round in pixels)
  const R = 2 + 2 * s, rx = new Int32Array(24), ry = new Int32Array(24);
  for (let k = 0; k < 24; k++) {
    const a = Math.fround(k * 0.2617994);
    rx[k] = Math.floor(Math.cos(a) * R + 0.5); ry[k] = Math.floor((Math.sin(a) * R) / aspect + 0.5);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let a0 = 0, a1 = 0, a2 = 0;
      for (let k = -4; k <= 4; k++) {
        const w = W5[k < 0 ? -k : k];
        a0 += tmp[at(c + k * s3 - off, r)] * w;
        a1 += tmp[at(c + k * s3, r) + 1] * w;
        a2 += tmp[at(c + k * s3 + off, r) + 2] * w;
      }
      let g0 = 0, g1 = 0, g2 = 0;
      for (let k = 0; k < 24; k++) {
        // (the grid's rows count from the top in both engines)
        let cc = c + rx[k], rr = r + ry[k];
        cc = cc < 0 ? 0 : cc >= cols ? cols - 1 : cc; rr = rr < 0 ? 0 : rr >= rows ? rows - 1 : rr;
        const j = (rr * cols + cc) * 3;
        g0 += L[j]; g1 += L[j + 1]; g2 += L[j + 2];
      }
      const o = (r * cols + c) * 3;
      out[o] = q(a0 * 0.85 * 1.6 + g0 * 0.05); out[o + 1] = q(a1 * 0.95 * 1.6 + g1 * 0.05); out[o + 2] = q(a2 * 1.2 * 1.6 + g2 * 0.05);
    }
  }
}
let lightBuf = new Float32Array(0);

/* ---------------------------------------------------------------- */
/* «Papel»: the still sheet (PAPER_FS)                                */
/* ---------------------------------------------------------------- */

/**
 * One engine's still sheet (paperField), kept while the size, the cell and the fold stay; let go when its piece
 * has no paper. Each engine has its own: a stage with paper and a preview without it never redraw each other's.
 */
export class PaperSheet {
  key = '';
  buf: Int16Array = new Int16Array(0);
  get(W: number, H: number, cw: number, fold: number): Int16Array {
    const key = `${W}x${H}:${cw}:${fold}`;
    if (key !== this.key) { this.key = key; this.buf = drawPaper(W, H, cw, fold); }
    return this.buf;
  }
  drop() { if (this.key) { this.key = ''; this.buf = new Int16Array(0); } }
}
const SHEET = new PaperSheet();

/** One crease of the paper (PAPER_FS crease): a thin dark line, the side facing the light lighter, the other darker. */
function crease(px: number, py: number, ax: number, ay: number, nx: number, ny: number, k: number, facet: number) {
  const d = (px - ax) * nx + (py - ay) * ny;
  const side = (d < 0 ? -1 : 1) * (nx * -0.6 + ny * 0.8);
  return k * (side * (0.45 * Math.exp(-Math.abs(d) / 0.06) + facet) - 0.9 * Math.exp((-d * d) / 4.84e-6));
}

/**
 * The paper's relief per pixel (PAPER_FS), × 256, rows from the top, kept while the size, the cell and the
 * fold stay. P is quantised as the shader's 8-bit texture keeps it (P · 0.4 + 0.5).
 */
export function paperField(W: number, H: number, cw: number, fold: number): Int16Array {
  return SHEET.get(W, H, cw, fold);
}

function drawPaper(W: number, H: number, cw: number, fold: number): Int16Array {
  const paperBuf = new Int16Array(W * H);
  // the fibres of each square of three cells (two each), worked out once
  const gw = Math.ceil(W / cw / 3) + 3, gh = Math.ceil(H / cw / 3) + 3;
  const F = new Float64Array(gw * gh * 2 * 6);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) for (let f = 0; f < 2; f++) {
    const idx = gx - 1, idy = gy - 1, o = ((gy * gw + gx) * 2 + f) * 6;
    hash22(idx * 1.7 + f * 13.1, idy * 1.7 + f * 13.1);
    const a = hash12(idx + f * 7.3, idy + f * 7.3) * PI;
    F[o] = (idx + V2[0]) * 3; F[o + 1] = (idy + V2[1]) * 3;
    F[o + 2] = Math.cos(a); F[o + 3] = Math.sin(a);
    F[o + 4] = 0.3 + 0.8 * hash12(idx * 2.3 + f, idy * 2.3 + f);
    F[o + 5] = hash12(idx * 3.1 + f * 5, idy * 3.1 + f * 5) < 0.5 ? -1 : 1;
  }
  const lines: number[][] = [];
  if (fold === 1) lines.push([0, 0, 1, 0, 1, 0], [0, 0, 0, 1, 1, 0]);
  else if (fold === 2) lines.push([0, 1 / 6, 0, 1, 1, 0], [0, -1 / 6, 0, 1, 1, 0]);
  else if (fold === 3) lines.push([0, 0, 0.7071068, 0.7071068, 1, 0], [0, 0, 0.7071068, -0.7071068, 1, 0]);
  else if (fold === 4) {
    for (let k = 0; k < 9; k++) {
      const an = hash12(k, 8.9) * PI;
      lines.push([(hash12(k, 1.7) - 0.5) * 1.4, (hash12(k, 4.3) - 0.5) * 0.9, Math.cos(an), Math.sin(an), 0.45 + 0.35 * hash12(k, 2.1), 0.14]);
    }
  }
  for (let y = 0; y < H; y++) {
    const fy = H - y - 0.5; // gl_FragCoord.y counts from the bottom
    const qy = fy / cw, gy = Math.floor(qy / 3);
    for (let x = 0; x < W; x++) {
      const fx = x + 0.5, qx = fx / cw, gx = Math.floor(qx / 3);
      let P = (hash12(Math.floor(fx), Math.floor(fy)) - 0.5) * 0.5 + (vnoise(qx * 0.22, qy * 0.22) + 0.6 * vnoise(qx * 0.55 + 7.3, qy * 0.55 + 7.3) - 0.8) * 0.55;
      let fib = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = gx + i + 1, cy = gy + j + 1;
        if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
        for (let f = 0; f < 2; f++) {
          const o = ((cy * gw + cx) * 2 + f) * 6;
          const pax = qx - F[o], pay = qy - F[o + 1], len = F[o + 4];
          let t = pax * F[o + 2] + pay * F[o + 3];
          t = t < -len ? -len : t > len ? len : t;
          const ex = pax - F[o + 2] * t, ey = pay - F[o + 3] * t;
          fib += F[o + 5] * Math.exp(-(ex * ex + ey * ey) / 0.004);
        }
      }
      P += (fib < -1 ? -1 : fib > 1 ? 1 : fib) * 0.45;
      if (lines.length) {
        const px = (fx - 0.5 * W) / H, py = (fy - 0.5 * H) / H;
        for (const [ax, ay, nx, ny, k, fc] of lines) P += crease(px, py, ax, ay, nx, ny, k, fc);
      }
      // the shader's 8-bit texture: P · 0.4 + 0.5, back to P × 256
      const b = Math.round(Math.min(1, Math.max(0, P * 0.4 + 0.5)) * 255);
      paperBuf[y * W + x] = Math.round(((b / 255 - 0.5) / 0.4) * 256);
    }
  }
  return paperBuf;
}

/**
 * Film grain in place, for frames whose other effects are canvas overlays. The shader adds grain after
 * scanlines and vignette; here it comes before them, so it fades with them (a subtle difference).
 * With «Papel» (`paper`: paperField), the still sheet instead: col += P · grain · (0.04 + 0.3 · col).
 */
export function grainPass(f: ComposeFrame, px: Uint32Array, paper: Int16Array | null = null) {
  if (paper) {
    if (f.transparent || f.fx.grain <= 0) return;
    const gk = Math.round(f.fx.grain * 256);
    for (let o = 0, n = f.W * f.H; o < n; o++) {
      const k = (paper[o] * gk) >> 8;
      if (k === 0) continue;
      const v = px[o];
      let r = v & 255, gg = (v >>> 8) & 255, b = (v >>> 16) & 255;
      r += (k * (10 + ((r * 77) >> 8))) >> 8; gg += (k * (10 + ((gg * 77) >> 8))) >> 8; b += (k * (10 + ((b * 77) >> 8))) >> 8;
      r &= ~(r >> 31); gg &= ~(gg >> 31); b &= ~(b >> 31);
      r -= (r - 255) & ((255 - r) >> 31); gg -= (gg - 255) & ((255 - gg) >> 31); b -= (b - 255) & ((255 - b) >> 31);
      px[o] = (v & -16777216) | (b << 16) | (gg << 8) | r;
    }
    return;
  }
  const g = Math.round(f.fx.grain * 0.16 * 255 * 256);
  if (f.transparent || g <= 0) return;
  let sd = (Math.imul(Math.floor(f.realT * 240) + 7, 0x9e3779b1) | 1) >>> 0;
  for (let o = 0, n = f.W * f.H; o < n; o++) {
    sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
    const d = ((((sd & 0xffff) - 32768) * g) >> 16) + 128 >> 8;
    const v = px[o];
    let r = (v & 255) + d, gg = ((v >>> 8) & 255) + d, b = ((v >>> 16) & 255) + d;
    r &= ~(r >> 31); gg &= ~(gg >> 31); b &= ~(b >> 31);
    r -= (r - 255) & ((255 - r) >> 31); gg -= (gg - 255) & ((255 - gg) >> 31); b -= (b - 255) & ((255 - b) >> 31);
    px[o] = (v & -16777216) | (b << 16) | (gg << 8) | r;
  }
}

/** A: shaded pixel + bloom + cell grid → 10-bit channels. Opaque frames only (the shader skips both when transparent). */
function passA(f: ComposeFrame, src: Uint32Array, F: Int32Array) {
  const { W, H, cw, ch, cols, rows, fx } = f;
  const B = f.bloom;
  const bloomK = B && fx.bloom > 0 ? fx.bloom * 1.4 * 1020 : 0;
  const gridK = Math.round(fx.grid * 0.6 * 256);
  const bgR = f.bg[0] * 255, bgG = f.bg[1] * 255, bgB = f.bg[2] * 255;
  const gR = Math.round((bgR + (f.accent[0] * 255 - bgR) * 0.35) * 4);
  const gG = Math.round((bgG + (f.accent[1] * 255 - bgG) * 0.35) * 4);
  const gB = Math.round((bgB + (f.accent[2] * 255 - bgB) * 0.35) * 4);
  // bloom: bilinear upsample of the blurred grid, done separably (two upsampled grid rows kept around)
  const bR = new Int32Array(W), bG = new Int32Array(W), bB = new Int32Array(W);
  let L0 = new Int32Array(0), L1 = new Int32Array(0), j0c = -1, j1c = -1;
  const ci0 = new Int32Array(bloomK > 0 ? W : 0), ci1 = new Int32Array(bloomK > 0 ? W : 0), cfx = new Float32Array(bloomK > 0 ? W : 0);
  if (bloomK > 0) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / cw - 0.5, i0 = Math.floor(u);
      cfx[x] = u - i0;
      ci0[x] = (i0 < 0 ? 0 : i0 >= cols ? cols - 1 : i0) * 3;
      ci1[x] = (i0 + 1 < 0 ? 0 : i0 + 1 >= cols ? cols - 1 : i0 + 1) * 3;
    }
    L0 = new Int32Array(W * 3); L1 = new Int32Array(W * 3);
  }
  for (let y = 0; y < H; y++) {
    let fy = 0;
    if (bloomK > 0) {
      const v = (y + 0.5) / ch - 0.5, j = Math.floor(v);
      fy = ((v - j) * 256 + 0.5) | 0;
      const j0 = j < 0 ? 0 : j >= rows ? rows - 1 : j, j1 = j + 1 < 0 ? 0 : j + 1 >= rows ? rows - 1 : j + 1;
      if (j0 === j1c && j0 !== j0c) { const t = L0; L0 = L1; L1 = t; j0c = j0; j1c = -1; }
      if (j0 !== j0c) { bloomRow(B!, j0, cols, W, ci0, ci1, cfx, bloomK, L0); j0c = j0; }
      if (j1 !== j1c) { bloomRow(B!, j1, cols, W, ci0, ci1, cfx, bloomK, L1); j1c = j1; }
    }
    if (bloomK > 0) {
      // vertical lerp once per row, into planar rows the pixel loop adds unconditionally
      for (let x = 0, k = 0; x < W; x++, k += 3) {
        bR[x] = L0[k] + (((L1[k] - L0[k]) * fy) >> 8);
        bG[x] = L0[k + 1] + (((L1[k + 1] - L0[k + 1]) * fy) >> 8);
        bB[x] = L0[k + 2] + (((L1[k + 2] - L0[k + 2]) * fy) >> 8);
      }
    }
    const rowGrid = gridK > 0 && y % ch === 0;
    let o = y * W;
    for (let x = 0; x < W; x++, o++) {
      const v = src[o];
      let r = ((v & 255) << 2) + bR[x], g = (((v >>> 8) & 255) << 2) + bG[x], b = (((v >>> 16) & 255) << 2) + bB[x];
      if (gridK > 0 && (rowGrid || x % cw === 0)) { r += ((gR - r) * gridK) >> 8; g += ((gG - g) * gridK) >> 8; b += ((gB - b) * gridK) >> 8; }
      r -= (r - 1023) & ((1023 - r) >> 31); g -= (g - 1023) & ((1023 - g) >> 31); b -= (b - 1023) & ((1023 - b) >> 31);
      F[o] = r | (g << 10) | (b << 20);
    }
  }
}

/**
 * B: gather + scanlines, vignette, flicker, grain, edge fade. `F` holds 10-bit channels (opaque frames);
 * without it (transparent frames) pixels come straight from the shaded RGBA `src`.
 */
function passB(f: ComposeFrame, F: Int32Array | null, src: Uint32Array, dst: Uint32Array) {
  const { W, H, cw, fx } = f;
  const T = f.realT;
  const flick = fx.flicker > 0 ? 1 - fx.flicker * 0.12 * (0.5 + 0.5 * Math.sin(T * 53)) * hash12(Math.floor(T * 12), 3) : 1;
  // scanlines by row (gl_FragCoord.y counts from the bottom); vignette split into row and column terms
  const rowMul = new Float32Array(H), vy = new Float32Array(H), vx = new Float32Array(W);
  for (let y = 0; y < H; y++) {
    const fcy = H - y - 0.5;
    rowMul[y] = (fx.scan > 0 ? 1 - fx.scan * 0.45 * (0.5 + 0.5 * Math.cos(fcy * 1.5708)) : 1) * flick * 256;
    const v = fcy / H - 0.5; vy[y] = fx.vig * v * v * 2.2;
  }
  for (let x = 0; x < W; x++) { const v = (x + 0.5) / W - 0.5; vx[x] = fx.vig * v * v * 2.2; }
  const map = fx.curve > 0 ? curveIdx : null, edge = fx.curve > 0 ? curveEdge : null;
  const off = fx.chroma > 0 ? Math.floor(0.5 + fx.chroma * cw * 0.45) : 0;
  const transparent = !F;
  const bg4R = Math.round(f.bg[0] * 1020), bg4G = Math.round(f.bg[1] * 1020), bg4B = Math.round(f.bg[2] * 1020);
  const paper = transparent ? null : f.paper ?? null, gk = Math.round(fx.grain * 256);
  const grain4 = transparent || paper ? 0 : Math.round(fx.grain * 0.16 * 1020);
  let sd = (Math.imul(Math.floor(T * 240) + 7, 0x9e3779b1) | 1) >>> 0;

  for (let y = 0; y < H; y++) {
    const m0 = rowMul[y], vyy = vy[y];
    let o = y * W;
    for (let x = 0; x < W; x++, o++) {
      const s = map ? map[o] : o;
      let r: number, g: number, b: number, a = 255;
      if (s < 0) {
        if (transparent) { r = g = b = a = 0; } else { r = bg4R; g = bg4G; b = bg4B; }
      } else if (F) {
        const v = F[s];
        r = v & 1023; g = (v >> 10) & 1023; b = (v >> 20) & 1023;
        if (off > 0) {
          const sx = s % W;
          r = sx + off < W ? F[s + off] & 1023 : bg4R;
          b = sx - off >= 0 ? (F[s - off] >> 20) & 1023 : bg4B;
        }
      } else {
        const v = src[s];
        a = v >>> 24;
        r = (v & 255) << 2; g = ((v >>> 8) & 255) << 2; b = ((v >>> 16) & 255) << 2;
        if (off > 0 && a > 0) {
          // shader: premultiplied channels from the offset pixels, divided by this pixel's alpha at the end
          const sx = s % W;
          const vr = sx + off < W ? src[s + off] : 0, vb = sx - off >= 0 ? src[s - off] : 0;
          r = ((((vr & 255) << 2) * (vr >>> 24)) / a) | 0;
          b = (((((vb >>> 16) & 255) << 2) * (vb >>> 24)) / a) | 0;
        }
      }
      let m = (m0 * (1 - vx[x] - vyy) + 0.5) | 0;
      if (m < 0) m = 0;
      const e = edge ? edge[o] : 256;
      if (edge) m = (m * e) >> 8;
      r = (r * m) >> 8; g = (g * m) >> 8; b = (b * m) >> 8;
      if (grain4 > 0) {
        // shader order: grain is added before the edge fade multiplies everything
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        const n = ((((sd & 0xffff) - 32768) * grain4) >> 16) * e >> 8;
        r += n; g += n; b += n;
      } else if (paper && gk > 0) {
        // «Papel»: the still sheet (10-bit units), before the edge fade
        const k = (((paper[o] * gk) >> 8) * e) >> 8;
        r += (k * (41 + ((r * 77) >> 8))) >> 8; g += (k * (41 + ((g * 77) >> 8))) >> 8; b += (k * (41 + ((b * 77) >> 8))) >> 8;
      }
      r = (r + 2) >> 2; g = (g + 2) >> 2; b = (b + 2) >> 2;
      dst[o] = pack(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b, a);
    }
  }
}
