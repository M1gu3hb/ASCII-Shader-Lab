/**
 * The ML worker: onnxruntime-web sessions, pre-processing, inference and the guided upsampling, off the main
 * thread. One module worker per page; one model resident at a time (switching releases the previous one).
 *
 * ORT is imported lazily with the build this worker was started for: the WebGPU build (its WASM binary also
 * carries the CPU kernels) or the plain WASM build. Its .mjs/.wasm files are served from our own origin under
 * /ort/<version>/ (copied from node_modules by vite.config.ts): no CDN, no blob: URLs, no proxy worker.
 *
 * Frames arrive as transferable ImageBitmap/VideoFrame and are closed here; mattes leave as transferable bytes.
 */
import type * as OrtNS from 'onnxruntime-web';
import type { CutoutModelId } from './index';
import { baseName, inputSize, modelSpec, type GraphFiles, type ModelInput, type ModelSpec, type ModelVariant } from './models';
import { readFile } from './store';
import { applyGuided, planGuided } from './refine';
import { applyGuidedGL } from './gl';
import { chooseMask, cleanMask, type PromptPoint } from './choose';
import type { DecodeResult, MatteResult, Req, Res, Timings, WorkerBackend } from './protocol';

type Ort = typeof OrtNS;
type Session = OrtNS.InferenceSession;
type Tensor = OrtNS.Tensor;
type Frame = ImageBitmap | VideoFrame;

const scope = self as unknown as {
  postMessage(m: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  location: Location;
};

let ort: Ort | null = null;
let backend: WorkerBackend = 'wasm';
let threads = 1;
let resident: { id: CutoutModelId; sessions: Record<string, Session> } | null = null;

interface SelectState {
  emb: Record<string, Tensor>;
  guide: Uint8ClampedArray;
  w: number;
  h: number;
  prev: { mask: Float32Array; points: PromptPoint[] } | null;
}
const selections = new Map<number, SelectState>();

const post = (m: Res, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const progress = (rid: number, p: number | null, label: string) => post({ t: 'progress', rid, p, label });
const now = () => performance.now();

/* ------------------------------------------------------------------ runtime */

async function loadOrt(b: WorkerBackend, n: number): Promise<void> {
  if (ort) return;
  backend = b;
  threads = n;
  ort = (b === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm')) as unknown as Ort;
  const version = ort.env.versions.web;
  ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/${version}/`, scope.location.origin).href;
  ort.env.wasm.numThreads = n;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
}

const variantOf = (spec: ModelSpec): ModelVariant => {
  const v = backend === 'webgpu' ? spec.webgpu : spec.wasm;
  if (!v) throw new Error(backend === 'webgpu' ? `El modelo ${spec.name} no tiene versión para WebGPU.` : `El modelo ${spec.name} necesita WebGPU.`);
  return v;
};

async function createSession(g: GraphFiles): Promise<Session> {
  if (!ort) throw new Error('El motor de inferencia no está listo.');
  const model = await readFile(g.graph);
  const opts: OrtNS.InferenceSession.SessionOptions = {
    executionProviders: [backend === 'webgpu' ? 'webgpu' : 'wasm'],
    graphOptimizationLevel: 'all',
  };
  if (g.data) opts.externalData = [{ path: baseName(g.data.path), data: await readFile(g.data) }];
  return ort.InferenceSession.create(model, opts);
}

async function release(): Promise<void> {
  if (!resident) return;
  const old = resident;
  resident = null;
  for (const s of Object.values(old.sessions)) { try { await s.release(); } catch { /* already gone */ } }
}

/** Makes `id` the resident model. Returns the load time when it had to load. */
async function ensure(id: CutoutModelId, rid: number): Promise<{ sessions: Record<string, Session>; load?: number }> {
  if (resident?.id === id) return { sessions: resident.sessions };
  await release();
  progress(rid, null, 'Preparando el modelo…');
  const t0 = now();
  const v = variantOf(modelSpec(id));
  const sessions: Record<string, Session> = {};
  for (const [part, g] of Object.entries(v.parts)) sessions[part] = await createSession(g);
  resident = { id, sessions };
  return { sessions, load: now() - t0 };
}

/* ------------------------------------------------------------------ pixels */

const frameSize = (f: Frame) => ('displayWidth' in f ? { w: f.displayWidth, h: f.displayHeight } : { w: f.width, h: f.height });

function ctx2d(w: number, h: number): OffscreenCanvasRenderingContext2D {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Sin Canvas 2D en el worker.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function toTensor(frame: Frame, input: ModelInput, tw: number, th: number): Tensor {
  const ctx = ctx2d(tw, th);
  ctx.drawImage(frame as CanvasImageSource, 0, 0, tw, th);
  const d = ctx.getImageData(0, 0, tw, th).data;
  const n = tw * th, out = new Float32Array(3 * n);
  const [m0, m1, m2] = input.mean, [s0, s1, s2] = input.std;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = (d[j] / 255 - m0) / s0;
    out[n + i] = (d[j + 1] / 255 - m1) / s1;
    out[2 * n + i] = (d[j + 2] / 255 - m2) / s2;
  }
  return new ort!.Tensor('float32', out, [1, 3, th, tw]);
}

function fullRGBA(frame: Frame, w: number, h: number): Uint8ClampedArray {
  const ctx = ctx2d(w, h);
  ctx.drawImage(frame as CanvasImageSource, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function upsample(rgba: Uint8ClampedArray, w: number, h: number, low: Float32Array, lw: number, lh: number, detail: number): { alpha: Uint8ClampedArray; how: 'gl' | 'cpu' } {
  const plan = planGuided(rgba, w, h, low, lw, lh, detail);
  const gl = applyGuidedGL(plan, rgba, w, h);
  return gl ? { alpha: gl, how: 'gl' } : { alpha: applyGuided(plan, rgba, w, h), how: 'cpu' };
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

/* ------------------------------------------------------------------ tasks */

async function matte(r: Extract<Req, { t: 'matte' }>): Promise<MatteResult> {
  const { frame } = r;
  try {
    const spec = modelSpec(r.id);
    const { sessions, load } = await ensure(r.id, r.rid);
    const { w, h } = frameSize(frame);
    const { tw, th } = inputSize(spec.input, w, h);
    progress(r.rid, null, 'Recortando…');
    let t = now();
    const x = toTensor(frame, spec.input, tw, th);
    const pre = now() - t;
    t = now();
    const out = await sessions.model.run({ [spec.input.inputName]: x });
    const run = now() - t;
    t = now();
    const y = out[spec.input.outputName] ?? Object.values(out)[0];
    const data = y.data as Float32Array;
    const [lh, lw] = y.dims.slice(-2) as [number, number];
    const low = new Float32Array(lw * lh);
    if (spec.input.output === 'logits') for (let i = 0; i < low.length; i++) low[i] = sigmoid(data[i]);
    else for (let i = 0; i < low.length; i++) low[i] = Math.min(1, Math.max(0, data[i]));
    for (const v of Object.values(out)) (v as Tensor & { dispose?: () => void }).dispose?.();
    let alpha: Uint8ClampedArray | undefined;
    let how: 'gl' | 'cpu' | undefined;
    if (r.upsample) {
      progress(r.rid, null, 'Afinando bordes…');
      const up = upsample(fullRGBA(frame, w, h), w, h, low, lw, lh, r.detail);
      alpha = up.alpha; how = up.how;
    }
    const ms: Timings = { load, pre, run, post: now() - t, backend, threads, upsample: how };
    return { w, h, alpha, low, lw, lh, ms };
  } finally {
    frame.close();
  }
}

async function encode(r: Extract<Req, { t: 'encode' }>): Promise<{ w: number; h: number; ms: Timings }> {
  const { frame } = r;
  try {
    const spec = modelSpec('select');
    const { sessions, load } = await ensure('select', r.rid);
    const { w, h } = frameSize(frame);
    progress(r.rid, null, 'Analizando la imagen…');
    let t = now();
    const x = toTensor(frame, spec.input, 1024, 1024);
    const guide = fullRGBA(frame, w, h);
    const pre = now() - t;
    t = now();
    const emb = await sessions.encoder.run({ pixel_values: x });
    const run = now() - t;
    selections.set(r.sid, { emb, guide, w, h, prev: null });
    return { w, h, ms: { load, pre, run, post: 0, backend, threads } };
  } finally {
    frame.close();
  }
}

async function decode(r: Extract<Req, { t: 'decode' }>): Promise<DecodeResult> {
  const sel = selections.get(r.sid);
  if (!sel) throw new Error('La selección ya no existe: vuelve a abrir la imagen.');
  const { w, h } = sel;
  const MS = 256;
  const empty = (): DecodeResult => ({ w, h, alpha: new Uint8ClampedArray(w * h), low: new Float32Array(MS * MS), lw: MS, lh: MS, index: -1, scores: [], iou: [], ms: { pre: 0, run: 0, post: 0, backend, threads } });
  if (!r.points.length && !r.box) { sel.prev = null; return empty(); }
  const { sessions, load } = await ensure('select', r.rid);
  const o = ort!;
  let t = now();
  const sx = 1024 / w, sy = 1024 / h;
  // Without a box, SAM 2's prompt encoder appends a padding point (label -1); the exported graph does not, so we do.
  const pad = r.box ? 0 : 1;
  const n = r.points.length + pad;
  const pts = new Float32Array(n * 2), labels = new BigInt64Array(n);
  r.points.forEach((p, i) => { pts[i * 2] = p.x * sx; pts[i * 2 + 1] = p.y * sy; labels[i] = p.positive ? 1n : 0n; });
  if (pad) labels[n - 1] = -1n;
  const boxes = r.box
    ? new o.Tensor('float32', Float32Array.from([r.box.x * sx, r.box.y * sy, (r.box.x + r.box.w) * sx, (r.box.y + r.box.h) * sy]), [1, 1, 4])
    : new o.Tensor('float32', new Float32Array(0), [1, 0, 4]);
  const feeds: Record<string, Tensor> = {
    input_points: new o.Tensor('float32', pts, [1, 1, n, 2]),
    input_labels: new o.Tensor('int64', labels, [1, 1, n]),
    input_boxes: boxes,
    'image_embeddings.0': sel.emb['image_embeddings.0'],
    'image_embeddings.1': sel.emb['image_embeddings.1'],
    'image_embeddings.2': sel.emb['image_embeddings.2'],
  };
  const pre = now() - t;
  t = now();
  const out = await sessions.decoder.run(feeds);
  const run = now() - t;
  t = now();
  const iouT = out.iou_scores.data as Float32Array;
  const pm = out.pred_masks;
  const [k, mh, mw] = pm.dims.slice(-3) as [number, number, number];
  const all = pm.data as Float32Array;
  const masks: Float32Array[] = [];
  for (let j = 0; j < k; j++) masks.push(all.slice(j * mh * mw, (j + 1) * mh * mw));
  const mpts: PromptPoint[] = r.points.map(p => ({ x: (p.x / w) * mw, y: (p.y / h) * mh, positive: p.positive }));
  const choice = chooseMask(iouT, masks, mw, mh, mpts, sel.prev);
  const chosen = masks[choice.index];
  sel.prev = { mask: chosen, points: mpts };
  const low = cleanMask(chosen, mw, mh, mpts);
  progress(r.rid, null, 'Afinando bordes…');
  const up = upsample(sel.guide, w, h, low, mw, mh, r.detail);
  return {
    w, h, alpha: up.alpha, low, lw: mw, lh: mh, index: choice.index, scores: choice.scores, iou: Array.from(iouT),
    ms: { load, pre, run, post: now() - t, backend, threads, upsample: up.how },
  };
}

/* ------------------------------------------------------------------ dispatch */

let chain: Promise<unknown> = Promise.resolve();
/** ORT sessions do not run concurrently: every task waits for the previous one. */
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
};

function friendly(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/bad_alloc|out of memory|memory access out of bounds|Aborted\(\)|RangeError: Array buffer allocation/i.test(m)) {
    return 'El modelo se quedó sin memoria en este navegador. Cierra otras pestañas, prueba una foto más pequeña o usa «Retrato» / «Seleccionar objeto».';
  }
  if (/webgpu/i.test(m) && backend === 'webgpu') return `WebGPU falló en este equipo (${m.slice(0, 160)}).`;
  return m.slice(0, 400);
}

scope.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  const reply = (value?: unknown, transfer: Transferable[] = []) => post({ t: 'ok', rid: r.rid, value }, transfer);
  const fail = (err: unknown) => post({ t: 'err', rid: r.rid, message: friendly(err), code: (err as { code?: string })?.code });
  const task = (): Promise<unknown> => {
    switch (r.t) {
      case 'init': return loadOrt(r.backend, r.threads).then(() => reply({ backend, threads, version: ort?.env.versions.web }));
      case 'load': return ensure(r.id, r.rid).then(x => reply({ load: x.load ?? 0 }));
      case 'matte': return matte(r).then(v => reply(v, v.alpha ? [v.alpha.buffer, v.low.buffer] : [v.low.buffer]));
      case 'encode': return encode(r).then(v => reply(v));
      case 'decode': return decode(r).then(v => reply(v, [v.alpha.buffer, v.low.buffer]));
      case 'drop': selections.delete(r.sid); reply(); return Promise.resolve();
      case 'release': return (async () => {
        if (!r.id || resident?.id === r.id) await release();
        if (!r.id) selections.clear();
        reply();
      })();
    }
  };
  // 'drop' and 'init' do not need the queue; everything else touching sessions does.
  (r.t === 'drop' ? task() : serial(task)).catch(fail);
};
