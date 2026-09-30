/**
 * Field pass on the CPU: the luminance (and media colour) of every cell, a port of buildFieldShader()
 * in ../glsl/programs.ts. Same coordinates (p in screen heights, y up, origin at the centre), same layer
 * transforms and blends, domain warp, loop crossfade, pulse, media/text sampling and pointer effects.
 * Outputs are quantised to 8 bits like the RGBA8 texture the GPU writes.
 * Pure: no DOM, so it runs in tests.
 */
import { BLENDS, type Recipe } from '../recipe';
import { figureFit } from '../catalog';
import { PI, TAU, blendf, clamp, fbm, hash12 } from './core';

const fr = Math.fround;
import { basicPattern, setPX, type BasicPattern } from './patterns';
import { DISP_MAX } from '../touch';
import { XformState, runStage, updateTrail, type StageEnv } from './xform';
import type { XformStage } from '../xform';

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
  /** 1 while the pointer is pressed (Imán pulls harder). */
  ptrDown?: number;
  sim: { h: Float32Array; tr: Float32Array } | null;
  /** «Zoom con los dedos» and «Seguir»: the view p → p·k + (ox, oy) (null: none). See ../touch.ts. */
  view?: [number, number, number] | null;
  /** «Estirar»: the touch field's bytes (B and A: displacement per cell), null otherwise. */
  disp?: Uint8Array | null;
  /**
   * Transformations of the picture or the text (../xform.ts), their grids and Estela's state, and how much
   * the trail keeps this frame. Null: none.
   */
  xform?: { stages: XformStage[]; state: XformState; decay: number; times?: [number, number] } | null;
}

export { INTERACT as INTERACT_MODES } from '../recipe';

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

/**
 * Active layers as the GPU engine binds them (max 4; with none on, 'nube' with layer 0's parameters), on a
 * W×H canvas (a figure on a canvas taller than wide is sized to its width: catalog.ts figureFit).
 */
export function fieldLayers(r: Recipe, W: number, H: number): FieldLayer[] {
  const on = r.layers.filter(l => l.on).slice(0, 4);
  const list = on.length ? on : [{ ...r.layers[0], on: true, pattern: 'nube' }];
  return list.map(l => ({
    pat: basicPattern(l.pattern),
    scale: l.scale * figureFit(l.pattern, W, H), rot: (l.rot * Math.PI) / 180, x: l.x, y: l.y, a: l.a, b: l.b,
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

/** The domain warp of the sample positions at time t (B.ppx/ppy → B.qx/qy), as the first step of runField. */
function warpInto(f: FieldFrame, B: FieldBuffers, t: number) {
  const n = f.cols * f.rows;
  for (let i = 0; i < n; i++) {
    const ppx = B.ppx[i], ppy = B.ppy[i];
    const wx = ppx * f.warpScale * 1.2, wy = ppy * f.warpScale * 1.2;
    B.qx[i] = ppx + f.warp * (fbm(wx + t * 0.15, wy + t * 0.15) - 0.5) * 1.6;
    B.qy[i] = ppy + f.warp * (fbm(wx + 5.2 - t * 0.15, wy + 1.3 - t * 0.15) - 0.5) * 1.6;
  }
}

/** Runs the field pass; fills B.a (luminance) and B.r/g/b (media colour, white otherwise). */
export function runField(f: FieldFrame, B: FieldBuffers) {
  const { W, H, cw, ch, cols, rows, time: T } = f;
  const im = f.imode, sim = f.sim;
  const mx = (f.ptrX - 0.5 * W) / H, my = (0.5 * H - f.ptrY) / H;
  const rad2 = Math.max(f.irad * f.irad, 1e-5), str = f.istr, on = f.ptrOn;
  const pulseK = 1 - f.pulse * 0.06;
  const V = f.view, disp = f.disp, down = f.ptrDown ?? 0;

  // 1. warped sample positions (pointer distortion, pulse zoom, domain warp)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const px = fr(((col + 0.5) * cw - 0.5 * W) / H), py = fr((0.5 * H - (row + 0.5) * ch) / H);
      let ppx = px, ppy = py;
      if (V) { ppx = fr(fr(px * V[0]) + V[1]); ppy = fr(fr(py * V[0]) + V[2]); }
      if (((im >= 2 && im <= 5) || im === 16) && on > 0) {
        const dmx = px - mx, dmy = py - my;
        const fall = on * Math.exp(-(dmx * dmx + dmy * dmy) / rad2);
        if (im === 3) { const k = 1 - 0.62 * str * fall; ppx = mx + dmx * k; ppy = my + dmy * k; }
        else if (im === 4) {
          const nx = dmx + 1e-5, ny = dmy + 1e-5, nl = Math.sqrt(nx * nx + ny * ny), k = str * f.irad * 0.7 * fall;
          ppx = px - (nx / nl) * k; ppy = py - (ny / nl) * k;
        } else if (im === 5) {
          const an = str * 3.2 * fall, c = Math.cos(an), s = Math.sin(an);
          ppx = mx + c * dmx + s * dmy; ppy = my - s * dmx + c * dmy;
        } else if (im === 16) {
          // Imán: the pattern is drawn in toward the pointer, more while pressed
          const nx = dmx + 1e-5, ny = dmy + 1e-5, nl = Math.sqrt(nx * nx + ny * ny), k = str * f.irad * 0.8 * fall * (1 + 0.8 * down);
          ppx = px + (nx / nl) * k; ppy = py + (ny / nl) * k;
        }
      }
      if (im === 2 && sim) {
        const h = sim.h;
        const gx = simAt(h, cols, rows, col + 1, row) - simAt(h, cols, rows, col - 1, row);
        const gy = simAt(h, cols, rows, col, row - 1) - simAt(h, cols, rows, col, row + 1);
        ppx += gx * 0.05 * str; ppy += gy * 0.05 * str;
      }
      if (disp) {
        // Estirar: the grid shows the pattern from where the finger took it
        const o = i * 4;
        ppx -= ((disp[o + 2] - 128) / 127) * DISP_MAX; ppy -= ((disp[o + 3] - 128) / 127) * DISP_MAX;
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
  if (loop) {
    tl = T - f.loop * Math.floor(T / f.loop); w = tl / f.loop; stack(f, B, tl, B.v0);
    // the warp drifts too: the second stack reads it as it was one loop earlier (as the field shader)
    if (f.warp > 0) warpInto(f, B, tl - f.loop);
    stack(f, B, tl - f.loop, B.v1);
  }
  else stack(f, B, T, B.v0);
  const loopK = 1 + 0.41 * Math.sin(PI * w);

  // 3. source, pointer light / ripples / trails, pulse; quantise like an RGBA8 target
  const media = f.src === 'media' ? f.media : null;
  const text = f.src === 'text' ? f.text : null;
  if (media) MAP.set(W, H, media.natW, media.natH, f.fit, f.zoom, f.panX, f.panY, f.mirror);
  const csx = (cw / W) * 0.25, csy = (ch / H) * 0.25;
  const env = f.morph > 0 ? 0.5 - 0.5 * Math.cos((TAU * T) / f.morph) : 0;
  const morphK = f.morph > 0 ? smooth01(env) : 0;
  const pvOf = (i: number) => {
    if (!loop) return B.v0[i];
    const v = B.v0[i] * (1 - w) + B.v1[i] * w;
    return clamp(0.5 + (v - 0.5) * loopK, 0, 1);
  };
  // the source transformed (xform.ts): the grid its last transformation wrote, read per cell
  const grid = f.xform && (media || text) ? runXforms(f, f.xform, media, text, pvOf) : null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const pv = pvOf(i);
      let l = pv, cr = 1, cg = 1, cb = 1;
      if (media || text) {
        const sx = B.ppx[i] * (H / W) + 0.5, sy = 0.5 - B.ppy[i];
        let gi = -1;
        if (grid) {
          let gx = Math.floor((sx * W) / cw), gy = Math.floor((sy * H) / ch);
          gx = gx < 0 ? 0 : gx >= cols ? cols - 1 : gx; gy = gy < 0 ? 0 : gy >= rows ? rows - 1 : gy;
          gi = (gy * cols + gx) * 3;
        }
        if (media) {
          if (grid) { cr = grid[gi] / 255; cg = grid[gi + 1] / 255; cb = grid[gi + 2] / 255; }
          else {
            ACC[0] = ACC[1] = ACC[2] = 0;
            // a cell cut by the canvas edge samples up to the edge (as the WebGL engine does)
            const x0 = clamp(sx - csx, 0, 1), x1 = clamp(sx + csx, 0, 1), y0 = clamp(sy - csy, 0, 1), y1 = clamp(sy + csy, 0, 1);
            mediaTap(media, x0, y0); mediaTap(media, x1, y0);
            mediaTap(media, x0, y1); mediaTap(media, x1, y1);
            cr = ACC[0] * 0.25; cg = ACC[1] * 0.25; cb = ACC[2] * 0.25;
          }
          const ml = cr * 0.299 + cg * 0.587 + cb * 0.114;
          l = f.mediaMix > 0 ? blendf(ml, pv, f.mediaBlend, f.mediaMix) : ml;
        } else if (text) {
          const tm = grid
            ? (grid[gi] * 0.299 + grid[gi + 1] * 0.587 + grid[gi + 2] * 0.114) / 255
            : (sampleRed(text, sx - csx, sy - csy) + sampleRed(text, sx + csx, sy - csy)
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

/**
 * The transformation passes (glsl/xform.ts) on the CPU: the source averaged per cell (the four taps of
 * the field pass, at the cell centre), then each stage in order. Returns the last grid.
 */
function runXforms(f: FieldFrame, X: NonNullable<FieldFrame['xform']>, media: MediaBuffer | null, text: TextBuffer | null, pvOf: (i: number) => number): Uint8Array {
  const { W, H, cw, ch, cols, rows } = f;
  const st = X.state;
  st.resize(cols * rows);
  const q = (v: number) => Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255);
  let cur = st.grid[0];
  const csx = (cw / W) * 0.25, csy = (ch / H) * 0.25;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col, o = i * 3;
      const sx = ((col + 0.5) * cw) / W, sy = ((row + 0.5) * ch) / H;
      if (media) {
        ACC[0] = ACC[1] = ACC[2] = 0;
        const x0 = clamp(sx - csx, 0, 1), x1 = clamp(sx + csx, 0, 1), y0 = clamp(sy - csy, 0, 1), y1 = clamp(sy + csy, 0, 1);
        mediaTap(media, x0, y0); mediaTap(media, x1, y0);
        mediaTap(media, x0, y1); mediaTap(media, x1, y1);
        cur[o] = q(ACC[0] * 0.25); cur[o + 1] = q(ACC[1] * 0.25); cur[o + 2] = q(ACC[2] * 0.25);
      } else if (text) {
        const tm = (sampleRed(text, sx - csx, sy - csy) + sampleRed(text, sx + csx, sy - csy)
          + sampleRed(text, sx - csx, sy + csy) + sampleRed(text, sx + csx, sy + csy)) * 0.25;
        cur[o] = cur[o + 1] = cur[o + 2] = q(tm);
      }
    }
  }
  if (X.stages.some(s => s.kind === 'desplazar')) for (let i = 0; i < cols * rows; i++) st.pat[i] = q(pvOf(i));
  const env: StageEnv = { cols, rows, aspect: ch / cw, time: X.times?.[0] ?? f.time, timeB: X.times?.[1] ?? f.time, pat: st.pat, trail: st.trail[st.i] };
  let other = st.grid[1];
  for (const s of X.stages) {
    if (s.kind === 'estela') {
      const j = st.i ^ 1;
      updateTrail(cur, st.prev[st.i], st.trail[st.i], st.trail[j], X.decay, st.have);
      st.prev[j].set(cur);
      st.i = j;
      st.have = true;
      env.trail = st.trail[j];
    }
    runStage(s, cur, other, env);
    const t = cur; cur = other; other = t;
  }
  return cur;
}

/** smoothstep(.1, .9, x) */
function smooth01(x: number) { let t = (x - 0.1) / 0.8; t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

/** Ripple height at a cell, clamped to the grid like the GPU's CLAMP_TO_EDGE sampling. */
function simAt(h: Float32Array, cols: number, rows: number, c: number, r: number) {
  c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
  r = r < 0 ? 0 : r >= rows ? rows - 1 : r;
  return h[r * cols + c];
}
