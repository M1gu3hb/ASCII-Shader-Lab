/**
 * «Contorno preciso» (K): intelligent scissors. Click on an edge of the photo to start; move along the outline
 * and the line snaps to the photo's edges (livewire.ts); click to fix a point (it also fixes itself when the
 * line stays put for a moment); click the first point, double-click or Intro to close; Retroceso removes the
 * last point; Esc cancels. The result is a dense MaskPolygonPart that follows the edge.
 *
 * The edge map is computed once per photo when the tool is chosen (the target's source at ≤ 1024 px); each move
 * then only expands the search as far as the pointer, within a window around the last point and a budget per
 * move, and continues on the next frame if it needs more (see livewire.ts).
 */
import type { Id, MaskOp } from '../../project/types';
import { useProject } from '../../project/store';
import { dist, simplifyRDP, type Pt } from './geom';
import { ICONS } from './icons';
import { clampToWindow, costMapFromRGBA, PathCooling, wireSearch, type CostMap, type WireSearch } from './livewire';
import * as draw from './overlay';
import { setLive, setSettings, settings, useLive, useSettings } from './state';
import { LIMITS } from '../../project/normalize';
import { OP_NAME, addPart, canvasPixels, editableTarget, layerById, layerPoint, opFor, screenOf } from './target';
import type { Tool, ToolEvent, ToolHost } from './types';
import { Button, Note, Slider, Switch, pct, px } from './ui';

const MAX_SIDE = 1024;
const WINDOW = 320;
const BUDGET = 200_000;
/** Milliseconds a pointer move may spend expanding the search (the rest continues on the next frames). */
const MOVE_MS = 8;

interface WireState {
  layer: Id;
  op: MaskOp;
  /** Map pixel indices: the fixed outline so far (first anchor first) and where each anchor starts in it. */
  fixed: number[];
  anchors: number[];
  search: WireSearch;
  live: number[];
  target: number;
  cooling: PathCooling;
  touch: boolean;
  lastDown: { t: number; s: Pt } | null;
}

export interface WireStats { mapMs: number; moves: number; lastMoveMs: number; maxMoveMs: number; meanMoveMs: number; settled: number }

export const contourTool: Tool & { stats: WireStats; map(): CostMap | null } = (() => {
  let map: CostMap | null = null;
  let mapKey = '';
  let building: Promise<void> | null = null;
  let st: WireState | null = null;
  let raf = 0;
  /** Touch: a finger is down (its point is placed when it lifts). */
  let touchDown = false;
  const stats: WireStats = { mapMs: 0, moves: 0, lastMoveMs: 0, maxMoveMs: 0, meanMoveMs: 0, settled: 0 };

  const idxOf = (p: Pt) => {
    const m = map!;
    const x = Math.min(m.w - 1, Math.max(0, Math.floor(p.x * m.w))), y = Math.min(m.h - 1, Math.max(0, Math.floor(p.y * m.h)));
    return y * m.w + x;
  };
  const ptOf = (i: number): Pt => ({ x: ((i % map!.w) + 0.5) / map!.w, y: (Math.floor(i / map!.w) + 0.5) / map!.h });

  async function build(host: ToolHost) {
    const t0 = performance.now();
    setLive({ wire: 'building' });
    const src = await host.sourcePixels();
    if (!src) { setLive({ wire: 'error' }); host.say('Esta capa no tiene una foto de la que leer los bordes.'); return; }
    const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
    const w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    const px = canvasPixels(c);
    c.width = c.height = 0;
    map = costMapFromRGBA(px.data, w, h);
    stats.mapMs = Math.round(performance.now() - t0);
    setLive({ wire: 'ready' });
    host.redrawOverlay();
  }

  const ensureMap = (host: ToolHost) => {
    const l = layerById(host.target());
    const key = `${host.target()}|${l && 'source' in l ? l.source : ''}|${host.view().canvas.w}x${host.view().canvas.h}`;
    if (map && key === mapKey) return;
    if (building && key === mapKey) return;
    mapKey = key;
    map = null;
    building = build(host).catch(() => { setLive({ wire: 'error' }); }).finally(() => { building = null; });
  };

  /** Expands the search towards the pointer; continues on the next frames when the budget runs out. */
  const follow = (host: ToolHost) => {
    if (!st || !map) return;
    const t0 = performance.now();
    const done = st.search.reach(st.target, BUDGET, MOVE_MS);
    const ms = performance.now() - t0;
    stats.moves++;
    stats.lastMoveMs = ms;
    stats.maxMoveMs = Math.max(stats.maxMoveMs, ms);
    stats.meanMoveMs += (ms - stats.meanMoveMs) / stats.moves;
    stats.settled = st.search.count;
    if (done) {
      st.live = st.search.path(st.target);
      if (settings().wireAuto && !st.touch) {
        const k = st.cooling.update(st.live);
        if (k > 0) fix(host, st.live[k], true);
      }
    } else {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => follow(host));
    }
    host.redrawOverlay();
  };

  /** Fixes the live path up to node `at` as outline and starts a new search there. */
  const fix = (host: ToolHost, at: number, auto = false) => {
    if (!st || !map) return;
    const path = st.search.settled(at) ? st.search.path(at) : [];
    if (!path.length) return;
    st.fixed.push(...path.slice(1));
    st.anchors.push(st.fixed.length - 1);
    st.search = wireSearch(map, at, WINDOW);
    st.cooling.reset();
    st.live = [at];
    setLive({ vertices: st.anchors.length });
    if (!auto) host.say(`Punto ${st.anchors.length} fijado`);
    follow(host);
  };

  const close = (host: ToolHost) => {
    if (!st || !map) return;
    if (st.fixed.length < 3 || st.anchors.length < 2) { host.say('Marca al menos dos puntos del contorno antes de cerrarlo.'); return; }
    // close along the edges too: from the last point back to the first
    const first = st.fixed[0];
    st.target = first;
    st.search.reach(first, 400_000);
    const back = st.search.settled(first) ? st.search.path(first).slice(1, -1) : [];
    const nodes = [...st.fixed, ...back];
    const flat: number[] = [];
    for (const i of nodes) { const p = ptOf(i); flat.push(p.x, p.y); }
    // dense, but no more than it needs: 0.6 map px of tolerance, and within the project's point budget
    let simple = simplifyRDP(flat, 0.6, map.w, map.h);
    let tol = 0.6;
    while (simple.length > LIMITS.pts && tol < 8) { tol *= 1.6; simple = simplifyRDP(flat, tol, map.w, map.h); }
    const s = st;
    st = null;
    cancelAnimationFrame(raf);
    setLive({ vertices: 0 });
    const l = layerById(s.layer);
    const r = (v: number) => Math.round(v * 1e5) / 1e5;
    const ss = settings();
    addPart(host, s.layer, { kind: 'polygon', op: s.op, pts: simple.map(r), soft: ss.shapeSoft, alpha: ss.shapeAlpha }, `Contorno de ${simple.length >> 1} puntos añadido a la máscara de «${l?.name ?? 'la capa'}» (${OP_NAME[s.op]}).`);
    host.redrawOverlay();
  };

  const cancel = (host: ToolHost, say = true) => {
    st = null;
    cancelAnimationFrame(raf);
    setLive({ vertices: 0 });
    if (say) host.say('Contorno cancelado');
    host.redrawOverlay();
  };

  const undoAnchor = (host: ToolHost) => {
    if (!st || !map) return;
    if (st.anchors.length <= 1) { cancel(host); return; }
    st.anchors.pop();
    const at = st.anchors[st.anchors.length - 1];
    st.fixed.length = at + 1;
    st.search = wireSearch(map, st.fixed[at], WINDOW);
    st.cooling.reset();
    setLive({ vertices: st.anchors.length });
    host.say(`Quedan ${st.anchors.length} puntos`);
    follow(host);
  };

  /** A click (mouse/pen) or a lifted tap (touch): first point, close, or a new fixed point. */
  const act = (e: ToolEvent, host: ToolHost) => {
    if (!map) return;
    const node = idxOf(layerPoint(host, e.p));
    if (!st) {
      const l = editableTarget(host);
      if (!l) return;
      st = {
        layer: l.id, op: opFor(e, host), fixed: [node], anchors: [0], search: wireSearch(map, node, WINDOW), live: [node], target: node,
        cooling: new PathCooling(7, 18), touch: e.pointerType === 'touch', lastDown: { t: e.time, s: e.s },
      };
      setLive({ vertices: 1 });
      host.say('Primer punto: recorre el borde');
      host.redrawOverlay();
      return;
    }
    const first = screenOf(host)(ptOf(st.fixed[0]));
    const tol = e.pointerType === 'touch' ? 24 : 9;
    if (st.anchors.length >= 2 && dist(first, e.s) <= tol) { close(host); return; }
    const ld = st.lastDown;
    st.lastDown = { t: e.time, s: e.s };
    if (ld && e.time - ld.t < 400 && dist(ld.s, e.s) < 8) { close(host); return; }
    st.target = clampToWindow(map, st.search.seed, WINDOW, node % map.w, Math.floor(node / map.w));
    st.search.reach(st.target, 400_000);
    fix(host, st.target);
  };

  const tool: Tool & { stats: WireStats; map(): CostMap | null } = {
    id: 'contorno',
    name: 'Contorno preciso',
    hint: 'Haz clic en un borde de la foto y recórrelo: la línea se pega a los bordes. Clic para fijar un punto, clic en el primero o Intro para cerrar, Retroceso quita el último. En teléfono: toca puntos sobre el borde; la línea los une siguiendo la foto.',
    shortcut: 'K',
    group: 'seleccion',
    icon: ICONS.contour,
    cursor: 'crosshair',
    draws: true,
    stats,
    map: () => map,

    activate(host) { ensureMap(host); },
    deactivate(host) { cancel(host, false); },

    down(e, host) {
      ensureMap(host);
      if (!map) { host.say('Preparando los bordes de la foto…'); return; }
      // on touch the point is placed when the finger lifts (two fingers moving the view must not place one);
      // meanwhile the line follows the finger
      if (e.pointerType === 'touch') { touchDown = true; tool.move!(e, host); return; }
      act(e, host);
    },

    up(e, host) {
      if (!touchDown) return;
      touchDown = false;
      act(e, host);
    },

    move(e, host) {
      if (!st || !map) return;
      const lp = layerPoint(host, e.p);
      const node = idxOf(lp);
      st.target = clampToWindow(map, st.search.seed, WINDOW, node % map.w, Math.floor(node / map.w));
      follow(host);
    },

    cancel(host) { touchDown = false; host.redrawOverlay(); },

    onKey(e, host) {
      if (!st) return false;
      if (e.key === 'Enter') { close(host); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { undoAnchor(host); return true; }
      if (e.key === 'Escape') { cancel(host); return true; }
      return false;
    },

    overlay(ctx, host) {
      if (!map) {
        const v = host.view();
        draw.tag(ctx, { x: v.frame.x + v.frame.w / 2, y: v.frame.y + 24 }, 'Preparando los bordes de la foto…', { align: 'center' });
        return;
      }
      if (!st || st.layer !== host.target()) return;
      const scr = screenOf(host);
      const line = (nodes: number[], o = {}) => { if (nodes.length > 1) draw.polyline(ctx, nodes.map(i => scr(ptOf(i))), false, o); };
      line(st.fixed);
      line(st.live, { color: '#ffffff', alpha: 0.9 });
      st.anchors.forEach((a, k) => draw.handle(ctx, scr(ptOf(st!.fixed[a])), { size: k === 0 ? (st!.touch ? 13 : 9) : st!.touch ? 9 : 6, round: k === 0 }));
    },

    Options: ({ host }) => <ContourOptions host={host} actions={{ close: () => close(host), undo: () => undoAnchor(host), cancel: () => cancel(host) }} />,
  };
  return tool;
})();

function ContourOptions({ host, actions }: { host: ToolHost; actions: { close(): void; undo(): void; cancel(): void } }) {
  const st = useSettings();
  const n = useLive(s => s.vertices);
  const wire = useLive(s => s.wire);
  useProject(s => s.project);
  void host;
  return (
    <div className="tl-opts" data-tool="contorno">
      <span className="tl-title">Contorno preciso</span>
      {wire === 'building' ? <Note>Preparando los bordes de la foto…</Note> : wire === 'error' ? <Note tone="warn">No se pudo leer la foto de esta capa.</Note> : null}
      <Switch label="Puntos automáticos" checked={st.wireAuto} onChange={v => setSettings({ wireAuto: v })} hint="Fija un punto solo cuando la línea deja de cambiar" />
      <Slider label="Borde suave" value={st.shapeSoft} min={0} max={80} step={1} format={px} onChange={v => setSettings({ shapeSoft: v })} />
      <Slider label="Intensidad" value={st.shapeAlpha} min={0.05} max={1} step={0.05} format={pct} onChange={v => setSettings({ shapeAlpha: v })} />
      <span className="tl-mono" aria-live="polite">{n ? `${n} ${n === 1 ? 'punto' : 'puntos'}` : 'sin puntos'}</span>
      <Button primary disabled={n < 2} onClick={actions.close} kbd="Intro">Cerrar</Button>
      <Button disabled={!n} onClick={actions.undo} kbd="Retroceso">Quitar último</Button>
      <Button disabled={!n} onClick={actions.cancel} kbd="Esc">Cancelar</Button>
    </div>
  );
}
