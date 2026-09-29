/**
 * The viewport: the art (the scheduler's canvas) as the protagonist, the checkerboard under transparency,
 * the original for before/after, the mask view of the selected layer, and the overlay canvas where tools
 * draw. Owns the gestures: zoom (wheel, pinch, buttons), pan (space-drag, middle button, two fingers, one
 * finger when the tool does not draw), and routes pointers to the active tool in frame units.
 *
 * Pointer routing (src/foto/tools/types.ts):
 *   - mouse / pen: button 0 goes to the tool (down/move/up), hover moves too (brush cursors); the middle
 *     button, or the left one with the space bar held, pans; without a tool a drag pans;
 *   - touch: one finger goes to the tool when it draws (Tool.draws), else it pans; a second finger always
 *     wins: the tool's gesture is cancelled (Tool.cancel) and the two fingers pan and pinch-zoom.
 * The pointer is captured on down, so a drag that leaves the viewport keeps going.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent } from 'react';
import { fitRect } from '../project/adjust';
import { sourceFit } from '../project/compositor';
import { coverageOfImage, coverageToGrey, maskCanvas } from '../project/masks';
import { useProject } from '../project/store';
import type { Mask, Project } from '../project/types';
import { activeTool, host, originalOf, setOverlayRedraw } from './host';
import { markSpaceUsed, setOverViewport, spaceHeld } from './keys';
import { attachArt, onRendered, setDisplayScale, viewCompositor, type Rendered } from './scheduler';
import type { Tool, ToolEvent } from './tools/types';
import { maskShown, say, setUI, useFoto } from './ui';
import { clampPan, clampZoom, frameRect, makeView, panForZoom, setViewport, zoomValue, type Rect } from './view';

export interface Insets { top: number; right: number; bottom: number; left: number }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const dpr = () => Math.min(3, window.devicePixelRatio || 1);

function toolEvent(e: PointerEvent, box: DOMRect): ToolEvent {
  const view = host.view();
  return {
    p: view.toFrame(e.clientX, e.clientY),
    s: { x: e.clientX - box.left, y: e.clientY - box.top },
    pressure: e.pressure > 0 && e.pointerType !== 'mouse' ? e.pressure : 0.5,
    pointerType: (e.pointerType === 'pen' || e.pointerType === 'touch' ? e.pointerType : 'mouse'),
    button: e.button,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: isMac ? e.metaKey : e.ctrlKey,
    time: e.timeStamp,
    native: e,
  };
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'tool'; id: number; tool: Tool }
  | { kind: 'pan'; id: number; x: number; y: number; pan: { x: number; y: number } }
  | { kind: 'pinch'; ids: [number, number]; d: number; mx: number; my: number; k: number; pan: { x: number; y: number } };

export function Viewport({ inset, compact }: { inset: Insets; compact?: boolean }) {
  const project = useProject(s => s.project);
  const selection = useProject(s => s.selection);
  const zoom = useFoto(s => s.zoom);
  const pan = useFoto(s => s.pan);
  const compare = useFoto(s => s.compare);
  const split = useFoto(s => s.split);
  const holding = useFoto(s => s.holding);
  const maskView = useFoto(s => s.maskView);
  const toolId = useFoto(s => s.tool);
  const box = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLCanvasElement>(null);
  const origRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const touches = useRef(new Map<number, { x: number; y: number }>());

  const cw = project?.canvas.w ?? 1, ch = project?.canvas.h ?? 1;
  const area: Rect = { x: inset.left, y: inset.top, w: Math.max(1, size.w - inset.left - inset.right), h: Math.max(1, size.h - inset.top - inset.bottom) };
  const k = zoomValue(zoom, area, cw, ch, compact ? 10 : undefined);
  const frame = frameRect(k, pan, area, cw, ch);
  const geo = useRef({ k, area, frame });
  geo.current = { k, area, frame };

  /* ---------------------------------------------------------------- size and geometry */

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setViewport({ view: makeView(frame, { w: cw, h: ch }, () => el.getBoundingClientRect()), el });
    if (size.w > 0) setDisplayScale((frame.w * dpr()) / cw);
    if (Math.abs(useFoto.getState().zk - k) > 1e-6) setUI({ zk: k });
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.x, frame.y, frame.w, frame.h, cw, ch, size.w]);
  useEffect(() => () => setViewport(null), []);

  useEffect(() => {
    attachArt(artRef.current);
    return () => attachArt(null);
  }, []);

  /* ---------------------------------------------------------------- overlay (tools) */

  const redrawRaf = useRef(0);
  const redraw = useCallback(() => {
    if (redrawRaf.current) return;
    redrawRaf.current = requestAnimationFrame(() => {
      redrawRaf.current = 0;
      const c = overRef.current, el = box.current;
      if (!c || !el) return;
      const r = dpr(), w = el.clientWidth, h = el.clientHeight;
      if (c.width !== Math.round(w * r) || c.height !== Math.round(h * r)) { c.width = Math.round(w * r); c.height = Math.round(h * r); }
      const x = c.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.setTransform(r, 0, 0, r, 0, 0);
      const t = activeTool();
      if (t?.overlay) { x.save(); try { t.overlay(x, host); } catch (e) { console.warn('foto: overlay', e); } x.restore(); }
    });
  }, []);
  useEffect(() => { setOverlayRedraw(redraw); return () => setOverlayRedraw(() => undefined); }, [redraw]);
  useEffect(() => { redraw(); }, [toolId, selection, size.w, size.h, redraw]);

  /* ---------------------------------------------------------------- mask view */

  useEffect(() => onRendered(r => drawMaskView(r)), []);
  const lastRender = useRef<Rendered | null>(null);
  function drawMaskView(r: Rendered | null) {
    if (r) lastRender.current = r;
    const c = maskRef.current, rr = lastRender.current;
    if (!c) return;
    const mode = useFoto.getState().maskView;
    const shown = maskShown();
    const sel = useProject.getState().selection[0];
    const lf = rr?.state.layers.find(l => l.layer.id === sel);
    const mask: Mask | null | undefined = lf ? lf.layer.mask : rr?.project.layers.find(l => l.id === sel)?.mask;
    if (!rr || !shown || !mask || !mask.parts.length) { c.width = c.height = 0; c.hidden = true; return; }
    const w = rr.report.w, h = rr.report.h;
    const cov = maskCoverage(rr.project, mask, w, h, rr.scale, rr.state.t);
    if (!cov) { c.hidden = true; return; }
    c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, w, h);
    if (mode === 'grey') x.drawImage(coverageToGrey(cov.coverage, w, h), 0, 0);
    else {
      x.drawImage(cov.canvas, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = 'rgba(255, 91, 31, 0.35)';
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }
    c.hidden = false;
  }
  const shownNow = useFoto(s => maskShown(s));
  useEffect(() => { drawMaskView(null); }, [maskView, shownNow, selection]);

  /* ---------------------------------------------------------------- the original (before/after) */

  const showOrig = compare || holding;
  useEffect(() => {
    if (!showOrig || !project) return;
    let gone = false;
    void (async () => {
      const o = originalOf(project);
      const c = origRef.current;
      if (!c) return;
      const w = Math.max(1, Math.round(Math.min(cw, frame.w * dpr()))), h = Math.max(1, Math.round((w * ch) / cw));
      const src = o ? project.sources.find(s => s.id === o.source) : null;
      const prov = viewCompositor().provider;
      const t = useProject.getState().time;
      if (src && (await prov.prepare(src, t))) {
        const img = prov.frame(src, t);
        if (gone || !img) return;
        c.width = w; c.height = h;
        const x = c.getContext('2d')!;
        x.fillStyle = project.canvas.bg;
        if (!project.canvas.transparent) x.fillRect(0, 0, w, h); else x.clearRect(0, 0, w, h);
        const r = fitRect(img.width, img.height, w, h, o!.fit);
        x.drawImage(img, r.x, r.y, r.w, r.h);
      } else if (!gone) {
        c.width = w; c.height = h;
        const x = c.getContext('2d')!;
        x.fillStyle = project.canvas.bg;
        x.fillRect(0, 0, w, h);
      }
    })();
    return () => { gone = true; };
  }, [showOrig, project?.sources, project?.layers, cw, ch, Math.round(frame.w)]);

  /* ---------------------------------------------------------------- zoom and pan */

  const setZoomAt = useCallback((k1: number, sx: number, sy: number) => {
    const g = geo.current;
    const nk = clampZoom(k1);
    const st = useFoto.getState();
    const np = panForZoom(st.pan, g.k, nk, sx, sy, g.area);
    setUI({ zoom: nk, pan: clampPan(np, nk, g.area, cw, ch) });
  }, [cw, ch]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // trackpad pinches arrive as ctrl+wheel with small deltas: a stronger factor for them
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setZoomAt(geo.current.k * f, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoomAt]);

  /* ---------------------------------------------------------------- pointers */

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const ne = e.nativeEvent;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
    const g = gesture.current;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (touches.current.size >= 2) {
        // a second finger: two-finger pan and zoom always win
        if (g.kind === 'tool') { try { g.tool.cancel?.(host); } catch (err) { console.warn(err); } host.preview(null); setLoupe(null); say('Gesto cancelado: dos dedos mueven y acercan la vista.'); }
        const [a, b] = [...touches.current.entries()].slice(0, 2);
        gesture.current = {
          kind: 'pinch', ids: [a[0], b[0]], d: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y) || 1,
          mx: (a[1].x + b[1].x) / 2, my: (a[1].y + b[1].y) / 2, k: geo.current.k, pan: { ...useFoto.getState().pan },
        };
        return;
      }
      const t = activeTool();
      if (t && t.draws) { gesture.current = { kind: 'tool', id: e.pointerId, tool: t }; t.down?.(toolEvent(ne, r), host); setLoupe({ x: e.clientX - r.left, y: e.clientY - r.top }); redraw(); return; }
      gesture.current = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, pan: { ...useFoto.getState().pan } };
      return;
    }
    const t = activeTool();
    const panWanted = e.button === 1 || (e.button === 0 && spaceHeld()) || (e.button === 0 && !t) || useFoto.getState().tool === 'mano';
    if (panWanted) {
      if (spaceHeld()) markSpaceUsed();
      e.preventDefault();
      gesture.current = { kind: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY, pan: { ...useFoto.getState().pan } };
      el.dataset.panning = '1';
      return;
    }
    if (t && (e.button === 0 || e.button === 2)) {
      gesture.current = { kind: 'tool', id: e.pointerId, tool: t };
      t.down?.(toolEvent(ne, r), host);
      redraw();
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const g = gesture.current;
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (g.kind === 'pinch') {
      const a = touches.current.get(g.ids[0]), b = touches.current.get(g.ids[1]);
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const nk = clampZoom(g.k * (d / g.d));
      const ar = geo.current.area;
      // zoom around the first midpoint, then move with the fingers
      const zp = panForZoom(g.pan, g.k, nk, g.mx, g.my, ar);
      setUI({ zoom: nk, pan: clampPan({ x: zp.x + (mx - g.mx), y: zp.y + (my - g.my) }, nk, ar, cw, ch) });
      return;
    }
    if (g.kind === 'pan' && g.id === e.pointerId) {
      const np = { x: g.pan.x + (e.clientX - g.x), y: g.pan.y + (e.clientY - g.y) };
      const cur = geo.current;
      setUI({ zoom: cur.k, pan: clampPan(np, cur.k, cur.area, cw, ch) });
      return;
    }
    if (g.kind === 'tool' && g.id === e.pointerId) {
      g.tool.move?.(toolEvent(e.nativeEvent, r), host);
      if (e.pointerType === 'touch') setLoupe({ x: e.clientX - r.left, y: e.clientY - r.top });
      redraw();
      return;
    }
    // hover: tools draw their cursor (brush circles)
    if (g.kind === 'none' && e.pointerType !== 'touch') {
      const t = activeTool();
      if (t?.move) { t.move(toolEvent(e.nativeEvent, r), host); redraw(); }
    }
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const g = gesture.current;
    touches.current.delete(e.pointerId);
    delete el.dataset.panning;
    if (g.kind === 'pinch') {
      if (touches.current.size < 2) gesture.current = { kind: 'none' };
      return;
    }
    if (g.kind === 'pan' && g.id === e.pointerId) { gesture.current = { kind: 'none' }; return; }
    if (g.kind === 'tool' && g.id === e.pointerId) {
      gesture.current = { kind: 'none' };
      setLoupe(null);
      try {
        if (cancelled) { g.tool.cancel?.(host); host.preview(null); } else g.tool.up?.(toolEvent(e.nativeEvent, r), host);
      } catch (err) { console.warn('foto: tool', err); }
      redraw();
    }
  };

  /* ---------------------------------------------------------------- loupe (touch) */

  useEffect(() => {
    if (!loupe) return;
    const c = loupeRef.current, a = artRef.current;
    if (!c || !a) return;
    const S = 108, Z = 2.5;
    const r = dpr();
    c.width = S * r; c.height = S * r;
    const x = c.getContext('2d')!;
    x.setTransform(r, 0, 0, r, 0, 0);
    x.clearRect(0, 0, S, S);
    const f = geo.current.frame;
    const u = (loupe.x - f.x) / f.w, v = (loupe.y - f.y) / f.h;
    const sw = (S / Z / f.w) * a.width, sh = (S / Z / f.h) * a.height;
    x.save();
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#0c0b0a'; x.fillRect(0, 0, S, S);
    x.imageSmoothingEnabled = false;
    x.drawImage(a, u * a.width - sw / 2, v * a.height - sh / 2, sw, sh, 0, 0, S, S);
    x.restore();
    x.strokeStyle = 'rgba(12,11,10,.9)'; x.lineWidth = 3;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = '#ede6da'; x.lineWidth = 1;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 1.5, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(S / 2 - 7, S / 2); x.lineTo(S / 2 + 7, S / 2); x.moveTo(S / 2, S / 2 - 7); x.lineTo(S / 2, S / 2 + 7); x.stroke();
  }, [loupe]);

  /* ---------------------------------------------------------------- compare divider */

  const dragSplit = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const f = geo.current.frame, r = box.current!.getBoundingClientRect();
      setUI({ split: Math.min(1, Math.max(0, (ev.clientX - r.left - f.x) / f.w)) });
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const splitKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    let v = split;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    setUI({ split: Math.min(1, Math.max(0, v)) });
  };

  if (!project) return null;
  const transparent = project.canvas.transparent;
  const frameStyle: CSSProperties = { left: frame.x, top: frame.y, width: frame.w, height: frame.h };
  const clip = holding ? 'inset(0 0 0 100%)' : compare ? `inset(0 0 0 ${(split * 100).toFixed(3)}%)` : undefined;
  const t = activeTool();
  const cursor = gesture.current.kind === 'pan' ? 'grabbing' : toolId === 'mano' || !t ? 'grab' : t.cursor ?? 'crosshair';
  return (
    <div ref={box} className={'fv' + (compact ? ' fv-compact' : '')} data-tool={toolId ?? ''}>
      <div className={'fv-frame' + (transparent ? ' alpha' : '')} style={frameStyle} data-testid="frame">
        <canvas ref={origRef} className="fv-orig" hidden={!showOrig} aria-hidden="true" />
        <div className="fv-art-wrap" style={clip ? { clipPath: clip } : undefined}>
          <canvas ref={artRef} className="fv-art" role="img" aria-label={`${project.name}: la composición (${project.layers.length} ${project.layers.length === 1 ? 'capa' : 'capas'})`} />
          <canvas ref={maskRef} className={'fv-mask' + (maskView === 'grey' ? ' grey' : '')} hidden aria-hidden="true" />
        </div>
      </div>
      <canvas
        ref={overRef} className="fv-over" style={{ cursor }} aria-hidden="true"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={e => end(e, false)} onPointerCancel={e => end(e, true)}
        onContextMenu={e => e.preventDefault()}
        onPointerEnter={e => { if (e.pointerType !== 'touch') setOverViewport(true); }} onPointerLeave={() => setOverViewport(false)}
      />
      {compare && !holding && (
        <div className="fv-split" style={{ left: frame.x + split * frame.w, top: Math.max(0, frame.y), height: Math.min(frame.h, size.h - Math.max(0, frame.y)) }}
          role="slider" tabIndex={0} aria-label="Antes y después: el original a la izquierda" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(split * 100)} aria-valuetext={`${Math.round(split * 100)} % original`}
          onPointerDown={dragSplit} onKeyDown={splitKey}>
          <span className="fv-split-line" /><span className="fv-split-knob" aria-hidden="true">‹ ›</span>
          <span className="fv-split-tag l" aria-hidden="true">Original</span><span className="fv-split-tag r" aria-hidden="true">Resultado</span>
        </div>
      )}
      {loupe && <canvas ref={loupeRef} className="fv-loupe" style={{ left: loupe.x - 54, top: Math.max(4, loupe.y - 140) }} aria-hidden="true" />}
    </div>
  );
}

/* ------------------------------------------------------------------ mask coverage for the view */

/** A mask's coverage at w×h for the mask view, with the viewport's decoded pictures (as the compositor reads them). */
function maskCoverage(p: Project, mask: Mask, w: number, h: number, scale: number, t: number) {
  const prov = viewCompositor().provider;
  try {
    return maskCanvas({ ...mask, off: false }, {
      w, h, scale, t,
      raster: ref => { const img = prov.image(ref); return img ? coverageOfImage(img, w, h) : null; },
      pixels: id => {
        const s = p.sources.find(x => x.id === id);
        const img = s ? prov.frame(s, t) : null;
        if (!img) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        const r = fitRect(img.width, img.height, w, h, sourceFit(p, id));
        x.drawImage(img, r.x, r.y, r.w, r.h);
        return x.getImageData(0, 0, w, h).data;
      },
      pixelsKey: id => `${id}@${t}|view`,
    });
  } catch (e) {
    console.warn('foto: mask view', e);
    return null;
  }
}
