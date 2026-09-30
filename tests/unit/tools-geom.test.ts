import { describe, expect, it } from 'vitest';
import {
  boxFromDrag, boxLocal, boxPoint, dragBox, fromPx, handlePoints, hitHandle, hitPart, hitTop, insertVertex, insidePolygon, layerMapping,
  movePart, nearestEdge, polygonArea, removeVertex, simplifyRDP, toPx, type HitContext, type PxBox,
} from '../../src/foto/tools/geom';
import type { MaskPart } from '../../src/project/types';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('Ramer–Douglas–Peucker', () => {
  it('keeps the corners of a noisy square and drops the points along its sides', () => {
    const pts: number[] = [];
    const side = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < 50; i++) {
        const t = i / 50;
        // ±0.3 px of wobble
        pts.push(x0 + (x1 - x0) * t + (i % 2 ? 0.3 : -0.3) * (y1 !== y0 ? 1 : 0), y0 + (y1 - y0) * t + (i % 2 ? 0.3 : -0.3) * (x1 !== x0 ? 1 : 0));
      }
    };
    side(0, 0, 100, 0); side(100, 0, 100, 100); side(100, 100, 0, 100); side(0, 100, 0, 0);
    pts.push(0, 0);
    const out = simplifyRDP(pts, 1);
    expect(out.length / 2).toBeLessThanOrEqual(6);
    const has = (x: number, y: number) => { for (let i = 0; i < out.length; i += 2) if (Math.hypot(out[i] - x, out[i + 1] - y) < 1) return true; return false; };
    expect(has(100, 0) && has(100, 100) && has(0, 100)).toBe(true);
  });

  it('measures the tolerance after scaling (screen px): the same path keeps more points when zoomed in', () => {
    const pts: number[] = [];
    for (let i = 0; i <= 100; i++) pts.push(i / 100, 0.5 + 0.002 * Math.sin(i / 3));
    const far = simplifyRDP(pts, 1.5, 200, 200); // wobble 0.4 px on screen: a straight line
    const near = simplifyRDP(pts, 1.5, 4000, 4000); // wobble 8 px on screen: kept
    expect(far.length / 2).toBe(2);
    expect(near.length / 2).toBeGreaterThan(20);
  });

  it('keeps the first and last points and never loses a point on degenerate input', () => {
    expect(simplifyRDP([0, 0], 1)).toEqual([0, 0]);
    expect(simplifyRDP([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
    const same = simplifyRDP([1, 1, 1, 1, 1, 1, 1, 1], 0.5);
    expect(same).toEqual([1, 1, 1, 1]);
    // a long path does not overflow the stack
    const long: number[] = [];
    for (let i = 0; i < 200_000; i++) long.push(Math.cos(i / 1000), Math.sin(i / 1000));
    expect(simplifyRDP(long, 0.001).length).toBeGreaterThan(10);
  });
});

describe('handles of rotated boxes', () => {
  const S = { w: 400, h: 200 };
  const b0: PxBox = { cx: 200, cy: 100, hw: 50, hh: 20, a: Math.PI / 6 };

  it('box ↔ frame units round trip; a local point maps back', () => {
    const f = fromPx(b0, S);
    const back = toPx(f, S);
    close(back.cx, 200); close(back.cy, 100); close(back.hw, 50); close(back.hh, 20); close(back.a, Math.PI / 6);
    const q = boxPoint(b0, 30, -10);
    const l = boxLocal(b0, q);
    close(l.x, 30); close(l.y, -10);
  });

  it('dragging a corner of a rotated box keeps the opposite corner in place', () => {
    const hp = handlePoints(b0, 24);
    const anchor = hp.nw;
    const to = boxPoint(b0, 80, 40); // further out along the box's own axes
    const b1 = dragBox(b0, 'se', hp.se, to);
    close(handlePoints(b1, 24).nw.x, anchor.x, 1e-6);
    close(handlePoints(b1, 24).nw.y, anchor.y, 1e-6);
    close(b1.hw, (80 + 50) / 2); close(b1.hh, (40 + 20) / 2);
    close(b1.a, b0.a);
  });

  it('an edge handle changes one axis only; from the centre changes both sides', () => {
    const hp = handlePoints(b0, 24);
    const e = dragBox(b0, 'e', hp.e, boxPoint(b0, 70, 5));
    close(e.hh, 20); close(e.hw, 60);
    const c = dragBox(b0, 'e', hp.e, boxPoint(b0, 70, 5), { centre: true });
    close(c.hw, 70); close(c.cx, 200); close(c.cy, 100);
  });

  it('keeping proportions scales both axes by the larger change and keeps the anchor', () => {
    const hp = handlePoints(b0, 24);
    const b1 = dragBox(b0, 'se', hp.se, boxPoint(b0, 150, 30), { keep: true });
    close(b1.hw / b1.hh, 50 / 20, 1e-9);
    close(b1.hw, 100); // (150 + 50)/2 wins over (30 + 20)/2 × 2.5
    const nw = handlePoints(b1, 24).nw;
    close(nw.x, hp.nw.x, 1e-6); close(nw.y, hp.nw.y, 1e-6);
  });

  it('grabbing a handle off its centre does not make the box jump', () => {
    const hp = handlePoints(b0, 24);
    const grab = { x: hp.se.x + 2, y: hp.se.y - 1 };
    const b1 = dragBox(b0, 'se', grab, grab);
    close(b1.hw, 50, 1e-9); close(b1.hh, 20, 1e-9); close(b1.cx, 200, 1e-9);
  });

  it('dragging past the opposite side flips (sizes stay positive)', () => {
    const hp = handlePoints(b0, 24);
    const b1 = dragBox(b0, 'e', hp.e, boxPoint(b0, -90, 0));
    expect(b1.hw).toBeGreaterThan(0);
    close(b1.hw, 20);
  });

  it('rotation follows the pointer around the centre; keep snaps to 15°', () => {
    const r = dragBox(b0, 'rot', { x: 300, y: 100 }, { x: 200, y: 200 });
    close(r.a, Math.PI / 6 + Math.PI / 2);
    const s = dragBox({ ...b0, a: 0 }, 'rot', { x: 300, y: 100 }, { x: 300, y: 118 }, { keep: true });
    close(s.a, (15 * Math.PI) / 180);
    const m = dragBox(b0, 'move', { x: 0, y: 0 }, { x: 10, y: -5 });
    close(m.cx, 210); close(m.cy, 95);
  });

  it('hits handles by distance, the rotation handle first, and the inside as move', () => {
    const hp = handlePoints(b0, 24);
    expect(hitHandle(b0, hp.rot, 6, 24)).toBe('rot');
    expect(hitHandle(b0, { x: hp.ne.x + 3, y: hp.ne.y }, 6, 24)).toBe('ne');
    expect(hitHandle(b0, hp.s, 6, 24)).toBe('s');
    expect(hitHandle(b0, { x: 200, y: 100 }, 6, 24)).toBe('move');
    expect(hitHandle(b0, { x: 20, y: 20 }, 6, 24)).toBeNull();
    // a rotated box's corner region outside an ellipse is not «move»
    const corner = boxPoint(b0, 45, 17);
    expect(hitHandle(b0, corner, 2, 24, false)).toBe('move');
    expect(hitHandle(b0, corner, 2, 24, true)).toBeNull();
  });

  it('a new box from a drag: square, from the centre', () => {
    const b = boxFromDrag({ x: 10, y: 10 }, { x: 50, y: 30 });
    expect(b).toEqual({ cx: 30, cy: 20, hw: 20, hh: 10, a: 0 });
    const sq = boxFromDrag({ x: 10, y: 10 }, { x: 50, y: -10 }, { square: true });
    expect(sq.hw).toBe(sq.hh);
    expect(sq.cy).toBeLessThan(10);
    const c = boxFromDrag({ x: 100, y: 100 }, { x: 130, y: 90 }, { centre: true });
    expect(c).toEqual({ cx: 100, cy: 100, hw: 30, hh: 10, a: 0 });
  });
});

describe('hit testing per part kind', () => {
  const S = { w: 400, h: 200 };
  const ctx = (o: Partial<HitContext> = {}): HitContext => ({ size: S, tol: 3, ...o });

  it('rectangle and ellipse, rotated in pixels', () => {
    const r: MaskPart = { kind: 'rect', op: 'add', x: 0.25, y: 0.25, w: 0.5, h: 0.5, rot: 90, soft: 0, alpha: 1 };
    // 200×100 px rotated 90° → 100 wide, 200 tall around (200, 100)
    expect(hitPart(r, { x: 0.5, y: 0.02 }, ctx())).toBe(true);
    expect(hitPart(r, { x: 0.3, y: 0.5 }, ctx())).toBe(false);
    const e: MaskPart = { kind: 'ellipse', op: 'add', x: 0.25, y: 0.25, w: 0.5, h: 0.5, rot: 0, soft: 0, alpha: 1 };
    expect(hitPart(e, { x: 0.5, y: 0.5 }, ctx())).toBe(true);
    expect(hitPart(e, { x: 0.26, y: 0.26 }, ctx())).toBe(false);
    expect(hitPart(e, { x: 0.25 - 2 / 400, y: 0.5 }, ctx())).toBe(true); // within the tolerance
  });

  it('polygon: inside (non-zero), near an edge, outside', () => {
    const p: MaskPart = { kind: 'polygon', op: 'add', pts: [0.1, 0.1, 0.9, 0.1, 0.5, 0.9], soft: 0, alpha: 1 };
    expect(hitPart(p, { x: 0.5, y: 0.4 }, ctx())).toBe(true);
    expect(hitPart(p, { x: 0.5, y: 0.1 - 2 / 200 }, ctx())).toBe(true);
    expect(hitPart(p, { x: 0.1, y: 0.8 }, ctx())).toBe(false);
    expect(insidePolygon([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1], { x: 0.5, y: 0.5 })).toBe(true);
  });

  it('stroke: within its radius (× pressure), not beyond', () => {
    const s: MaskPart = { kind: 'stroke', op: 'add', pts: [0.2, 0.5, 0.8, 0.5], size: 0.2, hardness: 1, alpha: 1 }; // r = 20 px
    expect(hitPart(s, { x: 0.5, y: 0.5 + 18 / 200 }, ctx({ tol: 0 }))).toBe(true);
    expect(hitPart(s, { x: 0.5, y: 0.5 + 25 / 200 }, ctx({ tol: 0 }))).toBe(false);
    const thin = { ...s, pressure: [0.25, 0.25] };
    expect(hitPart(thin, { x: 0.5, y: 0.5 + 10 / 200 }, ctx({ tol: 0 }))).toBe(false);
    const dot: MaskPart = { ...s, pts: [0.5, 0.5] };
    expect(hitPart(dot, { x: 0.5 + 15 / 400, y: 0.5 }, ctx({ tol: 0 }))).toBe(true);
  });

  it('gradient: its control line; its area only when nothing else is there', () => {
    const g: MaskPart = { kind: 'gradient', op: 'add', shape: 'linear', x0: 0.5, y0: 0.1, x1: 0.5, y1: 0.9, alpha0: 1, alpha1: 0, alpha: 1 };
    expect(hitPart(g, { x: 0.5 + 2 / 400, y: 0.5 }, ctx())).toBe(true);
    expect(hitPart(g, { x: 0.2, y: 0.2 }, ctx())).toBe(false);
    const rect: MaskPart = { kind: 'rect', op: 'add', x: 0, y: 0, w: 0.3, h: 0.3, rot: 0, soft: 0, alpha: 1 };
    // the gradient is on top, but the rectangle is what is under the pointer
    expect(hitTop([rect, g], { x: 0.1, y: 0.1 }, ctx())).toBe(0);
    // nothing else: the gradient's strong half picks it, its weak half does not
    expect(hitTop([rect, g], { x: 0.8, y: 0.3 }, ctx())).toBe(1);
    expect(hitTop([rect, g], { x: 0.8, y: 0.8 }, ctx())).toBe(-1);
  });

  it('raster and colour parts ask the sampler (≥ 0.5 counts); unknown yet = no hit', () => {
    const r: MaskPart = { kind: 'raster', op: 'add', media: { kind: 'image', w: 10, h: 10 }, soft: 0, alpha: 1 };
    const c: MaskPart = { kind: 'color', op: 'add', source: 'foto', color: '#ff0000', tol: 0.1, soft: 0.1, alpha: 1 };
    const sample = (part: MaskPart, p: { x: number }) => (part.kind === 'raster' ? (p.x < 0.5 ? 1 : 0) : part.kind === 'color' ? 0.7 : null);
    expect(hitPart(r, { x: 0.2, y: 0.5 }, ctx({ sample }))).toBe(true);
    expect(hitPart(r, { x: 0.7, y: 0.5 }, ctx({ sample }))).toBe(false);
    expect(hitPart(c, { x: 0.7, y: 0.5 }, ctx({ sample }))).toBe(true);
    expect(hitPart(r, { x: 0.2, y: 0.5 }, ctx())).toBe(false);
  });

  it('the topmost of overlapping parts wins', () => {
    const a: MaskPart = { kind: 'rect', op: 'add', x: 0, y: 0, w: 1, h: 1, rot: 0, soft: 0, alpha: 1 };
    const b: MaskPart = { kind: 'ellipse', op: 'subtract', x: 0.4, y: 0.4, w: 0.2, h: 0.2, rot: 0, soft: 0, alpha: 1 };
    expect(hitTop([a, b], { x: 0.5, y: 0.5 }, ctx())).toBe(1);
    expect(hitTop([a, b], { x: 0.1, y: 0.1 }, ctx())).toBe(0);
  });
});

describe('editing helpers', () => {
  it('moves every kind that has a position; polygons insert and remove vertices', () => {
    const p: MaskPart = { kind: 'polygon', op: 'add', pts: [0, 0, 1, 0, 1, 1], soft: 0, alpha: 1 };
    expect((movePart(p, 0.1, 0.2) as typeof p).pts).toEqual([0.1, 0.2, 1.1, 0.2, 1.1, 1.2]);
    const g: MaskPart = { kind: 'gradient', op: 'add', shape: 'radial', x0: 0, y0: 0, x1: 1, y1: 1, alpha0: 1, alpha1: 0, alpha: 1 };
    expect(movePart(g, 1, 1)).toMatchObject({ x0: 1, y0: 1, x1: 2, y1: 2 });
    const e = nearestEdge(p.pts, { x: 0.5, y: -0.1 }, true);
    expect(e.i).toBe(0);
    const ins = insertVertex(p.pts, e.i, { x: 0.5, y: 0 });
    expect(ins).toEqual([0, 0, 0.5, 0, 1, 0, 1, 1]);
    expect(removeVertex(ins, 1)).toEqual(p.pts);
    expect(removeVertex(p.pts, 0)).toEqual(p.pts); // three is the minimum
    expect(Math.abs(polygonArea([0, 0, 10, 0, 10, 10, 0, 10]))).toBe(100);
  });

  it('layer space: a transformed layer maps frame points into its own units and back', () => {
    const m = layerMapping({ x: 0.1, y: -0.05, scale: 2, rot: 30 }, { w: 400, h: 200 });
    const p = { x: 0.3, y: 0.7 };
    const l = m.toLayer(p), f = m.toFrame(l);
    close(f.x, 0.3); close(f.y, 0.7);
    // the layer's centre (frame centre + offset) maps to the middle of the layer
    const c = m.toLayer({ x: 0.6, y: 0.45 });
    close(c.x, 0.5); close(c.y, 0.5);
    const id = layerMapping({ x: 0, y: 0, scale: 1, rot: 0 }, { w: 400, h: 200 });
    expect(id.toLayer(p)).toEqual(p);
  });
});
