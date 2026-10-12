import { Accum } from '../draw';
import { SimRng } from '../rng';
import type { FieldModel, ModelConfig, ModelState, Params, SourceFeed, Stroke } from '../types';

/**
 * Feedback loop (the mechanism of frame-feedback visualizers, written here from its description): a
 * luminance buffer at twice the raster's resolution where every fixed step
 *   1. resamples the previous buffer through a coarse warp mesh: zoom about a wandering centre whose amount
 *      grows exponentially with the radius («Curvatura»: the edges run ahead of the centre, a tunnel), a turn
 *      plus a turn that grows towards the centre (a hurricane), a translation whose heading drifts, and a
 *      smooth sinusoidal warp whose frequencies drift too;
 *   2. optionally sharpens what it read against a blurred copy, c + k (c − blur c), before the decay: the
 *      clamp to 0..1 turns that into Turing-like labyrinths that flow with the warp («Tinta»);
 *   3. decays (multiplicative and a small subtractive fade) and clamps;
 *   4. draws new shapes into the buffer (a closed curve or a line driven by a synthetic signal, a polygon
 *      outline, a polygon filled with a rotated and shrunken copy of the buffer, scattered dots, or a moving
 *      lattice pattern injected at low opacity), so the next step drags them along;
 *   5. optionally folds the buffer onto a mirror symmetry (two, four, six or eight wedges) inside the loop.
 * Everything that moves is driven by an autonomous clock: slow deterministic oscillators (sums of sines with
 * unrelated frequencies and seeded phases) and a periodic «pulse» with a fast attack and an exponential fall.
 * The raster is the buffer averaged 2 × 2, with an optional mirrored echo and a contrast curve.
 *
 * Version 2 (PR #10 close-out) adds colour inside the loop and a seed fed by the piece:
 *  - three colour buffers at the raster's resolution (rgb weighted by intensity) go through the same mesh,
 *    decay and folds as the luminance, so the echoes keep their colour as they travel; what the seeds add
 *    brings the colour of «Color»: a hue that runs with time («Arcoíris»), one that turns a little on every
 *    pass («Deriva»: older echoes have moved further round the wheel), two that alternate on the beat
 *    («Dos tonos») or the colours of the picture under the seed («De la fuente»);
 *  - the seed «Fuente» injects the piece's picture or letters into the loop (FieldModel.feed), a little on
 *    every step and more on the beat; with patterns as the source it draws the closed wave.
 * The luminance of version 2 is the luminance of version 1 for the same settings: pieces made with version 1
 * keep their run exactly (their recipes have no colour, families-compat.test.ts).
 */

const ID = 'ecos', V = 2, RATE = 30;
/** Buffer pixels per raster pixel, each way. */
const SS = 2;
const MESH_X = 48, MESH_Y = 24;
/** Small subtractive fade per step: dim residue goes to black instead of staying as a haze. */
const FADE = 0.0025;
/** Oscillator frequencies (rad/s): three unrelated terms per oscillator. */
const OM = [
  0.093, 0.151, 0.247, 0.061, 0.113, 0.197, 0.077, 0.139, 0.229, 0.051, 0.127, 0.211,
  0.069, 0.163, 0.263, 0.083, 0.107, 0.181, 0.057, 0.149, 0.239, 0.073, 0.121, 0.193,
];
const N_OSC = OM.length / 3;

/**
 * 0..1 → a byte in steps of 4 (64 levels): a sample halfway between two or four texels is then a whole level
 * in both engines (the GPU's float32 and the CPU's float64 would otherwise round an exact .5 apart).
 */
const byte = (v: number) => (v <= 0 ? 0 : v >= 1 ? 252 : ((v * 63 + 0.5) | 0) * 4);

interface P {
  zoom: number; curve: number; rot: number; swirl: number; wander: number; drift: number; warp: number; mirror: string;
  memory: number; ink: number; seed: string; amount: number; sides: number; strobe: number; pulse: number; tempo: number; echo: string; contrast: number;
  color: string; hue: number;
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const read = (p: Params): P => ({
  zoom: num(p.zoom, 0.3), curve: num(p.curve, 0.3), rot: num(p.rot, 0.1), swirl: num(p.swirl, 0), wander: num(p.wander, 0.5),
  drift: num(p.drift, 0), warp: num(p.warp, 0.3), mirror: String(p.mirror ?? 'no'), memory: num(p.memory, 0.7), ink: num(p.ink, 0),
  seed: String(p.seed ?? 'onda'), amount: num(p.amount, 0.7), sides: Math.max(3, Math.min(8, Math.round(num(p.sides, 5)))), strobe: num(p.strobe, 0.4),
  pulse: num(p.pulse, 0.5), tempo: Math.max(0.5, num(p.tempo, 2.4)), echo: String(p.echo ?? 'no'), contrast: num(p.contrast, 0.5),
  color: String(p.color ?? 'arcoiris'), hue: num(p.hue, 0.55),
});

/** A hue (turns) at full saturation and value, as rgb 0..1 into out. */
function hueRGB(hh: number, out: Float64Array, sat = 1) {
  const h6 = (hh - Math.floor(hh)) * 6;
  const r = Math.abs(h6 - 3) - 1, g = 2 - Math.abs(h6 - 2), b = 2 - Math.abs(h6 - 4);
  const c = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  out[0] = 1 - sat + sat * c(r); out[1] = 1 - sat + sat * c(g); out[2] = 1 - sat + sat * c(b);
}

export function create(cfg: ModelConfig): FieldModel {
  const h = Math.max(16, Math.round(cfg.res)), w = 2 * h;
  const bh = h * SS, bw = w * SS, nb = bw * bh;
  // the random stream is the one version 1 had (its name kept the version it was born with)
  const rng = new SimRng(`${ID}|1|${cfg.seed}`);
  /** Version 2 and later: colour in the loop and the seed fed by the piece. */
  const ver = cfg.v ?? V, colourOn = ver >= 2;
  let p = read(cfg.params);
  let steps = 0;

  // seeded phases of the oscillators (fixed by the seed: not part of the state)
  const PH = new Float64Array(OM.length);
  for (let i = 0; i < PH.length; i++) PH[i] = rng.next() * Math.PI * 2;
  /** Slow oscillator k at time τ (s), in −1..1. */
  const osc = (k: number, tau: number) => {
    const o = (k % N_OSC) * 3;
    return (Math.sin(OM[o] * tau + PH[o]) + 0.6 * Math.sin(OM[o + 1] * tau + PH[o + 1]) + 0.35 * Math.sin(OM[o + 2] * tau + PH[o + 2])) / 1.95;
  };
  /** The pulse: 0..1, fast attack (40 ms), exponential fall, every «Compás» seconds. */
  const pulseAt = (tau: number) => {
    const T = p.tempo, ph = tau - T * Math.floor(tau / T), atk = 0.04;
    if (ph < atk) return ph / atk;
    return Math.exp(-(ph - atk) / Math.min(0.45, 0.3 * T));
  };

  // ---- buffers
  const buf = new Accum(bw, bh);
  const B = buf.d;
  const tmp = new Float32Array(nb);
  const lw = bw >> 1, lh = bh >> 1;
  const lo = new Float32Array(lw * lh), loTmp = new Float32Array(lw * lh);
  const loAcc = new Accum(lw, lh);
  const meshX = new Float32Array((MESH_X + 1) * (MESH_Y + 1)), meshY = new Float32Array(meshX.length);
  const rowX = new Float32Array(MESH_X + 1), rowY = new Float32Array(MESH_X + 1);
  // per buffer column / row: mesh cell and fraction
  const colI = new Int32Array(bw), colT = new Float32Array(bw), rowJ = new Int32Array(bh), rowT = new Float32Array(bh);
  for (let x = 0; x < bw; x++) { const g = ((x + 0.5) / bw) * MESH_X; colI[x] = Math.min(MESH_X - 1, g | 0); colT[x] = g - colI[x]; }
  for (let y = 0; y < bh; y++) { const g = ((y + 0.5) / bh) * MESH_Y; rowJ[y] = Math.min(MESH_Y - 1, g | 0); rowT[y] = g - rowJ[y]; }
  // the trama seed: a pattern on a quarter-resolution grid, added bilinearly
  const qw = Math.max(8, bw >> 2), qh = Math.max(4, bh >> 2), pat = new Float32Array(qw * qh), patRow = new Float32Array(qw);
  const qcolI = new Int32Array(bw), qcolT = new Float32Array(bw), qrowJ = new Int32Array(bh), qrowT = new Float32Array(bh);
  for (let x = 0; x < bw; x++) { const g = Math.max(0, Math.min(qw - 1.001, ((x + 0.5) * qw) / bw - 0.5)); qcolI[x] = g | 0; qcolT[x] = g - (g | 0); }
  for (let y = 0; y < bh; y++) { const g = Math.max(0, Math.min(qh - 1.001, ((y + 0.5) * qh) / bh - 0.5)); qrowJ[y] = g | 0; qrowT[y] = g - (g | 0); }

  // ---- colour (version 2): rgb weighted by intensity, one value per raster pixel (the luminance's 2 × 2)
  const nc = w * h;
  const CR = colourOn ? new Float32Array(nc) : null, CG = colourOn ? new Float32Array(nc) : null, CB = colourOn ? new Float32Array(nc) : null;
  const cTmp = colourOn ? new Float32Array(nc * 3) : null;
  /** The luminance before the seeds of this step (what they add takes the seed's colour). */
  const before = colourOn ? new Float32Array(nb) : null;
  // per raster column / row: mesh cell and fraction (the colour reads the mesh at its own pixel centres)
  const ccolI = new Int32Array(w), ccolT = new Float32Array(w), crowJ = new Int32Array(h), crowT = new Float32Array(h);
  for (let x = 0; x < w; x++) { const g = ((x + 0.5) / w) * MESH_X; ccolI[x] = Math.min(MESH_X - 1, g | 0); ccolT[x] = g - ccolI[x]; }
  for (let y = 0; y < h; y++) { const g = ((y + 0.5) / h) * MESH_Y; crowJ[y] = Math.min(MESH_Y - 1, g | 0); crowT[y] = g - crowJ[y]; }
  const SEEDC = new Float64Array(3);

  // ---- the piece's source (seed «Fuente», colour «De la fuente»): sampled on the trama's quarter grid and per raster pixel
  let src: SourceFeed | null = null;
  const srcL = new Float32Array(qw * qh);
  const srcRGB = new Float32Array(nc * 3);
  const SO = new Float64Array(4);
  const takeFeed = (f: SourceFeed | null) => {
    src = f;
    if (!f) { srcL.fill(0); srcRGB.fill(0); return; }
    for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
      f.at(((x + 0.5) / qw) * 2 - 1, 0.5 - (y + 0.5) / qh, SO);
      srcL[y * qw + x] = SO[3];
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      f.at(((x + 0.5) / w) * 2 - 1, 0.5 - (y + 0.5) / h, SO);
      const o = (y * w + x) * 3;
      srcRGB[o] = SO[0]; srcRGB[o + 1] = SO[1]; srcRGB[o + 2] = SO[2];
    }
  };

  // ---- mirror folds (static per mode): for each buffer pixel outside the fundamental region, the
  // buffer coordinates it copies (bilinear); −1: the pixel is its own source. The colour has its own map.
  let mirrorMode = '';
  let mirX: Float32Array | null = null, mirY: Float32Array | null = null;
  let cmirX: Float32Array | null = null, cmirY: Float32Array | null = null;
  const foldMap = (fw: number, fh: number, mx: Float32Array, my: Float32Array) => {
    const k = mirrorMode === 'seis' ? 3 : mirrorMode === 'ocho' ? 4 : 0;
    const wedge = k ? Math.PI / k : 0;
    for (let y = 0; y < fh; y++) {
      const dy = 0.5 - (y + 0.5) / fh;
      for (let x = 0; x < fw; x++) {
        const dx = ((x + 0.5) / fw) * 2 - 1, i = y * fw + x;
        let qx = dx, qy = dy;
        if (mirrorMode === 'lados') qx = Math.abs(dx);
        else if (mirrorMode === 'cuatro') { qx = Math.abs(dx); qy = Math.abs(dy); }
        else {
          let a = Math.atan2(dy, dx);
          const r = Math.sqrt(dx * dx + dy * dy);
          a -= 2 * wedge * Math.floor(a / (2 * wedge));
          if (a > wedge) a = 2 * wedge - a;
          qx = r * Math.cos(a); qy = r * Math.sin(a);
        }
        if (Math.abs(qx - dx) < 1e-9 && Math.abs(qy - dy) < 1e-9) { mx[i] = -1; continue; }
        mx[i] = (qx * 0.5 + 0.5) * fw - 0.5; my[i] = (0.5 - qy) * fh - 0.5;
      }
    }
  };
  const buildMirror = () => {
    mirrorMode = p.mirror;
    if (mirrorMode === 'no') { mirX = mirY = cmirX = cmirY = null; return; }
    mirX = new Float32Array(nb); mirY = new Float32Array(nb);
    if (colourOn) { cmirX = new Float32Array(nc); cmirY = new Float32Array(nc); foldMap(w, h, cmirX, cmirY); }
    const k = mirrorMode === 'seis' ? 3 : mirrorMode === 'ocho' ? 4 : 0;
    const wedge = k ? Math.PI / k : 0;
    for (let y = 0; y < bh; y++) {
      const dy = 0.5 - (y + 0.5) / bh;
      for (let x = 0; x < bw; x++) {
        const dx = ((x + 0.5) / bw) * 2 - 1, i = y * bw + x;
        let qx = dx, qy = dy;
        if (mirrorMode === 'lados') qx = Math.abs(dx);
        else if (mirrorMode === 'cuatro') { qx = Math.abs(dx); qy = Math.abs(dy); }
        else {
          let a = Math.atan2(dy, dx);
          const r = Math.sqrt(dx * dx + dy * dy);
          a -= 2 * wedge * Math.floor(a / (2 * wedge));
          if (a > wedge) a = 2 * wedge - a;
          qx = r * Math.cos(a); qy = r * Math.sin(a);
        }
        if (Math.abs(qx - dx) < 1e-9 && Math.abs(qy - dy) < 1e-9) { mirX[i] = -1; continue; }
        mirX[i] = (qx * 0.5 + 0.5) * bw - 0.5; mirY[i] = (0.5 - qy) * bh - 0.5;
      }
    }
  };
  buildMirror();

  /** Bilinear sample of a w × h field with wrap, at pixel coordinates (centres at integers). */
  const sampleWrap = (f: Float32Array, fw: number, fh: number, fx: number, fy: number) => {
    // floor through int32 (the coordinates stay within a few frames of the buffer), then wrap
    let ix = fx | 0, iy = fy | 0;
    if (fx < ix) ix--;
    if (fy < iy) iy--;
    const tx = fx - ix, ty = fy - iy;
    if (ix < 0 || ix >= fw) { ix %= fw; if (ix < 0) ix += fw; }
    if (iy < 0 || iy >= fh) { iy %= fh; if (iy < 0) iy += fh; }
    const ix1 = ix + 1 === fw ? 0 : ix + 1, r0 = iy * fw, r1 = iy + 1 === fh ? 0 : r0 + fw;
    const a = f[r0 + ix] + (f[r0 + ix1] - f[r0 + ix]) * tx, b = f[r1 + ix] + (f[r1 + ix1] - f[r1 + ix]) * tx;
    return a + (b - a) * ty;
  };

  /** Buffer pixel coordinates of a domain point. */
  const bx = (x: number) => (x * 0.5 + 0.5) * bw;
  const by = (y: number) => (0.5 - y) * bh;

  // ---- one step
  const step1 = () => {
    if (p.mirror !== mirrorMode) buildMirror();
    const tau = steps / RATE;
    const beat = pulseAt(tau) * p.pulse;
    const cx = p.wander * 0.3 * osc(0, tau), cy = p.wander * 0.15 * osc(1, tau);
    // log-zoom per step (> 0: the picture grows from the centre), with a kick on the beat
    const lz = (1.6 * p.zoom + 0.6 * beat * (p.zoom < 0 ? -1 : 1) * Math.min(1, 0.25 + Math.abs(p.zoom))) / RATE;
    const a0 = (0.8 * p.rot + 0.5 * p.wander * osc(2, tau)) / RATE;
    const sw = (2.5 * p.swirl) / RATE;
    const dHead = Math.PI * (osc(3, tau) + 0.25 * osc(4, tau)), dSp = (0.3 * p.drift) / RATE;
    const ddx = Math.cos(dHead) * dSp, ddy = Math.sin(dHead) * dSp;
    const wa = 0.009 * p.warp;
    const f0 = 3.6 + 1.4 * osc(5, tau), f1 = 3.9 + 1.3 * osc(6, tau), f2 = 4.3 + 1.2 * osc(7, tau), f3 = 3.3 + 1.5 * osc(4, tau + 40);
    const kc = 2.2 * p.curve;
    // the mesh: where each vertex reads the previous buffer (buffer pixel coordinates)
    for (let j = 0; j <= MESH_Y; j++) {
      const y = 0.5 - j / MESH_Y;
      for (let i = 0; i <= MESH_X; i++) {
        const x = -1 + (2 * i) / MESH_X;
        const dx = x - cx, dy = y - cy, rad = Math.sqrt(dx * dx + dy * dy);
        const s = Math.exp(-lz * Math.exp(kc * (rad - 0.3)));
        const a = a0 + sw / (rad + 0.2), ca = Math.cos(a), sa = Math.sin(a);
        let sx = cx + (ca * dx + sa * dy) * s - ddx, sy = cy + (-sa * dx + ca * dy) * s - ddy;
        if (wa > 0) {
          sx += wa * (Math.sin(0.29 * tau + x * f0 - y * f3) + Math.cos(0.61 * tau - x * f1 + y * f2));
          sy += wa * (Math.cos(0.47 * tau - x * f2 - y * f1) + Math.sin(0.83 * tau + x * f0 + y * f3));
        }
        const k = j * (MESH_X + 1) + i;
        meshX[k] = (sx * 0.5 + 0.5) * bw - 0.5; meshY[k] = (0.5 - sy) * bh - 0.5;
      }
    }
    // the blurred copy for «Tinta»: half resolution, three 1-2-1 passes (wrapping)
    const ink = p.ink * 0.9;
    if (ink > 0) {
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const o = 2 * y * bw + 2 * x;
        lo[y * lw + x] = 0.25 * (B[o] + B[o + 1] + B[o + bw] + B[o + bw + 1]);
      }
      loAcc.d.set(lo);
      loAcc.blur(3, true, loTmp);
      lo.set(loAcc.d);
    }
    const decay = Math.exp(-(1 - p.memory) * 4.5 / RATE);
    // the injected lattice (seed «Trama») or the piece's picture or letters (seed «Fuente», version 2) is added in
    // the same pass
    const fed = colourOn && p.seed === 'fuente' && !!src;
    const op = p.seed === 'trama' ? tramaPattern(tau, beat) : fed ? 0.05 * p.amount * (1 - p.pulse * 0.6 + 1.6 * beat) : 0;
    const inj = fed ? srcL : pat;
    const keep = colourOn && op > 0 ? before! : null;
    const MX1 = MESH_X + 1;
    for (let y = 0; y < bh; y++) {
      // the mesh row at this pixel row, then each pixel between two of its vertices
      const j = rowJ[y], ty = rowT[y], r0 = j * MX1, r1 = r0 + MX1;
      for (let i = 0; i < MX1; i++) {
        rowX[i] = meshX[r0 + i] + (meshX[r1 + i] - meshX[r0 + i]) * ty;
        rowY[i] = meshY[r0 + i] + (meshY[r1 + i] - meshY[r0 + i]) * ty;
      }
      if (op > 0) {
        const q0 = qrowJ[y] * qw, q1 = q0 + qw, qt = qrowT[y];
        for (let i = 0; i < qw; i++) patRow[i] = op * (inj[q0 + i] + (inj[q1 + i] - inj[q0 + i]) * qt);
      }
      const o = y * bw;
      for (let x = 0; x < bw; x++) {
        const i = colI[x], tx = colT[x];
        const fx = rowX[i] + (rowX[i + 1] - rowX[i]) * tx, fy = rowY[i] + (rowY[i + 1] - rowY[i]) * tx;
        let c = sampleWrap(B, bw, bh, fx, fy);
        if (ink > 0) c += ink * (c - sampleWrap(lo, lw, lh, fx * 0.5 - 0.25, fy * 0.5 - 0.25));
        c = c * decay - FADE;
        if (keep) keep[o + x] = c < 0 ? 0 : c > 1 ? 1 : c;
        if (op > 0) { const q = qcolI[x]; c += patRow[q] + (patRow[q + 1] - patRow[q]) * qcolT[x]; }
        tmp[o + x] = c < 0 ? 0 : c > 1 ? 1 : c;
      }
    }
    B.set(tmp);
    if (colourOn) {
      warpColour(decay, tau);
      if (!keep) before!.set(B);
    }
    seeds(tau, beat, cx, cy);
    if (colourOn) addColour(tau);
    if (mirX && mirY) {
      tmp.set(B);
      for (let i = 0; i < nb; i++) { const sx = mirX[i]; if (sx >= 0) B[i] = sampleWrap(tmp, bw, bh, sx, mirY[i]); }
      if (cmirX && cmirY) {
        const T = cTmp!;
        for (let i = 0; i < nc; i++) { T[i * 3] = CR![i]; T[i * 3 + 1] = CG![i]; T[i * 3 + 2] = CB![i]; }
        for (let i = 0; i < nc; i++) {
          const sx = cmirX[i];
          if (sx < 0) continue;
          CR![i] = sample3(T, sx, cmirY[i], 0); CG![i] = sample3(T, sx, cmirY[i], 1); CB![i] = sample3(T, sx, cmirY[i], 2);
        }
      }
    }
    steps++;
  };

  /** Bilinear sample of channel ch of an interleaved rgb field (w × h, wrapping), at pixel coordinates. */
  const sample3 = (f: Float32Array, fx: number, fy: number, ch: number) => {
    let ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    ix = ((ix % w) + w) % w; iy = ((iy % h) + h) % h;
    const ix1 = ix + 1 === w ? 0 : ix + 1, iy1 = iy + 1 === h ? 0 : iy + 1;
    const a = f[(iy * w + ix) * 3 + ch], b = f[(iy * w + ix1) * 3 + ch], c = f[(iy1 * w + ix) * 3 + ch], d = f[(iy1 * w + ix1) * 3 + ch];
    const top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  };

  /**
   * The colour goes through the same mesh as the luminance (read at its own pixel centres), decays with it and,
   * with «Deriva», turns a little round the grey axis on every pass.
   */
  const warpColour = (decay: number, tau: number) => {
    const T = cTmp!, R = CR!, G = CG!, Bc = CB!;
    for (let i = 0; i < nc; i++) { T[i * 3] = R[i]; T[i * 3 + 1] = G[i]; T[i * 3 + 2] = Bc[i]; }
    const MX1 = MESH_X + 1;
    // «Deriva»: a rotation about (1, 1, 1) of 0.04 turns a second (Rodrigues), else none
    let m00 = 1, m01 = 0, m02 = 0, m10 = 0, m11 = 1, m12 = 0, m20 = 0, m21 = 0, m22 = 1;
    if (p.color === 'deriva') {
      const a = (2 * Math.PI * 0.04) / RATE, c = Math.cos(a), sn = Math.sin(a), k = (1 - c) / 3, q = sn / Math.sqrt(3);
      m00 = c + k; m01 = k - q; m02 = k + q; m10 = k + q; m11 = c + k; m12 = k - q; m20 = k - q; m21 = k + q; m22 = c + k;
    }
    void tau;
    for (let y = 0; y < h; y++) {
      const j = crowJ[y], ty = crowT[y], r0 = j * MX1, r1 = r0 + MX1;
      for (let x = 0; x < w; x++) {
        const i = ccolI[x], tx = ccolT[x];
        const x0 = meshX[r0 + i] + (meshX[r1 + i] - meshX[r0 + i]) * ty, x1 = meshX[r0 + i + 1] + (meshX[r1 + i + 1] - meshX[r0 + i + 1]) * ty;
        const y0 = meshY[r0 + i] + (meshY[r1 + i] - meshY[r0 + i]) * ty, y1 = meshY[r0 + i + 1] + (meshY[r1 + i + 1] - meshY[r0 + i + 1]) * ty;
        // buffer pixel coordinates → colour pixel coordinates (2 × 2 buffer pixels per colour pixel)
        const fx = (x0 + (x1 - x0) * tx) * 0.5 - 0.25, fy = (y0 + (y1 - y0) * tx) * 0.5 - 0.25;
        const r = sample3(T, fx, fy, 0) * decay, g = sample3(T, fx, fy, 1) * decay, b = sample3(T, fx, fy, 2) * decay;
        const o = y * w + x;
        R[o] = m00 * r + m01 * g + m02 * b; G[o] = m10 * r + m11 * g + m12 * b; Bc[o] = m20 * r + m21 * g + m22 * b;
      }
    }
  };

  /** What the seeds (and the fed picture) added this step takes the colour of «Color». */
  const addColour = (tau: number) => {
    const R = CR!, G = CG!, Bc = CB!, pre = before!;
    const fromSrc = p.color === 'fuente' && !!src;
    if (!fromSrc) {
      const beatN = Math.floor(tau / p.tempo);
      const hh = p.color === 'arcoiris' ? p.hue + tau / (p.tempo * 8) : p.color === 'dos' ? p.hue + (beatN % 2) * 0.5 : p.hue;
      hueRGB(hh, SEEDC, 0.85);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const q = 2 * y * bw + 2 * x;
        const d = 0.25 * (Math.max(0, B[q] - pre[q]) + Math.max(0, B[q + 1] - pre[q + 1]) + Math.max(0, B[q + bw] - pre[q + bw]) + Math.max(0, B[q + bw + 1] - pre[q + bw + 1]));
        if (d <= 0) continue;
        const o = y * w + x;
        if (fromSrc) { const c = o * 3; R[o] += srcRGB[c] * d; G[o] += srcRGB[c + 1] * d; Bc[o] += srcRGB[c + 2] * d; }
        else { R[o] += SEEDC[0] * d; G[o] += SEEDC[1] * d; Bc[o] += SEEDC[2] * d; }
      }
    }
    // keep the weights in proportion: their size is the luminance's (only their direction is drawn)
    for (let i = 0; i < nc; i++) {
      const m = Math.max(R[i], G[i], Bc[i]);
      if (m > 2) { const k = 2 / m; R[i] *= k; G[i] *= k; Bc[i] *= k; }
    }
  };

  /** A point of the synthetic signal's curve: closed around (cx, cy) or a line across the frame. */
  const signal = (u: number, tau: number, n: number) => {
    // harmonics n, 2n − 1, 3n + 1 with slowly changing weights and drifting phases
    const a1 = 0.6 + 0.4 * osc(8, tau), a2 = 0.35 + 0.3 * osc(9, tau), a3 = 0.2 + 0.2 * osc(10, tau);
    return (a1 * Math.sin(n * u + 0.9 * tau) + a2 * Math.sin((2 * n - 1) * u - 1.3 * tau + 1) + a3 * Math.sin((3 * n + 1) * u + 0.7 * tau + 2)) / 1.15;
  };

  const F2 = new Float64Array(2);
  /** With a mirror on, a point moved into the region the fold keeps (seeds drawn there survive it). */
  const fold = (x: number, y: number) => {
    F2[0] = x; F2[1] = y;
    if (mirrorMode === 'lados') F2[0] = Math.abs(x);
    else if (mirrorMode === 'cuatro') { F2[0] = Math.abs(x); F2[1] = Math.abs(y); }
    else if (mirrorMode !== 'no') {
      const wedge = Math.PI / (mirrorMode === 'seis' ? 3 : 4), r = Math.sqrt(x * x + y * y);
      let a = Math.atan2(y, x);
      a -= 2 * wedge * Math.floor(a / (2 * wedge));
      if (a > wedge) a = 2 * wedge - a;
      F2[0] = r * Math.cos(a); F2[1] = r * Math.sin(a);
    }
    return F2;
  };

  /** Inside a regular polygon (centre, radius, angle, sides): signed distance to its outline (< 0 inside). */
  const polyDist = (x: number, y: number, pcx: number, pcy: number, R: number, ang: number, n: number) => {
    const dx = x - pcx, dy = y - pcy, r = Math.sqrt(dx * dx + dy * dy);
    const sec = (2 * Math.PI) / n;
    let a = Math.atan2(dy, dx) - ang;
    a -= sec * Math.floor(a / sec);
    return r * Math.cos(a - sec / 2) - R * Math.cos(Math.PI / n);
  };

  /** The textured polygon: its interior shows the whole frame (from tmp), turned and shrunk into it. */
  const copyInto = (pcx: number, pcy: number, R: number, ang: number, n: number, texAng: number) => {
    const ct = Math.cos(texAng), st = Math.sin(texAng);
    const zoomIn = 0.5 / R, mix = Math.min(0.92, 0.85 * p.amount + 0.1);
    const x0 = Math.max(0, Math.floor(bx(pcx - R) - 1)), x1 = Math.min(bw - 1, Math.ceil(bx(pcx + R) + 1));
    const y0 = Math.max(0, Math.floor(by(pcy + R) - 1)), y1 = Math.min(bh - 1, Math.ceil(by(pcy - R) + 1));
    for (let y = y0; y <= y1; y++) {
      const yy = 0.5 - (y + 0.5) / bh;
      for (let x = x0; x <= x1; x++) {
        const xx = ((x + 0.5) / bw) * 2 - 1;
        const d = polyDist(xx, yy, pcx, pcy, R, ang, n);
        if (d > 0.5 / bh) continue;
        const cover = d < -0.5 / bh ? 1 : 0.5 - d * bh;
        const lx = (xx - pcx) * zoomIn, ly = (yy - pcy) * zoomIn;
        const sx = ct * lx - st * ly, sy = st * lx + ct * ly;
        const v = sampleWrap(tmp, bw, bh, bx(sx) - 0.5, by(sy) - 0.5);
        const i = y * bw + x;
        B[i] += (v - B[i]) * mix * cover;
      }
    }
  };

  const polygon = (pcx: number, pcy: number, R: number, ang: number, n: number, amp: number, wd: number) => {
    let px0 = bx(pcx + R * Math.cos(ang)), py0 = by(pcy + R * Math.sin(ang));
    for (let k = 1; k <= n; k++) {
      const a = ang + (k * 2 * Math.PI) / n;
      const px1 = bx(pcx + R * Math.cos(a)), py1 = by(pcy + R * Math.sin(a));
      buf.line(px0, py0, px1, py1, wd, amp);
      px0 = px1; py0 = py1;
    }
  };

  /** The seed «Trama»: n gratings (quasi-periodic for 5 and 7), drifting and turning; returns its opacity. */
  const tramaPattern = (tau: number, beat: number) => {
    const n = p.sides, amp = p.amount * (1 - p.pulse * 0.75 + 1.25 * beat);
    const k = 13 + 4 * osc(11, tau), turn = 0.05 * tau + 0.6 * osc(12, tau);
    for (let g = 0; g < n; g++) { const a = turn + (g * Math.PI) / n; gC[g] = Math.cos(a) * k; gS[g] = Math.sin(a) * k; gP[g] = 0.7 * tau * (g % 2 ? 1 : -1); }
    for (let y = 0; y < qh; y++) {
      const yy = 0.5 - (y + 0.5) / qh;
      for (let x = 0; x < qw; x++) {
        const xx = ((x + 0.5) / qw) * 2 - 1;
        let sum = 0;
        for (let g = 0; g < n; g++) sum += Math.cos(gC[g] * xx + gS[g] * yy + gP[g]);
        sum /= n;
        const v = sum < 0.25 ? 0 : sum > 0.75 ? 1 : (sum - 0.25) * 2;
        pat[y * qw + x] = v * v * (3 - 2 * v);
      }
    }
    return 0.07 * amp;
  };
  const gC = new Float64Array(8), gS = new Float64Array(8), gP = new Float64Array(8);

  const seeds = (tau: number, beat: number, cx: number, cy: number) => {
    const amp = p.amount * (1 - p.pulse * 0.75 + 1.25 * beat);
    if (amp <= 0) return;
    // «Intermitencia»: curves and polygons drawn every few steps leave separate copies instead of a smear
    const every = 1 + Math.round(p.strobe * 7);
    if (steps % every !== 0 && p.seed !== 'puntos') return;
    const n = p.sides;
    const wd = 1.6 * SS;
    // «Fuente» is fed in the warp pass; with no picture or letters (patterns as the source) it draws the wave
    const seed = p.seed === 'fuente' ? (colourOn && src ? '' : 'onda') : p.seed;
    switch (seed) {
      case 'onda': {
        const R0 = (0.16 + 0.05 * osc(11, tau)) * (1 + 0.35 * beat);
        const M = 120;
        fold(cx, cy); cx = F2[0]; cy = F2[1];
        let px0 = 0, py0 = 0;
        for (let k = 0; k <= M; k++) {
          const u = (k / M) * Math.PI * 2, r = R0 * (1 + 0.32 * signal(u, tau, n));
          const px1 = bx(cx + r * Math.cos(u)), py1 = by(cy + r * Math.sin(u));
          if (k) buf.line(px0, py0, px1, py1, wd, Math.min(1, amp));
          px0 = px1; py0 = py1;
        }
        break;
      }
      case 'linea': {
        const M = 160, tilt = 0.18 * osc(11, tau), y0 = cy + 0.1 * osc(12, tau), A = 0.07 * (1 + 0.8 * beat);
        let px0 = 0, py0 = 0;
        for (let k = 0; k <= M; k++) {
          const x = -1 + (2 * k) / M;
          const y = y0 + tilt * x + A * signal(x * Math.PI, tau, n);
          const px1 = bx(x), py1 = by(y);
          if (k) buf.line(px0, py0, px1, py1, wd, Math.min(1, amp));
          px0 = px1; py0 = py1;
        }
        break;
      }
      case 'poligono':
      case 'copia': {
        // two polygons go round the centre on opposite sides, turning and breathing
        const orb = 0.2 * tau + 1.5 * osc(13, tau), rho = 0.3 + 0.1 * osc(14, tau);
        const texAng = 0.6 * osc(17, tau) + 0.2 * tau;
        if (seed === 'copia') tmp.set(B);
        for (let q = 0; q < 2; q++) {
          const a = orb + q * Math.PI, rr = q ? rho * 0.75 : rho;
          fold(rr * Math.cos(a), 0.6 * rr * Math.sin(a));
          const pcx = F2[0], pcy = F2[1];
          const R = (q ? 0.65 : 1) * (0.19 + 0.05 * osc(15, tau)) * (1 + 0.25 * beat);
          const ang = (q ? -1.3 : 1) * (0.35 * tau + 2 * osc(16, tau));
          if (seed === 'copia') copyInto(pcx, pcy, R, ang, n, q ? -texAng : texAng);
          polygon(pcx, pcy, R, ang, n, Math.min(1, amp * (q ? 0.8 : 1)), wd * (q ? 1 : 1.2));
        }
        break;
      }
      case 'puntos': {
        // dots at random places: a steady trickle, a burst on each beat
        const rate = (2 + n) * (0.35 + 2.5 * beat) * p.amount;
        let count = Math.floor(rate) + (rng.next() < rate - Math.floor(rate) ? 1 : 0);
        count = Math.min(24, count);
        for (let k = 0; k < count; k++) {
          const r = rng.range(1.2, 2.6) * SS;
          fold(rng.range(-0.86, 0.86), rng.range(-0.46, 0.46));
          buf.splat(bx(F2[0]), by(F2[1]), r, 0.9, true);
        }
        for (let i = 0; i < nb; i++) if (B[i] > 1) B[i] = 1;
        break;
      }
    }
  };

  // ---- render: 2 × 2 average, optional mirrored echo, contrast curve
  const render = (out: Uint8Array) => {
    const gamma = Math.pow(2, (p.contrast - 0.5) * 2.2);
    const echo = p.echo, ex = echo === 'h' || echo === 'hv', ey = echo === 'v' || echo === 'hv';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = 2 * y * bw + 2 * x;
        let v = 0.25 * (B[o] + B[o + 1] + B[o + bw] + B[o + bw + 1]);
        if (echo !== 'no') {
          const xm = ex ? w - 1 - x : x, ym = ey ? h - 1 - y : y;
          const q = 2 * ym * bw + 2 * xm;
          v = 0.5 * v + 0.5 * 0.25 * (B[q] + B[q + 1] + B[q + bw] + B[q + bw + 1]);
        }
        out[y * w + x] = byte(gamma === 1 ? v : Math.pow(v, gamma));
      }
    }
  };

  /** Version 2: each raster pixel's colour (the direction of its rgb weights, at full value), with the echo. */
  const renderColour = (out: Uint8Array) => {
    const R = CR!, G = CG!, Bc = CB!;
    const echo = p.echo, ex = echo === 'h' || echo === 'hv', ey = echo === 'v' || echo === 'hv';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let r = R[i], g = G[i], b = Bc[i];
        if (echo !== 'no') { const j = (ey ? h - 1 - y : y) * w + (ex ? w - 1 - x : x); r = 0.5 * (r + R[j]); g = 0.5 * (g + G[j]); b = 0.5 * (b + Bc[j]); }
        const m = Math.max(r, g, b), o = i * 3;
        if (m < 1e-4) { out[o] = out[o + 1] = out[o + 2] = 255; continue; }
        out[o] = Math.round((255 * r) / m); out[o + 1] = Math.round((255 * g) / m); out[o + 2] = Math.round((255 * b) / m);
      }
    }
  };

  return {
    w, h,
    get steps() { return steps; },
    setParams(np: Params) { p = read(np); if (p.mirror !== mirrorMode) buildMirror(); },
    step(k: number) { for (let i = 0; i < k; i++) step1(); },
    render(out: Uint8Array) { render(out); },
    ...(colourOn ? { renderColor(out: Uint8Array) { renderColour(out); } } : {}),
    feed(f: SourceFeed | null) { takeFeed(f); },
    stroke(s: Stroke) {
      // a stroke drawn into the loop: it comes back transformed, again and again
      const r = Math.max(1.2 * SS, s.r * bh * 0.6);
      buf.line(bx(s.x0), by(s.y0), bx(s.x1), by(s.y1), r, Math.max(0, Math.min(1, s.strength)));
    },
    snapshot(): ModelState {
      const scalars: Record<string, number> = {};
      rng.save(scalars);
      return { id: ID, v: ver, steps, res: h, scalars, arrays: colourOn ? { B: B.slice(), CR: CR!.slice(), CG: CG!.slice(), CB: CB!.slice() } : { B: B.slice() } };
    },
    restore(s: ModelState) {
      if (s.id !== ID || s.res !== h) throw new Error('El estado guardado no corresponde a estos ecos.');
      const a = s.arrays.B;
      if (!(a instanceof Float32Array) || a.length !== nb) throw new Error('El estado guardado está incompleto.');
      B.set(a);
      if (colourOn) {
        // a state saved without colour (version 1) starts its colour from nothing
        for (const [k, C] of [['CR', CR!], ['CG', CG!], ['CB', CB!]] as const) {
          const c = s.arrays[k];
          if (c instanceof Float32Array && c.length === nc) C.set(c); else C.fill(0);
        }
      }
      steps = s.steps;
      rng.load(s.scalars);
    },
  };
}
