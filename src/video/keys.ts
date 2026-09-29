/**
 * Tracking schedule and prompts (pure): which frames get a model decode (keyframes), the stretch a correction
 * recomputes, the prompts drawn from the previous mask, the choice among candidate masks, and the names that
 * mark keyframes in a tracked mask part.
 *
 * Keyframes are every `keyEvery` seconds (rounded to whole frames), plus the first and last frame and every frame
 * the person corrected. Between two keyframes nothing calls the model: masks are carried along the optical flow
 * (track.ts). A correction on frame c makes c a keyframe and recomputes only the frames between the keyframes
 * around it (stretchAround).
 */
import { bboxOf, squaredDistance } from './sdf';

/** Frame times of a stretch at `fps`: start + j / fps while < end (at least one frame). */
export function trackTimes(start: number, end: number, fps: number): number[] {
  const f = fps > 0 ? fps : 30;
  const s = Math.max(0, start);
  if (!(end > s)) return [s];
  const n = Math.max(1, Math.round((end - s) * f));
  const out: number[] = [];
  for (let j = 0; j < n; j++) out.push(s + j / f);
  return out;
}

/**
 * Keyframe indices for `n` frames: every `step` frames from 0, the last frame, and the `forced` ones (corrections),
 * sorted and unique.
 */
export function keyframeIndices(n: number, step: number, forced: readonly number[] = []): number[] {
  if (n <= 0) return [];
  const s = Math.max(1, Math.round(step));
  const set = new Set<number>();
  for (let i = 0; i < n; i += s) set.add(i);
  set.add(n - 1);
  for (const f of forced) if (f >= 0 && f < n) set.add(Math.round(f));
  return [...set].sort((a, b) => a - b);
}

/** Frames per keyframe for a keyframe interval in seconds (at least 1). */
export const keyStep = (keyEvery: number, fps: number) => Math.max(1, Math.round(Math.max(0.01, keyEvery) * (fps > 0 ? fps : 30)));

/**
 * The keyframes around frame `c`: the last one before it and the first one after it (null when c is after the
 * last one). Frames strictly between prev and next are what a correction at c recomputes.
 */
export function stretchAround(keys: readonly number[], c: number): { prev: number | null; next: number | null } {
  let prev: number | null = null, next: number | null = null;
  for (const k of keys) {
    if (k < c) prev = k;
    else if (k > c && next === null) next = k;
  }
  return { prev, next };
}

/** Nearest index of a sorted list of times to t. */
export function nearestIndex(times: readonly number[], t: number): number {
  let best = 0, d = Infinity;
  for (let i = 0; i < times.length; i++) {
    const e = Math.abs(times[i] - t);
    if (e < d) { d = e; best = i; }
  }
  return best;
}

export interface PromptPoint { x: number; y: number; positive: boolean }
export interface Prompt { points: PromptPoint[]; box?: { x: number; y: number; w: number; h: number } }

/**
 * Prompts for the model on a keyframe, drawn from the mask expected there (the previous mask carried by the flow),
 * in the mask's pixels:
 *   - the box of the mask, expanded by `expand` (15 %) on each side;
 *   - up to 3 positive points at maxima of the distance to the outside (deep inside the object, far apart);
 *   - up to 4 negative points just outside the box, left/right/above/below, where the mask is empty.
 * Null when the mask is empty (the object is gone).
 */
export function promptsFrom(mask: ArrayLike<number>, w: number, h: number, o: { expand?: number; positives?: number; negatives?: number } = {}): { box: { x: number; y: number; w: number; h: number }; points: PromptPoint[] } | null {
  const bb = bboxOf(mask, w, h);
  if (!bb) return null;
  const ex = o.expand ?? 0.15;
  const mx = bb.w * ex, my = bb.h * ex;
  const box = {
    x: Math.max(0, bb.x - mx), y: Math.max(0, bb.y - my),
    w: 0, h: 0,
  };
  box.w = Math.min(w, bb.x + bb.w + mx) - box.x;
  box.h = Math.min(h, bb.y + bb.h + my) - box.y;
  const points: PromptPoint[] = [];
  // positives: distance-to-outside maxima, each next one away from the previous ones
  const d2 = squaredDistance(w, h, i => mask[i] < 0.5);
  const taken: Array<{ x: number; y: number; r: number }> = [];
  const maxPos = o.positives ?? 3;
  let first = 0;
  for (let k = 0; k < maxPos; k++) {
    let best = -1, bd = 0;
    for (let y = bb.y; y < bb.y + bb.h; y++) {
      for (let x = bb.x; x < bb.x + bb.w; x++) {
        const i = y * w + x;
        const d = d2[i];
        if (d <= bd) continue;
        if (taken.some(t => (t.x - x) ** 2 + (t.y - y) ** 2 < t.r * t.r)) continue;
        bd = d; best = i;
      }
    }
    if (best < 0) break;
    const r = Math.sqrt(bd);
    if (k === 0) first = r;
    else if (r < Math.max(2, first * 0.5)) break;
    const x = best % w, y = (best - x) / w;
    taken.push({ x, y, r: Math.max(2, r * 1.5) });
    points.push({ x: x + 0.5, y: y + 0.5, positive: true });
  }
  // negatives: just outside the (unexpanded) box, where there is no mask
  const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
  const m = Math.max(3, Math.min(bb.w, bb.h) * 0.12);
  const cand = [[bb.x - m, cy], [bb.x + bb.w + m, cy], [cx, bb.y - m], [cx, bb.y + bb.h + m]];
  const maxNeg = o.negatives ?? 4;
  for (const [x, y] of cand) {
    if (points.filter(p => !p.positive).length >= maxNeg) break;
    if (x < 1 || y < 1 || x > w - 2 || y > h - 2) continue;
    const i = Math.floor(y) * w + Math.floor(x);
    if (mask[i] >= 0.25) continue;
    points.push({ x, y, positive: false });
  }
  return { box, points };
}

/** The prompt variants a keyframe asks the model for (box + points, points only, box only). */
export function promptVariants(p: { box: Prompt['box']; points: PromptPoint[] }): Prompt[] {
  const out: Prompt[] = [{ points: p.points, box: p.box }];
  if (p.points.some(q => q.positive)) out.push({ points: p.points });
  if (p.box) out.push({ points: [], box: p.box });
  return out;
}

/** How much a candidate that lies inside the expected mask counts, next to its IoU (see chooseCandidate). */
export const CONTAIN_WEIGHT = 0.6;

/**
 * Picks the candidate that agrees best with the expected mask, not the model's own score: the model may prefer a
 * part or the whole scene, the flow says where the object should be. Agreement is the IoU, or — when the expected
 * mask has grown too big (a keyframe that took in some background carries it along) — 0.6 × the share of the
 * candidate that lies inside it, so a tight, correct candidate inside a loose expectation still wins and the track
 * recovers, while a candidate somewhere else scores nothing. `occluded` when even the best one agrees less than
 * `minIoU`, or is much smaller than expected and mostly outside it (the object is hidden): then the last mask is
 * kept.
 */
export function chooseCandidate(cands: ReadonlyArray<ArrayLike<number>>, expected: ArrayLike<number>, o: { minIoU?: number; minArea?: number } = {}): { index: number; iou: number; occluded: boolean; ious: number[] } {
  const minIoU = o.minIoU ?? 0.3;
  const minArea = o.minArea ?? 0.25;
  const ious: number[] = [];
  let index = -1, best = -1, bestContain = 0;
  let expArea = 0;
  for (let i = 0; i < expected.length; i++) if (expected[i] >= 0.5) expArea++;
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k];
    let inter = 0, uni = 0, area = 0;
    for (let i = 0; i < expected.length; i++) {
      const x = c[i] >= 0.5, y = expected[i] >= 0.5;
      if (x) area++;
      if (x && y) inter++;
      if (x || y) uni++;
    }
    const v = uni ? inter / uni : 0;
    ious.push(v);
    if (area === 0) continue;
    const score = Math.max(v, CONTAIN_WEIGHT * (inter / area));
    if (score > best) { best = score; index = k; bestContain = inter / area; }
  }
  if (index < 0) return { index: -1, iou: 0, occluded: true, ious };
  let area = 0;
  const c = cands[index];
  for (let i = 0; i < c.length; i++) if (c[i] >= 0.5) area++;
  // much smaller than expected and not inside it: the object is (mostly) hidden. Much smaller but inside it: the
  // visible part of the object, or a tight mask inside a loose expectation — kept (that is how a track recovers).
  const occluded = best < minIoU || (expArea > 0 && area < expArea * minArea && bestContain < 0.8);
  return { index, iou: best, occluded, ious };
}

/* ------------------------------------------------------------------ names of tracked frames */

export type FrameRole = 'clave' | 'correccion' | 'oculto' | '';

/**
 * Name of a tracked frame's picture: «pista-000012.png», with «-clave» (model keyframe), «-correccion» (a
 * keyframe the person set) or «-oculto» (the object was hidden: the last mask was kept). The names carry the
 * keyframes in the project itself (the contract has no field for them), so a correction after reopening the
 * project still knows which frames were decided by the model.
 */
export function frameName(index: number, role: FrameRole): string {
  return `pista-${String(index).padStart(6, '0')}${role ? '-' + role : ''}.png`;
}

export function roleOf(name: string | undefined): FrameRole {
  const m = /^pista-\d+-(clave|correccion|oculto)\.png$/.exec(name ?? '');
  return (m?.[1] as FrameRole) ?? '';
}

/** Keyframe indices of a tracked part's frames (model keyframes, corrections and hidden ones: all decided there). */
export function keysOfFrames(frames: ReadonlyArray<{ media: { name?: string } }>): number[] {
  const out: number[] = [];
  frames.forEach((f, i) => { if (roleOf(f.media.name)) out.push(i); });
  if (frames.length && !out.includes(0)) out.unshift(0);
  return out;
}
