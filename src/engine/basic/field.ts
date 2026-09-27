/**
 * Field pass on the CPU: the luminance (and media colour) of every cell, a port of buildFieldShader()
 * in ../glsl/programs.ts. Same coordinates (p in screen heights, y up, origin at the centre), same layer
 * transforms and blends, domain warp, loop crossfade, pulse, media/text sampling and pointer effects.
 * Outputs are quantised to 8 bits like the RGBA8 texture the GPU writes.
 * Pure: no DOM, so it runs in tests.
 */
import { BLENDS, type Recipe } from '../recipe';
import { PI, TAU, blendf, clamp, fbm, hash12 } from './core';

const fr = Math.fround;
import { basicPattern, setPX, type BasicPattern } from './patterns';

export type FieldSource = 'pattern' | 'media' | 'text';

export interface FieldLayer {
  pat: BasicPattern;
  scale: number; rot: number; x: number; y: number; a: number; b: number;
  mix: number; speed: number; phase: number; invert: boolean; blend: number;
}

/** RGBA copy of the current image / video frame (possibly downscaled; natW/natH keep the real aspect). */
export interface MediaBuffer { data: Uint8ClampedArray; w: number; h: number; natW: number; natH: number }
/** Red channel of the rasterised text source. */
export interface TextBuffer { data: Uint8Array; w: number; h: number }

export interface FieldFrame {
  W: number; H: number; cw: number; ch: number; cols: number; rows: number;
  /** Held time (stop motion applied). */
  time: number;
  loop: number;
  layers: FieldLayer[];
  warp: number; warpScale: number; pulse: number;
  src: FieldSource;
  mediaMix: number; mediaBlend: number; morph: number;
  media: MediaBuffer | null;
  fit: number; zoom: number; panX: number; panY: number; mirror: boolean;
  text: TextBuffer | null;
  /** Index in INTERACT_MODES; pointer in device px from the top-left. */
  imode: number; ptrX: number; ptrY: number; ptrOn: number; istr: number; irad: number;
  sim: { h: Float32Array; tr: Float32Array } | null;
}

export const INTERACT_MODES = ['none', 'light', 'ripple', 'lens', 'repel', 'swirl', 'erase', 'paint', 'scramble'] as const;

/** Per-cell outputs plus scratch space, sized for cols × rows. */
export class FieldBuffers {
  readonly n: number;
  readonly a: Uint8Array; readonly r: Uint8Array; readonly g: Uint8Array; readonly b: Uint8Array;
  readonly ppx: Float64Array; readonly ppy: Float64Array; readonly qx: Float64Array; readonly qy: Float64Array;
  readonly v0: Float64Array; readonly v1: Float64Array;
  constructor(n: number) {
    this.n = n;
    this.a = new Uint8Array(n); this.r = new Uint8Array(n); this.g = new Uint8Array(n); this.b = new Uint8Array(n);
    this.ppx = new Float64Array(n); this.ppy = new Float64Array(n); this.qx = new Float64Array(n); this.qy = new Float64Array(n);
    this.v0 = new Float64Array(n); this.v1 = new Float64Array(n);
  }
}

/** Active layers as the GPU engine binds them (max 4; with none on, 'nube' with layer 0's parameters). */
export function fieldLayers(r: Recipe): FieldLayer[] {
  const on = r.layers.filter(l => l.on).slice(0, 4);
  const list = on.length ? on : [{ ...r.layers[0], on: true, pattern: 'nube' }];
  return list.map(l => ({
    pat: basicPattern(l.pattern),
    scale: l.scale, rot: (l.rot * Math.PI) / 180, x: l.x, y: l.y, a: l.a, b: l.b,
    mix: l.mix, speed: l.speed, phase: l.phase, invert: l.invert, blend: Math.max(0, BLENDS.indexOf(l.blend)),
  }));
}

/** Beat pulse, as AsciiEngine.pulse(). */
export function pulseAt(m: Recipe['motion'], tq: number, external: number): number {
  if (external > 0) return Math.min(1, external);
  if (m.pulse <= 0) return 0;
  let bpm = m.bpm, t = tq;
  if (m.loop > 0) { const beats = Math.max(1, Math.round((m.loop * bpm) / 60)); bpm = (beats * 60) / m.loop; t = tq % m.loop; }
  const ph = (t * bpm) / 60;
  return m.pulse * Math.pow(1 - (ph - Math.floor(ph)), 3);
}

/** Stop-motion time quantisation, as AsciiEngine.timeQ(). */
export const heldTime = (t: number, hold: number) => (hold > 0 ? Math.floor(t * hold) / hold : t);

/* ---------------------------------------------------------------- */

const S4 = new Float64Array(4);

/** Bilinear RGBA sample (0..1) with clamp-to-edge, like texture() on a LINEAR texture. Writes S4. */
function sampleRGBA(m: MediaBuffer, u: number, v: number) {
  const w = m.w, h = m.h, d = m.data;
  const x = u * w - 0.5, y = v * h - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let x1 = x0 + 1, y1 = y0 + 1;
  if (x0 < 0) x0 = 0; else if (x0 > w - 1) x0 = w - 1;
  if (x1 < 0) x1 = 0; else if (x1 > w - 1) x1 = w - 1;
  if (y0 < 0) y0 = 0; else if (y0 > h - 1) y0 = h - 1;
  if (y1 < 0) y1 = 0; else if (y1 > h - 1) y1 = h - 1;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let k = 0; k < 4; k++) S4[k] = (d[i00 + k] * w00 + d[i10 + k] * w10 + d[i01 + k] * w01 + d[i11 + k] * w11) / 255;
}

function sampleRed(t: TextBuffer, u: number, v: number): number {
  const w = t.w, h = t.h, d = t.data;
  const x = u * w - 0.5, y = v * h - 0.5;
  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let x1 = x0 + 1, y1 = y0 + 1;
  if (x0 < 0) x0 = 0; else if (x0 > w - 1) x0 = w - 1;
  if (x1 < 0) x1 = 0; else if (x1 > w - 1) x1 = w - 1;
  if (y0 < 0) y0 = 0; else if (y0 > h - 1) y0 = h - 1;
  if (y1 < 0) y1 = 0; else if (y1 > h - 1) y1 = h - 1;
  const a = d[y0 * w + x0] + (d[y0 * w + x1] - d[y0 * w + x0]) * fx;
  const b = d[y1 * w + x0] + (d[y1 * w + x1] - d[y1 * w + x0]) * fx;
  return (a + (b - a) * fy) / 255;
}

/** Maps screen uv (0..1, y down) to media uv with fit / zoom / pan / mirror (GLSL mediaUV). */
export class MediaMap {
  kx = 1; ky = 1; zoom = 1; panX = 0; panY = 0; mirror = false;
  set(W: number, H: number, natW: number, natH: number, fit: number, zoom: number, panX: number, panY: number, mirror: boolean) {
    const ca = W / H, ma = natW / Math.max(natH, 1);
    let kx = 1, ky = 1;
    if (fit === 0) { if (ca > ma) ky = ma / ca; else kx = ca / ma; }
    else if (fit === 1) { if (ca > ma) kx = ca / ma; else ky = ma / ca; }
    this.kx = kx; this.ky = ky; this.zoom = zoom; this.panX = panX; this.panY = panY; this.mirror = mirror;
    return this;
  }
  u(sx: number) { const u = ((sx - 0.5) * this.kx) / this.zoom + 0.5 - this.panX * 0.5; return this.mirror ? 1 - u : u; }
  v(sy: number) { return ((sy - 0.5) * this.ky) / this.zoom + 0.5 + this.panY * 0.5; }
  /** Where the whole picture lands on a W × H canvas (draw it flipped horizontally when mirror is set). */
  rect(W: number, H: number) {
    return {
      x: ((-0.5 + this.panX * 0.5) * this.zoom / this.kx + 0.5) * W,
      y: ((-0.5 - this.panY * 0.5) * this.zoom / this.ky + 0.5) * H,
      w: (W * this.zoom) / this.kx,
      h: (H * this.zoom) / this.ky,
      mirror: this.mirror,
    };
  }
}
const MAP = new MediaMap();

/** media(s): transparent black outside the picture. Accumulates rgb into ACC. */
const ACC = new Float64Array(3);
function mediaTap(m: MediaBuffer, sx: number, sy: number) {
  const u = MAP.u(sx), v = MAP.v(sy);
  if (u < 0 || v < 0 || u > 1 || v > 1) return;
  sampleRGBA(m, u, v);
  ACC[0] += S4[0]; ACC[1] += S4[1]; ACC[2] += S4[2];
}

/* ---------------------------------------------------------------- */

function stack(f: FieldFrame, B: FieldBuffers, t: number, out: Float64Array) {
  const { cols, rows } = f;
  const cellP = f.ch / f.H;
  const qxs = B.qx, qys = B.qy;
  for (let li = 0; li < f.layers.length; li++) {
    const L = f.layers[li];
    const lt = t * L.speed + L.phase;
    setPX(cellP * L.scale);
    L.pat.prep?.(lt, L.a, L.b);
    const fn = L.pat.f;
    // uniforms are float32 on the GPU, and so is the transform: exact-boundary floors in hashed patterns depend on it
    const c = fr(Math.cos(fr(L.rot))), s = fr(Math.sin(fr(L.rot))), sc = fr(L.scale), ox = fr(L.x), oy = fr(L.y), a = L.a, b = L.b;
    const inv = L.invert, mixK = L.mix, blend = L.blend, first = li === 0;
    // column-major, so patterns that only depend on x (per column) can reuse work between cells
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const i = row * cols + col;
        const dx = fr(qxs[i] - ox), dy = fr(qys[i] - oy);
        let x = fn(fr(fr(fr(c * dx) + fr(s * dy)) * sc), fr(fr(fr(-s * dx) + fr(c * dy)) * sc), lt, a, b);
        if (inv) x = 1 - x;
        out[i] = first ? x * mixK : blendf(out[i], x, blend, mixK);
      }
    }
  }
}

/** Runs the field pass; fills B.a (luminance) and B.r/g/b (media colour, white otherwise). */
export function runField(f: FieldFrame, B: FieldBuffers) {
  const { W, H, cw, ch, cols, rows, time: T } = f;
  const im = f.imode, sim = f.sim;
  const mx = (f.ptrX - 0.5 * W) / H, my = (0.5 * H - f.ptrY) / H;
  const rad2 = Math.max(f.irad * f.irad, 1e-5), str = f.istr, on = f.ptrOn;
  const pulseK = 1 - f.pulse * 0.06;

  // 1. warped sample positions (pointer distortion, pulse zoom, domain warp)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const px = fr(((col + 0.5) * cw - 0.5 * W) / H), py = fr((0.5 * H - (row + 0.5) * ch) / H);
      let ppx = px, ppy = py;
      if (im >= 2 && im <= 5 && on > 0) {
        const dmx = px - mx, dmy = py - my;
        const fall = on * Math.exp(-(dmx * dmx + dmy * dmy) / rad2);
        if (im === 3) { const k = 1 - 0.62 * str * fall; ppx = mx + dmx * k; ppy = my + dmy * k; }
        else if (im === 4) {
          const nx = dmx + 1e-5, ny = dmy + 1e-5, nl = Math.sqrt(nx * nx + ny * ny), k = str * f.irad * 0.7 * fall;
          ppx = px - (nx / nl) * k; ppy = py - (ny / nl) * k;
        } else if (im === 5) {
          const an = str * 3.2 * fall, c = Math.cos(an), s = Math.sin(an);
          ppx = mx + c * dmx + s * dmy; ppy = my - s * dmx + c * dmy;
        }
      }
      if (im === 2 && sim) {
        const h = sim.h;
        const gx = simAt(h, cols, rows, col + 1, row) - simAt(h, cols, rows, col - 1, row);
        const gy = simAt(h, cols, rows, col, row - 1) - simAt(h, cols, rows, col, row + 1);
        ppx += gx * 0.05 * str; ppy += gy * 0.05 * str;
      }
      if (pulseK !== 1) { ppx = fr(ppx * pulseK); ppy = fr(ppy * pulseK); }
      let qx = ppx, qy = ppy;
      if (f.warp > 0) {
        const wx = ppx * f.warpScale * 1.2, wy = ppy * f.warpScale * 1.2;
        qx += f.warp * (fbm(wx + T * 0.15, wy + T * 0.15) - 0.5) * 1.6;
        qy += f.warp * (fbm(wx + 5.2 - T * 0.15, wy + 1.3 - T * 0.15) - 0.5) * 1.6;
      }
      B.ppx[i] = ppx; B.ppy[i] = ppy; B.qx[i] = qx; B.qy[i] = qy;
    }
  }

  // 2. pattern stack (twice when looping, to crossfade the end of the loop into its start)
  const loop = f.loop > 0;
  let tl = T, w = 0;
  if (loop) { tl = T - f.loop * Math.floor(T / f.loop); w = tl / f.loop; stack(f, B, tl, B.v0); stack(f, B, tl - f.loop, B.v1); }
  else stack(f, B, T, B.v0);
  const loopK = 1 + 0.41 * Math.sin(PI * w);

  // 3. source, pointer light / ripples / trails, pulse; quantise like an RGBA8 target
  const media = f.src === 'media' ? f.media : null;
  const text = f.src === 'text' ? f.text : null;
  if (media) MAP.set(W, H, media.natW, media.natH, f.fit, f.zoom, f.panX, f.panY, f.mirror);
  const csx = (cw / W) * 0.25, csy = (ch / H) * 0.25;
  const env = f.morph > 0 ? 0.5 - 0.5 * Math.cos((TAU * T) / f.morph) : 0;
  const morphK = f.morph > 0 ? smooth01(env) : 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      let pv = B.v0[i];
      if (loop) { pv = B.v0[i] * (1 - w) + B.v1[i] * w; pv = clamp(0.5 + (pv - 0.5) * loopK, 0, 1); }
      let l = pv, cr = 1, cg = 1, cb = 1;
      if (media || text) {
        const sx = B.ppx[i] * (H / W) + 0.5, sy = 0.5 - B.ppy[i];
        if (media) {
          ACC[0] = ACC[1] = ACC[2] = 0;
          mediaTap(media, sx - csx, sy - csy); mediaTap(media, sx + csx, sy - csy);
          mediaTap(media, sx - csx, sy + csy); mediaTap(media, sx + csx, sy + csy);
          cr = ACC[0] * 0.25; cg = ACC[1] * 0.25; cb = ACC[2] * 0.25;
          const ml = cr * 0.299 + cg * 0.587 + cb * 0.114;
          l = f.mediaMix > 0 ? blendf(ml, pv, f.mediaBlend, f.mediaMix) : ml;
        } else if (text) {
          const tm = (sampleRed(text, sx - csx, sy - csy) + sampleRed(text, sx + csx, sy - csy)
            + sampleRed(text, sx - csx, sy + csy) + sampleRed(text, sx + csx, sy + csy)) * 0.25;
          l = f.mediaMix > 0 ? blendf(tm, pv, f.mediaBlend, f.mediaMix) : tm;
          if (f.morph > 0) l = hash12(col * 1.37, row * 1.37) < morphK ? pv : l;
        }
      }
      if (im === 1) {
        const px = ((col + 0.5) * cw - 0.5 * W) / H, py = (0.5 * H - (row + 0.5) * ch) / H;
        const dmx = px - mx, dmy = py - my, d2 = dmx * dmx + dmy * dmy;
        const fall = on * Math.exp(-d2 / rad2);
        l += str * fall * (0.75 + 0.25 * Math.sin(Math.sqrt(d2) * 40 - T * 6));
      } else if (im === 2 && sim) l += sim.h[i] * 0.3 * str;
      else if (im === 6 && sim) l *= 1 - clamp(sim.tr[i], 0, 1);
      else if (im === 7 && sim) l += sim.tr[i] * 0.85;
      l += f.pulse * 0.22;
      l = l > 0 ? (l < 1 ? l : 1) : 0;
      B.a[i] = Math.round(l * 255);
      B.r[i] = Math.round(clamp(cr, 0, 1) * 255); B.g[i] = Math.round(clamp(cg, 0, 1) * 255); B.b[i] = Math.round(clamp(cb, 0, 1) * 255);
    }
  }
}

/** smoothstep(.1, .9, x) */
function smooth01(x: number) { let t = (x - 0.1) / 0.8; t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/** Ripple height at a cell, clamped to the grid like the GPU's CLAMP_TO_EDGE sampling. */
function simAt(h: Float32Array, cols: number, rows: number, c: number, r: number) {
  c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
  r = r < 0 ? 0 : r >= rows ? rows - 1 : r;
  return h[r * cols + c];
}
