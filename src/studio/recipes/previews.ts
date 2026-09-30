import type { Recipe } from '../../engine/recipe';
import { useCaps } from '../caps';
import { getEngine } from '../engineBridge';
import { canvasUrl, snapshotCanvas, withOffscreen } from '../offscreen';

/**
 * Pictures of recipes for the recipe browser, drawn by the studio's shared hidden renderer (offscreen.ts,
 * the one the history thumbnails and the comparisons use): one at a time, the ones asked for first by
 * priority (the cards in view ask; a card that leaves the view withdraws its request), in idle moments,
 * never while the stage is getting a piece ready or showing a transition, and never while the tab is
 * hidden. Each picture is kept for the session (by engine kind and recipe), so reopening the browser or
 * coming back to a filter shows them at once; a camera or a playing video is drawn again each time.
 *
 * A picture is a still of a fixed moment of the piece (no animation runs for it), so reduced motion is
 * respected by construction. The composition is a small window's (CW×CH css px) rather than the stage's,
 * so every recipe is framed alike and its glyphs still read at the size of a card.
 */

export const PREVIEW_W = 288, PREVIEW_H = 180;
const CW = 480, CH = 300;
/** Moment of the animation shown (seconds of the piece's own clock), the same as the history thumbnails. */
const T = 4;
/** Share of the composition the picture shows: its middle, where a figure is (a field fills it anyway). */
const ZOOM = 0.8;
const MEM_MAX = 400;
/** A key or pointer press: renders wait this long after one, so what the person does comes first. */
const INPUT_QUIET_MS = 250;

export type PreviewCb = (url: string | null) => void;
interface Job { key: string; recipe: Recipe; prio: number; seq: number; cbs: Set<PreviewCb> }

const mem = new Map<string, string>();
const jobs = new Map<string, Job>();
let current: Job | null = null;
let timer = 0;
let seq = 0;
let lastInput = 0;
let listening = false;

const live = (r: Recipe) => r.source === 'camera' || r.source === 'video';
const kind = () => getEngine()?.kind ?? useCaps.getState().renderer ?? 'webgl';

export const previewKey = (r: Recipe) => `${kind()}|${JSON.stringify(r)}`;

/** A picture already made for this recipe (never for a camera or a video). */
export function peekPreview(r: Recipe): string | undefined {
  return live(r) ? undefined : mem.get(previewKey(r));
}

/**
 * Asks for the picture of a recipe. `prio`: lower comes first (a card's position in the list). Returns a
 * function that withdraws the request (a render already under way still finishes and is kept).
 */
export function requestPreview(r: Recipe, prio: number, cb: PreviewCb): () => void {
  listen();
  const key = previewKey(r);
  const hit = live(r) ? undefined : mem.get(key);
  if (hit) { cb(hit); return () => undefined; }
  let job = jobs.get(key);
  if (!job) { job = { key, recipe: r, prio, seq: ++seq, cbs: new Set() }; jobs.set(key, job); }
  else job.prio = Math.min(job.prio, prio);
  job.cbs.add(cb);
  schedule(0);
  return () => {
    const j = jobs.get(key);
    if (!j) return;
    j.cbs.delete(cb);
    if (!j.cbs.size && j !== current) jobs.delete(key);
  };
}

/** Pictures waiting (for tests and the «preparando» state). */
export const pendingPreviews = () => jobs.size;

function listen() {
  if (listening) return;
  listening = true;
  const input = () => { lastInput = performance.now(); };
  addEventListener('keydown', input, { capture: true, passive: true });
  addEventListener('pointerdown', input, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
}

const idle = (fn: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 16));

function schedule(delay: number) {
  if (timer || current) return;
  timer = window.setTimeout(() => { timer = 0; idle(() => void pump()); }, delay);
}

function next(): Job | null {
  let best: Job | null = null;
  for (const j of jobs.values()) if (!best || j.prio < best.prio || (j.prio === best.prio && j.seq < best.seq)) best = j;
  return best;
}

async function pump() {
  if (current || document.hidden || !jobs.size) return;
  // the stage is preparing a piece or forming one out of glyphs: its frames come first
  if (getEngine()?.busy) { schedule(120); return; }
  const quiet = performance.now() - lastInput;
  if (quiet < INPUT_QUIET_MS) { schedule(INPUT_QUIET_MS - quiet + 10); return; }
  const job = next();
  if (!job) return;
  current = job;
  let url: string | null = null;
  try {
    url = await render(job.recipe);
  } catch {
    url = null;
  }
  current = null;
  jobs.delete(job.key);
  if (url && !live(job.recipe)) remember(job.key, url);
  for (const cb of job.cbs) cb(url);
  schedule(0);
}

function remember(key: string, url: string) {
  mem.delete(key);
  mem.set(key, url);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value!);
}

async function render(r: Recipe): Promise<string | null> {
  // rendered a little larger than the picture, then scaled down smoothly (the glyphs stay crisp)
  const pr = Math.min(1, (PREVIEW_W * 1.6) / (CW * ZOOM));
  const c = await withOffscreen({ cssW: CW, cssH: CH, pixelRatio: pr }, r, async eng => {
    eng.set(r);
    await eng.ready();
    eng.renderAt(T, T);
    const W = eng.canvas.width, H = eng.canvas.height, sw = W * ZOOM, sh = H * ZOOM;
    return snapshotCanvas(eng, (W - sw) / 2, (H - sh) / 2, sw, sh, PREVIEW_W, PREVIEW_H);
  });
  return c ? canvasUrl(c, 0.8) : null;
}
