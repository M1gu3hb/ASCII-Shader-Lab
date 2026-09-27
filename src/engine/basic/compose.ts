/**
 * Compose pass on the CPU: turns the selected glyph grid into pixels, a port of BLUR_FS and COMPOSE_FS in
 * ../glsl/programs.ts. Glyph coverage comes from the same atlas the GPU samples (buildAtlas), so glyph
 * shapes are pixel-identical. Background, cell fills, glow, message plate, picture reveal, bloom, cell grid,
 * scanlines, vignette, flicker, CRT curvature, chromatic aberration and the dissolve transition follow
 * the shader. Film grain uses a fast random generator instead of the shader's hash (same amplitude).
 * Writes RGBA pixels into a Uint32 view of an ImageData buffer (little-endian byte order, which is what
 * every browser platform uses). Pure: no DOM.
 */
import type { Recipe } from '../recipe';
import { hash12 } from './core';
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
  /** Blurred grid for bloom (cols × rows × 3, 0..1). */
  bloom: Float32Array | null;
  realT: number;
  /** Transition progress 0..1, or -1. */
  trans: number;
  prev: Uint32Array | null;
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
      const fillA = cellBg * Lc;
      const ga = sel.alpha[i] / 255;
      const plate = sel.flags[i] > 0 ? box : 0;
      const g = sel.idx[i];
      const ax0 = (g % acols) * cw, ay0 = Math.floor(g / acols) * ch;
      const hasGlyph = ga > 0 && ay0 + ch <= ah;
      const covK = hasGlyph ? ga / 255 : 0;
      let rv = media && !transparent ? f.reveal : 0;
      if (media && tr && !transparent) rv = Math.max(rv, tr[i]);
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
 *     chromatic offsets) and applies scanlines, vignette, flicker, grain, the edge fade and the transition.
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
 * Effects that move pixels (CRT curvature, chromatic aberration, the dissolve transition) need the
 * per-pixel post passes below; everything else is drawn by overlays.ts on the canvas.
 */
export function needsPixelPost(f: ComposeFrame): boolean {
  return f.fx.curve > 0 || f.fx.chroma > 0 || f.trans >= 0;
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
  if (f.trans < 0) passBOpaque(f, tenBuf, dst);
  else passB(f, tenBuf, src, dst);
}

/**
 * B for opaque frames without a transition (CRT curvature and/or chromatic aberration): the same math as
 * passB in a lean loop, with the darkening factors (scanlines × vignette × flicker × edge fade) turned
 * into one integer per pixel of the row first.
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
  const grain4 = Math.round(fx.grain * 0.16 * 1020);
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
      }
      r = (r + 2) >> 2; g = (g + 2) >> 2; b = (b + 2) >> 2;
      r &= ~(r >> 31); g &= ~(g >> 31); b &= ~(b >> 31);
      r -= (r - 255) & ((255 - r) >> 31); g -= (g - 255) & ((255 - g) >> 31); b -= (b - 255) & ((255 - b) >> 31);
      dst[o] = -16777216 | (b << 16) | (g << 8) | r;
    }
  }
}

/**
 * Film grain in place, for frames whose other effects are canvas overlays. The shader adds grain after
 * scanlines and vignette; here it comes before them, so it fades with them (a subtle difference).
 */
export function grainPass(f: ComposeFrame, px: Uint32Array) {
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
 * B: gather + scanlines, vignette, flicker, grain, edge fade, transition. `F` holds 10-bit channels
 * (opaque frames); without it (transparent frames) pixels come straight from the shaded RGBA `src`.
 */
function passB(f: ComposeFrame, F: Int32Array | null, src: Uint32Array, dst: Uint32Array) {
  const { W, H, cw, ch, cols, rows, fx, atlas } = f;
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
  const grain4 = transparent ? 0 : Math.round(fx.grain * 0.16 * 1020);
  let sd = (Math.imul(Math.floor(T * 240) + 7, 0x9e3779b1) | 1) >>> 0;

  // dissolve transition: per-cell threshold and random glyph
  const trans = f.trans, prog = trans * 1.3 - 0.15, prev = f.prev;
  let cellH: Float32Array | null = null, cellG: Uint16Array | null = null;
  if (trans >= 0) {
    cellH = new Float32Array(cols * rows); cellG = new Uint16Array(cols * rows);
    const tt = Math.floor(T * 30), N = atlas.n;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      cellH[r * cols + c] = hash12(c * 1.13, r * 1.13) * 0.3;
      cellG[r * cols + c] = 1 + Math.floor(hash12(c + tt, r + tt) * Math.max(N - 1, 1));
    }
  }
  const ar = f.accent[0] * 255, ag = f.accent[1] * 255, ab = f.accent[2] * 255;
  const bgR = f.bg[0] * 255, bgG = f.bg[1] * 255, bgB = f.bg[2] * 255;

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
      }
      if (trans >= 0) {
        const sx = s < 0 ? x : s % W, sy = s < 0 ? y : (s / W) | 0;
        const cx = (sx / cw) | 0, cy = (sy / ch) | 0;
        const ci = (cy >= rows ? rows - 1 : cy) * cols + (cx >= cols ? cols - 1 : cx);
        const h = cellH![ci] + ((sx + 0.5) / W) * 0.55 + ((sy + 0.5) / H) * 0.15;
        if (h > prog + 0.07 && prev) { dst[o] = prev[o]; continue; }
        if (h > prog) {
          const gi = cellG![ci];
          const ay = Math.floor(gi / atlas.cols) * ch + (sy - cy * ch);
          const cv = ay < atlas.h ? atlas.cov[ay * atlas.w + (gi % atlas.cols) * cw + (sx - cx * cw)] / 255 : 0;
          dst[o] = transparent ? pack(c8(ar), c8(ag), c8(ab), c8(cv * 255))
            : pack(c8(bgR + (ar - bgR) * cv), c8(bgG + (ag - bgG) * cv), c8(bgB + (ab - bgB) * cv), 255);
          continue;
        }
      }
      r = (r + 2) >> 2; g = (g + 2) >> 2; b = (b + 2) >> 2;
      dst[o] = pack(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b, a);
    }
  }
}
