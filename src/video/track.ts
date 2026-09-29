/**
 * Object tracking on video (research.md §2.3, the design that works without WebGPU):
 *
 *   1. keyframes every `keyEvery` s (plus the first and last frame, plus corrections): the point-prompted model
 *      (src/cutout selectObject, EdgeTAM) decodes the object there, prompted from the mask the flow expects —
 *      its box expanded 15 %, positive points at distance-transform maxima inside, negative points just outside
 *      (keys.ts promptsFrom) — in three prompt variants; the candidate that overlaps the expected mask best wins
 *      (not the model's own score). When none overlaps enough, or it is much smaller than expected, the object is
 *      taken as hidden: the carried mask is kept and the frame is marked «oculto»;
 *   2. between keyframes: dense optical flow on luma (flow-gl.ts on WebGL2, flow.ts on the CPU) at about ¼ of the
 *      frame; the mask is carried forward from the keyframe before and backward from the keyframe after with the
 *      object's motion fitted to the flow inside it, and the two are blended by their signed distances (sdf.ts),
 *      weighted by how close the frame is to each keyframe;
 *   3. the result is a raster mask part {origin: 'track', frames: [{t, media}]}: one greyscale PNG per frame in
 *      the media store, at the mask working size (≤ 480 px: a few KB each, decoded by the compositor like any
 *      mask). Keyframes are marked in the file names (keys.ts frameName), so a correction after reopening the
 *      project still knows them;
 *   4. correctTrack: new points on one frame make it a keyframe and recompute only the frames between the keyframes
 *      around it.
 *
 * Everything is in the layer's frame space (the output frame before the layer's transform), where the video is
 * placed with the fit of the layer that shows it: masks, points and flow line up with what the compositor draws.
 *
 * Extension point: a WebGPU memory-attention tracker (SAM 2 / EdgeTAM video graphs, research.md §2.2) cannot be
 * tested on this project's machines (no GPU) and is not shipped. It would implement `Segmenter.propagate` (a mask
 * per frame from the previous ones) and replace steps 1–2 when present; see setTrackSegmenter.
 */
import { sourceFit } from '../project/compositor';
import { fitRect } from '../project/adjust';
import { sourceTime } from '../project/evaluate';
import { FRAME_EPS, keepBlob, openPreviewVideo, storeBlob, type BlobResolver } from '../project/sources';
import type { MediaRef } from '../engine/recipe';
import type { MaskRasterPart, Project, Source } from '../project/types';
import { put } from '../studio/mediaStore';
import { carryMask, flow as cpuFlow, lumaOf, type FlowField, type Luma } from './flow';
import { glFlow } from './flow-gl';
import type { TrackOptions } from './index';
import {
  chooseCandidate, frameName, keyframeIndices, keysOfFrames, keyStep, nearestIndex, promptsFrom, promptVariants, roleOf, stretchAround, trackTimes,
  type FrameRole, type Prompt,
} from './keys';
import { abortError, etaText } from './movie';
import { blendMasks } from './sdf';

/* ------------------------------------------------------------------ segmenter (the model) */

export interface SegFrame {
  /** Size of the picture the prompts are given in. */
  readonly w: number;
  readonly h: number;
  /** The object's mask for a prompt (0..1 coverage at w×h), or null when the model finds nothing. */
  mask(p: Prompt): Promise<Float32Array | null>;
  dispose(): void;
}

export interface Segmenter {
  /** A frame ready to be prompted (the model encodes it once). */
  open(frame: HTMLCanvasElement, job: { signal?: AbortSignal }): Promise<SegFrame>;
  /** Extension point (not shipped): memory-attention propagation, a mask per frame from the previous ones. */
  propagate?: never;
  /** Frees the model's resources when tracking ends (optional). */
  release?(): void;
}

let custom: Segmenter | null = null;

/** Replaces the model (tests, QA, a future memory tracker); null goes back to src/cutout's point selection. */
export function setTrackSegmenter(s: Segmenter | null): void { custom = s; }

const cutoutSegmenter: Segmenter = {
  async open(frame, job) {
    const cut = await import('../cutout');
    const s = await cut.selectObject(frame, { signal: job.signal });
    return {
      w: s.w, h: s.h,
      async mask(p) {
        const m = await s.mask(p.points, p.box);
        let any = false;
        const out = new Float32Array(m.w * m.h);
        for (let i = 0; i < out.length; i++) { const v = m.alpha[i] / 255; out[i] = v; if (v >= 0.5) any = true; }
        return any ? out : null;
      },
      dispose: () => s.dispose(),
    };
  },
};

/* ------------------------------------------------------------------ sizes and frames */

/** Longest side of stored masks and of the flow (¼ of 1080p; smaller frames keep their size). */
export const MASK_SIDE = 480;
/** Longest side of the frames the model sees (it works at 1024² inside). */
export const SEG_SIDE = 1024;

export interface Geometry {
  /** Mask / flow size, frame space. */
  w: number;
  h: number;
  /** Where the video sits in that frame (fit of the layer that shows it). */
  place: { x: number; y: number; w: number; h: number };
  /** Model frame size. */
  sw: number;
  sh: number;
  splace: { x: number; y: number; w: number; h: number };
}

export function geometry(p: Project, s: Source): Geometry {
  const k = Math.min(1, MASK_SIDE / Math.max(p.canvas.w, p.canvas.h));
  const w = Math.max(16, Math.round(p.canvas.w * k)), h = Math.max(16, Math.round(p.canvas.h * k));
  const ks = Math.min(1, SEG_SIDE / Math.max(p.canvas.w, p.canvas.h));
  const sw = Math.max(16, Math.round(p.canvas.w * ks)), sh = Math.max(16, Math.round(p.canvas.h * ks));
  const fit = sourceFit(p, s.id);
  return { w, h, place: fitRect(s.w, s.h, w, h, fit), sw, sh, splace: fitRect(s.w, s.h, sw, sh, fit) };
}

interface Reader {
  /** The frames at these source times, in order (canvases reused: draw them before asking the next). */
  frames(times: number[]): AsyncGenerator<CanvasImageSource | null>;
  close(): void;
}

/** Decoded frames of a video source: mediabunny in order when WebCodecs decodes it, else a seeked video element. */
async function openReader(s: Source, blobOf: BlobResolver): Promise<Reader> {
  const ref = s.media[0];
  const got = ref?.id ? await blobOf(ref.id) : null;
  if (!got) throw new Error(`Falta el video «${s.name}» en este navegador.`);
  const blob = got.blob;
  if (typeof VideoDecoder !== 'undefined') {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack().catch(() => null);
    if (track && (await track.canDecode().catch(() => false))) {
      const [dw, dh, first] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight(), track.getFirstTimestamp()]);
      const k = Math.min(1, 1280 / Math.max(dw, dh));
      const sink = new mb.CanvasSink(track, { width: Math.max(1, Math.round(dw * k)), height: Math.max(1, Math.round(dh * k)), fit: 'fill', poolSize: 2 });
      return {
        async *frames(times) {
          for await (const wc of sink.canvasesAtTimestamps(times.map(t => first + Math.max(0, t) + FRAME_EPS))) yield (wc?.canvas as CanvasImageSource) ?? null;
        },
        close: () => input.dispose(),
      };
    }
    input.dispose();
  }
  const vp = await openPreviewVideo(blob, 1280);
  if (!vp) throw new Error(`Este navegador no puede leer los cuadros de «${s.name}».`);
  return {
    async *frames(times) { for (const t of times) yield (await vp.seek(t)) ? vp.canvas : null; },
    close: () => vp.close(),
  };
}

/** Draws a video frame into frame space (the fitted place, nothing around it). */
function place(c: HTMLCanvasElement, img: CanvasImageSource, r: { x: number; y: number; w: number; h: number }) {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#000';
  x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, r.x, r.y, r.w, r.h);
  return x;
}

/** A 0..1 mask resampled to another size (bilinear, through a canvas). */
function resizeMask(m: Float32Array, w: number, h: number, W: number, H: number): Float32Array {
  if (w === W && h === H) return m;
  const a = document.createElement('canvas');
  a.width = w; a.height = h;
  const ax = a.getContext('2d')!;
  const img = ax.createImageData(w, h);
  for (let i = 0; i < m.length; i++) { const v = Math.round(m[i] * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ax.putImageData(img, 0, 0);
  const b = document.createElement('canvas');
  b.width = W; b.height = H;
  const bx = b.getContext('2d', { willReadFrequently: true })!;
  bx.imageSmoothingEnabled = true;
  bx.imageSmoothingQuality = 'high';
  bx.drawImage(a, 0, 0, W, H);
  const d = bx.getImageData(0, 0, W, H).data;
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  a.width = a.height = b.width = b.height = 0;
  return out;
}

/* ------------------------------------------------------------------ mask files */

async function maskBlob(m: Float32Array, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let i = 0; i < m.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, m[i])) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const b = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
  c.width = c.height = 0;
  if (!b) throw new Error('No se pudo guardar la máscara de un cuadro.');
  return b;
}

/** Stores a mask PNG (media store when it fits, this tab otherwise) and returns its reference. */
async function storeMask(m: Float32Array, w: number, h: number, name: string): Promise<MediaRef> {
  const blob = await maskBlob(m, w, h);
  const r = await put(blob, { kind: 'image', name, w, h });
  keepBlob(r.id, blob, name);
  return { id: r.id, kind: 'image', name, type: 'image/png', size: blob.size, w, h };
}

/** For matte.ts: the same frame reader and mask storage. */
export const loadStretchReader = openReader;
export const storeMaskFrame = storeMask;

/** A stored mask back as 0..1 coverage at w×h. */
async function loadMask(ref: MediaRef, w: number, h: number, blobOf: BlobResolver): Promise<Float32Array | null> {
  const got = ref.id ? await blobOf(ref.id) : null;
  if (!got) return null;
  const bmp = await createImageBitmap(got.blob);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const d = x.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  c.width = c.height = 0;
  return out;
}

/* ------------------------------------------------------------------ flow */

let glBroken = false;
/** Dense flow a → b on WebGL2 when it works here, else on the CPU (same maths, flow.ts). */
export function computeFlow(a: Luma, b: Luma): { f: FlowField; backend: 'gl' | 'cpu' } {
  if (!glBroken) {
    try {
      const f = glFlow(a, b);
      if (f) return { f, backend: 'gl' };
    } catch { glBroken = true; }
  }
  return { f: cpuFlow(a, b), backend: 'cpu' };
}

/* ------------------------------------------------------------------ stats and estimates */

export interface TrackStats {
  frames: number;
  keyframes: number;
  occluded: number;
  /** ms: decoding frames, flow (all frames, both directions), the model (encode + decodes), writing masks. */
  decodeMs: number;
  flowMs: number;
  modelMs: number;
  storeMs: number;
  totalMs: number;
  flowBackend: 'gl' | 'cpu' | '';
  /** IoU of the chosen candidate with the carried mask, per keyframe (tracking confidence). */
  keyIoU: number[];
}

let last: TrackStats | null = null;
export const lastTrackStats = () => last;

/** Measured on this project's test machine (WASM, 2 threads; report-cutout.md): encode ≈1.2–4.2 s, decode ≈0.16–0.5 s. */
export function trackEstimate(p: Project, o: Pick<TrackOptions, 'start' | 'end' | 'keyEvery'>): { frames: number; keyframes: number; seconds: [number, number]; text: string } {
  const fps = p.time.fps || 30;
  const n = trackTimes(o.start, o.end, fps).length;
  const keys = keyframeIndices(n, keyStep(o.keyEvery ?? 0.5, fps)).length;
  const lo = keys * (1.2 + 3 * 0.16) + n * 0.03, hi = keys * (4.2 + 3 * 0.5) + n * 0.12;
  return { frames: n, keyframes: keys, seconds: [lo, hi], text: `${n} cuadros, ${keys} con el modelo: entre ${etaText(lo)} y ${etaText(hi)} en un equipo como el de prueba (sin WebGPU); con WebGPU, bastante menos.` };
}

/* ------------------------------------------------------------------ the tracker */

interface Ctx {
  p: Project;
  s: Source;
  g: Geometry;
  blob: BlobResolver;
  seg: Segmenter;
  times: number[];
  signal?: AbortSignal;
  stats: TrackStats;
  progress: (done: number, label: string) => void;
}

const check = (s?: AbortSignal) => { if (s?.aborted) throw abortError(); };

/** Luma (mask size) and, for keyframes, the model frame, of frames [a, b] of the stretch, in order. */
async function readStretch(c: Ctx, reader: Reader, idx: number[], keys: Set<number>): Promise<Map<number, { luma: Luma; seg: HTMLCanvasElement | null }>> {
  const out = new Map<number, { luma: Luma; seg: HTMLCanvasElement | null }>();
  const t0 = performance.now();
  const mc = document.createElement('canvas');
  mc.width = c.g.w; mc.height = c.g.h;
  let j = 0;
  for await (const img of reader.frames(idx.map(i => sourceTime(c.s, c.times[i])))) {
    check(c.signal);
    const i = idx[j++];
    if (!img) continue;
    const x = place(mc, img, c.g.place);
    const luma = lumaOf(x.getImageData(0, 0, c.g.w, c.g.h).data, c.g.w, c.g.h);
    let seg: HTMLCanvasElement | null = null;
    if (keys.has(i)) {
      seg = document.createElement('canvas');
      seg.width = c.g.sw; seg.height = c.g.sh;
      place(seg, img, c.g.splace);
    }
    out.set(i, { luma, seg });
    if (j >= idx.length) break;
  }
  mc.width = mc.height = 0;
  c.stats.decodeMs += performance.now() - t0;
  return out;
}

/** The model on one keyframe, prompted from the expected mask (or the person's prompt); null = nothing found. */
async function decodeKey(c: Ctx, frame: HTMLCanvasElement, expected: Float32Array | null, user: Prompt | null): Promise<{ mask: Float32Array; occluded: boolean; iou: number } | null> {
  const t0 = performance.now();
  const sx = c.g.sw / c.g.w, sy = c.g.sh / c.g.h;
  const toSeg = (pr: Prompt): Prompt => ({
    points: pr.points.map(q => ({ x: q.x * sx, y: q.y * sy, positive: q.positive })),
    ...(pr.box ? { box: { x: pr.box.x * sx, y: pr.box.y * sy, w: pr.box.w * sx, h: pr.box.h * sy } } : {}),
  });
  let variants: Prompt[];
  if (user) {
    variants = [user];
    const fromMask = expected ? promptsFrom(expected, c.g.w, c.g.h) : null;
    if (fromMask && user.points.length) variants.push({ points: user.points, box: fromMask.box });
  } else {
    const pr = expected ? promptsFrom(expected, c.g.w, c.g.h) : null;
    if (!pr) return null;
    variants = promptVariants(pr);
  }
  const sf = await c.seg.open(frame, { signal: c.signal });
  const cands: Float32Array[] = [];
  try {
    for (const v of variants) {
      check(c.signal);
      const m = await sf.mask(toSeg(v));
      if (m) cands.push(resizeMask(m, sf.w, sf.h, c.g.w, c.g.h));
    }
  } finally { sf.dispose(); }
  c.stats.modelMs += performance.now() - t0;
  if (!cands.length) return null;
  if (user) {
    // the person's own prompt decides; the expected mask only breaks ties between the variants
    const ch = expected ? chooseCandidate(cands, expected, { minIoU: 0, minArea: 0 }) : { index: 0, iou: 1 };
    return { mask: cands[Math.max(0, ch.index)], occluded: false, iou: ch.iou };
  }
  const ch = chooseCandidate(cands, expected!);
  if (ch.index < 0) return null;
  return { mask: cands[ch.index], occluded: ch.occluded, iou: ch.iou };
}

function timeFlow(c: Ctx, a: Luma, b: Luma): FlowField {
  const t0 = performance.now();
  const r = computeFlow(a, b);
  c.stats.flowBackend = r.backend;
  c.stats.flowMs += performance.now() - t0;
  return r.f;
}

/**
 * Fills the frames strictly between keyframes a and b: forward carry from mA, backward carry from mB, blended by
 * their signed distances. Returns the masks of a+1 … b−1.
 */
function fillBetween(c: Ctx, a: number, b: number, mA: Float32Array, mB: Float32Array, luma: Map<number, { luma: Luma }>): Map<number, Float32Array> {
  const out = new Map<number, Float32Array>();
  if (b - a < 2) return out;
  const fwd = new Map<number, Float32Array>();
  let cur = mA;
  for (let j = a + 1; j < b; j++) {
    const la = luma.get(j - 1)?.luma, lb = luma.get(j)?.luma;
    if (la && lb) cur = carryMask(cur, timeFlow(c, la, lb)).mask;
    fwd.set(j, cur);
  }
  cur = mB;
  for (let j = b - 1; j > a; j--) {
    const la = luma.get(j + 1)?.luma, lb = luma.get(j)?.luma;
    if (la && lb) cur = carryMask(cur, timeFlow(c, la, lb)).mask;
    out.set(j, blendMasks(fwd.get(j)!, cur, c.g.w, c.g.h, (j - a) / (b - a)));
  }
  return out;
}

/** Carries a mask from frame a to frame b (forward) along the flow; the expected mask at b. */
function carryTo(c: Ctx, a: number, b: number, m: Float32Array, luma: Map<number, { luma: Luma }>): Float32Array {
  let cur = m;
  for (let j = a + 1; j <= b; j++) {
    const la = luma.get(j - 1)?.luma, lb = luma.get(j)?.luma;
    if (la && lb) cur = carryMask(cur, timeFlow(c, la, lb)).mask;
  }
  return cur;
}

function newStats(): TrackStats {
  return { frames: 0, keyframes: 0, occluded: 0, decodeMs: 0, flowMs: 0, modelMs: 0, storeMs: 0, totalMs: 0, flowBackend: '', keyIoU: [] };
}

function contextFor(p: Project, o: Pick<TrackOptions, 'source' | 'onProgress' | 'signal'>, times: number[], blob: BlobResolver): Ctx {
  const s = p.sources.find(x => x.id === o.source);
  if (!s || s.kind !== 'video') throw new Error('Elige un video para seguir el objeto.');
  const g = geometry(p, s);
  const stats = newStats();
  const t0 = performance.now();
  return {
    p, s, g, blob, seg: custom ?? cutoutSegmenter, times, signal: o.signal, stats,
    progress: (done, label) => {
      const el = (performance.now() - t0) / 1000;
      const eta = done > 0 && done < times.length ? etaText((el / done) * (times.length - done)) : '';
      o.onProgress?.({ done, total: times.length, label: `${label}${eta ? ` · quedan ${eta}` : ''}` });
    },
  };
}

/** The person's prompt (frame units) in mask pixels. */
function userPrompt(g: Geometry, points: TrackOptions['points'], box?: TrackOptions['box']): Prompt {
  return {
    points: points.map(q => ({ x: q.x * g.w, y: q.y * g.h, positive: q.positive })),
    ...(box ? { box: { x: box.x * g.w, y: box.y * g.h, w: box.w * g.w, h: box.h * g.h } } : {}),
  };
}

export async function trackObjectImpl(p: Project, o: TrackOptions & { blob?: BlobResolver }): Promise<MaskRasterPart> {
  const blob = o.blob ?? storeBlob;
  const fps = p.time.fps || 30;
  const times = trackTimes(o.start, o.end, fps);
  const c = contextFor(p, o, times, blob);
  if (!o.points.length && !o.box) throw new Error('Marca el objeto con al menos un punto o un recuadro.');
  const n = times.length;
  const keys = keyframeIndices(n, keyStep(o.keyEvery ?? 0.5, fps));
  const t0 = performance.now();
  const reader = await openReader(c.s, blob);
  const refs: Array<MediaRef | null> = new Array(n).fill(null);
  const roles: FrameRole[] = new Array(n).fill('');
  try {
    c.progress(0, 'Preparando el modelo…');
    // stretch by stretch, from one keyframe to the next: never more than one stretch of frames in memory
    let prevMask: Float32Array | null = null;
    for (let k = 0; k < keys.length; k++) {
      const a = k > 0 ? keys[k - 1] : 0, b = keys[k];
      const idx: number[] = [];
      for (let i = a; i <= b; i++) idx.push(i);
      const frames = await readStretch(c, reader, idx, new Set([b]));
      const fb = frames.get(b);
      if (!fb?.seg) throw new Error('No se pudo leer un cuadro del video.');
      let mB: Float32Array;
      let role: FrameRole = 'clave';
      if (k === 0) {
        const r = await decodeKey(c, fb.seg, null, userPrompt(c.g, o.points, o.box));
        if (!r) throw new Error('El modelo no encontró un objeto en esos puntos: prueba con otro punto o un recuadro.');
        mB = r.mask;
      } else {
        const expected = carryTo(c, a, b, prevMask!, frames);
        const r = await decodeKey(c, fb.seg, expected, null);
        if (!r || r.occluded) { mB = expected; role = 'oculto'; c.stats.occluded++; }
        else mB = r.mask;
        c.stats.keyIoU.push(r ? Math.round(r.iou * 1000) / 1000 : 0);
        const between = fillBetween(c, a, b, prevMask!, mB, frames);
        const ts = performance.now();
        for (const [j, m] of between) refs[j] = await storeMask(m, c.g.w, c.g.h, frameName(j, ''));
        c.stats.storeMs += performance.now() - ts;
      }
      c.stats.keyframes++;
      const ts = performance.now();
      refs[b] = await storeMask(mB, c.g.w, c.g.h, frameName(b, role));
      roles[b] = role;
      c.stats.storeMs += performance.now() - ts;
      prevMask = mB;
      for (const f of frames.values()) if (f.seg) f.seg.width = f.seg.height = 0;
      c.progress(b + 1, `Siguiendo el objeto: cuadro ${b + 1} de ${n}`);
    }
  } finally {
    reader.close();
    c.seg.release?.();
    c.stats.frames = n;
    c.stats.totalMs = performance.now() - t0;
    last = c.stats;
  }
  const frames = refs.map((m, i) => ({ t: times[i], media: m! }));
  return {
    kind: 'raster', op: 'add', media: frames[0].media, frames, interp: true, soft: 0.5, alpha: 1, origin: 'track',
    points: o.points.map(q => ({ ...q })),
  };
}

export async function correctTrackImpl(
  p: Project, part: MaskRasterPart, at: { t: number; points: TrackOptions['points'] },
  o: Pick<TrackOptions, 'source' | 'layer' | 'onProgress' | 'signal'> & { blob?: BlobResolver },
): Promise<MaskRasterPart> {
  const blob = o.blob ?? storeBlob;
  const frames = part.frames ?? [];
  if (frames.length < 2) throw new Error('Esta máscara no viene de un seguimiento.');
  if (!at.points.length) throw new Error('Marca el objeto con al menos un punto en ese cuadro.');
  const times = frames.map(f => f.t);
  const c = contextFor(p, o, times, blob);
  const t0 = performance.now();
  const ci = nearestIndex(times, at.t);
  const keys = keysOfFrames(frames);
  if (!keys.includes(frames.length - 1)) keys.push(frames.length - 1);
  const { prev, next } = stretchAround(keys, ci);
  const a = prev ?? ci, b = next ?? ci;
  const reader = await openReader(c.s, blob);
  const out = frames.map(f => ({ t: f.t, media: f.media }));
  try {
    c.progress(0, 'Corrigiendo el cuadro…');
    const idx: number[] = [];
    for (let i = a; i <= b; i++) idx.push(i);
    const lumas = await readStretch(c, reader, idx, new Set([ci]));
    const fc = lumas.get(ci);
    if (!fc?.seg) throw new Error('No se pudo leer ese cuadro del video.');
    const current = await loadMask(frames[ci].media, c.g.w, c.g.h, blob);
    const r = await decodeKey(c, fc.seg, current, userPrompt(c.g, at.points));
    if (!r) throw new Error('El modelo no encontró un objeto en esos puntos: prueba con otro punto.');
    c.stats.keyframes++;
    const ts = performance.now();
    out[ci] = { t: times[ci], media: await storeMask(r.mask, c.g.w, c.g.h, frameName(ci, 'correccion')) };
    c.stats.storeMs += performance.now() - ts;
    // the stretches on both sides, between the keyframes around the corrected one
    if (prev !== null) {
      const mA = await loadMask(frames[prev].media, c.g.w, c.g.h, blob);
      if (mA) for (const [j, m] of fillBetween(c, prev, ci, mA, r.mask, lumas)) out[j] = { t: times[j], media: await storeMask(m, c.g.w, c.g.h, frameName(j, '')) };
    }
    if (next !== null) {
      const mB = await loadMask(frames[next].media, c.g.w, c.g.h, blob);
      if (mB) for (const [j, m] of fillBetween(c, ci, next, r.mask, mB, lumas)) out[j] = { t: times[j], media: await storeMask(m, c.g.w, c.g.h, frameName(j, roleOf(frames[j].media.name))) };
    }
    c.progress(times.length, 'Corrección lista');
  } finally {
    reader.close();
    c.seg.release?.();
    c.stats.frames = b - a + 1;
    c.stats.totalMs = performance.now() - t0;
    last = c.stats;
  }
  const pts = [...(part.points ?? [])];
  return { ...part, media: out[0].media, frames: out, points: pts };
}
