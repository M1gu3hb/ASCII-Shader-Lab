/**
 * The canvas side of the finishes: a pool of output canvases, one per pool key (the compositor uses the
 * layer id), and the shared scratch memory.
 *
 * Canvas pooling
 *   - applyFinishes(input, finishes, ctx, key) draws `input` into the canvas of `key` (created on first use,
 *     resized when the input size changes), runs the finishes on its pixels and returns that canvas. It
 *     stays the caller's until the next call with the same key, which overwrites it.
 *   - At most MAX_POOL keys are kept; the least recently used one is dropped (its canvas shrunk to 0×0 so
 *     the browser frees the pixels at once). releaseFinishes(key) drops one, releaseFinishes() all of them
 *     and the scratch memory.
 *   - Scratch buffers (a few floats per pixel of the largest recent input) are shared by every key — the
 *     finishes run synchronously, one at a time — and dropped after SCRATCH_IDLE_MS without a call.
 */
import type { Finish } from '../project/types';
import type { FinishContext, Source2D } from './index';
import { activeFinishes, dropSharedScratch, runFinishes, sharedScratch } from './pipeline';

interface PoolEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export const MAX_POOL = 24;
const SCRATCH_IDLE_MS = 20_000;

const pool = new Map<string, PoolEntry>();
let idle: ReturnType<typeof setTimeout> | null = null;

function sizeOf(input: Source2D): { w: number; h: number } {
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    return { w: input.naturalWidth || input.width, h: input.naturalHeight || input.height };
  }
  return { w: input.width, h: input.height };
}

function entryFor(key: string, w: number, h: number): PoolEntry {
  let e = pool.get(key);
  if (e) { pool.delete(key); pool.set(key, e); } // most recently used last
  else {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo crear un lienzo 2D para los acabados.');
    e = { canvas, ctx };
    pool.set(key, e);
    while (pool.size > MAX_POOL) {
      const [oldKey, old] = pool.entries().next().value!;
      if (oldKey === key) break;
      old.canvas.width = 0; old.canvas.height = 0;
      pool.delete(oldKey);
    }
  }
  if (e.canvas.width !== w || e.canvas.height !== h) { e.canvas.width = w; e.canvas.height = h; }
  return e;
}

function touchScratch(): void {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => { idle = null; dropSharedScratch(); }, SCRATCH_IDLE_MS);
}

export function applyFinishesCanvas(input: Source2D, finishes: Finish[], ctx: FinishContext, key: string): HTMLCanvasElement {
  const { w, h } = sizeOf(input);
  const e = entryFor(key, w, h);
  const c = e.ctx;
  if (input !== e.canvas) {
    c.clearRect(0, 0, w, h);
    if (w > 0 && h > 0) c.drawImage(input as CanvasImageSource, 0, 0, w, h);
  }
  if (w < 1 || h < 1 || !activeFinishes(finishes).length) return e.canvas;
  const img = c.getImageData(0, 0, w, h);
  runFinishes(img, finishes, ctx, sharedScratch());
  c.putImageData(img, 0, 0);
  touchScratch();
  return e.canvas;
}

/** Drops one pool key (its canvas), or every canvas and the scratch memory. */
export function releaseFinishes(key?: string): void {
  if (key !== undefined) {
    const e = pool.get(key);
    if (e) { e.canvas.width = 0; e.canvas.height = 0; pool.delete(key); }
    return;
  }
  for (const e of pool.values()) { e.canvas.width = 0; e.canvas.height = 0; }
  pool.clear();
  if (idle) { clearTimeout(idle); idle = null; }
  dropSharedScratch();
}

/** What the pool holds now (for tests and the QA page). */
export function finishPoolStats(): { canvases: number; pixels: number; scratchBytes: number } {
  let pixels = 0;
  for (const e of pool.values()) pixels += e.canvas.width * e.canvas.height;
  return { canvases: pool.size, pixels, scratchBytes: sharedScratch().bytes };
}
