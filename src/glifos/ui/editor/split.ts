/**
 * Inserting and removing nodes (pure). Inserting splits a segment with de Casteljau, so the outline keeps
 * exactly its shape; removing a node joins its neighbours with their own handles.
 */
import type { Contour, PathNode, Pt } from '../../doc';
import { copyContour, lerp, segment } from './math';

/** de Casteljau: the two halves of a cubic at t. */
export function splitCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [[Pt, Pt, Pt, Pt], [Pt, Pt, Pt, Pt]] {
  const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  return [[p0, q0, r0, s], [s, r1, q2, p3]];
}

/** A copy of the contour with a node inserted on segment `si` at `t` (the new node is at index si + 1). */
export function insertNode(c: Contour, si: number, t: number): Contour {
  const out = copyContour(c);
  const s = segment(c, si);
  const ia = si, ib = (si + 1) % c.nodes.length;
  const tt = Math.min(1 - 1e-6, Math.max(1e-6, t));
  let node: PathNode;
  if (s.curve) {
    const [[, q0, r0, m], [, r1, q2]] = splitCubic(s.p0, s.p1, s.p2, s.p3, tt);
    // a missing handle stays missing (it sat on its node, and so do its split parts)
    if (s.a.ho) out.nodes[ia].ho = q0;
    if (s.b.hi) out.nodes[ib].hi = q2;
    node = { x: m.x, y: m.y, smooth: true, hi: r0, ho: r1 };
  } else {
    const m = lerp(s.p0, s.p3, tt);
    node = { x: m.x, y: m.y };
  }
  out.nodes.splice(si + 1, 0, node);
  return out;
}

/**
 * A copy of the contour without node `ni` (null when nothing would be left). A closed contour stays
 * closed; the neighbours keep their handles towards each other.
 */
export function removeNode(c: Contour, ni: number): Contour | null {
  if (c.nodes.length <= 1) return null;
  const out = copyContour(c);
  out.nodes.splice(ni, 1);
  if (!c.closed) {
    // the ends of an open contour have nothing to point to outside
    delete out.nodes[0].hi;
    delete out.nodes[out.nodes.length - 1].ho;
  }
  return out;
}

/**
 * Removes several nodes ("ci:ni" keys) from a list of contours. Contours left with fewer than two nodes
 * draw nothing and go; `map` says where each surviving contour went (-1: removed).
 */
export function removeNodes(contours: Contour[], keys: Iterable<string>): { contours: Contour[]; map: number[] } {
  const byC = new Map<number, number[]>();
  for (const k of keys) {
    const [ci, ni] = k.split(':').map(Number);
    if (!contours[ci]?.nodes[ni]) continue;
    byC.set(ci, [...(byC.get(ci) ?? []), ni]);
  }
  const out: Contour[] = [];
  const map: number[] = [];
  contours.forEach((c, ci) => {
    const del = byC.get(ci);
    if (!del) { map.push(out.length); out.push(c); return; }
    let cur: Contour | null = c;
    for (const ni of [...del].sort((a, b) => b - a)) { cur = cur ? removeNode(cur, ni) : null; }
    if (cur && cur.nodes.length >= 2) { map.push(out.length); out.push(cur); } else map.push(-1);
  });
  return { contours: out, map };
}
