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
 */

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

/** What this device can run, and the models with their sizes (no download happens here). */
export async function cutoutCaps(): Promise<CutoutCaps> {
  return { backend: 'wasm', webgpu: false, threads: false, phone: false, models: [] };
}

export async function modelState(_id: CutoutModelId): Promise<ModelState> {
  return 'absent';
}

/** Downloads (after the person agreed) and caches a model. Resolves when it is stored and verified. */
export async function downloadModel(_id: CutoutModelId, _job: Job = {}): Promise<void> {
  throw new Error('El recorte todavía no está disponible en esta versión.');
}

/** Frees the cached copy of a model (the person can reclaim the space). */
export async function forgetModel(_id: CutoutModelId): Promise<void> {}

/** Automatic subject cut-out: the matte at the source's size, already upsampled with the image as a guide. */
export async function removeBackground(
  _src: Pixels,
  _opts: Job & { model?: 'subject' | 'subject-hq' | 'portrait' } = {},
): Promise<Matte> {
  throw new Error('El recorte todavía no está disponible en esta versión.');
}

/** Edge work on a matte: feather, shift, hair detail. Pure (does not touch the input). */
export function refineMatte(_src: Pixels, matte: Matte, _o: RefineOptions): Matte {
  return matte;
}

/** The cut-out image: source colours (decontaminated at the edges) with the matte as alpha. */
export function cutoutCanvas(_src: Pixels, _matte: Matte, _o: Pick<RefineOptions, 'decontaminate'>): HTMLCanvasElement {
  return document.createElement('canvas');
}

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

export async function selectObject(_src: Pixels, _job: Job = {}): Promise<SelectSession> {
  throw new Error('La selección de objetos todavía no está disponible en esta versión.');
}

/** Terminates the ML worker and releases every session (call when leaving the studio). */
export function releaseCutout(): void {}
