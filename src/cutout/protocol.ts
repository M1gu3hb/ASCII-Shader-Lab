/** Messages between the page (client.ts) and the ML worker (ml.worker.ts). Types only. */
import type { CutoutModelId } from './index';

export type WorkerBackend = 'webgpu' | 'wasm';

export interface Timings {
  /** Session creation from the stored files (only when this call loaded the model). */
  load?: number;
  /** Resize + normalise. */
  pre: number;
  /** Model inference (for a selection: the decoder; the image encoder is `encode`). */
  run: number;
  /** Selection only: encoding the image, once per image. */
  encode?: number;
  /** Sigmoid + guided upsampling to the source size. */
  post: number;
  backend: WorkerBackend;
  threads: number;
  /** 'gl' when the full-resolution step ran on WebGL2, 'cpu' otherwise. */
  upsample?: 'gl' | 'cpu';
}

export type Req =
  | { t: 'init'; rid: number; backend: WorkerBackend; threads: number }
  | { t: 'load'; rid: number; id: CutoutModelId }
  | { t: 'matte'; rid: number; id: CutoutModelId; frame: ImageBitmap | VideoFrame; upsample: boolean; detail: number }
  | { t: 'encode'; rid: number; sid: number; frame: ImageBitmap }
  | { t: 'decode'; rid: number; sid: number; points: Array<{ x: number; y: number; positive: boolean }>; box?: { x: number; y: number; w: number; h: number }; detail: number }
  | { t: 'drop'; rid: number; sid: number }
  | { t: 'release'; rid: number; id?: CutoutModelId };

export interface MatteResult {
  w: number;
  h: number;
  /** Source-size matte (when upsampled) — 0..255. */
  alpha?: Uint8ClampedArray;
  /** The model's matte at its own resolution, 0..1. */
  low: Float32Array;
  lw: number;
  lh: number;
  ms: Timings;
}

export interface DecodeResult {
  w: number;
  h: number;
  alpha: Uint8ClampedArray;
  low: Float32Array;
  lw: number;
  lh: number;
  index: number;
  scores: number[];
  iou: number[];
  ms: Timings;
}

export type Res =
  | { t: 'ok'; rid: number; value?: unknown }
  | { t: 'err'; rid: number; message: string; code?: string }
  | { t: 'progress'; rid: number; p: number | null; label: string };
