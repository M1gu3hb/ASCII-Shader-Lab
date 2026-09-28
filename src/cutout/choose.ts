/**
 * Which of the three masks a point-prompted decoder returns to keep, and how to clean it (pure; unit-tested).
 *
 * The decoder (SAM 2 family) answers every prompt with three candidate masks (whole object, part, sub-part) and a
 * predicted IoU for each. With one click the highest predicted IoU is the usual pick. When the person ADDS points
 * to refine a selection, jumping to a different granularity (e.g. from «the person» to «the shirt») feels broken,
 * so the candidate that agrees with the previous mask gets a bonus. Candidates that contradict the clicks (a
 * positive point outside, a negative point inside) are penalised, and unstable candidates (logits hovering around
 * zero, typical on busy backgrounds) lose a little.
 */

export interface PromptPoint { x: number; y: number; positive: boolean }

export interface Choice { index: number; scores: number[] }

/** Share of the mask that stays inside when the threshold moves from -1 to +1 (SAM's «stability score»). */
export function stability(m: Float32Array): number {
  let hi = 0, lo = 0;
  for (let i = 0; i < m.length; i++) { if (m[i] > 1) hi++; if (m[i] > -1) lo++; }
  return lo ? hi / lo : 0;
}

/**
 * @param iouPred  predicted IoU per candidate
 * @param masks    candidate logits, each mw × mh (> 0 = inside)
 * @param points   the clicks in mask coordinates (0..mw, 0..mh)
 * @param prev     the previous chosen mask (logits, same size) and its points, if any
 */
export function chooseMask(iouPred: ArrayLike<number>, masks: Float32Array[], mw: number, mh: number, points: PromptPoint[], prev?: { mask: Float32Array; points: PromptPoint[] } | null): Choice {
  const added = !!prev && prev.points.length > 0 && points.length > prev.points.length && prev.points.every(p => points.some(q => samePoint(p, q)));
  const scores: number[] = [];
  for (let k = 0; k < masks.length; k++) {
    const m = masks[k];
    let s = (Number(iouPred[k]) || 0) + 0.2 * stability(m);
    for (const p of points) {
      const x = Math.min(mw - 1, Math.max(0, Math.floor(p.x))), y = Math.min(mh - 1, Math.max(0, Math.floor(p.y)));
      const inside = m[y * mw + x] > 0;
      if (p.positive !== inside) s -= 0.5;
    }
    if (added && prev) s += 0.35 * logitIoU(m, prev.mask);
    scores.push(s);
  }
  let index = 0;
  for (let k = 1; k < scores.length; k++) if (scores[k] > scores[index]) index = k;
  return { index, scores };
}

const samePoint = (a: PromptPoint, b: PromptPoint) => a.positive === b.positive && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** IoU of two logit masks (inside = logit > 0). */
export function logitIoU(a: Float32Array, b: Float32Array): number {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] > 0, y = b[i] > 0;
    if (x && y) inter++;
    if (x || y) uni++;
  }
  return uni ? inter / uni : 0;
}

/** 4-connected components of `on` pixels: labels (0 = off) and the area of each label. */
function components(on: Uint8Array, w: number, h: number): { labels: Int32Array; areas: number[]; border: boolean[] } {
  const labels = new Int32Array(w * h);
  const areas = [0], border = [false];
  const stack: number[] = [];
  for (let s = 0; s < on.length; s++) {
    if (!on[s] || labels[s]) continue;
    const id = areas.length;
    let area = 0, touches = false;
    labels[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (x > 0 && on[i - 1] && !labels[i - 1]) { labels[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && on[i + 1] && !labels[i + 1]) { labels[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && on[i - w] && !labels[i - w]) { labels[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && on[i + w] && !labels[i + w]) { labels[i + w] = id; stack.push(i + w); }
    }
    areas.push(area);
    border.push(touches);
  }
  return { labels, areas, border };
}

/**
 * The chosen logits as a clean 0..1 matte at the decoder's resolution: specks away from the clicks are removed,
 * pinholes inside are filled (both below 0.4 % of the frame; SAM 2's own predictor offers the same clean-up),
 * and the edge is a one-pixel ramp around logit 0 so the guided upsampling decides it from the photo.
 */
export function cleanMask(logits: Float32Array, w: number, h: number, points: PromptPoint[]): Float32Array {
  const n = w * h, limit = Math.max(4, Math.round(n * 0.004));
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = logits[i] > 0 ? 1 : 0;
  const at = (p: PromptPoint) => Math.min(h - 1, Math.max(0, Math.floor(p.y))) * w + Math.min(w - 1, Math.max(0, Math.floor(p.x)));
  const keep = new Uint8Array(n);
  {
    const { labels, areas } = components(fg, w, h);
    const clicked = new Set(points.filter(p => p.positive).map(p => labels[at(p)]).filter(Boolean));
    for (let i = 0; i < n; i++) { const l = labels[i]; if (l && (areas[l] >= limit || clicked.has(l))) keep[i] = 1; }
  }
  {
    const bg = new Uint8Array(n);
    for (let i = 0; i < n; i++) bg[i] = keep[i] ? 0 : 1;
    const { labels, areas, border } = components(bg, w, h);
    const refused = new Set(points.filter(p => !p.positive).map(p => labels[at(p)]).filter(Boolean));
    for (let i = 0; i < n; i++) { const l = labels[i]; if (l && !border[l] && areas[l] < limit && !refused.has(l)) keep[i] = 1; }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = 0.5 + logits[i];
    out[i] = keep[i] ? (v < 0.5 ? 0.5 : v > 1 ? 1 : v) : (v > 0.5 ? 0.5 : v < 0 ? 0 : v);
  }
  // Changed pixels (removed specks, filled holes) are fully decided.
  for (let i = 0; i < n; i++) if (keep[i] !== fg[i]) out[i] = keep[i];
  return out;
}
