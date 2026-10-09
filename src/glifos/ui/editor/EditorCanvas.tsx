/**
 * The editor's canvas: draws the glyph (draw.ts) and turns pointer gestures into edits. Everything that
 * changes at pointer speed (view, gesture, previews, hover) lives in refs and only schedules a redraw;
 * the selection and the tool live in the editor store; the document is only written through the
 * editor's editPart / editDoc (one undo step per gesture: a stable key per drag).
 */
import { useEffect, useRef } from 'react';
import type { Contour, Glyph, GlyphDoc, Pt } from '../../doc';
import { glyphContours } from '../../compile';
import { bboxOf, scaleAbout } from '../../geom/ops';
import { componentContours } from './components';
import { drawScene, readPalette, RULER, DEFAULT_PALETTE, type Palette, type Scene } from './draw';
import { useEditorApi, useEdStore, type EdState, type ToolId } from './editorStore';
import { hitAnchor, hitBoxHandle, hitContour, hitGuide, hitHandle, hitNode, hitSegment, insideFill, marquee, type BoxHandle } from './hit';
import { rotateCCW, type Box } from './math';
import { PEN_IDLE, penReduce, penSanitize, type PenHit, type PenState } from './pen';
import { rasterBox } from './raster';
import { EMPTY_SEL, addToSel, applyToSelection, moveHandle, movedNodes, nodeKey, parseKey, sanitizeSel, selectionBox, toggleSmooth, type GlyphPart, type Selection } from './selection';
import { dragBox, ellipseContour, pencilContours, rectContour } from './shapes';
import { effectiveAdvance } from './sidebearings';
import { constrain45, snapPoint, snapTargets, type SnapLine } from './snap';
import { fitView, glyphFrame, panBy, pinchView, stepZoom, toFont, toScreen, zoomAbout, type View } from './view';

type Img = (CanvasImageSource & { width: number; height: number }) | undefined;

type Gesture =
  | { kind: 'pan'; s0: Pt; v0: View }
  | { kind: 'pinch'; a0: Pt; b0: Pt; v0: View; ids: [number, number] }
  | { kind: 'marquee'; a: Pt; b: Pt; base: Selection; add: boolean; s0: Pt }
  | { kind: 'move'; f0: Pt; grab: Pt; orig: GlyphPart; sel: Selection; skip: Set<string>; key: string; s0: Pt; live: boolean }
  | { kind: 'handle'; ci: number; ni: number; which: 'hi' | 'ho'; orig: Contour; key: string; s0: Pt; live: boolean }
  | { kind: 'box'; handle: BoxHandle; box: Box; f0: Pt; orig: GlyphPart; sel: Selection; skip: Set<string>; key: string }
  | { kind: 'pen'; key: string; s0: Pt; dragging: boolean }
  | { kind: 'pencil'; pts: Pt[]; last: Pt }
  | { kind: 'shape'; shape: 'rectangulo' | 'elipse'; a: Pt; b: Pt; s0: Pt }
  | { kind: 'guide'; index: number | null; axis: 'x' | 'y'; at: number; outside: boolean; s0: Pt; moved: boolean }
  | { kind: 'raster'; f0: Pt; ox: number; oy: number; key: string };

interface Mods { shift: boolean; alt: boolean; button: number; pointerType: string }

let gestureSeq = 0;
const newKey = (k: string) => `${k}-${++gestureSeq}`;

const BOX_CURSOR: Record<BoxHandle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', rot: 'grab' };

export function EditorCanvas({ doc, g, ch, image, label, describedBy }: {
  doc: GlyphDoc; g: Glyph; ch: string; image?: (id: string) => Img; label: string; describedBy: string;
}) {
  const api = useEditorApi();
  const store = useEdStore();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ doc, g, ch, image, api });
  live.current = { doc, g, ch, image, api };

  const viewRef = useRef<View | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const palRef = useRef<Palette>(DEFAULT_PALETTE);
  const rafRef = useRef(0);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, Pt>());
  const pendingRef = useRef<{ id: number; sp: Pt; mods: Mods; t: number } | null>(null);
  const penRef = useRef<PenState>(PEN_IDLE);
  const spaceRef = useRef(false);
  const focusNodeRef = useRef<string | null>(null);
  const fitOnSizeRef = useRef(true);
  const coarseRef = useRef(false);
  const hoverRef = useRef<{ node: string | null; seg: { p: Pt } | null; guide: number | null; cursor: Pt | null; closeHot: boolean }>({ node: null, seg: null, guide: null, cursor: null, closeHot: false });
  const previewRef = useRef<{ snap: { lines: SnapLine[]; node?: Pt } | null }>({ snap: null });
  const compCache = useRef<{ doc: GlyphDoc | null; g: Glyph | null; comps: Contour[][]; full: Box | null }>({ doc: null, g: null, comps: [], full: null });

  const invalidate = () => { if (!rafRef.current) rafRef.current = requestAnimationFrame(paint); };

  const ed = () => store.getState();
  const setSel = (sel: Selection) => store.setState({ sel });

  function derived() {
    const { doc: d, g: gl, ch: c } = live.current;
    const cc = compCache.current;
    if (cc.doc !== d || cc.g !== gl) {
      cc.doc = d; cc.g = gl;
      cc.comps = gl.components.map(k => componentContours(d, k));
      cc.full = bboxOf(glyphContours(d, c));
    }
    return cc;
  }
  const part = (): GlyphPart => ({ contours: live.current.g.contours, components: live.current.g.components, anchors: live.current.g.anchors });
  const advOf = () => effectiveAdvance(live.current.doc, live.current.g);

  function transformBox(st: EdState): Box | null {
    if (st.tool !== 'seleccionar' || !live.current.api.editable) return null;
    const s = st.sel;
    const n = movedNodes(s, live.current.g.contours).size;
    if (n < 2 && !s.contours.length && !s.components.length && s.anchors.length < 2) return null;
    const b = selectionBox(part(), s, i => derived().comps[i] ?? []);
    if (!b || (b.x1 - b.x0 < 1e-6 && b.y1 - b.y0 < 1e-6)) return null;
    return b;
  }

  function paint() {
    rafRef.current = 0;
    const cv = canvasRef.current, v = viewRef.current;
    if (!cv || !v) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const st = ed();
    const { doc: d, g: gl, image: img } = live.current;
    const dv = derived();
    const gs = gestureRef.current;
    const pen = st.tool === 'pluma' ? { ci: penRef.current.ci, cursor: hoverRef.current.cursor, closeHot: hoverRef.current.closeHot } : null;
    const scene: Scene = {
      w, h, dpr, v, pal: palRef.current, doc: d, g: gl, adv: advOf(), fullBox: dv.full, compContours: dv.comps,
      selNodes: movedNodes(st.sel, gl.contours), selContours: new Set(st.sel.contours), selComponents: new Set(st.sel.components), selAnchors: new Set(st.sel.anchors),
      fill: st.fill, showHandles: true, image: gl.raster ? img?.(gl.raster.img) : undefined,
      transformBox: gs && gs.kind !== 'box' && gs.kind !== 'pan' && gs.kind !== 'pinch' ? null : transformBox(st),
      hoverNode: hoverRef.current.node, hoverSeg: st.tool === 'pluma' ? hoverRef.current.seg : null, hoverGuide: hoverRef.current.guide,
      focusNode: focusNodeRef.current, pen,
      pencil: gs?.kind === 'pencil' ? { pts: gs.pts, width: st.pencilWidth ?? d.style.weight, closed: st.pencilClosed } : null,
      shape: gs?.kind === 'shape' ? { kind: gs.shape, box: dragBox(gs.a, gs.b, false, false) } : null,
      marquee: gs?.kind === 'marquee' ? { x0: gs.a.x, y0: gs.a.y, x1: gs.b.x, y1: gs.b.y } : null,
      snap: gs && (gs.kind === 'move' || gs.kind === 'handle' || gs.kind === 'box' || gs.kind === 'shape' || gs.kind === 'pen' || gs.kind === 'guide') || st.tool === 'pluma' ? previewRef.current.snap : null,
      guideDrag: gs?.kind === 'guide' ? { axis: gs.axis, at: gs.at, outside: gs.outside, index: gs.index } : null,
      grid: st.snap.grid ? st.snap.step : 0, coarse: coarseRef.current, moveImage: st.moveImage,
    };
    if (gs?.kind === 'shape') scene.shape = { kind: gs.shape, box: shapeBoxOf(gs) };
    drawScene(ctx, scene);
  }

  // shift/alt at the last pointer event (shape constraints are read while drawing)
  const modsRef = useRef({ shift: false, alt: false });
  const shapeBoxOf = (gs: Extract<Gesture, { kind: 'shape' }>) => dragBox(gs.a, gs.b, modsRef.current.shift, modsRef.current.alt);

  const fit = () => {
    const { w, h } = sizeRef.current;
    if (!w || !h) { fitOnSizeRef.current = true; return; }
    const dv = derived();
    const box = glyphFrame(advOf(), live.current.doc.metrics, dv.full);
    // the rulers take the top and left edges: centre in what is left
    const v = fitView(box, w - RULER, h - RULER, Math.min(48, Math.max(20, Math.min(w, h) * 0.06)));
    viewRef.current = { s: v.s, ox: v.ox + RULER, oy: v.oy + RULER };
    syncZoom();
    invalidate();
  };
  const syncZoom = () => { const v = viewRef.current; if (v && Math.abs(ed().zoom - v.s) > 1e-9) store.setState({ zoom: v.s }); };
  const setView = (v: View) => { viewRef.current = v; syncZoom(); invalidate(); };

  // canvas API for the toolbar and the keyboard
  useEffect(() => {
    api.canvas.current = {
      zoomBy: dir => {
        const v = viewRef.current;
        if (!v) return;
        const { w, h } = sizeRef.current;
        setView(zoomAbout(v, stepZoom(v.s, dir) / v.s, { x: (w + RULER) / 2, y: (h + RULER) / 2 }));
      },
      fit,
      endPen: () => {
        if (penRef.current.ci === null) return false;
        runPen({ type: 'end' }, newKey('pen'));
        return true;
      },
      stepNode: dir => {
        const cs = live.current.g.contours;
        const all: string[] = [];
        cs.forEach((c, ci) => c.nodes.forEach((_, ni) => all.push(nodeKey(ci, ni))));
        if (!all.length) return false;
        const cur = focusNodeRef.current ?? (ed().sel.nodes.length === 1 ? ed().sel.nodes[0] : null);
        const i = cur ? all.indexOf(cur) : -1;
        const j = i < 0 ? (dir > 0 ? 0 : all.length - 1) : i + dir;
        if (j < 0 || j >= all.length) { focusNodeRef.current = null; invalidate(); return false; }
        focusNodeRef.current = all[j];
        setSel({ ...EMPTY_SEL, nodes: [all[j]] });
        ensureVisible(all[j]);
        invalidate();
        return true;
      },
    };
    return () => { api.canvas.current = null; };
  });

  const ensureVisible = (k: string) => {
    const [ci, ni] = parseKey(k);
    const n = live.current.g.contours[ci]?.nodes[ni];
    const v = viewRef.current;
    if (!n || !v) return;
    const p = toScreen(v, n), { w, h } = sizeRef.current, pad = 40;
    let dx = 0, dy = 0;
    if (p.x < RULER + pad) dx = RULER + pad - p.x; else if (p.x > w - pad) dx = w - pad - p.x;
    if (p.y < RULER + pad) dy = RULER + pad - p.y; else if (p.y > h - pad) dy = h - pad - p.y;
    if (dx || dy) setView(panBy(v, dx, dy));
  };

  // size, palette, pointer type
  useEffect(() => {
    const wrap = wrapRef.current, cv = canvasRef.current;
    if (!wrap || !cv) return;
    palRef.current = readPalette(wrap);
    const mq = window.matchMedia('(pointer: coarse)');
    coarseRef.current = mq.matches;
    const onMq = () => { coarseRef.current = mq.matches; invalidate(); };
    mq.addEventListener?.('change', onMq);
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const prev = sizeRef.current;
      sizeRef.current = { w, h, dpr };
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      if (fitOnSizeRef.current || !viewRef.current) { fitOnSizeRef.current = false; fit(); return; }
      // keep the centre where it was
      const v = viewRef.current;
      setView({ s: v.s, ox: v.ox + (w - prev.w) / 2, oy: v.oy + (h - prev.h) / 2 });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    const unsub = store.subscribe((s, p) => {
      if (s.tool !== p.tool) {
        if (p.tool === 'pluma' && penRef.current.ci !== null) runPen({ type: 'end' }, newKey('pen'));
        penRef.current = PEN_IDLE;
        store.setState({ penActive: false });
        hoverRef.current = { node: null, seg: null, guide: null, cursor: null, closeHot: false };
        previewRef.current.snap = null;
        setCursor();
      }
      if (s.sel !== p.sel && focusNodeRef.current && !(s.sel.nodes.length === 1 && s.sel.nodes[0] === focusNodeRef.current)) focusNodeRef.current = null;
      invalidate();
    });
    return () => { ro.disconnect(); unsub(); mq.removeEventListener?.('change', onMq); cancelAnimationFrame(rafRef.current); rafRef.current = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // another glyph: frame it, nothing selected, the pen at rest
  useEffect(() => {
    penRef.current = PEN_IDLE;
    focusNodeRef.current = null;
    gestureRef.current = null;
    store.setState({ sel: EMPTY_SEL, penActive: false });
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);

  // the document changed (an edit, undo, redo): what is selected must still exist
  useEffect(() => {
    const s = ed().sel, ns = sanitizeSel(s, part());
    if (ns !== s) setSel(ns);
    const ps = penSanitize(penRef.current, g.contours);
    if (ps !== penRef.current) { penRef.current = ps; store.setState({ penActive: ps.ci !== null }); }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, g]);

  // wheel: Ctrl/Cmd zooms about the pointer, otherwise it pans (trackpads); space held pans with the pointer
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey || e.metaKey) setView(zoomAbout(v, Math.exp(-e.deltaY * unit * 0.0022), at));
      else setView(panBy(v, -e.deltaX * unit, -e.deltaY * unit));
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    const scope = (t: EventTarget | null) => t === document.body || t === wrapRef.current;
    const kd = (e: KeyboardEvent) => {
      if (e.key === ' ' && scope(e.target) && !e.repeat) { spaceRef.current = true; setCursor(); e.preventDefault(); }
      if (e.key === 'Shift' || e.key === 'Alt') { modsRef.current = { shift: e.shiftKey, alt: e.altKey }; if (gestureRef.current?.kind === 'shape') invalidate(); }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = false; setCursor(); }
      if (e.key === 'Shift' || e.key === 'Alt') { modsRef.current = { shift: e.shiftKey, alt: e.altKey }; if (gestureRef.current?.kind === 'shape') invalidate(); }
    };
    const blur = () => { spaceRef.current = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => { cv.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- helpers ---------------- */

  const screenOf = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const tol = () => (coarseRef.current ? 16 : 8);

  function snapAt(p: Pt, skip?: Set<string>): Pt {
    const sp = ed().snap, v = viewRef.current!;
    if (!sp.grid && !sp.lines && !sp.nodes) { previewRef.current.snap = null; return p; }
    const t = snapTargets(live.current.doc, live.current.g, advOf(), { lines: sp.lines, nodes: sp.nodes, skip });
    const r = snapPoint(p, t, { tolPx: coarseRef.current ? 12 : 7, scale: v.s, grid: sp.grid ? sp.step : 0 });
    previewRef.current.snap = r.lines.length || r.node ? { lines: r.lines, node: r.node } : null;
    return r.p;
  }

  function setCursor(c?: string) {
    const cv = canvasRef.current;
    if (!cv) return;
    const gs = gestureRef.current;
    cv.style.cursor = gs?.kind === 'pan' ? 'grabbing' : spaceRef.current ? 'grab' : c ?? cv.style.cursor;
  }

  function runPen(ev: Parameters<typeof penReduce>[2], key: string) {
    const { api: a, g: gl } = live.current;
    const r = penReduce(penRef.current, gl.contours, ev);
    penRef.current = r.state;
    if (r.changed) a.editPart(gg => { gg.contours = r.contours; }, r.label, key);
    store.setState({ penActive: r.state.ci !== null });
    if (r.state.ci !== null) {
      const c = r.contours[r.state.ci];
      if (c) setSel({ ...EMPTY_SEL, nodes: [nodeKey(r.state.ci, c.nodes.length - 1)] });
    } else if (ev.type === 'down' && r.label === 'Cerrar trazo' && r.state.drag) setSel({ ...EMPTY_SEL, contours: [r.state.drag.ci] });
    invalidate();
  }

  /* ---------------- gestures ---------------- */

  function begin(sp: Pt, m: Mods) {
    const v = viewRef.current;
    if (!v) return;
    const { api: a, g: gl, doc: d } = live.current;
    const st = ed();
    const fp = toFont(v, sp);
    modsRef.current = { shift: m.shift, alt: m.alt };
    previewRef.current.snap = null;

    if (m.button === 1 || (m.button === 0 && spaceRef.current)) { gestureRef.current = { kind: 'pan', s0: sp, v0: v }; setCursor(); return; }
    if (m.button !== 0) return;

    // rulers: drag a new guide out of them (any tool)
    if ((sp.y < RULER && sp.x > RULER) || (sp.x < RULER && sp.y > RULER)) {
      if (!a.docEditable) return;
      const axis = sp.y < RULER ? 'x' : 'y';
      gestureRef.current = { kind: 'guide', index: null, axis, at: axis === 'x' ? fp.x : fp.y, outside: true, s0: sp, moved: false };
      invalidate();
      return;
    }

    const tool: ToolId = st.tool;
    if (tool === 'guia') {
      if (!a.docEditable) return;
      const gi = hitGuide(d.guides, v, sp, tol());
      if (gi !== null) {
        const gd = d.guides[gi];
        gestureRef.current = { kind: 'guide', index: gi, axis: gd.axis, at: gd.at, outside: false, s0: sp, moved: false };
      } else {
        const axis = m.alt ? 'x' : 'y';
        const p = snapAt(fp);
        gestureRef.current = { kind: 'guide', index: null, axis, at: axis === 'x' ? p.x : p.y, outside: false, s0: sp, moved: false };
      }
      invalidate();
      return;
    }

    if (tool === 'seleccionar') {
      const sel = st.sel;
      const tb = a.editable ? transformBox(st) : null;
      if (tb) {
        const bh = hitBoxHandle(tb, v, sp, coarseRef.current ? 16 : 9);
        if (bh) {
          gestureRef.current = { kind: 'box', handle: bh, box: tb, f0: fp, orig: part(), sel, skip: movedNodes(sel, gl.contours), key: newKey('box') };
          return;
        }
      }
      const hh = hitHandle(gl.contours, v, sp, tol());
      if (hh && a.editable) {
        setSel({ ...EMPTY_SEL, nodes: [nodeKey(hh.ci, hh.ni)] });
        gestureRef.current = { kind: 'handle', ...hh, orig: gl.contours[hh.ci], key: newKey('asa'), s0: sp, live: false };
        return;
      }
      const hn = hitNode(gl.contours, v, sp, tol());
      if (hn) {
        const k = nodeKey(hn.ci, hn.ni);
        const inSel = movedNodes(sel, gl.contours).has(k);
        let ns = sel;
        if (m.shift) ns = addToSel(sel, { nodes: [k] }, true);
        else if (!inSel) ns = { ...EMPTY_SEL, nodes: [k] };
        setSel(ns);
        if (a.editable && (!m.shift || !inSel)) startMove(fp, gl.contours[hn.ci].nodes[hn.ni], ns, sp);
        return;
      }
      const ha = hitAnchor(gl.anchors, v, sp, tol());
      if (ha !== null) {
        const inSel = sel.anchors.includes(ha);
        const ns = m.shift ? addToSel(sel, { anchors: [ha] }, true) : inSel ? sel : { ...EMPTY_SEL, anchors: [ha] };
        setSel(ns);
        if (a.editable) startMove(fp, gl.anchors[ha], ns, sp);
        return;
      }
      if (st.moveImage && gl.raster && a.editable) {
        const rb = rasterBox(gl.raster);
        if (fp.x >= rb.x0 && fp.x <= rb.x1 && fp.y >= rb.y0 && fp.y <= rb.y1) {
          gestureRef.current = { kind: 'raster', f0: fp, ox: gl.raster.x, oy: gl.raster.y, key: newKey('imagen') };
          return;
        }
      }
      const hc = hitContour(gl.contours, v, sp, coarseRef.current ? 10 : 5);
      if (hc !== null) {
        const inSel = sel.contours.includes(hc) || gl.contours[hc].nodes.every((_, ni) => sel.nodes.includes(nodeKey(hc, ni)));
        const ns = m.shift ? addToSel(sel, { contours: [hc] }, true) : inSel ? sel : { ...EMPTY_SEL, contours: [hc] };
        setSel(ns);
        if (a.editable && (!m.shift || !inSel)) startMove(fp, nearestSelected(fp, ns) ?? fp, ns, sp);
        return;
      }
      const comps = derived().comps;
      for (let i = comps.length - 1; i >= 0; i--) {
        const onLine = hitContour(comps[i], v, sp, coarseRef.current ? 10 : 5) !== null || insideFill(comps[i], fp);
        if (!onLine) continue;
        const inSel = sel.components.includes(i);
        const ns = m.shift ? addToSel(sel, { components: [i] }, true) : inSel ? sel : { ...EMPTY_SEL, components: [i] };
        setSel(ns);
        if (a.editable && (!m.shift || !inSel)) startMove(fp, fp, ns, sp);
        return;
      }
      gestureRef.current = { kind: 'marquee', a: fp, b: fp, base: m.shift ? sel : EMPTY_SEL, add: m.shift, s0: sp };
      if (!m.shift) setSel(EMPTY_SEL);
      return;
    }

    if (!a.editable) return;

    if (tool === 'pluma') {
      const key = newKey('pen');
      let hit: PenHit | null = null;
      const pen = penRef.current;
      if (pen.ci !== null) {
        const first = gl.contours[pen.ci]?.nodes[0];
        if (first && gl.contours[pen.ci].nodes.length >= 2 && Math.hypot(toScreen(v, first).x - sp.x, toScreen(v, first).y - sp.y) <= tol() + 2) hit = { kind: 'node', ci: pen.ci, ni: 0 };
      } else {
        const hn = hitNode(gl.contours, v, sp, tol());
        if (hn) hit = { kind: 'node', ...hn };
        else {
          const hs = hitSegment(gl.contours, v, sp, coarseRef.current ? 10 : 6);
          if (hs) hit = { kind: 'segment', ci: hs.ci, si: hs.si, t: hs.t };
        }
      }
      if (m.alt && pen.ci === null && hit?.kind !== 'node') return;
      let p = hit?.kind === 'node' ? gl.contours[hit.ci].nodes[hit.ni] : snapAt(fp);
      if (m.shift && pen.ci !== null && hit?.kind !== 'node') {
        const c = gl.contours[pen.ci];
        if (c?.nodes.length) p = constrain45(c.nodes[c.nodes.length - 1], p);
      }
      gestureRef.current = { kind: 'pen', key, s0: sp, dragging: false };
      runPen({ type: 'down', p, hit, alt: m.alt }, key);
      return;
    }
    if (tool === 'lapiz') {
      gestureRef.current = { kind: 'pencil', pts: [fp], last: sp };
      return;
    }
    if (tool === 'rectangulo' || tool === 'elipse') {
      const p = snapAt(fp);
      gestureRef.current = { kind: 'shape', shape: tool, a: p, b: p, s0: sp };
      invalidate();
    }
  }

  function nearestSelected(fp: Pt, sel: Selection): Pt | null {
    let best: Pt | null = null, bd = Infinity;
    for (const k of movedNodes(sel, live.current.g.contours)) {
      const [ci, ni] = parseKey(k);
      const n = live.current.g.contours[ci]?.nodes[ni];
      if (!n) continue;
      const d = Math.hypot(n.x - fp.x, n.y - fp.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function startMove(fp: Pt, grab: Pt, sel: Selection, sp: Pt) {
    gestureRef.current = { kind: 'move', f0: fp, grab: { x: grab.x, y: grab.y }, orig: part(), sel, skip: movedNodes(sel, live.current.g.contours), key: newKey('mover'), s0: sp, live: false };
  }

  function update(sp: Pt, m: Mods) {
    const gs = gestureRef.current, v = viewRef.current;
    if (!gs || !v) return;
    const { api: a } = live.current;
    const fp = toFont(v, sp);
    modsRef.current = { shift: m.shift, alt: m.alt };
    const far = (s0: Pt, px = 3) => Math.hypot(sp.x - s0.x, sp.y - s0.y) > px;
    switch (gs.kind) {
      case 'pan': setView(panBy(gs.v0, sp.x - gs.s0.x, sp.y - gs.s0.y)); return;
      case 'marquee': gs.b = fp; invalidate(); return;
      case 'move': {
        if (!gs.live && !far(gs.s0, coarseRef.current ? 6 : 3)) return;
        gs.live = true;
        let dx = fp.x - gs.f0.x, dy = fp.y - gs.f0.y;
        if (m.shift) { const c = constrain45({ x: 0, y: 0 }, { x: dx, y: dy }); dx = c.x; dy = c.y; }
        if (m.shift) previewRef.current.snap = null;
        else { const target = snapAt({ x: gs.grab.x + dx, y: gs.grab.y + dy }, gs.skip); dx = target.x - gs.grab.x; dy = target.y - gs.grab.y; }
        const out = applyToSelection(gs.orig, gs.sel, [1, 0, 0, 1, dx, dy]);
        a.editPart(gg => { gg.contours = out.contours; gg.components = out.components; gg.anchors = out.anchors; }, 'Mover', gs.key);
        return;
      }
      case 'handle': {
        if (!gs.live && !far(gs.s0, 2)) return;
        gs.live = true;
        const p = snapAt(fp, new Set([nodeKey(gs.ci, gs.ni)]));
        const c = moveHandle(gs.orig, gs.ni, gs.which, p, m.alt);
        a.editPart(gg => { gg.contours[gs.ci] = c; }, 'Mover asa', gs.key);
        return;
      }
      case 'box': {
        const b = gs.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        let mat: [number, number, number, number, number, number];
        let label = 'Escalar';
        if (gs.handle === 'rot') {
          let ang = (Math.atan2(fp.y - cy, fp.x - cx) - Math.atan2(gs.f0.y - cy, gs.f0.x - cx)) * 180 / Math.PI;
          if (m.shift) ang = Math.round(ang / 15) * 15;
          mat = rotateCCW(ang, cx, cy);
          label = 'Rotar';
          previewRef.current.snap = null;
        } else {
          const p = snapAt(fp, gs.skip);
          const hx = gs.handle.includes('w') ? b.x0 : gs.handle.includes('e') ? b.x1 : cx;
          const hy = gs.handle.includes('n') ? b.y1 : gs.handle.includes('s') ? b.y0 : cy;
          const ax = m.alt ? cx : gs.handle.includes('w') ? b.x1 : b.x0;
          const ay = m.alt ? cy : gs.handle.includes('n') ? b.y0 : b.y1;
          const useX = gs.handle !== 'n' && gs.handle !== 's', useY = gs.handle !== 'e' && gs.handle !== 'w';
          let sx = useX && Math.abs(hx - ax) > 1e-6 ? (p.x - ax) / (hx - ax) : 1;
          let sy = useY && Math.abs(hy - ay) > 1e-6 ? (p.y - ay) / (hy - ay) : 1;
          if (m.shift) {
            // proportional: the larger change wins; each axis keeps its own flip
            if (useX && useY) { const k = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * k; sy = Math.sign(sy || 1) * k; }
            else if (useX) sy = Math.abs(sx);
            else sx = Math.abs(sy);
          }
          if (!Number.isFinite(sx) || Math.abs(sx) < 1e-3) sx = sx < 0 ? -1e-3 : 1e-3;
          if (!Number.isFinite(sy) || Math.abs(sy) < 1e-3) sy = sy < 0 ? -1e-3 : 1e-3;
          mat = scaleAbout(sx, sy, ax, ay);
        }
        const out = applyToSelection(gs.orig, gs.sel, mat);
        a.editPart(gg => { gg.contours = out.contours; gg.components = out.components; gg.anchors = out.anchors; }, label, gs.key);
        return;
      }
      case 'pen': {
        if (!gs.dragging && !far(gs.s0, coarseRef.current ? 6 : 3)) return;
        gs.dragging = true;
        const d = penRef.current.drag;
        let p = fp;
        if (m.shift && d) { const n = live.current.g.contours[d.ci]?.nodes[d.ni]; if (n) p = constrain45(n, fp); }
        runPen({ type: 'drag', p }, gs.key);
        return;
      }
      case 'pencil':
        if (!far(gs.last, 1.5)) return;
        gs.pts.push(fp);
        gs.last = sp;
        invalidate();
        return;
      case 'shape':
        gs.b = snapAt(fp);
        invalidate();
        return;
      case 'guide': {
        if (!gs.moved && !far(gs.s0, 2)) return;
        gs.moved = true;
        const { w, h } = sizeRef.current;
        gs.outside = sp.x < RULER || sp.y < RULER || sp.x > w || sp.y > h;
        const p = gs.outside ? fp : snapAt(fp);
        gs.at = gs.axis === 'x' ? p.x : p.y;
        invalidate();
        return;
      }
      case 'raster': {
        const dx = fp.x - gs.f0.x, dy = fp.y - gs.f0.y;
        a.editPart(gg => { if (gg.raster) { gg.raster.x = Math.round(gs.ox + dx); gg.raster.y = Math.round(gs.oy + dy); } }, 'Mover imagen', gs.key);
        return;
      }
      case 'pinch': return;
    }
  }

  function finish(cancel = false) {
    const gs = gestureRef.current;
    gestureRef.current = null;
    if (!gs) return;
    const { api: a, g: gl, doc: d } = live.current;
    const st = ed();
    previewRef.current.snap = null;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    switch (gs.kind) {
      case 'marquee': {
        if (cancel) break;
        const box = { x0: gs.a.x, y0: gs.a.y, x1: gs.b.x, y1: gs.b.y };
        const v = viewRef.current!;
        const tiny = Math.abs(gs.a.x - gs.b.x) * v.s < 3 && Math.abs(gs.a.y - gs.b.y) * v.s < 3;
        if (tiny) { if (!gs.add) setSel(EMPTY_SEL); break; }
        const nodes = marquee(gl.contours, box);
        const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
        const anchors = gl.anchors.flatMap((an, i) => (an.x >= x0 && an.x <= x1 && an.y >= y0 && an.y <= y1 ? [i] : []));
        setSel(addToSel(gs.base, { nodes, anchors }, false));
        break;
      }
      case 'pen':
        runPen({ type: 'up' }, gs.key);
        break;
      case 'pencil': {
        if (cancel || gs.pts.length < 2) break;
        const v = viewRef.current!;
        const width = st.pencilWidth ?? d.style.weight;
        const cs = pencilContours(gs.pts, { width, closed: st.pencilClosed, tolerance: 1.5 / v.s, cap: d.style.terminal });
        if (!cs.length) break;
        const base = gl.contours.length;
        if (a.editPart(gg => { gg.contours.push(...cs); }, 'Lápiz')) setSel({ ...EMPTY_SEL, contours: cs.map((_, i) => base + i) });
        break;
      }
      case 'shape': {
        if (cancel) break;
        const b = shapeBoxOf(gs), v = viewRef.current!;
        if ((b.x1 - b.x0) * v.s < 3 || (b.y1 - b.y0) * v.s < 3) break;
        const rb = { x0: r1(b.x0), y0: r1(b.y0), x1: r1(b.x1), y1: r1(b.y1) };
        const c = gs.shape === 'rectangulo' ? rectContour(rb) : ellipseContour(rb);
        const base = gl.contours.length;
        if (a.editPart(gg => { gg.contours.push(c); }, gs.shape === 'rectangulo' ? 'Rectángulo' : 'Elipse')) setSel({ ...EMPTY_SEL, contours: [base] });
        break;
      }
      case 'guide': {
        if (cancel) break;
        const at = Math.round(gs.at);
        if (gs.index === null) {
          if (gs.outside) break;
          a.editDoc(dd => { dd.guides.push({ axis: gs.axis, at }); }, gs.axis === 'x' ? 'Añadir guía vertical' : 'Añadir guía horizontal');
          a.say(`Guía ${gs.axis === 'x' ? 'vertical en x' : 'horizontal en y'} ${at}`);
        } else if (gs.outside) {
          const i = gs.index;
          a.editDoc(dd => { dd.guides.splice(i, 1); }, 'Quitar guía');
          a.say('Guía quitada');
        } else if (gs.moved) {
          const i = gs.index;
          a.editDoc(dd => { if (dd.guides[i]) dd.guides[i].at = at; }, 'Mover guía');
        }
        break;
      }
      default: break;
    }
    setCursor();
    invalidate();
  }

  /* ---------------- pointer events ---------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sp = screenOf(e);
    wrapRef.current?.setAttribute('data-pointer', '');
    wrapRef.current?.focus({ preventScroll: true });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    const ps = pointersRef.current;
    ps.set(e.pointerId, sp);
    const mods: Mods = { shift: e.shiftKey, alt: e.altKey, button: e.button, pointerType: e.pointerType };
    if (ps.size === 2 && viewRef.current) {
      // two fingers: pan and zoom; whatever one finger started stops here
      pendingRef.current = null;
      const cur = gestureRef.current;
      if (cur && cur.kind !== 'pinch') finish(cur.kind === 'pencil' || cur.kind === 'shape' || cur.kind === 'marquee' || cur.kind === 'guide');
      const [[ia, a0], [ib, b0]] = [...ps.entries()];
      gestureRef.current = { kind: 'pinch', a0, b0, v0: viewRef.current, ids: [ia, ib] };
      return;
    }
    if (ps.size > 2) return;
    if (e.pointerType === 'touch') {
      // a second finger may follow: wait a moment (or for a move) before acting
      pendingRef.current = { id: e.pointerId, sp, mods, t: performance.now() };
      window.setTimeout(() => { const p = pendingRef.current; if (p && p.id === e.pointerId) { pendingRef.current = null; begin(p.sp, p.mods); } }, 90);
      return;
    }
    begin(sp, mods);
    if (gestureRef.current) e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sp = screenOf(e);
    const ps = pointersRef.current;
    if (ps.has(e.pointerId)) ps.set(e.pointerId, sp);
    const mods: Mods = { shift: e.shiftKey, alt: e.altKey, button: e.button, pointerType: e.pointerType };
    const pend = pendingRef.current;
    if (pend && pend.id === e.pointerId && Math.hypot(sp.x - pend.sp.x, sp.y - pend.sp.y) > 8) { pendingRef.current = null; begin(pend.sp, pend.mods); }
    const gs = gestureRef.current;
    if (gs?.kind === 'pinch') {
      const a1 = ps.get(gs.ids[0]), b1 = ps.get(gs.ids[1]);
      if (a1 && b1) setView(pinchView(gs.v0, gs.a0, gs.b0, a1, b1));
      return;
    }
    if (gs) { update(sp, mods); return; }
    hover(sp, e.altKey);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ps = pointersRef.current;
    ps.delete(e.pointerId);
    const pend = pendingRef.current;
    if (pend && pend.id === e.pointerId) { pendingRef.current = null; begin(pend.sp, pend.mods); }
    const gs = gestureRef.current;
    if (gs?.kind === 'pinch') { if (ps.size < 2) gestureRef.current = null; return; }
    if (gs) { update(screenOf(e), { shift: e.shiftKey, alt: e.altKey, button: e.button, pointerType: e.pointerType }); finish(e.type === 'pointercancel'); }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const v = viewRef.current;
    const { api: a, g: gl } = live.current;
    if (!v || ed().tool !== 'seleccionar') return;
    const sp = screenOf(e);
    const hn = hitNode(gl.contours, v, sp, tol());
    if (hn && a.editable) {
      const c = toggleSmooth(gl.contours[hn.ci], hn.ni);
      const smooth = !!c.nodes[hn.ni].smooth;
      a.editPart(gg => { gg.contours[hn.ci] = c; }, smooth ? 'Nodo suave' : 'Nodo de esquina');
      setSel({ ...EMPTY_SEL, nodes: [nodeKey(hn.ci, hn.ni)] });
      a.say(smooth ? 'Nodo suave' : 'Nodo de esquina');
      return;
    }
    const hc = hitContour(gl.contours, v, sp, 5);
    if (hc !== null) setSel({ ...EMPTY_SEL, nodes: gl.contours[hc].nodes.map((_, ni) => nodeKey(hc, ni)) });
  };

  function hover(sp: Pt, alt: boolean) {
    const v = viewRef.current;
    if (!v) return;
    const { g: gl, doc: d, api: a } = live.current;
    const st = ed();
    const hv = hoverRef.current;
    const prev = `${hv.node}|${hv.seg?.p.x},${hv.seg?.p.y}|${hv.guide}|${hv.closeHot}|${hv.cursor?.x},${hv.cursor?.y}`;
    hv.node = null; hv.seg = null; hv.guide = null; hv.closeHot = false;
    let cursor = 'default';
    const fp = toFont(v, sp);
    if ((sp.y < RULER && sp.x > RULER) || (sp.x < RULER && sp.y > RULER)) cursor = a.docEditable ? (sp.y < RULER ? 'ew-resize' : 'ns-resize') : 'default';
    else if (st.tool === 'seleccionar') {
      const tb = a.editable ? transformBox(st) : null;
      const bh = tb ? hitBoxHandle(tb, v, sp, coarseRef.current ? 16 : 9) : null;
      if (bh) cursor = BOX_CURSOR[bh];
      else {
        const hn = hitNode(gl.contours, v, sp, tol());
        if (hn) { hv.node = nodeKey(hn.ci, hn.ni); cursor = 'pointer'; }
        else if (hitHandle(gl.contours, v, sp, tol()) || hitAnchor(gl.anchors, v, sp, tol()) !== null) cursor = 'pointer';
        else if (st.moveImage && gl.raster) { const rb = rasterBox(gl.raster); if (fp.x >= rb.x0 && fp.x <= rb.x1 && fp.y >= rb.y0 && fp.y <= rb.y1) cursor = 'move'; }
        if (cursor === 'default' && hitContour(gl.contours, v, sp, 5) !== null) cursor = a.editable ? 'move' : 'default';
      }
    } else if (st.tool === 'pluma') {
      cursor = a.editable ? 'crosshair' : 'not-allowed';
      const pen = penRef.current;
      if (pen.ci !== null) {
        const c = gl.contours[pen.ci];
        if (c && c.nodes.length >= 2 && Math.hypot(toScreen(v, c.nodes[0]).x - sp.x, toScreen(v, c.nodes[0]).y - sp.y) <= tol() + 2) { hv.closeHot = true; cursor = 'pointer'; }
        hv.cursor = hv.closeHot ? c.nodes[0] : snapAt(fp);
      } else {
        const hn = hitNode(gl.contours, v, sp, tol());
        if (hn) { hv.node = nodeKey(hn.ci, hn.ni); cursor = alt ? 'pointer' : 'pointer'; }
        else {
          const hs = hitSegment(gl.contours, v, sp, coarseRef.current ? 10 : 6);
          if (hs) { hv.seg = { p: hs.p }; cursor = 'copy'; previewRef.current.snap = null; }
          else snapAt(fp);
        }
        hv.cursor = null;
      }
    } else if (st.tool === 'guia') {
      const gi = hitGuide(d.guides, v, sp, tol());
      if (gi !== null) { hv.guide = gi; cursor = d.guides[gi].axis === 'x' ? 'ew-resize' : 'ns-resize'; } else cursor = 'crosshair';
    } else cursor = a.editable ? 'crosshair' : 'not-allowed';
    setCursor(cursor);
    const now = `${hv.node}|${hv.seg?.p.x},${hv.seg?.p.y}|${hv.guide}|${hv.closeHot}|${hv.cursor?.x},${hv.cursor?.y}`;
    if (now !== prev || st.tool === 'pluma') invalidate();
  }

  const onPointerLeave = () => {
    const hv = hoverRef.current;
    if (hv.node || hv.seg || hv.guide !== null || hv.cursor) {
      hoverRef.current = { node: null, seg: null, guide: null, cursor: null, closeHot: false };
      if (!gestureRef.current) previewRef.current.snap = null;
      invalidate();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== wrapRef.current) return;
    wrapRef.current.removeAttribute('data-pointer');
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (api.canvas.current?.stepNode(e.shiftKey ? -1 : 1)) e.preventDefault();
    } else if (e.key === 'Escape' && gestureRef.current) {
      e.preventDefault();
      finish(true);
    }
  };

  return (
    <div
      ref={wrapRef} className="ge-canvas" role="application" tabIndex={0} aria-label={label} aria-describedby={describedBy}
      aria-roledescription="lienzo de edición" onKeyDown={onKeyDown}
      onBlur={() => { wrapRef.current?.removeAttribute('data-pointer'); if (focusNodeRef.current) { focusNodeRef.current = null; invalidate(); } }}
    >
      <canvas
        ref={canvasRef} aria-hidden="true"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave} onDoubleClick={onDoubleClick} onContextMenu={e => e.preventDefault()}
      />
    </div>
  );
}

