import { describe, expect, it } from 'vitest';
import { emptyGlyph, newDoc, type Contour, type Glyph, type Pt } from '../../src/glifos/doc';
import { flattenContour } from '../../src/glifos/compile';
import { fitView, glyphFrame, panBy, pinchView, stepZoom, toFont, toScreen, zoomAbout, type View } from '../../src/glifos/ui/editor/view';
import { hitAnchor, hitBoxHandle, hitContour, hitGuide, hitHandle, hitNode, hitSegment, insideFill, marquee, nearestOnSegment, winding } from '../../src/glifos/ui/editor/hit';
import { insertNode, removeNode, removeNodes, splitCubic } from '../../src/glifos/ui/editor/split';
import { constrain45, snapPoint, snapTargets, NO_TARGETS } from '../../src/glifos/ui/editor/snap';
import { PEN_IDLE, penReduce, penSanitize, type PenState } from '../../src/glifos/ui/editor/pen';
import {
  EMPTY_SEL, addToSel, alignOpposite, applyToSelection, moveHandle, movedNodes, sanitizeSel, selectionBox, toggleSmooth, wholeContours, type GlyphPart, type Selection,
} from '../../src/glifos/ui/editor/selection';
import { deleteSelection, duplicateSelection, mirrorSelection, moveSelection, pathOpSelection, reverseSelection, setClosed } from '../../src/glifos/ui/editor/actions';
import { cubicAt, rotateCCW, segmentAt, signedArea, applyM } from '../../src/glifos/ui/editor/math';
import { effectiveAdvance, lsbEdit, rsbEdit, shiftGlyph, sidebearings } from '../../src/glifos/ui/editor/sidebearings';
import { anchorPlacement, cleanAnchorName, componentCandidates, componentProblem, usesGlyph } from '../../src/glifos/ui/editor/components';
import { KAPPA, dragBox, ellipseContour, pencilContours, rectContour } from '../../src/glifos/ui/editor/shapes';
import { isLocked, markEdited } from '../../src/glifos/ui/editor/status';
import { applyVectorized, rasterBox, tracePlace } from '../../src/glifos/ui/editor/raster';

const near = (a: Pt, b: Pt, eps = 1e-6) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
const square = (x0: number, y0: number, x1: number, y1: number): Contour => rectContour({ x0, y0, x1, y1 });
const V: View = { s: 0.5, ox: 100, oy: 600 };

/** A closed contour of two cubic segments (an eye shape) for split tests. */
const eye = (): Contour => ({
  closed: true,
  nodes: [
    { x: 0, y: 0, hi: { x: 30, y: -80 }, ho: { x: 30, y: 80 } },
    { x: 200, y: 0, hi: { x: 170, y: 80 }, ho: { x: 170, y: -80 } },
  ],
});

/** Samples the drawn outline of a contour (the shape, whatever its nodes). */
function sampleOutline(c: Contour, n = 400): Pt[] {
  const poly = flattenContour(c, 64);
  return poly.filter((_, i) => i % Math.max(1, Math.floor(poly.length / n)) === 0);
}
function distToOutline(c: Contour, p: Pt): number {
  let best = Infinity;
  for (let si = 0; si < (c.closed ? c.nodes.length : c.nodes.length - 1); si++) best = Math.min(best, nearestOnSegment(c, si, p).d);
  return best;
}

describe('view', () => {
  it('converts font units to screen and back', () => {
    const p = { x: 123.5, y: -45 };
    const s = toScreen(V, p);
    expect(s).toEqual({ x: 100 + 61.75, y: 600 + 22.5 });
    expect(near(toFont(V, s), p)).toBe(true);
  });

  it('zooming about a point keeps that point fixed', () => {
    const at = { x: 321, y: 77 };
    const before = toFont(V, at);
    const z = zoomAbout(V, 2.5, at);
    expect(z.s).toBeCloseTo(1.25, 12);
    expect(near(toFont(z, at), before, 1e-9)).toBe(true);
    // limits hold and the point still stays
    const big = zoomAbout(V, 1e6, at);
    expect(big.s).toBe(40);
    expect(near(toFont(big, at), before, 1e-9)).toBe(true);
  });

  it('fits a box centred and pinches about the midpoint', () => {
    const v = fitView({ x0: 0, y0: -200, x1: 600, y1: 800 }, 800, 600, 40);
    const c = toScreen(v, { x: 300, y: 300 });
    expect(near(c, { x: 400, y: 300 }, 1e-9)).toBe(true);
    expect(v.s).toBeCloseTo(520 / 1000, 12);
    const a0 = { x: 100, y: 100 }, b0 = { x: 200, y: 100 };
    const under = toFont(v, { x: 150, y: 100 });
    const p = pinchView(v, a0, b0, { x: 90, y: 140 }, { x: 290, y: 140 });
    expect(p.s).toBeCloseTo(v.s * 2, 12);
    expect(near(toScreen(p, under), { x: 190, y: 140 }, 1e-9)).toBe(true);
    expect(panBy(v, 5, -3).ox).toBe(v.ox + 5);
    expect(stepZoom(0.5, 1)).toBeGreaterThan(0.5);
    expect(stepZoom(0.5, -1)).toBeLessThan(0.5);
    const f = glyphFrame(600, newDoc({ mode: 'texto' }).metrics, { x0: -50, y0: 0, x1: 300, y1: 900 });
    expect(f).toEqual({ x0: -50, y0: -200, x1: 600, y1: 900 });
  });
});

describe('hit testing', () => {
  const cs = [square(0, 0, 100, 100), square(30, 30, 70, 70)];

  it('finds nodes and handles within the tolerance in screen pixels', () => {
    expect(hitNode(cs, V, toScreen(V, { x: 100, y: 100 }), 6)).toEqual({ ci: 0, ni: 2 });
    // 10 units away at scale 0.5 = 5 px: inside 6 px, outside 4 px
    expect(hitNode(cs, V, toScreen(V, { x: 110, y: 100 }), 6)).toEqual({ ci: 0, ni: 2 });
    expect(hitNode(cs, V, toScreen(V, { x: 110, y: 100 }), 4)).toBeNull();
    expect(hitHandle([eye()], V, toScreen(V, { x: 30, y: 80 }), 5)).toEqual({ ci: 0, ni: 0, which: 'ho' });
  });

  it('finds the nearest point of a segment, straight or curved', () => {
    const h = hitSegment(cs, V, toScreen(V, { x: 50, y: 2 }), 4);
    expect(h).toMatchObject({ ci: 0, si: 0 });
    expect(h!.t).toBeCloseTo(0.5, 6);
    const e = eye();
    const target = cubicAt(e.nodes[0], e.nodes[0].ho!, e.nodes[1].hi!, e.nodes[1], 0.3);
    const r = nearestOnSegment(e, 0, target);
    expect(r.d).toBeLessThan(1e-6);
    expect(r.t).toBeCloseTo(0.3, 5);
  });

  it('point in contour follows non-zero winding: a reversed inner contour is a hole', () => {
    const outer = square(0, 0, 100, 100);
    const inner: Contour = { closed: true, nodes: [...square(30, 30, 70, 70).nodes].reverse() };
    expect(insideFill([outer, inner], { x: 10, y: 10 })).toBe(true);
    expect(insideFill([outer, inner], { x: 50, y: 50 })).toBe(false);
    // the same direction does not cut: still inside
    expect(insideFill([outer, square(30, 30, 70, 70)], { x: 50, y: 50 })).toBe(true);
    expect(winding(flattenContour(outer), { x: 150, y: 50 })).toBe(0);
    // a click inside the counter picks the counter (the smallest enclosing contour)
    expect(hitContour(cs, V, toScreen(V, { x: 50, y: 50 }), 3)).toBe(1);
    expect(hitContour(cs, V, toScreen(V, { x: 15, y: 50 }), 3)).toBe(0);
    expect(hitContour(cs, V, toScreen(V, { x: 500, y: 500 }), 3)).toBeNull();
  });

  it('marquee selects the nodes inside the box, any corner order', () => {
    expect(marquee(cs, { x0: 120, y0: 120, x1: 20, y1: 20 }).sort()).toEqual(['0:2', '1:0', '1:1', '1:2', '1:3']);
    expect(hitAnchor([{ name: 'top', x: 50, y: 500 }], V, toScreen(V, { x: 52, y: 500 }), 4)).toBe(0);
    expect(hitGuide([{ axis: 'y', at: 300 }, { axis: 'x', at: 40 }], V, toScreen(V, { x: 999, y: 304 }), 3)).toBe(0);
    expect(hitBoxHandle({ x0: 0, y0: 0, x1: 100, y1: 100 }, V, toScreen(V, { x: 100, y: 0 }), 5)).toBe('se');
  });
});

describe('split', () => {
  it('splitting a cubic at t = 0.5 gives two halves on the same curve', () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 10, y: 90 }, p2 = { x: 120, y: 80 }, p3 = { x: 150, y: 0 };
    const [l, r] = splitCubic(p0, p1, p2, p3, 0.5);
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      expect(near(cubicAt(l[0], l[1], l[2], l[3], u), cubicAt(p0, p1, p2, p3, u * 0.5))).toBe(true);
      expect(near(cubicAt(r[0], r[1], r[2], r[3], u), cubicAt(p0, p1, p2, p3, 0.5 + u * 0.5))).toBe(true);
    }
  });

  it('inserting a node keeps the shape (sampled points within 1e-6)', () => {
    const e = eye();
    const out = insertNode(e, 0, 0.5);
    expect(out.nodes).toHaveLength(3);
    expect(out.nodes[1].smooth).toBe(true);
    for (const p of sampleOutline(e)) expect(distToOutline(out, p)).toBeLessThan(1e-6);
    for (const p of sampleOutline(out)) expect(distToOutline(e, p)).toBeLessThan(1e-6);
    // the original is untouched
    expect(e.nodes).toHaveLength(2);
    // a straight segment gets a corner node on the line
    const s = insertNode(square(0, 0, 100, 100), 1, 0.25);
    expect(s.nodes[2]).toEqual({ x: 100, y: 25 });
    expect(near(segmentAt(s, 1, 1), { x: 100, y: 25 })).toBe(true);
  });

  it('removing a node keeps the contour closed; too few nodes drop it', () => {
    const c = removeNode(square(0, 0, 100, 100), 1)!;
    expect(c.closed).toBe(true);
    expect(c.nodes).toHaveLength(3);
    const r = removeNodes([square(0, 0, 10, 10), { closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }], ['1:0', '0:3']);
    expect(r.contours).toHaveLength(1);
    expect(r.map).toEqual([0, -1]);
    expect(r.contours[0].closed).toBe(true);
  });
});

describe('snap', () => {
  const t = { xs: [{ at: 0, kind: 'metrica' as const }, { at: 250, kind: 'guia' as const }], ys: [{ at: 500, kind: 'metrica' as const }, { at: 520, kind: 'guia' as const }], points: [] };

  it('picks the nearest target within the threshold and ignores what is beyond', () => {
    // 8 px at scale 0.5 = 16 units of reach
    const r = snapPoint({ x: 243, y: 513 }, t, { tolPx: 8, scale: 0.5 });
    expect(r.p).toEqual({ x: 250, y: 520 });
    expect(r.lines.map(l => l.kind)).toEqual(['guia', 'guia']);
    const r2 = snapPoint({ x: 243, y: 507 }, t, { tolPx: 8, scale: 0.5 });
    expect(r2.p.y).toBe(500);
    const far = snapPoint({ x: 220, y: 560 }, t, { tolPx: 8, scale: 0.5 });
    expect(far.p).toEqual({ x: 220, y: 560 });
    expect(far.lines).toHaveLength(0);
    // zoomed in, the same distance in units is out of reach
    expect(snapPoint({ x: 243, y: 513 }, t, { tolPx: 8, scale: 4 }).lines).toHaveLength(0);
  });

  it('nodes win, the grid catches the rest', () => {
    const r = snapPoint({ x: 103, y: 98 }, { ...NO_TARGETS, points: [{ x: 100, y: 100 }] }, { tolPx: 4, scale: 1, grid: 10 });
    expect(r.node).toEqual({ x: 100, y: 100 });
    const g = snapPoint({ x: 117, y: -43 }, NO_TARGETS, { tolPx: 4, scale: 1, grid: 10 });
    expect(g.p).toEqual({ x: 120, y: -40 });
    expect(g.grid).toBe(true);
    const d = newDoc({ mode: 'texto' });
    d.guides.push({ axis: 'x', at: 333 });
    const tg = snapTargets(d, { ...emptyGlyph('a', d), contours: [square(0, 0, 10, 10)] }, 600, { lines: true, nodes: true, skip: new Set(['0:0']) });
    expect(tg.xs.map(x => x.at)).toEqual([0, 600, 333]);
    expect(tg.ys.map(y => y.at)).toEqual([0, 500, 700, 800, -200]);
    expect(tg.points).toHaveLength(3);
    const c = constrain45({ x: 0, y: 0 }, { x: 100, y: 8 });
    expect(c.y).toBeCloseTo(0, 9);
  });
});

describe('pen', () => {
  it('a click adds a corner node, a drag a smooth node with symmetric handles', () => {
    let st: PenState = PEN_IDLE;
    let cs: Contour[] = [];
    let r = penReduce(st, cs, { type: 'down', p: { x: 0, y: 0 } });
    expect(r.changed).toBe(true);
    ({ state: st, contours: cs } = r);
    ({ state: st, contours: cs } = penReduce(st, cs, { type: 'up' }));
    expect(cs).toHaveLength(1);
    expect(cs[0].nodes[0]).toEqual({ x: 0, y: 0 });
    expect(cs[0].closed).toBe(false);
    ({ state: st, contours: cs } = penReduce(st, cs, { type: 'down', p: { x: 100, y: 0 } }));
    r = penReduce(st, cs, { type: 'drag', p: { x: 140, y: 30 } });
    ({ state: st, contours: cs } = r);
    ({ state: st, contours: cs } = penReduce(st, cs, { type: 'up' }));
    const n = cs[0].nodes[1];
    expect(n.smooth).toBe(true);
    expect(n.ho).toEqual({ x: 140, y: 30 });
    expect(n.hi).toEqual({ x: 60, y: -30 });
    ({ state: st, contours: cs } = penReduce(st, cs, { type: 'down', p: { x: 100, y: 100 } }));
    ({ state: st, contours: cs } = penReduce(st, cs, { type: 'up' }));
    // a press on the first node closes the contour and ends it
    r = penReduce(st, cs, { type: 'down', p: { x: 0, y: 0 }, hit: { kind: 'node', ci: 0, ni: 0 } });
    expect(r.label).toBe('Cerrar trazo');
    ({ state: st, contours: cs } = penReduce(r.state, r.contours, { type: 'up' }));
    expect(cs[0].closed).toBe(true);
    expect(cs[0].nodes).toHaveLength(3);
    expect(st).toEqual(PEN_IDLE);
  });

  it('Esc ends an open contour (a lone node goes); a press on a segment inserts a node; Alt removes handles', () => {
    let r = penReduce(PEN_IDLE, [], { type: 'down', p: { x: 5, y: 5 } });
    r = penReduce(r.state, r.contours, { type: 'up' });
    r = penReduce(r.state, r.contours, { type: 'end' });
    expect(r.contours).toHaveLength(0);
    expect(r.state).toEqual(PEN_IDLE);
    const e = eye();
    const ins = penReduce(PEN_IDLE, [e], { type: 'down', p: { x: 0, y: 0 }, hit: { kind: 'segment', ci: 0, si: 1, t: 0.5 } });
    expect(ins.contours[0].nodes).toHaveLength(3);
    expect(ins.state).toEqual(PEN_IDLE);
    const alt = penReduce(PEN_IDLE, [e], { type: 'down', p: { x: 0, y: 0 }, hit: { kind: 'node', ci: 0, ni: 1 }, alt: true });
    expect(alt.contours[0].nodes[1].hi).toBeUndefined();
    expect(alt.contours[0].nodes[1].ho).toBeUndefined();
    // continue an open contour from its last node; a removed contour resets the pen
    const open: Contour = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    const cont = penReduce(PEN_IDLE, [open], { type: 'down', p: { x: 10, y: 0 }, hit: { kind: 'node', ci: 0, ni: 1 } });
    expect(cont.state.ci).toBe(0);
    expect(penSanitize({ ci: 3, drag: null }, [open])).toEqual(PEN_IDLE);
  });
});

describe('selection and transforms', () => {
  const part = (cs: Contour[]): GlyphPart => ({ contours: cs, components: [], anchors: [] });

  it('a transform moves selected nodes with their handles and leaves the rest', () => {
    const g = part([eye(), square(300, 0, 400, 100)]);
    const sel: Selection = { ...EMPTY_SEL, nodes: ['0:0'] };
    const out = moveSelection(g, sel, 10, -5);
    expect(out.contours[0].nodes[0]).toMatchObject({ x: 10, y: -5, hi: { x: 40, y: -85 }, ho: { x: 40, y: 75 } });
    expect(out.contours[0].nodes[1]).toBe(g.contours[0].nodes[1]);
    expect(out.contours[1]).toBe(g.contours[1]);
    // the input is never changed
    expect(g.contours[0].nodes[0].x).toBe(0);
    const whole = moveSelection(g, { ...EMPTY_SEL, contours: [1] }, 0, 50);
    expect(whole.contours[1].nodes.map(n => n.y)).toEqual([50, 50, 150, 150]);
  });

  it('dragging a handle of a smooth node keeps the other collinear (Alt breaks it)', () => {
    const c: Contour = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0, smooth: true, hi: { x: 60, y: 0 }, ho: { x: 130, y: 0 } }, { x: 200, y: 0 }] };
    const out = moveHandle(c, 1, 'ho', { x: 130, y: 40 }, false).nodes[1];
    const a = { x: out.ho!.x - out.x, y: out.ho!.y - out.y }, b = { x: out.hi!.x - out.x, y: out.hi!.y - out.y };
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 9);
    expect(a.x * b.x + a.y * b.y).toBeLessThan(0);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(40, 9);
    const broken = moveHandle(c, 1, 'ho', { x: 130, y: 40 }, true).nodes[1];
    expect(broken.hi).toEqual({ x: 60, y: 0 });
    expect(broken.smooth).toBeUndefined();
    const al = alignOpposite({ x: 0, y: 0, smooth: true, hi: { x: 0, y: 10 }, ho: { x: 30, y: 0 } }, 'hi');
    expect(near(al.ho!, { x: 0, y: -30 })).toBe(true);
  });

  it('double click turns a corner smooth with aligned handles, and back', () => {
    const c: Contour = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 100, y: 0, hi: { x: 80, y: -20 }, ho: { x: 100, y: 40 } }, { x: 100, y: 100 }] };
    const s = toggleSmooth(c, 1).nodes[1];
    expect(s.smooth).toBe(true);
    const a = { x: s.ho!.x - s.x, y: s.ho!.y - s.y }, b = { x: s.hi!.x - s.x, y: s.hi!.y - s.y };
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 9);
    expect(toggleSmooth(toggleSmooth(c, 1), 1).nodes[1].smooth).toBeUndefined();
  });

  it('mirroring keeps the signed area sign (fills stay fills)', () => {
    const tri: Contour = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 50, y: 150 }] };
    const g = part([tri, eye()]);
    for (const axis of ['h', 'v'] as const) {
      const box = selectionBox(g, { ...EMPTY_SEL, contours: [0, 1] }, () => [])!;
      const out = mirrorSelection(g, { ...EMPTY_SEL, contours: [0, 1] }, axis, box);
      expect(Math.sign(signedArea(out.contours[0]))).toBe(Math.sign(signedArea(tri)));
      expect(Math.sign(signedArea(out.contours[1]))).toBe(Math.sign(signedArea(eye())));
      expect(Math.abs(signedArea(out.contours[0]))).toBeCloseTo(Math.abs(signedArea(tri)), 6);
    }
    const flipped = mirrorSelection(g, { ...EMPTY_SEL, contours: [0] }, 'h', { x0: 0, y0: 0, x1: 200, y1: 150 });
    expect(flipped.contours[0].nodes.map(n => n.x).sort((a, b) => a - b)).toEqual([0, 150, 200]);
  });

  it('rotation goes counter-clockwise whatever the geometry lane convention', () => {
    const p = applyM(rotateCCW(90, 0, 0), { x: 10, y: 0 });
    expect(near(p, { x: 0, y: 10 }, 1e-9)).toBe(true);
  });

  it('components move and scale with the selection; anchors move', () => {
    const g: GlyphPart = { contours: [], components: [{ of: '´', dx: 10, dy: 20 }], anchors: [{ name: 'top', x: 5, y: 5 }] };
    const out = applyToSelection(g, { ...EMPTY_SEL, components: [0], anchors: [0] }, [2, 0, 0, 2, 1, 1]);
    expect(out.components[0]).toEqual({ of: '´', dx: 21, dy: 41, s: 2, manual: true });
    expect(out.anchors[0]).toEqual({ name: 'top', x: 11, y: 11 });
  });

  it('selection helpers: whole contours in pick order, shift toggles, sanitize after undo', () => {
    const g = part([square(0, 0, 10, 10), square(20, 0, 30, 10), square(40, 0, 50, 10)]);
    const s: Selection = { ...EMPTY_SEL, contours: [2], nodes: ['0:0', '0:1', '0:2', '0:3', '1:0'] };
    expect(wholeContours(s, g.contours)).toEqual([2, 0]);
    expect(movedNodes(s, g.contours).size).toBe(9);
    expect(addToSel(s, { contours: [2] }, true).contours).toEqual([]);
    expect(addToSel(s, { contours: [1] }, false).contours).toEqual([2, 1]);
    expect(sanitizeSel(s, part([square(0, 0, 10, 10)]))).toEqual({ ...EMPTY_SEL, nodes: ['0:0', '0:1', '0:2', '0:3'] });
  });
});

describe('actions', () => {
  const part = (cs: Contour[]): GlyphPart => ({ contours: cs, components: [], anchors: [] });

  it('delete removes nodes (keeping the contour) or whole contours', () => {
    const g = part([square(0, 0, 100, 100), square(200, 0, 300, 100)]);
    const a = deleteSelection(g, { ...EMPTY_SEL, nodes: ['0:1'] });
    expect(a.part.contours).toHaveLength(2);
    expect(a.part.contours[0].nodes).toHaveLength(3);
    expect(a.part.contours[0].closed).toBe(true);
    const b = deleteSelection(g, { ...EMPTY_SEL, contours: [0] });
    expect(b.part.contours).toEqual([g.contours[1]]);
  });

  it('duplicate copies with a +20, +20 offset and selects the copies', () => {
    const g = part([square(0, 0, 100, 100)]);
    const d = duplicateSelection(g, { ...EMPTY_SEL, contours: [0] });
    expect(d.part.contours).toHaveLength(2);
    expect(d.part.contours[1].nodes[0]).toEqual({ x: 20, y: 20 });
    expect(d.part.contours[0]).toBe(g.contours[0]);
    expect(d.sel.contours).toEqual([1]);
  });

  it('close, open and reverse act on the contours touched', () => {
    const open: Contour = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    const closed = setClosed(part([open]), { ...EMPTY_SEL, nodes: ['0:1'] }, true);
    expect(closed.contours[0].closed).toBe(true);
    expect(setClosed(closed, { ...EMPTY_SEL, contours: [0] }, false).contours[0].closed).toBe(false);
    const r = reverseSelection(part([square(0, 0, 10, 10)]), { ...EMPTY_SEL, contours: [0] });
    expect(Math.sign(signedArea(r.part.contours[0]))).toBe(-1);
    expect(pathOpSelection(part([square(0, 0, 10, 10)]), { ...EMPTY_SEL, contours: [0] }, 'unir')).toBeNull();
    const op = pathOpSelection(part([square(0, 0, 10, 10), square(5, 5, 15, 15), square(50, 50, 60, 60)]), { ...EMPTY_SEL, contours: [1, 0] }, 'unir');
    expect(op).not.toBeNull();
    // what was not involved stays first, untouched
    expect(op!.part.contours[0].nodes[0]).toEqual({ x: 50, y: 50 });
  });
});

describe('side bearings', () => {
  const d = newDoc({ mode: 'texto' });
  const glyph = (): Glyph => ({ ...emptyGlyph('a', d), adv: 500, contours: [square(60, 0, 420, 480)], components: [{ of: '´', dx: 100, dy: 0 }], anchors: [{ name: 'top', x: 240, y: 500 }] });

  it('editing the left bearing keeps the right one', () => {
    const g = glyph();
    const box = { x0: 60, y0: 0, x1: 420, y1: 480 };
    expect(sidebearings(box, g.adv)).toEqual({ lsb: 60, rsb: 80 });
    const e = lsbEdit(box, g.adv, 100, false);
    expect(e).toEqual({ dx: 40, adv: 540 });
    shiftGlyph(g, e.dx);
    g.adv = e.adv;
    expect(sidebearings({ x0: 100, y0: 0, x1: 460, y1: 480 }, g.adv)!.rsb).toBe(80);
    expect(g.contours[0].nodes[0].x).toBe(100);
    expect(g.components[0].dx).toBe(140);
    expect(g.anchors[0].x).toBe(280);
    // a cell-wide advance does not move
    expect(lsbEdit(box, 600, 100, true).adv).toBe(600);
    expect(rsbEdit(box, 30)).toBe(450);
    const a = newDoc({ mode: 'ascii' });
    expect(effectiveAdvance(a, { adv: 321 })).toBe(a.metrics.cell);
    expect(effectiveAdvance(a, { adv: 321, ownAdv: true })).toBe(321);
  });
});

describe('components and anchors', () => {
  const d = newDoc({ mode: 'texto' });
  d.glyphs.a = { ...d.glyphs.a, status: 'dibujado', contours: [square(50, 0, 450, 500)], anchors: [{ name: 'top', x: 250, y: 500 }] };
  d.glyphs['´'] = { ...d.glyphs['´'], status: 'dibujado', contours: [square(0, 0, 80, 150)], anchors: [{ name: '_top', x: 40, y: -20 }] };
  d.glyphs['á'] = { ...d.glyphs['á'], components: [{ of: 'a', dx: 0, dy: 0 }, { of: '´', dx: 0, dy: 0, manual: true }] };

  it('guards against using itself or a glyph that uses it', () => {
    expect(componentProblem(d, 'á', 'á')).toMatch(/sí mismo/);
    expect(usesGlyph(d, 'á', 'a')).toBe(true);
    expect(componentProblem(d, 'a', 'á')).toMatch(/ciclo/);
    expect(componentProblem(d, 'b', 'c')).toMatch(/dibujo/);
    expect(componentCandidates(d, 'o')).toContain('a');
    expect(componentCandidates(d, 'a')).not.toContain('á');
  });

  it('places a mark by anchors (_top on top)', () => {
    const p = anchorPlacement(d, d.glyphs['á'], 1);
    expect(p).toEqual({ dx: 210, dy: 520, anchor: 'top' });
    expect(anchorPlacement(d, d.glyphs['á'], 0)).toBeNull();
    expect(cleanAnchorName('  top ')).toBe('top');
    expect(cleanAnchorName('a b')).toHaveProperty('error');
  });
});

describe('shapes, pencil, status, raster', () => {
  it('rectangles and ellipses turn counter-clockwise; the ellipse has 4 smooth nodes at kappa', () => {
    expect(signedArea(rectContour({ x0: 0, y0: 0, x1: 10, y1: 10 }))).toBeGreaterThan(0);
    const e = ellipseContour({ x0: 0, y0: 0, x1: 200, y1: 100 });
    expect(e.nodes).toHaveLength(4);
    expect(e.nodes.every(n => n.smooth)).toBe(true);
    expect(e.nodes[0].ho!.y - e.nodes[0].y).toBeCloseTo(50 * KAPPA, 9);
    expect(signedArea(e)).toBeGreaterThan(0);
    // the drawn curve passes through the ellipse at 45°
    const p = cubicAt(e.nodes[0], e.nodes[0].ho!, e.nodes[1].hi!, e.nodes[1], 0.5);
    expect(((p.x - 100) / 100) ** 2 + ((p.y - 50) / 50) ** 2).toBeCloseTo(1, 3);
    expect(dragBox({ x: 10, y: 10 }, { x: 40, y: 0 }, true, false)).toEqual({ x0: 10, y0: -20, x1: 40, y1: 10 });
    expect(dragBox({ x: 10, y: 10 }, { x: 20, y: 30 }, false, true)).toEqual({ x0: 0, y0: -10, x1: 20, y1: 30 });
  });

  it('the pencil gives closed outlines', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, y: Math.sin(i / 4) * 40 }));
    const stroke = pencilContours(pts, { width: 40, closed: false, tolerance: 2, cap: 'recto' });
    expect(stroke.length).toBeGreaterThan(0);
    expect(stroke.every(c => c.closed && c.nodes.length >= 2)).toBe(true);
    const loop = Array.from({ length: 40 }, (_, i) => ({ x: Math.cos((i / 40) * Math.PI * 2) * 100, y: Math.sin((i / 40) * Math.PI * 2) * 100 }));
    const closed = pencilContours(loop, { width: 40, closed: true, tolerance: 2, cap: 'recto' });
    expect(closed).toHaveLength(1);
    expect(closed[0].closed).toBe(true);
    expect(pencilContours([{ x: 0, y: 0 }], { width: 40, closed: false, tolerance: 2, cap: 'recto' })).toEqual([]);
  });

  it('an edit marks proposals as corrected and empty glyphs as drawn; locked is view-only', () => {
    const d = newDoc({ mode: 'texto' });
    const p: Glyph = { ...emptyGlyph('b', d), status: 'propuesto', origin: 'asistente', contours: [square(0, 0, 10, 10)] };
    markEdited(p);
    expect(p.corrected).toBe(true);
    expect(p.status).toBe('propuesto');
    const mine: Glyph = { ...emptyGlyph('c', d), status: 'aceptado', origin: 'manual' };
    markEdited(mine);
    expect(mine.corrected).toBeUndefined();
    const v = emptyGlyph('e', d);
    markEdited(v);
    expect(v.status).toBe('vacio');
    v.contours.push({ closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
    markEdited(v);
    expect(v.status).toBe('vacio');
    v.contours[0].closed = true;
    markEdited(v);
    expect(v.status).toBe('dibujado');
    expect(isLocked({ ...v, status: 'bloqueado' })).toBe(true);
  });

  it('vectorising places the trace by the crop and keeps the picture as a guide', () => {
    const r = { img: '0123456789abcdef', crop: { x: 10, y: 10, w: 200, h: 100 }, x: -20, y: 700, s: 2, threshold: 0.5, read: 'oscuro' as const, use: 'glifo' as const, visible: true };
    expect(rasterBox(r)).toEqual({ x0: -20, y1: 700, x1: 380, y0: 500 });
    expect(tracePlace(r, { w: 100, h: 50 })).toEqual({ x: -20, y: 700, s: 4 });
    const d = newDoc({ mode: 'texto' });
    const g: Glyph = { ...emptyGlyph('R', d), contours: [square(0, 0, 1, 1)], raster: r };
    applyVectorized(g, [square(5, 5, 9, 9)], 'anadir');
    expect(g.contours).toHaveLength(2);
    expect(g.origin).toBe('vectorizado');
    expect(g.raster!.use).toBe('guia');
    applyVectorized(g, [square(5, 5, 9, 9)], 'reemplazar');
    expect(g.contours).toHaveLength(1);
  });
});
