/**
 * Cutout: background removal and point-assisted object selection, entirely in the browser. CONTRACT for the
 * photo studio (src/foto) and the video editor: the signatures below are fixed; lane «cutout» fills in the
 * implementation (an ML worker with onnxruntime-web, matte refinement, model download and cache). Import this
 * module lazily (import('../cutout')): it is heavy only once a model is loaded.
 *
 * Promises the UI can rely on:
 *   - Photos and video frames never leave the device. Models are downloaded (never uploaded to) and only after
 *     the person agrees to the size shown by modelInfo(); the download is cached by content hash.
 *   - Every model listed has permissive licences for its code AND its weights (see MODELS[].licence).
 *   - Results are masks at the source's size: alpha 0..255, one byte per pixel.
 *
 * How it works:
 *   - models.ts   the registry: files pinned to a Hugging Face commit, sha256, size, licences, pre-processing;
 *   - caps.ts     device gating (WebGPU, threads, memory, phone) with the reasons in Spanish;
 *   - store.ts    download (same-origin mirror first when /models/manifest.json exists), sha256 verification,
 *                 Cache Storage keyed by hash, removal;
 *   - client.ts + ml.worker.ts   one module worker with onnxruntime-web (WebGPU EP, else WASM with threads when
 *                 crossOriginIsolated, else single-threaded WASM); cancelling a run terminates the worker;
 *   - refine.ts (+ gl.ts)   guided-filter upsampling, blur-fusion foreground colours, shift/feather, brushes;
 *   - choose.ts   which of the decoder's three masks to keep; suggest.ts   the model-free recommendation.
 */
import { detectEnv, gateModels, MB, threadCount, type DeviceEnv } from './caps';
import { chooseMask } from './choose';
import * as client from './client';
import { applyGuidedGL } from './gl';
import { MODELS, modelSpec, variantBytes, variantFiles, type ModelSpec, type ModelVariant } from './models';
import { readRGBA, sizeOf, toBitmap } from './pixels';
import type { DecodeResult, MatteResult, Timings } from './protocol';
import {
  applyGuided, colorMatte, combine, cutoutRGBA, featherMatte, guidedRefine, planGuided, shiftMatte, stampStroke, type BrushPoint,
} from './refine';
import * as store from './store';
import { CutoutError } from './store';
import { suggestFromRGBA, type CutoutSuggestion } from './suggest';

export type CutoutModelId =
  /** General subject cut-out (people, objects, pets): BiRefNet lite at 512². */
  | 'subject'
  /** Higher-detail edges (hair, fur) at 1024²; only where WebGPU is available. */
  | 'subject-hq'
  /** People only, small and fast: good on phones. */
  | 'portrait'
  /** Point/box-prompted segmentation (click to select an object). */
  | 'select';

export interface ModelInfo {
  id: CutoutModelId;
  /** Spanish name and one honest line («Recorta personas, objetos y animales…»). */
  name: string;
  blurb: string;
  /** Upstream project, code licence and weights licence, stated separately. */
  upstream: string;
  licence: { code: string; weights: string };
  /** Bytes to download for the backend this device would use. */
  bytes: number;
  backend: Backend;
  /** False when this device cannot run it (with the reason in Spanish). */
  available: boolean;
  why?: string;
  /** Available, but with a warning worth showing before the download (memory, time), in Spanish. */
  note?: string;
}

export type Backend = 'webgpu' | 'wasm-threads' | 'wasm';

export interface CutoutCaps {
  backend: Backend;
  webgpu: boolean;
  /** crossOriginIsolated: WASM threads available. */
  threads: boolean;
  /** navigator.deviceMemory when the browser tells it. */
  memoryGB?: number;
  phone: boolean;
  models: ModelInfo[];
}

export type ModelState = 'absent' | 'downloading' | 'cached' | 'loading' | 'ready' | 'error';

export interface Progress {
  /** 0..1, or null when unknown. */
  p: number | null;
  /** Spanish label of the step («Descargando modelo 42 MB de 98 MB», «Recortando…»). */
  label: string;
}

/** A single-channel mask at w × h (0 = transparent, 255 = opaque). */
export interface Matte {
  w: number;
  h: number;
  alpha: Uint8ClampedArray;
}

export interface RefineOptions {
  /** Edge softness in source px. */
  feather: number;
  /** Contract (-) or expand (+) the edge, in source px. */
  shift: number;
  /** Remove the old background's colour from semi-transparent edges, 0..1. */
  decontaminate: number;
  /** Keep fine hair/fur detail (guided-filter strength), 0..1. */
  detail: number;
}

export type Pixels = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement | ImageData;

export interface Job {
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

export { CutoutError } from './store';
export type { CutoutSuggestion } from './suggest';
export type { Timings } from './protocol';
export type { BrushPoint } from './refine';
export { MODELS } from './models';

/**
 * Refinement that leaves a fresh matte as it came out of removeBackground/selectObject: no feather, no shift,
 * no extra guided pass (the result is already guided at DETAIL_BUILT_IN), and most of the old background's colour
 * removed from soft edges (hair over a dark background turns grey on a light one without it).
 */
export const DEFAULT_REFINE: RefineOptions = { feather: 0, shift: 0, decontaminate: 0.8, detail: 0 };

/** Guided-filter strength used when a matte is upsampled to the source's size. */
export const DETAIL_BUILT_IN = 0.5;

/** The sentence every download dialog shows (with the model's name and size). */
export const CONSENT_TEXT = 'Tus fotos no se suben: el recorte ocurre en tu equipo. El modelo se descarga una vez desde Hugging Face y queda guardado en este navegador.';

/* ------------------------------------------------------------------ device and models */

let envP: Promise<DeviceEnv> | null = null;
let forceWasm = false;
const env = () => (envP ??= detectEnv(forceWasm));

/**
 * 'wasm' never uses WebGPU (e.g. when WebGPU misbehaves on a machine); 'auto' picks the best. Changing it
 * restarts the worker. The WASM builds are different files: they need their own download.
 */
export function setCutoutBackend(pref: 'auto' | 'wasm'): void {
  if ((pref === 'wasm') === forceWasm) return;
  forceWasm = pref === 'wasm';
  envP = null;
  client.kill();
}

/** What this device can run, and the models with their sizes (no download happens here). */
export async function cutoutCaps(): Promise<CutoutCaps> {
  const e = await env();
  return {
    backend: e.webgpu ? 'webgpu' : e.threads ? 'wasm-threads' : 'wasm',
    webgpu: e.webgpu,
    threads: e.threads,
    memoryGB: e.memoryGB,
    phone: e.phone,
    models: gateModels(e),
  };
}

async function modelInfo(id: CutoutModelId): Promise<ModelInfo> {
  const info = (await cutoutCaps()).models.find(m => m.id === id);
  if (!info) throw new CutoutError(`Modelo desconocido: ${id}`, 'unavailable');
  return info;
}

const variantFor = (spec: ModelSpec, info: ModelInfo): ModelVariant | undefined => (info.backend === 'webgpu' ? spec.webgpu : spec.wasm);

const downloading = new Set<CutoutModelId>();
const loading = new Set<CutoutModelId>();
const failed = new Set<CutoutModelId>();

export async function modelState(id: CutoutModelId): Promise<ModelState> {
  if (downloading.has(id)) return 'downloading';
  if (loading.has(id)) return 'loading';
  if (client.residentModel() === id) return 'ready';
  const info = await modelInfo(id);
  const v = variantFor(modelSpec(id), info);
  if (v) {
    let all = true;
    for (const f of variantFiles(v)) if (!(await store.hasFile(f))) { all = false; break; }
    if (all) return 'cached';
  }
  return failed.has(id) ? 'error' : 'absent';
}

/** What a download dialog needs: name, size for this device, where it comes from and the privacy sentence. */
export async function consentInfo(id: CutoutModelId): Promise<{ id: CutoutModelId; name: string; bytes: number; size: string; from: string; text: string; licence: string; note?: string; available: boolean; why?: string }> {
  const info = await modelInfo(id);
  const spec = modelSpec(id);
  const v = variantFor(spec, info);
  const mirrors = await store.mirror();
  const mirrored = !!v && variantFiles(v).every(f => mirrors.has(f.sha256));
  return {
    id,
    name: info.name,
    bytes: info.bytes,
    size: MB(info.bytes),
    from: mirrored ? 'este sitio' : 'Hugging Face',
    text: mirrored ? CONSENT_TEXT.replace('desde Hugging Face', 'desde este sitio') : CONSENT_TEXT,
    licence: `Código ${spec.licence.code}, pesos ${spec.licence.weights} · ${spec.upstream}`,
    note: info.note,
    available: info.available,
    why: info.why,
  };
}

/** Downloads (after the person agreed) and caches a model. Resolves when it is stored and verified. */
export async function downloadModel(id: CutoutModelId, job: Job = {}): Promise<void> {
  const info = await modelInfo(id);
  if (!info.available) throw new CutoutError(info.why ?? 'Este modelo no está disponible aquí.', 'unavailable');
  const spec = modelSpec(id);
  const v = variantFor(spec, info)!;
  downloading.add(id);
  failed.delete(id);
  try {
    await store.downloadFiles(spec, variantFiles(v), ({ loaded, total }) => {
      job.onProgress?.({ p: total ? loaded / total : 1, label: total ? `Descargando modelo ${MB(loaded)} de ${MB(total)}` : 'El modelo ya estaba guardado' });
    }, job.signal);
    job.onProgress?.({ p: 1, label: 'Modelo verificado y guardado en este navegador' });
  } catch (e) {
    if ((e as CutoutError)?.code !== 'aborted') failed.add(id);
    throw e;
  } finally {
    downloading.delete(id);
  }
}

/** Frees the cached copy of a model (the person can reclaim the space). */
export async function forgetModel(id: CutoutModelId): Promise<void> {
  const spec = modelSpec(id);
  if (client.residentModel() === id) client.kill(new CutoutError('Modelo borrado.', 'model'));
  const files = [spec.webgpu, spec.wasm].flatMap(v => (v ? variantFiles(v) : []));
  await store.deleteFiles(files);
  failed.delete(id);
}

/** «Borrar modelos descargados»: every model file stored by this site in this browser. */
export async function forgetAllModels(): Promise<void> {
  client.kill(new CutoutError('Modelos borrados.', 'model'));
  await store.deleteAll();
  failed.clear();
}

/** Bytes currently kept by downloaded models in this browser. */
export const storedModelBytes = (): Promise<number> => store.storedBytes();

/** Checks the model is usable here and stored; starts the worker for its backend. */
async function prepare(id: CutoutModelId): Promise<{ info: ModelInfo; spec: ModelSpec }> {
  const info = await modelInfo(id);
  if (!info.available) throw new CutoutError(info.why ?? 'Este modelo no está disponible aquí.', 'unavailable');
  const spec = modelSpec(id);
  const v = variantFor(spec, info)!;
  for (const f of variantFiles(v)) {
    if (!(await store.hasFile(f))) throw new CutoutError(`Primero hay que descargar «${spec.name}» (${MB(variantBytes(v))}).`, 'needs-download');
  }
  const e = await env();
  await client.ensureWorker(info.backend === 'webgpu' ? 'webgpu' : 'wasm', threadCount(e));
  return { info, spec };
}

/** Loads a downloaded model into the worker ahead of time (e.g. while the person picks a photo). */
export async function loadModel(id: CutoutModelId, job: Job = {}): Promise<number> {
  await prepare(id);
  loading.add(id);
  try {
    const r = await client.call<{ load: number }>({ t: 'load', id }, { onProgress: job.onProgress, signal: job.signal });
    client.setResident(id);
    return r.load;
  } finally { loading.delete(id); }
}

/* ------------------------------------------------------------------ inference */

const timings = new WeakMap<Matte, Timings & { total: number; choice?: { index: number; scores: number[]; iou: number[] } }>();

/** How long a matte took (model load if any, pre-processing, inference, upsampling) and on which backend. */
export const cutoutTimings = (m: Matte) => timings.get(m);

/** Automatic subject cut-out: the matte at the source's size, already upsampled with the image as a guide. */
export async function removeBackground(
  src: Pixels,
  opts: Job & { model?: 'subject' | 'subject-hq' | 'portrait' } = {},
): Promise<Matte> {
  const id = opts.model ?? 'subject';
  await prepare(id);
  const t0 = performance.now();
  const bmp = await toBitmap(src);
  loading.add(id);
  try {
    const r = await client.call<MatteResult>({ t: 'matte', id, frame: bmp, upsample: true, detail: DETAIL_BUILT_IN }, { transfer: [bmp], onProgress: opts.onProgress, signal: opts.signal });
    client.setResident(id);
    const m: Matte = { w: r.w, h: r.h, alpha: r.alpha! };
    timings.set(m, { ...r.ms, total: performance.now() - t0 });
    return m;
  } finally { loading.delete(id); }
}

/**
 * One video frame (or any image) through a matting model, for the video editor: the frame is transferred to the
 * worker (and closed there). With `upsample: false` the result is the model's own low-resolution matte (fast,
 * for previews and temporal smoothing); with `upsample: true` it is at the frame's size. `size` sets the shortest
 * side the portrait model works at (512 by default; 256 is enough for a live preview); the subject models always
 * work at their fixed square size.
 *
 * Throughput measured on this project's 4-vCPU test machine, WASM with 2 threads, 640 × 360 frames (see the
 * lane report for the numbers; WebGPU was not measurable there). Frames are processed one at a time: send the
 * next one when the previous resolves.
 */
export async function matteFrame(frame: ImageBitmap | VideoFrame, opts: Job & { model?: 'subject' | 'subject-hq' | 'portrait'; upsample?: boolean; detail?: number; size?: number } = {}): Promise<{ matte: Matte; low: Matte; timings: Timings }> {
  const id = opts.model ?? 'portrait';
  await prepare(id);
  const r = await client.call<MatteResult>({ t: 'matte', id, frame, upsample: !!opts.upsample, detail: opts.detail ?? DETAIL_BUILT_IN, size: opts.size }, { transfer: [frame as Transferable], onProgress: opts.onProgress, signal: opts.signal });
  client.setResident(id);
  const lowBytes = new Uint8ClampedArray(r.lw * r.lh);
  for (let i = 0; i < lowBytes.length; i++) lowBytes[i] = Math.round(r.low[i] * 255);
  const low: Matte = { w: r.lw, h: r.lh, alpha: lowBytes };
  return { matte: r.alpha ? { w: r.w, h: r.h, alpha: r.alpha } : low, low, timings: r.ms };
}

/* ------------------------------------------------------------------ refinement (pure, page side) */

/** Guided upsampling on this thread (WebGL2 when available, CPU otherwise): a low-res matte to w × h. */
export function upsampleMatte(src: Pixels, low: Matte, w: number, h: number, detail = DETAIL_BUILT_IN, mode: 'auto' | 'cpu' | 'gl' = 'auto'): Matte {
  const rgba = readRGBA(src, w, h).data;
  const lowF = Float32Array.from(low.alpha, v => v / 255);
  const plan = planGuided(rgba, w, h, lowF, low.w, low.h, detail);
  const gl = mode === 'cpu' ? null : applyGuidedGL(plan, rgba, w, h);
  if (mode === 'gl' && !gl) throw new CutoutError('WebGL2 no está disponible aquí.', 'unavailable');
  return { w, h, alpha: gl ?? applyGuided(plan, rgba, w, h) };
}

/**
 * Edge work on a matte: an extra guided pass on the edges (detail), then shift, then feather. Pure (does not
 * touch the input) and a function of its arguments only, so a project re-renders the same pixels after reload.
 */
export function refineMatte(src: Pixels, matte: Matte, o: RefineOptions): Matte {
  const { w, h } = matte;
  let a = matte.alpha;
  if (o.detail > 0) a = guidedRefine(readRGBA(src, w, h).data, w, h, a, Math.min(1, o.detail));
  if (o.shift) a = shiftMatte(a, w, h, o.shift);
  if (o.feather > 0) a = featherMatte(a, w, h, o.feather);
  return { w, h, alpha: a === matte.alpha ? new Uint8ClampedArray(a) : a };
}

/** The cut-out as straight-alpha RGBA: source colours (decontaminated at the edges) with the matte as alpha. */
export function cutoutImageData(src: Pixels, matte: Matte, o: Pick<RefineOptions, 'decontaminate'>): ImageData {
  const rgba = readRGBA(src, matte.w, matte.h).data;
  return new ImageData(cutoutRGBA(rgba, matte.alpha, matte.w, matte.h, o.decontaminate) as Uint8ClampedArray<ArrayBuffer>, matte.w, matte.h);
}

/** The cut-out image: source colours (decontaminated at the edges) with the matte as alpha. */
export function cutoutCanvas(src: Pixels, matte: Matte, o: Pick<RefineOptions, 'decontaminate'>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = matte.w;
  c.height = matte.h;
  c.getContext('2d')!.putImageData(cutoutImageData(src, matte, o), 0, 0);
  return c;
}

/** Transparent PNG of the cut-out (real alpha). */
export function cutoutBlob(src: Pixels, matte: Matte, o: Pick<RefineOptions, 'decontaminate'>): Promise<Blob> {
  return canvasBlob(cutoutCanvas(src, matte, o));
}

/** The matte as an image: 'gray' = white where opaque on black (opaque PNG), 'alpha' = white with the matte as alpha. */
export function matteToCanvas(matte: Matte, mode: 'gray' | 'alpha' = 'gray'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = matte.w;
  c.height = matte.h;
  const img = new ImageData(matte.w, matte.h);
  const d = img.data;
  for (let i = 0, j = 0; i < matte.alpha.length; i++, j += 4) {
    const a = matte.alpha[i];
    if (mode === 'gray') { d[j] = d[j + 1] = d[j + 2] = a; d[j + 3] = 255; } else { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a; }
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

export const matteBlob = (matte: Matte, mode: 'gray' | 'alpha' = 'gray') => canvasBlob(matteToCanvas(matte, mode));

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo crear el PNG.'))), 'image/png'));
}

/**
 * A keep/remove refinement stroke (source px): 'keep' paints the subject back in, 'remove' takes it out.
 * `size` is the brush diameter in source px; hardness 0..1 (1 = hard edge). Returns a new matte unless
 * `inPlace` (fast while painting; `dirty` gets the touched rectangle).
 */
export function applyBrush(matte: Matte, stroke: BrushPoint[], mode: 'keep' | 'remove', size: number, hardness: number, opts: { opacity?: number; inPlace?: boolean; dirty?: (r: { x: number; y: number; w: number; h: number }) => void } = {}): Matte {
  const out = opts.inPlace ? matte : { w: matte.w, h: matte.h, alpha: new Uint8ClampedArray(matte.alpha) };
  const r = stampStroke(out.alpha, out.w, out.h, stroke, mode, size, hardness, opts.opacity ?? 1);
  if (r) opts.dirty?.(r);
  return out;
}

/**
 * Everything close to a colour in the source (to remove a sky, a backdrop…): distance in RGB normalised to 0..1,
 * tol = still fully selected, soft = the ramp after it (same meaning as the project's MaskColorPart).
 */
export function matteFromColor(src: Pixels, color: string | [number, number, number], tol: number, soft: number): Matte {
  const img = readRGBA(src);
  return { w: img.width, h: img.height, alpha: colorMatte(img.data, img.width, img.height, color, tol, soft) };
}

/** add = union, subtract = a without b, intersect = both (same size). */
export function combineMattes(a: Matte, b: Matte, op: 'add' | 'subtract' | 'intersect'): Matte {
  if (a.w !== b.w || a.h !== b.h) throw new CutoutError('Las máscaras tienen tamaños distintos.', 'model');
  return { w: a.w, h: a.h, alpha: combine(a.alpha, b.alpha, op) };
}

/** A discreet, model-free recommendation for the UI (never downloads anything). */
export function suggestCutout(src: Pixels): CutoutSuggestion {
  const s = sizeOf(src);
  const k = Math.min(1, 256 / Math.max(s.w, s.h));
  const w = Math.max(1, Math.round(s.w * k)), h = Math.max(1, Math.round(s.h * k));
  const img = readRGBA(src, w, h);
  return suggestFromRGBA(img.data, w, h);
}

/* ------------------------------------------------------------------ selection */

export interface SelectPoint {
  x: number;
  y: number;
  /** true = part of the object, false = not part of it. */
  positive: boolean;
}

/**
 * A point-selection session on one image: the image is encoded once, each change of points/box decodes in a
 * fraction of a second. Correctable: points can be added and removed; the latest mask is returned.
 */
export interface SelectSession {
  readonly w: number;
  readonly h: number;
  mask(points: SelectPoint[], box?: { x: number; y: number; w: number; h: number }): Promise<Matte>;
  dispose(): void;
}

let nextSid = 1;

export async function selectObject(src: Pixels, job: Job = {}): Promise<SelectSession> {
  await prepare('select');
  const { w, h } = sizeOf(src);
  const sid = nextSid++;
  // Our own copy, so the image can be encoded again if the worker restarts (a cancel, another model's error).
  const keep = await toBitmap(src);
  let gen = -1;
  let encodeMs: Timings | null = null;
  const encode = async (j: Job) => {
    const bmp = await createImageBitmap(keep);
    loading.add('select');
    try {
      const r = await client.call<{ ms: Timings }>({ t: 'encode', sid, frame: bmp }, { transfer: [bmp], onProgress: j.onProgress, signal: j.signal });
      encodeMs = r.ms;
      client.setResident('select');
      gen = client.generation();
    } finally { loading.delete('select'); }
  };
  await encode(job);
  let disposed = false;
  return {
    w,
    h,
    async mask(points, box) {
      if (disposed) throw new CutoutError('Esta selección ya se cerró.', 'model');
      const t0 = performance.now();
      if (client.generation() !== gen) { await prepare('select'); await encode({}); }
      const r = await client.call<DecodeResult>({ t: 'decode', sid, points: points.map(p => ({ x: p.x, y: p.y, positive: p.positive })), box, detail: DETAIL_BUILT_IN });
      const m: Matte = { w: r.w, h: r.h, alpha: r.alpha };
      const enc = encodeMs;
      encodeMs = null;
      timings.set(m, { ...r.ms, load: enc?.load ?? r.ms.load, pre: r.ms.pre + (enc?.pre ?? 0), encode: enc?.run, total: performance.now() - t0 + (enc ? enc.pre + enc.run + (enc.load ?? 0) : 0), choice: { index: r.index, scores: r.scores, iou: r.iou } });
      return m;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      keep.close();
      if (client.generation() === gen) client.notify({ t: 'drop', sid });
    },
  };
}

/** Terminates the ML worker and releases every session (call when leaving the studio). */
export function releaseCutout(): void {
  client.kill(new CutoutError('El recorte se cerró.', 'model'));
}

/* ------------------------------------------------------------------ internals for tests and QA */

/** @internal Pure pieces, exported for the QA page and tests. */
export const __cutoutInternals = { chooseMask, gateModels, MODELS };
