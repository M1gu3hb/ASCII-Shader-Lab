/**
 * The page side of the ML worker: one worker, requests by id, progress, and cancellation. Cancelling a running
 * inference terminates the worker (ORT cannot stop a run halfway); the next request starts a new one and loads
 * the model again from Cache Storage.
 */
import type { CutoutModelId, Progress } from './index';
import type { Req, Res, WorkerBackend } from './protocol';
import { abortError, CutoutError } from './store';

interface Pending { resolve(v: unknown): void; reject(e: unknown): void; onProgress?: (p: Progress) => void }

let worker: Worker | null = null;
let workerBackend: WorkerBackend | null = null;
let workerThreads = 1;
let initP: Promise<{ backend: WorkerBackend; threads: number; version: string }> | null = null;
let nextRid = 1;
let gen = 0;
let resident: CutoutModelId | null = null;
const pending = new Map<number, Pending>();

/** Changes every time a worker is terminated (sessions and encoded images are gone). */
export const generation = () => gen;
/** The model loaded in the worker, if any. */
export const residentModel = () => resident;
export const setResident = (id: CutoutModelId | null) => { resident = id; };
export const activeBackend = () => workerBackend;

function failAll(err: unknown) {
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) p.reject(err);
}

/** Terminates the worker and rejects whatever was running. */
export function kill(reason: unknown = abortError()): void {
  if (worker) worker.terminate();
  worker = null;
  workerBackend = null;
  initP = null;
  resident = null;
  gen++;
  failAll(reason);
}

function spawn(backend: WorkerBackend, threads: number): void {
  const w = new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module', name: 'glyphos-recorte' });
  worker = w;
  workerBackend = backend;
  workerThreads = threads;
  w.onmessage = (e: MessageEvent<Res>) => {
    const m = e.data;
    const p = pending.get(m.rid);
    if (!p) return;
    if (m.t === 'progress') { p.onProgress?.({ p: m.p, label: m.label }); return; }
    pending.delete(m.rid);
    if (m.t === 'ok') p.resolve(m.value);
    else p.reject(new CutoutError(m.message, (m.code as CutoutError['code']) || 'model'));
  };
  w.onerror = e => {
    e.preventDefault?.();
    kill(new CutoutError(`El proceso del recorte se detuvo (${e.message || 'error del worker'}).`, 'model'));
  };
  initP = send<{ backend: WorkerBackend; threads: number; version: string }>({ t: 'init', backend, threads });
}

/** Starts (or reuses) the worker for a backend. A different backend restarts it. */
export async function ensureWorker(backend: WorkerBackend, threads: number) {
  if (!worker || workerBackend !== backend || workerThreads !== threads) {
    if (worker) kill(new CutoutError('Se reinició el recorte.', 'model'));
    spawn(backend, threads);
  }
  return initP!;
}

type Body = Req extends infer R ? (R extends { rid: number } ? Omit<R, 'rid'> : never) : never;

function send<T>(body: Body, transfer: Transferable[] = [], onProgress?: (p: Progress) => void): Promise<T> {
  if (!worker) return Promise.reject(new CutoutError('El recorte no está en marcha.', 'model'));
  const rid = nextRid++;
  const p = new Promise<T>((resolve, reject) => pending.set(rid, { resolve: resolve as (v: unknown) => void, reject, onProgress }));
  worker.postMessage({ ...body, rid } as Req, transfer);
  return p;
}

/** A request with cancellation: aborting terminates the worker and rejects with AbortError. */
export async function call<T>(body: Body, o: { transfer?: Transferable[]; onProgress?: (p: Progress) => void; signal?: AbortSignal } = {}): Promise<T> {
  if (o.signal?.aborted) {
    for (const t of o.transfer ?? []) (t as { close?: () => void }).close?.();
    throw abortError();
  }
  const p = send<T>(body, o.transfer, o.onProgress);
  if (!o.signal) return p;
  const signal = o.signal;
  const onAbort = () => kill(abortError());
  signal.addEventListener('abort', onAbort, { once: true });
  try { return await p; } finally { signal.removeEventListener('abort', onAbort); }
}

/** Fire-and-forget message (e.g. dropping a selection) when the worker is alive. */
export function notify(body: Body): void {
  if (worker) send(body).catch(() => undefined);
}
