/**
 * «Polígono» (P) and «Lazo» (L): closed outlines → MaskPolygonPart.
 *
 * Polígono: click (tap) each vertex; a rubber band follows the pointer (⇧ snaps it to 45°). Click the first
 * vertex, double-click, or Intro closes it; Retroceso removes the last vertex; Esc cancels. Keyboard alone:
 * arrows move a crosshair (⇧ × 10), Espacio places a vertex there, Intro closes.
 * Lazo: drag freehand; on release the path closes and is simplified (Ramer–Douglas–Peucker, tolerance in
 * screen px, so zooming in keeps more detail).
 * Modifiers at the first click / the start of the drag choose the operation (⇧ add, ⌥ subtract, ⇧⌥ intersect).
 */
import type { Id, MaskOp, MaskPolygonPart } from '../../project/types';
import { useProject } from '../../project/store';
import { dist, polygonArea, roundPts, simplifyRDP, type Pt } from './geom';
import { ICONS } from './icons';
import * as draw from './overlay';
import { setLive, setSettings, settings, useLive, useSettings } from './state';
import { OP_NAME, addPart, canvasSize, editableTarget, layerById, layerPoint, mapping, opFor, screenOf, screenPerPx } from './target';
import type { Tool, ToolEvent, ToolHost } from './types';
import { Button, Note, Slider, pct, px } from './ui';

/** Viewport px → frame units (the inverse of View.toScreen, which is a scale and an offset). */
export function fromScreen(host: ToolHost, s: Pt): Pt {
  const f = host.view().frame;
  return { x: (s.x - f.x) / f.w, y: (s.y - f.y) / f.h };
}

const polyPart = (op: MaskOp, pts: number[]): MaskPolygonPart => {
  const st = settings();
  return { kind: 'polygon', op, pts: roundPts(pts), soft: st.shapeSoft, alpha: st.shapeAlpha };
};

/** Screen scale of layer units (for tolerances in viewport px). */
function layerScreenScale(host: ToolHost) {
  const s = canvasSize(host), k = screenPerPx(host) * mapping(host).scale;
  return { sx: s.w * k, sy: s.h * k };
}

/* ------------------------------------------------------------------ polygon */

interface PolyState { layer: Id; op: MaskOp; pts: number[]; hover: Pt | null; touch: boolean; lastDown: { t: number; s: Pt } | null }

export const polygonTool: Tool = (() => {
  let st: PolyState | null = null;
  /** Keyboard crosshair (layer units), shown once the arrows are used. */
  let cursor: Pt | null = null;

  const count = () => setLive({ vertices: st ? st.pts.length >> 1 : 0 });
  const verts = (): Pt[] => { const out: Pt[] = []; if (st) for (let i = 0; i < st.pts.length; i += 2) out.push({ x: st.pts[i], y: st.pts[i + 1] }); return out; };

  const preview = (host: ToolHost) => {
    if (st && st.pts.length >= 6) host.preview({ layer: st.layer, part: polyPart(st.op, st.pts) });
    else host.preview(null);
  };

  const close = (host: ToolHost) => {
    if (!st) return;
    if (st.pts.length < 6) { host.say('Un polígono necesita al menos tres vértices.'); return; }
    const s = st;
    st = null;
    count();
    host.preview(null);
    const l = layerById(s.layer);
    addPart(host, s.layer, polyPart(s.op, s.pts), `Polígono de ${s.pts.length >> 1} vértices añadido a la máscara de «${l?.name ?? 'la capa'}» (${OP_NAME[s.op]}).`);
    host.redrawOverlay();
  };

  const addVertex = (host: ToolHost, p: Pt, e: Pick<ToolEvent, 'shift' | 'alt'> | null, touch = false) => {
    if (!st) {
      const l = editableTarget(host);
      if (!l) return;
      st = { layer: l.id, op: e ? opFor(e, host) : host.op(), pts: [], hover: null, touch, lastDown: null };
    }
    st.pts.push(p.x, p.y);
    count();
    preview(host);
    host.say(`Vértice ${st.pts.length >> 1}`);
    host.redrawOverlay();
  };

  /** ⇧: the next edge at a multiple of 45° from the last vertex (in pixels). */
  const snapped = (host: ToolHost, p: Pt, shift: boolean): Pt => {
    if (!shift || !st || st.pts.length < 2) return p;
    const s = canvasSize(host);
    const lx = st.pts[st.pts.length - 2] * s.w, ly = st.pts[st.pts.length - 1] * s.h;
    const dx = p.x * s.w - lx, dy = p.y * s.h - ly;
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
    return { x: (lx + Math.cos(a) * l) / s.w, y: (ly + Math.sin(a) * l) / s.h };
  };

  /** A click (or a lifted tap): close on the first vertex or on a double click, else a new vertex. */
  const act = (e: ToolEvent, host: ToolHost) => {
    const p = snapped(host, layerPoint(host, e.p), e.shift && !!st);
    if (st) {
      const first = screenOf(host)({ x: st.pts[0], y: st.pts[1] });
      const tol = e.pointerType === 'touch' ? 24 : 9;
      if (st.pts.length >= 6 && dist(first, e.s) <= tol) { close(host); return; }
      // the second click of a double click closes (it would only repeat the last vertex)
      const ld = st.lastDown;
      if (ld && e.time - ld.t < 400 && dist(ld.s, e.s) < 8) { close(host); return; }
      st.lastDown = { t: e.time, s: e.s };
      addVertex(host, p, e);
      return;
    }
    addVertex(host, p, e, e.pointerType === 'touch');
    if (st) (st as PolyState).lastDown = { t: e.time, s: e.s };
  };
  let touchDown = false;

  return {
    id: 'poligono',
    name: 'Polígono',
    hint: 'Haz clic en cada vértice; clic en el primero, doble clic o Intro para cerrar; Retroceso quita el último. Con teclado: flechas y Espacio. En teléfono: toca cada vértice y toca el primero (o «Cerrar») para terminar.',
    shortcut: 'P',
    group: 'seleccion',
    icon: ICONS.polygon,
    cursor: 'crosshair',
    draws: true,

    deactivate(host) { st = null; cursor = null; count(); host.preview(null); },

    down(e, host) {
      // touch: the vertex goes where the finger lifts (a second finger moving the view cancels it)
      if (e.pointerType === 'touch') { touchDown = true; if (st) { st.hover = layerPoint(host, e.p); host.redrawOverlay(); } return; }
      act(e, host);
    },

    up(e, host) {
      if (!touchDown) return;
      touchDown = false;
      act(e, host);
    },

    move(e, host) {
      if (!st) return;
      st.hover = snapped(host, layerPoint(host, e.p), e.shift);
      host.redrawOverlay();
    },

    cancel(host) { touchDown = false; host.redrawOverlay(); },

    onKey(e, host) {
      if (e.metaKey || e.ctrlKey) return false;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (e.key in arrows) {
        const s = canvasSize(host), step = e.shiftKey ? 10 : 1, [ax, ay] = arrows[e.key];
        cursor ??= st?.pts.length ? { x: st.pts[st.pts.length - 2], y: st.pts[st.pts.length - 1] } : layerPoint(host, { x: 0.5, y: 0.5 });
        cursor = { x: cursor.x + (ax * step) / s.w, y: cursor.y + (ay * step) / s.h };
        if (st) st.hover = cursor;
        host.redrawOverlay();
        return true;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        cursor ??= layerPoint(host, { x: 0.5, y: 0.5 });
        addVertex(host, cursor, st ? null : { shift: e.shiftKey, alt: e.altKey });
        return true;
      }
      if (!st) return false;
      if (e.key === 'Enter') { close(host); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        st.pts.splice(-2, 2);
        if (!st.pts.length) { st = null; host.say('Polígono vacío'); } else host.say(`Quedan ${st.pts.length >> 1} vértices`);
        count(); preview(host); host.redrawOverlay();
        return true;
      }
      if (e.key === 'Escape') { st = null; count(); host.preview(null); host.say('Polígono cancelado'); host.redrawOverlay(); return true; }
      return false;
    },

    overlay(ctx, host) {
      const scr = screenOf(host);
      if (st && st.layer === host.target()) {
        const v = verts().map(scr);
        draw.polyline(ctx, v, false);
        if (st.hover && v.length) {
          const h = scr(st.hover);
          draw.segment(ctx, v[v.length - 1], h, { dash: [4, 3] });
          if (v.length >= 2) draw.segment(ctx, h, v[0], { dash: [2, 5], alpha: 0.5 });
        }
        const near = st.hover && v.length >= 3 && dist(scr(st.hover), v[0]) <= (st.touch ? 24 : 9);
        v.forEach((q, i) => draw.handle(ctx, q, { size: i === 0 ? (st!.touch ? 13 : 9) : st!.touch ? 9 : 6, round: i === 0, active: i === 0 && !!near }));
        if (near) draw.tag(ctx, { x: v[0].x + 12, y: v[0].y - 14 }, 'cerrar');
      }
      if (cursor) draw.crosshair(ctx, scr(cursor), 9, true);
    },

    Options: ({ host }) => <FreeformOptions host={host} poly={{ close: () => close(host), undo: () => polygonTool.onKey!(new KeyboardEvent('keydown', { key: 'Backspace' }), host), cancel: () => polygonTool.onKey!(new KeyboardEvent('keydown', { key: 'Escape' }), host) }} />,
  };
})();

/* ------------------------------------------------------------------ lasso */

export const lassoTool: Tool & { lastSimplified?: { before: number; after: number } } = (() => {
  let st: { layer: Id; op: MaskOp; pts: number[]; touch: boolean } | null = null;

  const push = (host: ToolHost, p: Pt) => {
    if (!st) return;
    const n = st.pts.length;
    const l = layerPoint(host, p);
    if (n && Math.hypot((l.x - st.pts[n - 2]) * layerScreenScale(host).sx, (l.y - st.pts[n - 1]) * layerScreenScale(host).sy) < 1) return;
    st.pts.push(l.x, l.y);
  };

  const tool: Tool & { lastSimplified?: { before: number; after: number } } = {
    id: 'lazo',
    name: 'Lazo',
    hint: 'Arrastra alrededor de la zona: al soltar, el contorno se cierra solo. ⇧ al empezar suma, ⌥ resta. En teléfono: rodea la zona con un dedo (dos dedos mueven la vista).',
    shortcut: 'L',
    group: 'seleccion',
    icon: ICONS.lasso,
    cursor: 'crosshair',
    draws: true,

    deactivate(host) { st = null; host.preview(null); },

    down(e, host) {
      const l = editableTarget(host);
      if (!l) return;
      st = { layer: l.id, op: opFor(e, host), pts: [], touch: e.pointerType === 'touch' };
      push(host, e.p);
      host.redrawOverlay();
    },

    move(e, host) {
      if (!st) return;
      // every sample the device reported since the last event (smoother with a pen or a fast hand)
      const co = e.native?.getCoalescedEvents?.() ?? [];
      if (co.length > 1) for (const c of co) push(host, host.view().toFrame(c.clientX, c.clientY));
      else push(host, e.p);
      host.redrawOverlay();
    },

    up(e, host) {
      if (!st) return;
      push(host, e.p);
      const s = st;
      st = null;
      const { sx, sy } = layerScreenScale(host);
      const simple = simplifyRDP(s.pts, 1.25, sx, sy);
      tool.lastSimplified = { before: s.pts.length >> 1, after: simple.length >> 1 };
      if (simple.length < 6 || Math.abs(polygonArea(simple, sx, sy)) < 24) {
        host.say('El lazo era demasiado pequeño: rodea la zona arrastrando.');
        host.redrawOverlay();
        return;
      }
      const l = layerById(s.layer);
      addPart(host, s.layer, polyPart(s.op, simple), `Lazo añadido a la máscara de «${l?.name ?? 'la capa'}» (${OP_NAME[s.op]}, ${simple.length >> 1} puntos).`);
      host.redrawOverlay();
    },

    cancel(host) { st = null; host.redrawOverlay(); },

    onKey(e, host) {
      if (e.key === 'Escape' && st) { st = null; host.redrawOverlay(); return true; }
      return false;
    },

    overlay(ctx, host) {
      if (!st || st.layer !== host.target()) return;
      const scr = screenOf(host);
      const v: Pt[] = [];
      for (let i = 0; i < st.pts.length; i += 2) v.push(scr({ x: st.pts[i], y: st.pts[i + 1] }));
      draw.polyline(ctx, v, false);
      if (v.length > 2) draw.segment(ctx, v[v.length - 1], v[0], { dash: [2, 5], alpha: 0.6 });
    },

    Options: ({ host }) => <FreeformOptions host={host} />,
  };
  return tool;
})();

/* ------------------------------------------------------------------ options */

function FreeformOptions({ host, poly }: { host: ToolHost; poly?: { close(): void; undo(): void; cancel(): void } }) {
  const st = useSettings();
  const n = useLive(s => s.vertices);
  useProject(s => s.project);
  void host;
  return (
    <div className="tl-opts" data-tool={poly ? 'poligono' : 'lazo'}>
      <span className="tl-title">{poly ? 'Polígono' : 'Lazo'}</span>
      <Slider label="Borde suave" value={st.shapeSoft} min={0} max={80} step={1} format={px} onChange={v => setSettings({ shapeSoft: v })} hint="Difumina el borde de la zona (px de la imagen final)" />
      <Slider label="Intensidad" value={st.shapeAlpha} min={0.05} max={1} step={0.05} format={pct} onChange={v => setSettings({ shapeAlpha: v })} />
      {poly ? (
        <>
          <span className="tl-mono" aria-live="polite">{n ? `${n} ${n === 1 ? 'vértice' : 'vértices'}` : 'sin vértices'}</span>
          <Button primary disabled={n < 3} onClick={poly.close} kbd="Intro">Cerrar</Button>
          <Button disabled={!n} onClick={poly.undo} title="Retroceso">Quitar último</Button>
          <Button disabled={!n} onClick={poly.cancel} title="Esc">Cancelar</Button>
        </>
      ) : (
        <Note tone="quiet">Rodea la zona sin soltar; al soltar se cierra sola.</Note>
      )}
    </div>
  );
}
