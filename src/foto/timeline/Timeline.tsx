/**
 * The timeline of the photo and video studio. It reads and edits the core store (useProject, edit,
 * setTime, select): one row per layer (kind, name, visibility) with its span and its clips; expanded, one
 * row per animated property with its keyframes. Everything is draggable with snapping (keys, clip edges,
 * spans, the playhead, the frame grid; Alt drags freely), each drag is one undo step, and every action has
 * a keyboard path. Playback (play, pause, stop, reverse, speed, loop region) comes from a clock (clock.ts)
 * that works only while playing; the playhead moves outside React, so playing re-renders nothing here.
 *
 * A layer whose mask follows an object in a video (tracking) shows the tracked stretch and its keyframes as small
 * ticks on its row (the model's keyframes, the person's corrections, frames where the object was hidden); a
 * click or Enter on one moves the playhead there.
 *
 * Keyboard (the timeline focused): ←/→ one frame (⇧ one second) · Home/End · Space play/pause · ⇧Space play
 * backwards · K a key at the playhead · Delete the selection · Alt+←/→ move the selection · +/− zoom · Esc.
 * Touch: one finger pans, two fingers zoom, a long press opens the menu of a clip, a key or a row.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { templateById, paramsOf } from '../../project/clips';
import { trackValue } from '../../project/evaluate';
import { edit, select, setTime, useProject } from '../../project/store';
import type { Drawable } from '../../project/sources';
import type { AnimClip, Ease, Id, Layer, LayerKind, Project } from '../../project/types';
import '../../anim/index';
import type { Choreo } from '../../anim/choreo';
import { clipOverlaps, contentEnd, deleteClip, duplicateClip, moveClip, resizeClip, setClipEase, setClipParam, setClipReverse, setSpan } from '../../anim/edit';
import type { LibraryItem } from '../../anim/library';
import { addKey, animatablePaths, deleteKey, findClip, keyTimes, moveKey, pathInfo, setClipLoop, setKeyEase, setKeyValue, shiftKeys, type KeyRef, type PathInfo } from '../../anim/keys';
import { easeLabel } from '../../anim/ease';
import { keysOfFrames, roleOf } from '../../video/keys';
import { addChoreography, addLibraryItem, fitDuration } from './actions';
import { createClock, type PlaybackClock, type PlaybackState } from './clock';
import { LibraryPicker } from './LibraryPicker';
import { clampView, clipLanes, dragTo, fitView, formatTime, frameStep, pinchZoom, reveal, rulerTicks, snapClipStart, snapTargets, snapTime, timeToX, xToTime, zoomAt, type View } from './math';
import { ClipPanel, KeyPanel } from './Panels';
import './timeline.css';

export interface TimelineProps {
  /** The studio's playback clock (default: one of its own on the store's time). */
  clock?: PlaybackClock;
  /** A picture for the library previews (the studio's photo, small); default: the sample photo. */
  previewPicture?: () => Drawable | null;
  /** Phones: a narrower header column and panels as bottom sheets. */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
  /** A Spanish line after each action (the studio's status / aria-live). */
  onSay?: (s: string) => void;
  /** Library previews with the Canvas 2D engine (no WebGL 2). */
  basicPreviews?: boolean;
}

type Sel = { kind: 'clip'; id: Id } | { kind: 'keys'; refs: KeyRef[] } | null;
type Pop = { kind: 'clip'; id: Id; x: number; y: number } | { kind: 'key'; ref: KeyRef; x: number; y: number } | null;
interface MenuItem { label: string; run: () => void; danger?: boolean }

const KIND_ICON: Record<LayerKind, ReactNode> = {
  photo: <path d="M3 5h14v10H3z M3 12l4-4 4 4 2-2 4 4" />,
  ascii: <path d="M4 6h3M9 6h3M14 6h2M4 10h2M8 10h4M14 10h2M4 14h4M10 14h2M14 14h2" />,
  glyphs: <path d="M5 15 9 5h2l4 10M7 11h6" />,
  text: <path d="M4 5h12M10 5v11" />,
  shape: <path d="M4 4h12v12H4z" />,
};
const KIND_NAME: Record<LayerKind, string> = { photo: 'Foto', ascii: 'ASCII', glyphs: 'Caracteres', text: 'Texto', shape: 'Forma' };
const Icon = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d ? <path d={d} /> : children}</svg>
);
const I = {
  start: 'M5 4v12M16 4 8 10l8 6z', play: 'M6 4l10 6-10 6z', pause: 'M6 4v12M14 4v12', back: 'M14 4 4 10l10 6z',
  prev: 'M13 5 7 10l6 5', next: 'M7 5l6 5-6 5', loop: 'M4 8a5 5 0 0 1 9-3l2 2M16 12a5 5 0 0 1-9 3l-2-2M15 4v3h-3M5 16v-3h3',
  region: 'M3 5v10M17 5v10M3 10h14', magnet: 'M5 4v6a5 5 0 0 0 10 0V4M5 7h3M12 7h3', minus: 'M5 10h10', plus: 'M10 5v10M5 10h10',
  fit: 'M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4', eye: 'M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  eyeOff: 'M3 3l14 14M8.5 5.2A8 8 0 0 1 10 5c5 0 8 5 8 5a13 13 0 0 1-2.6 3M6 6.6C3.6 8 2 10 2 10s3 5 8 5a8 8 0 0 0 3.3-.7',
  caret: 'M7 5l6 5-6 5', caretDown: 'M5 7l5 6 5-6', key: 'M10 4l6 6-6 6-6-6z',
};

const HEAD = 188, HEAD_COMPACT = 118;
const LONG_PRESS = 480, MOVE_TOL = 6;

export function Timeline(props: TimelineProps) {
  const project = useProject(s => s.project);
  const selection = useProject(s => s.selection);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeText = useRef<HTMLSpanElement>(null);
  const headW = props.compact ? HEAD_COMPACT : HEAD;

  /* ---------------------------------------------------------------- clock */
  const projRef = useRef(project);
  projRef.current = project;
  const lenOf = (p: Project | null) => (p ? Math.max(p.time.duration, contentEnd(p), 1) : 1);
  const own = useMemo(() => props.clock ? null : createClock({
    get: () => useProject.getState().time, set: t => setTime(t), duration: () => lenOf(projRef.current),
    loop: () => !!projRef.current?.time.loop, fps: () => projRef.current?.time.fps ?? 30,
  }), [props.clock]);
  const clock = props.clock ?? own!;
  useEffect(() => () => own?.dispose(), [own]);
  const [play, setPlay] = useState<PlaybackState>(clock.state());
  useEffect(() => clock.subscribe(setPlay), [clock]);

  /* ---------------------------------------------------------------- view */
  const [view, setView] = useState<View>({ pps: 100, start: -0.2, width: 600 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const fitted = useRef<string>('');
  const len = lenOf(project);
  useLayoutEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.max(80, el.clientWidth);
      setView(v => {
        const key = `${project?.id}`;
        if (fitted.current !== key) { fitted.current = key; return fitView(len, w); }
        return v.width === w ? v : clampView({ ...v, width: w }, len);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project?.id, len]);

  /* ---------------------------------------------------------------- playhead (outside React) */
  const [idleTime, setIdleTime] = useState(useProject.getState().time);
  const placeHead = useCallback((t: number) => {
    const v = viewRef.current;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${timeToX(v, t)}px)`;
    if (timeText.current) timeText.current.textContent = formatTime(t);
  }, []);
  useEffect(() => {
    placeHead(useProject.getState().time);
    return useProject.subscribe((s, prev) => {
      if (s.time === prev.time) return;
      placeHead(s.time);
      if (!clock.state().playing) setIdleTime(s.time);
    });
  }, [placeHead, clock]);
  useEffect(() => { placeHead(useProject.getState().time); }, [view, placeHead]);
  useEffect(() => { if (!play.playing) setIdleTime(useProject.getState().time); }, [play.playing]);
  // while playing, keep the playhead in view
  useEffect(() => {
    if (!play.playing) return;
    return useProject.subscribe(s => {
      const v = viewRef.current;
      const x = timeToX(v, s.time);
      if (x < 0 || x > v.width) setView(clampView({ ...v, start: s.time - v.width * 0.1 / v.pps }, lenOf(projRef.current)));
    });
  }, [play.playing]);

  /* ---------------------------------------------------------------- local state */
  const [expanded, setExpanded] = useState<Set<Id>>(new Set());
  const [sel, setSel] = useState<Sel>(null);
  const [focusPath, setFocusPath] = useState<{ layer: Id; path: string } | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [picker, setPicker] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const say = (s: string) => props.onSay?.(s);

  const fps = project?.time.fps ?? 30;
  const layers = useMemo(() => (project ? [...project.layers].reverse() : []), [project]);
  const selLayer = project?.layers.find(l => l.id === selection[0]) ?? null;

  /* ---------------------------------------------------------------- helpers */
  const lanesLeft = () => lanesRef.current?.getBoundingClientRect().left ?? 0;
  const xOf = (e: { clientX: number }) => e.clientX - lanesLeft();
  const rootXY = (e: { clientX: number; clientY: number }) => { const r = root.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const targets = (except?: string) => {
    const p = projRef.current;
    if (!p) return [];
    return snapTargets({
      duration: lenOf(p), keys: keyTimes(p), clips: p.layers.flatMap(l => l.clips), spans: p.layers.map(l => l.span),
      playhead: useProject.getState().time, ...(except ? { except } : {}),
    });
  };
  const snapT = (t: number, alt: boolean, except?: string) => {
    if (!snapOn || alt) return { t: Math.max(0, t), snapped: false as const };
    return snapTime(Math.max(0, t), targets(except), viewRef.current, { px: 8, fps });
  };
  const goTo = (t: number) => { clock.pause(); setTime(Math.min(lenOf(projRef.current), Math.max(0, t))); };

  /** Grows the project's duration when content passes its end (a still project gets a length). */

  /* ---------------------------------------------------------------- actions */
  const addFromLibrary = (item: LibraryItem) => {
    const r = addLibraryItem(item, selLayer?.id);
    if (r.clip) setSel({ kind: 'clip', id: r.clip });
    if (r.ok) setPicker(false);
    say(r.msg);
  };
  const addChoreo = (c: Choreo) => {
    const r = addChoreography(c, selLayer?.id);
    if (r.ok) setPicker(false);
    say(r.msg);
  };
  const deleteSelection = () => {
    if (!sel) return;
    if (sel.kind === 'clip') { edit(d => { deleteClip(d, sel.id); }); say('Clip eliminado.'); }
    else { const refs = sel.refs; edit(d => { for (const r of refs) deleteKey(d, r.layer, r.path, r.t); }); say(refs.length > 1 ? `${refs.length} llaves eliminadas.` : 'Llave eliminada.'); }
    setSel(null); setPop(null);
  };
  const keyAtPlayhead = () => {
    const p = projRef.current;
    if (!p) return;
    const t = frameStep(useProject.getState().time, fps, 0, lenOf(p));
    let target = focusPath;
    if (!target && selLayer) {
      const tracked = p.tracks.find(tr => tr.layer === selLayer.id);
      target = { layer: selLayer.id, path: tracked?.path ?? 'opacity' };
    }
    if (!target) { say('Selecciona una capa (o una propiedad) para poner una llave.'); return; }
    const tgt = target;
    let at: number | null = null;
    edit(d => { at = addKey(d, tgt.layer, tgt.path, t); fitDuration(d); });
    if (at !== null) {
      setExpanded(s => new Set(s).add(tgt.layer));
      setSel({ kind: 'keys', refs: [{ layer: tgt.layer, path: tgt.path, t: at }] });
      const l = p.layers.find(x => x.id === tgt.layer);
      say(`Llave de «${(l && pathInfo(l, tgt.path)?.label) ?? tgt.path}» en ${formatTime(at)}.`);
    }
  };
  const nudgeSelection = (dt: number) => {
    if (!sel) return;
    if (sel.kind === 'clip') {
      const f = project && findClip(project, sel.id);
      if (f) edit(d => { moveClip(d, sel.id, Math.max(0, f.clip.start + dt)); fitDuration(d); }, `nudge-${sel.id}`);
    } else {
      let refs = sel.refs;
      edit(d => { refs = shiftKeys(d, refs, dt); fitDuration(d); }, `nudge-keys`);
      setSel({ kind: 'keys', refs });
    }
  };

  /* ---------------------------------------------------------------- keyboard */
  const onKeyDown = (e: RKeyboardEvent) => {
    const tg = e.target as HTMLElement;
    if (tg.closest('input, select, textarea, .tl-pop, .tl-lib')) return;
    const p = projRef.current;
    if (!p) return;
    const t = useProject.getState().time;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowRight': {
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.altKey && sel) nudgeSelection(dir * (e.shiftKey ? 1 : 1 / fps));
        else { const n = frameStep(t, fps, dir * (e.shiftKey ? Math.round(fps) : 1), lenOf(p)); goTo(n); setView(v => reveal(v, n)); }
        break;
      }
      case 'Home': goTo(play.region?.in ?? 0); setView(v => reveal(v, 0)); break;
      case 'End': goTo(play.region?.out ?? lenOf(p)); setView(v => reveal(v, lenOf(p))); break;
      case ' ': if (play.playing) clock.pause(); else clock.play(e.shiftKey ? -Math.abs(play.rate) : Math.abs(play.rate)); break;
      case 'k': case 'K': keyAtPlayhead(); break;
      case 'Delete': case 'Backspace': if (sel) deleteSelection(); else handled = false; break;
      case '+': case '=': setView(v => clampView(zoomAt(v, 1.4, timeToX(v, t)), lenOf(p))); break;
      case '-': case '_': setView(v => clampView(zoomAt(v, 1 / 1.4, timeToX(v, t)), lenOf(p))); break;
      case 'Escape': if (pop || menu) { setPop(null); setMenu(null); } else setSel(null); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };

  /* ---------------------------------------------------------------- gestures */
  type G =
    | { act: 'scrub' }
    | { act: 'clip'; id: Id; mode: 'move' | 'l' | 'r'; t0: number; dur0: number; x0: number; y0: number; moved: boolean; gid: string; el: HTMLElement }
    | { act: 'key'; refs: KeyRef[]; primary: KeyRef; t0: number; x0: number; y0: number; moved: boolean; gid: string; el: HTMLElement }
    | { act: 'span'; layer: Id; edge: 'in' | 'out'; x0: number; gid: string }
    | { act: 'region'; edge: 'in' | 'out'; r0: { in: number; out: number } }
    | { act: 'pan'; x0: number; y0: number; start0: number; top0: number; moved: boolean; lane?: Id }
    | { act: 'pinch'; d0: number; mid0: number; view0: View };
  const gesture = useRef<{ pid: number; g: G; touch: boolean; timer: number; at: number; xy: { clientX: number; clientY: number } } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const cancelLong = () => { const c = gesture.current; if (c?.timer) { clearTimeout(c.timer); c.timer = 0; } };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const touch = e.pointerType === 'touch';
    if (touch) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers: zoom (whatever the first one was doing stops)
    if (touch && touches.current.size === 2) {
      cancelLong();
      const [a, b] = [...touches.current.values()];
      gesture.current = { pid: -1, touch: true, timer: 0, at: e.timeStamp, xy: { clientX: e.clientX, clientY: e.clientY }, g: { act: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mid0: (a.x + b.x) / 2 - lanesLeft(), view0: viewRef.current } };
      setSnapAt(null);
      return;
    }
    if (!el || !project) return;
    const act = el.dataset.act!;
    // a tracking keyframe: its click moves the playhead (no drag starts here)
    if (act === 'tk') return;
    setMenu(null);
    let g: G | null = null;
    const gid = `g${e.timeStamp}`;
    if (act === 'ruler') { clock.pause(); g = { act: 'scrub' }; goTo(snapT(xToTime(viewRef.current, xOf(e)), e.altKey).t); }
    else if (act === 'clip' || act === 'clip-l' || act === 'clip-r') {
      const id = el.closest<HTMLElement>('[data-clip]')!.dataset.clip!;
      const f = findClip(project, id);
      if (!f) return;
      setSel({ kind: 'clip', id });
      select([f.layer.id]);
      g = { act: 'clip', id, mode: act === 'clip' ? 'move' : act === 'clip-l' ? 'l' : 'r', t0: f.clip.start, dur0: f.clip.dur, x0: e.clientX, y0: e.clientY, moved: false, gid, el: el.closest<HTMLElement>('[data-clip]')! };
    } else if (act === 'key') {
      const ref: KeyRef = { layer: el.dataset.layer!, path: el.dataset.path!, t: Number(el.dataset.t) };
      const already = sel?.kind === 'keys' && sel.refs.some(r => r.layer === ref.layer && r.path === ref.path && Math.abs(r.t - ref.t) < 1e-4);
      const refs = e.shiftKey && sel?.kind === 'keys' ? (already ? sel.refs : [...sel.refs, ref]) : already && sel?.kind === 'keys' ? sel.refs : [ref];
      setSel({ kind: 'keys', refs });
      setFocusPath({ layer: ref.layer, path: ref.path });
      g = { act: 'key', refs, primary: ref, t0: ref.t, x0: e.clientX, y0: e.clientY, moved: false, gid, el };
    } else if (act === 'span-in' || act === 'span-out') {
      g = { act: 'span', layer: el.dataset.layer!, edge: act === 'span-in' ? 'in' : 'out', x0: e.clientX, gid };
    } else if (act === 'region-in' || act === 'region-out') {
      if (!play.region) return;
      g = { act: 'region', edge: act === 'region-in' ? 'in' : 'out', r0: play.region };
    } else if (act === 'lane' || act === 'pan') {
      g = { act: 'pan', x0: e.clientX, y0: e.clientY, start0: viewRef.current.start, top0: body.current?.scrollTop ?? 0, moved: false, ...(el.dataset.layer ? { lane: el.dataset.layer } : {}) };
    }
    if (!g) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* the pointer may be gone */ }
    const c = { pid: e.pointerId, g, touch, timer: 0, at: e.timeStamp, xy: { clientX: e.clientX, clientY: e.clientY } };
    gesture.current = c;
    // long press (touch): the menu of what is under the finger
    if (touch && (g.act === 'clip' || g.act === 'key' || g.act === 'pan')) {
      const at = { clientX: e.clientX, clientY: e.clientY };
      c.timer = window.setTimeout(() => {
        if (gesture.current !== c) return;
        const moved = (g.act === 'clip' || g.act === 'key' || g.act === 'pan') && g.moved;
        if (moved) return;
        gesture.current = null;
        openMenuFor(g, at);
      }, LONG_PRESS);
    }
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = gesture.current;
    if (!c) return;
    const g = c.g;
    if (g.act === 'pinch') {
      if (touches.current.size < 2) return;
      const [a, b] = [...touches.current.values()];
      const d1 = Math.hypot(a.x - b.x, a.y - b.y), mid1 = (a.x + b.x) / 2 - lanesLeft();
      setView(clampView(pinchZoom(g.view0, g.d0, d1, g.mid0, mid1), lenOf(projRef.current)));
      return;
    }
    if (c.pid !== e.pointerId) return;
    const v = viewRef.current;
    switch (g.act) {
      case 'scrub': goTo(snapT(xToTime(v, xOf(e)), e.altKey).t); break;
      case 'clip': {
        const dx = e.clientX - g.x0;
        if (!g.moved && Math.hypot(dx, e.clientY - g.y0) < MOVE_TOL) return;
        g.moved = true; cancelLong();
        let t: number, snapped: number | undefined;
        if (g.mode === 'move') {
          const raw = dragTo(g.t0, dx, v);
          const s = snapOn && !e.altKey ? snapClipStart(raw, g.dur0, targets(g.id), v, { px: 8, fps }) : { t: raw, snapped: false };
          t = Math.max(0, s.t); snapped = s.snapped ? (s as { to?: number }).to : undefined;
          edit(d => { moveClip(d, g.id, t); fitDuration(d); }, g.gid);
        } else {
          const edge = g.mode === 'l' ? g.t0 : g.t0 + g.dur0;
          const s = snapT(dragTo(edge, dx, v), e.altKey, g.id);
          t = s.t; snapped = s.snapped ? s.t : undefined;
          edit(d => { resizeClip(d, g.id, g.mode === 'l' ? 'start' : 'end', t); fitDuration(d); }, g.gid);
        }
        setSnapAt(snapped ?? null);
        break;
      }
      case 'key': {
        const dx = e.clientX - g.x0;
        if (!g.moved && Math.hypot(dx, e.clientY - g.y0) < MOVE_TOL) return;
        g.moved = true; cancelLong();
        const s = snapT(dragTo(g.t0, dx, v), e.altKey);
        const cur = g.refs.find(r => r.layer === g.primary.layer && r.path === g.primary.path && Math.abs(r.t - g.primary.t) < 1e-4) ?? g.primary;
        const delta = s.t - cur.t;
        if (Math.abs(delta) < 1e-6) break;
        let refs = g.refs;
        edit(d => { refs = shiftKeys(d, g.refs, delta); fitDuration(d); }, g.gid);
        const moved = refs.find(r => r.layer === cur.layer && r.path === cur.path && Math.abs(r.t - (cur.t + delta)) < 1e-3) ?? { ...cur, t: cur.t + delta };
        g.refs = refs; g.primary = moved;
        setSel({ kind: 'keys', refs });
        setSnapAt(s.snapped ? s.t : null);
        break;
      }
      case 'span': {
        const l = projRef.current?.layers.find(x => x.id === g.layer);
        if (!l) break;
        const sp = l.span ?? { in: 0, out: lenOf(projRef.current) };
        const s = snapT(xToTime(v, xOf(e)), e.altKey);
        const next = g.edge === 'in' ? { in: Math.min(s.t, sp.out - 0.05), out: sp.out } : { in: sp.in, out: Math.max(s.t, sp.in + 0.05) };
        edit(d => { setSpan(d, g.layer, next); fitDuration(d); }, g.gid);
        setSnapAt(s.snapped ? s.t : null);
        break;
      }
      case 'region': {
        const s = snapT(xToTime(v, xOf(e)), e.altKey);
        clock.setRegion(g.edge === 'in' ? { in: Math.min(s.t, g.r0.out - 0.05), out: g.r0.out } : { in: g.r0.in, out: Math.max(s.t, g.r0.in + 0.05) });
        break;
      }
      case 'pan': {
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (!g.moved && Math.hypot(dx, dy) < MOVE_TOL) return;
        g.moved = true; cancelLong();
        setView(clampView({ ...v, start: g.start0 - dx / v.pps }, lenOf(projRef.current)));
        if (body.current && c.touch) body.current.scrollTop = g.top0 - dy;
        break;
      }
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    touches.current.delete(e.pointerId);
    const c = gesture.current;
    if (!c) return;
    if (c.g.act === 'pinch') { if (touches.current.size < 2) gesture.current = null; return; }
    if (c.pid !== e.pointerId) return;
    cancelLong();
    gesture.current = null;
    setSnapAt(null);
    const g = c.g;
    if (e.type === 'pointercancel') return;
    // a long press whose timer could not run in time (a busy frame): the lift still opens the menu
    const still = !((g as { moved?: boolean }).moved ?? false);
    if (c.touch && still && e.timeStamp - c.at >= LONG_PRESS && (g.act === 'clip' || g.act === 'key' || g.act === 'pan')) { openMenuFor(g, c.xy); return; }
    if (g.act === 'clip' && !g.moved) openClipPop(g.id, g.el);
    if (g.act === 'key' && !g.moved) {
      // a tap on touch, or a second click within 400 ms (pointer capture keeps dblclick from reaching the key)
      const id = `${g.primary.layer}|${g.primary.path}|${g.primary.t}`;
      const prev = lastTap.current;
      lastTap.current = { id, at: e.timeStamp };
      if (c.touch || (prev?.id === id && e.timeStamp - prev.at < 400)) openKeyPop(g.primary, g.el);
    }
    if (g.act === 'pan' && !g.moved) {
      // a tap on an empty lane: deselect, move the playhead there (on a layer row, select the layer)
      setSel(null); setPop(null);
      if (g.lane) select([g.lane]);
      goTo(snapT(xToTime(viewRef.current, xOf(e)), e.altKey).t);
    }
    if ((g.act === 'clip' || g.act === 'key' || g.act === 'span') && ((g as { moved?: boolean }).moved ?? true)) say('Movido.');
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const v = viewRef.current;
    // (the page's own scroll and zoom are cancelled by the native listener below: React's is passive)
    if (e.ctrlKey || e.metaKey) {
      setView(clampView(zoomAt(v, Math.exp(-e.deltaY * 0.0022), xOf(e)), len));
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      setView(clampView({ ...v, start: v.start + d / v.pps }, len));
    }
  };
  // wheel with ctrl must be cancellable: React's onWheel is passive, so the listener is added by hand
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const h = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault(); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  /* ---------------------------------------------------------------- popovers and menus */
  /** Where a panel opens: a column over the rows, next to what it edits, as tall as the rows' area. */
  const anchorOf = (el: Element) => {
    const r = el.getBoundingClientRect(), R = root.current!.getBoundingClientRect();
    const B = body.current?.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left - R.left), Math.max(8, R.width - 336));
    return { x, y: B ? Math.max(4, B.top - R.top + 4) : 8 };
  };
  const popStyle = (x: number, y: number): CSSProperties => ({ left: x, top: y, maxHeight: Math.max(160, (root.current?.clientHeight ?? 400) - y - 8) });
  const openClipPop = (id: Id, el: Element) => { setPop({ kind: 'clip', id, ...anchorOf(el) }); setSel({ kind: 'clip', id }); };
  const openKeyPop = (ref: KeyRef, el: Element) => { setPop({ kind: 'key', ref, ...anchorOf(el) }); setSel({ kind: 'keys', refs: [ref] }); };

  const openMenuFor = (g: G, at: { clientX: number; clientY: number }) => {
    const { x, y } = rootXY(at);
    const R = root.current!.getBoundingClientRect();
    const pos = { x: Math.min(x, R.width - 210), y: Math.min(y, R.height - 240) };
    if (g.act === 'clip') {
      const f = project && findClip(project, g.id);
      if (!f) return;
      setMenu({ ...pos, items: [
        { label: 'Parámetros…', run: () => openClipPop(g.id, g.el) },
        { label: 'Duplicar', run: () => edit(d => { duplicateClip(d, g.id); fitDuration(d); }) },
        { label: f.clip.reverse ? 'Hacia delante' : 'Al revés', run: () => edit(d => { setClipReverse(d, g.id, !f.clip.reverse); }) },
        { label: f.clip.pingpong ? 'Quitar ida y vuelta' : 'Ida y vuelta (×2)', run: () => edit(d => { setClipLoop(d, g.id, f.clip.pingpong ? 1 : Math.max(2, f.clip.repeat), !f.clip.pingpong); }) },
        { label: 'Eliminar', danger: true, run: () => { edit(d => { deleteClip(d, g.id); }); setSel(null); } },
      ] });
    } else if (g.act === 'key') {
      const ref = g.primary;
      setMenu({ ...pos, items: [
        { label: 'Curva y valor…', run: () => openKeyPop(ref, g.el) },
        { label: 'Eliminar llave', danger: true, run: () => { edit(d => { deleteKey(d, ref.layer, ref.path, ref.t); }); setSel(null); } },
      ] });
    } else if (g.act === 'pan') {
      const t = snapT(xToTime(viewRef.current, xOf(at)), false).t;
      const layer = g.lane;
      setMenu({ ...pos, items: [
        { label: 'Mover el cabezal aquí', run: () => goTo(t) },
        { label: 'Añadir animación aquí…', run: () => { goTo(t); if (layer) select([layer]); setPicker(true); } },
        ...(layer ? [{ label: 'Llave de opacidad aquí', run: () => { edit(d => { addKey(d, layer, 'opacity', t); fitDuration(d); }); setExpanded(s => new Set(s).add(layer)); } }] : []),
        ...(layer ? [{ label: project?.layers.find(x => x.id === layer)?.visible ? 'Ocultar la capa' : 'Mostrar la capa', run: () => edit(d => { const x = d.layers.find(y => y.id === layer); if (x) x.visible = !x.visible; }) }] : []),
      ] });
    }
  };
  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || !project) return;
    e.preventDefault();
    const act = el.dataset.act!;
    const at = { clientX: e.clientX, clientY: e.clientY };
    if (act.startsWith('clip')) { const c = el.closest<HTMLElement>('[data-clip]')!; openMenuFor({ act: 'clip', id: c.dataset.clip!, mode: 'move', t0: 0, dur0: 0, x0: 0, y0: 0, moved: false, gid: '', el: c }, at); }
    else if (act === 'key') { const ref = { layer: el.dataset.layer!, path: el.dataset.path!, t: Number(el.dataset.t) }; openMenuFor({ act: 'key', refs: [ref], primary: ref, t0: ref.t, x0: 0, y0: 0, moved: false, gid: '', el }, at); }
    else if (act === 'lane') openMenuFor({ act: 'pan', x0: 0, y0: 0, start0: 0, top0: 0, moved: false, ...(el.dataset.layer ? { lane: el.dataset.layer } : {}) }, at);
  };

  /* ---------------------------------------------------------------- render */
  if (!project) {
    return <div className={`tl ${props.className ?? ''}`} style={props.style} role="region" aria-label="Línea de tiempo"><p className="tl-empty">Abre un proyecto para ver su línea de tiempo.</p></div>;
  }
  const endX = timeToX(view, len);
  const ticks = rulerTicks(view);
  const regionOn = !!play.region;
  const speed = Math.abs(play.rate);
  const reverseOn = play.playing && play.rate < 0;

  const clipPopData = pop?.kind === 'clip' ? findClip(project, pop.id) : null;
  const keyPopData = (() => {
    if (pop?.kind !== 'key') return null;
    const tr = project.tracks.find(x => x.layer === pop.ref.layer && x.path === pop.ref.path);
    const idx = tr ? tr.keys.findIndex(k => Math.abs(k.t - pop.ref.t) < 1e-4) : -1;
    const l = project.layers.find(x => x.id === pop.ref.layer);
    const info = l ? pathInfo(l, pop.ref.path) : null;
    return tr && idx >= 0 && info ? { tr, idx, info } : null;
  })();

  return (
    <div ref={root} className={`tl${props.compact ? ' compact' : ''} ${props.className ?? ''}`} style={{ ...props.style, ['--tl-head' as string]: `${headW}px` }}
      role="region" aria-label="Línea de tiempo" tabIndex={0} onKeyDown={onKeyDown} data-pps={Math.round(view.pps * 100) / 100} data-start={Math.round(view.start * 1000) / 1000}>
      {/* ---------------------------------------------------------------- transport */}
      <div className="tl-bar" role="toolbar" aria-label="Reproducción y vista">
        <div className="grp">
          <button type="button" className="tl-btn" aria-label="Detener y volver al inicio" title="Detener" onClick={() => clock.stop()}><Icon d={I.start} /></button>
          <button type="button" className="tl-btn" aria-label="Reproducir al revés" aria-pressed={reverseOn} title="Reproducir al revés (⇧ Espacio)"
            onClick={() => (reverseOn ? clock.pause() : clock.play(-speed))}><Icon d={I.back} /></button>
          <button type="button" className="tl-btn" aria-label={play.playing && play.rate > 0 ? 'Pausar' : 'Reproducir'} aria-pressed={play.playing && play.rate > 0} title="Reproducir o pausar (Espacio)"
            onClick={() => (play.playing && play.rate > 0 ? clock.pause() : clock.play(speed))}><Icon d={play.playing && play.rate > 0 ? I.pause : I.play} /></button>
          <button type="button" className="tl-btn" aria-label="Cuadro anterior" title="Cuadro anterior (←)" onClick={() => goTo(frameStep(useProject.getState().time, fps, -1, len))}><Icon d={I.prev} /></button>
          <button type="button" className="tl-btn" aria-label="Cuadro siguiente" title="Cuadro siguiente (→)" onClick={() => goTo(frameStep(useProject.getState().time, fps, 1, len))}><Icon d={I.next} /></button>
        </div>
        <span className="tl-time" aria-live="off"><span ref={timeText}>{formatTime(idleTime)}</span>{!props.compact && <small> / {formatTime(len)}</small>}</span>
        <div className="grp">
          <select className="tl-select" aria-label="Velocidad" value={String(speed)} onChange={e => clock.setRate(Number(e.target.value) * (play.rate < 0 ? -1 : 1))}>
            {[0.25, 0.5, 1, 1.5, 2].map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
          <button type="button" className="tl-btn" aria-label="Repetir el proyecto en bucle" aria-pressed={project.time.loop} title="Bucle del proyecto" onClick={() => edit(d => { d.time.loop = !d.time.loop; })}><Icon d={I.loop} /></button>
          <button type="button" className="tl-btn tl-region" aria-label="Región de bucle" aria-pressed={regionOn} title="Repetir solo una región"
            onClick={() => { if (regionOn) clock.setRegion(null); else { const t = useProject.getState().time; const a = Math.min(t, Math.max(0, len - 1)); clock.setRegion({ in: a, out: Math.min(len, a + Math.max(1, len / 4)) }); } }}><Icon d={I.region} /></button>
          <button type="button" className="tl-btn" aria-label="Imán: ajustar a llaves, bordes y cuadros" aria-pressed={snapOn} title="Ajustar al arrastrar (Alt lo suspende)" onClick={() => setSnapOn(s => !s)}><Icon d={I.magnet} /></button>
        </div>
        {!props.compact && <span className="sep" />}
        <div className="grp">
          {!props.compact && <button type="button" className="tl-btn" aria-label="Alejar" onClick={() => setView(v => clampView(zoomAt(v, 1 / 1.5, timeToX(v, useProject.getState().time)), len))}><Icon d={I.minus} /></button>}
          <button type="button" className="tl-btn" aria-label="Ver todo" onClick={() => setView(v => fitView(len, v.width))}><Icon d={I.fit} /></button>
          {!props.compact && <button type="button" className="tl-btn" aria-label="Acercar" onClick={() => setView(v => clampView(zoomAt(v, 1.5, timeToX(v, useProject.getState().time)), len))}><Icon d={I.plus} /></button>}
        </div>
        {!props.compact && <label className="tl-time" style={{ minWidth: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <small>Dura</small>
          <input type="number" className="tl-select" aria-label="Duración del proyecto en segundos" min={0.1} step={0.1} value={Math.round(project.time.duration * 100) / 100} style={{ width: '5.2em' }}
            onChange={e => { const v = Number(e.target.value); if (v > 0) edit(d => { d.time.duration = Math.min(3600, v); }, 'duracion'); }} />
        </label>}
        <span className="tl-spacer" />
        <button type="button" className="tl-btn primary" onClick={() => setPicker(true)} aria-haspopup="dialog" aria-label="Añadir animación"><Icon d={I.plus} />{props.compact ? 'Añadir' : 'Animación'}</button>
      </div>

      {/* ---------------------------------------------------------------- rows */}
      <div ref={body} className="tl-body" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onWheel={onWheel} onContextMenu={onContextMenu}>
        <div className="tl-grid">
          <div className="tl-rulerhead">Capas</div>
          <div className="tl-ruler" data-act="ruler" role="slider" tabIndex={-1} aria-label="Cabezal de reproducción" aria-valuemin={0} aria-valuemax={Math.round(len * 100) / 100}
            aria-valuenow={Math.round(idleTime * 100) / 100} aria-valuetext={formatTime(idleTime)} ref={lanesRef}>
            {ticks.map(tk => <span key={tk.t.toFixed(4)} className={`tick${tk.major ? ' major' : ''}`} style={{ left: tk.x }} />)}
            {ticks.filter(tk => tk.label).map(tk => <span key={'l' + tk.t.toFixed(4)} className="lbl" style={{ left: tk.x }}>{tk.label}</span>)}
            <span className="out" style={{ left: Math.max(0, endX), right: 0 }} />
            <span className="end" style={{ left: endX }} />
            {play.region && <>
              <span className="region on" style={{ left: timeToX(view, play.region.in), width: (play.region.out - play.region.in) * view.pps }} />
              <span className="rh" data-act="region-in" role="slider" aria-label="Inicio de la región de bucle" aria-valuenow={play.region.in} tabIndex={-1} style={{ left: timeToX(view, play.region.in) }} />
              <span className="rh" data-act="region-out" role="slider" aria-label="Fin de la región de bucle" aria-valuenow={play.region.out} tabIndex={-1} style={{ left: timeToX(view, play.region.out) }} />
            </>}
          </div>
          {!layers.length && <><div className="tl-head"><span className="name">Sin capas</span></div><div className="tl-lane" /></>}
          {layers.map(l => (
            <LayerRows key={l.id} compact={!!props.compact} layer={l} project={project} view={view} expanded={expanded.has(l.id)} selected={selection.includes(l.id)} sel={sel} len={len} time={idleTime}
              focusPath={focusPath} onFocusPath={setFocusPath}
              onToggle={() => setExpanded(s => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })}
              onSelect={() => select([l.id])}
              onVisible={() => edit(d => { const x = d.layers.find(y => y.id === l.id); if (x) x.visible = !x.visible; })}
              onAddKey={path => { const t = frameStep(useProject.getState().time, fps, 0, len); edit(d => { addKey(d, l.id, path, t); fitDuration(d); }); setFocusPath({ layer: l.id, path }); }}
              onOpenClip={(id, el) => openClipPop(id, el)} onOpenKey={(ref, el) => openKeyPop(ref, el)}
              onGoTo={t => { goTo(t); setView(v => reveal(v, t)); say(`Cabezal en ${formatTime(t)}.`); }} />
          ))}
          <div className="tl-lanes-layer" style={{ left: headW }} aria-hidden="true">
            <div ref={playheadRef} className="tl-playhead"><span className="knob" /></div>
            {snapAt !== null && <div className="tl-snap" style={{ transform: `translateX(${timeToX(view, snapAt)}px)` }} />}
          </div>
        </div>
      </div>
      <TimeScroll view={view} len={len} onStart={st => setView(v => clampView({ ...v, start: st }, len))} />
      <p className="tl-hint">
        {props.compact && (typeof matchMedia !== 'function' || matchMedia('(pointer: coarse)').matches) ? 'Un dedo desplaza, dos acercan; mantén pulsado un clip o una llave para ver sus opciones.' : <><kbd>←</kbd><kbd>→</kbd> cuadro · <kbd>⇧</kbd> segundo · <kbd>Espacio</kbd> reproducir · <kbd>K</kbd> llave · <kbd>Supr</kbd> borrar · <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> mover selección · <kbd>Ctrl</kbd>+rueda zoom · clic derecho: opciones</>}
      </p>

      {/* ---------------------------------------------------------------- popovers */}
      {clipPopData && pop?.kind === 'clip' && (
        <div className="tl-pop" role="dialog" aria-label={`Clip ${templateById(clipPopData.clip.template)?.name ?? clipPopData.clip.template}`} style={popStyle(pop.x, pop.y)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPop(null); root.current?.focus(); } }}>
          <ClipPanel clip={clipPopData.clip} def={templateById(clipPopData.clip.template)} params={templateById(clipPopData.clip.template) ? paramsOf(templateById(clipPopData.clip.template)!, clipPopData.clip) : clipPopData.clip.params}
            a={{
              param: (k, v, commit) => edit(d => { setClipParam(d, pop.id, k, v); }, commit ? '' : `p-${pop.id}-${k}`),
              timing: (start, dur) => edit(d => { const f = findClip(d, pop.id); if (f) { f.clip.start = start; f.clip.dur = dur; } fitDuration(d); }, `t-${pop.id}`),
              reverse: v => edit(d => { setClipReverse(d, pop.id, v); }),
              loop: (r, pp) => edit(d => { setClipLoop(d, pop.id, r, pp); }, `r-${pop.id}`),
              ease: (e: Ease, commit?: boolean) => edit(d => { setClipEase(d, pop.id, e); }, commit ? '' : `e-${pop.id}`),
              duplicate: () => { let id = ''; edit(d => { id = duplicateClip(d, pop.id)?.id ?? ''; fitDuration(d); }); if (id) setSel({ kind: 'clip', id }); setPop(null); },
              remove: () => { edit(d => { deleteClip(d, pop.id); }); setSel(null); setPop(null); say('Clip eliminado.'); },
              close: () => { setPop(null); root.current?.focus(); },
            }} />
        </div>
      )}
      {keyPopData && pop?.kind === 'key' && (
        <div className="tl-pop" role="dialog" aria-label={`Llave de ${keyPopData.info.label}`} style={popStyle(pop.x, pop.y)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPop(null); root.current?.focus(); } }}>
          <KeyPanel info={keyPopData.info} k={keyPopData.tr.keys[keyPopData.idx]} isLast={keyPopData.idx === keyPopData.tr.keys.length - 1} fps={fps}
            a={{
              value: (v, commit) => edit(d => { setKeyValue(d, pop.ref.layer, pop.ref.path, pop.ref.t, v); }, commit ? '' : `kv-${pop.ref.path}`),
              time: t => { let at: number | null = null; edit(d => { at = moveKey(d, pop.ref.layer, pop.ref.path, pop.ref.t, t); fitDuration(d); }, `kt-${pop.ref.path}`); if (at !== null) setPop({ ...pop, ref: { ...pop.ref, t: at } }); },
              ease: (e, commit) => edit(d => { setKeyEase(d, pop.ref.layer, pop.ref.path, pop.ref.t, e); }, commit ? '' : `ke-${pop.ref.path}`),
              remove: () => { edit(d => { deleteKey(d, pop.ref.layer, pop.ref.path, pop.ref.t); }); setSel(null); setPop(null); say('Llave eliminada.'); },
              close: () => { setPop(null); root.current?.focus(); },
            }} />
        </div>
      )}
      {menu && (
        <div className="tl-menu" role="menu" style={{ left: menu.x, top: menu.y }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); } }}>
          {menu.items.map(it => <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setMenu(null); it.run(); }}>{it.label}</button>)}
        </div>
      )}
      {picker && (
        <LibraryPicker kind={selLayer?.kind ?? null} onPick={addFromLibrary} onChoreo={addChoreo} onClose={() => { setPicker(false); root.current?.focus(); }}
          {...(props.previewPicture ? { picture: props.previewPicture } : {})} {...(props.basicPreviews ? { basic: true } : {})} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the scrollbar of time */

/** Where the view is over the whole length; drag the thumb (or tap the track) to move through time. */
function TimeScroll({ view, len, onStart }: { view: View; len: number; onStart: (start: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x0: number; s0: number } | null>(null);
  const lo = -0.5, range = len + 1;
  const span = view.width / view.pps;
  const w = Math.min(1, span / range), left = Math.min(1 - w, Math.max(0, (view.start - lo) / range));
  const toTime = (dx: number) => (dx / Math.max(1, track.current?.clientWidth ?? 1)) * range;
  return (
    <div className="tl-scroll">
      <span />
      <div ref={track} className="track" role="scrollbar" aria-orientation="horizontal" aria-label="Desplazar en el tiempo"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)}
        onPointerDown={e => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          const onThumb = e.clientX >= r.left + left * r.width && e.clientX <= r.left + (left + w) * r.width;
          // a tap on the track centres the view there; the thumb is dragged
          const s0 = onThumb ? view.start : lo + ((e.clientX - r.left) / r.width) * range - span / 2;
          if (!onThumb) onStart(s0);
          drag.current = { id: e.pointerId, x0: e.clientX, s0 };
        }}
        onPointerMove={e => { const d = drag.current; if (d && d.id === e.pointerId) onStart(d.s0 + toTime(e.clientX - d.x0)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <span className="tl-thumb" style={{ left: `${left * 100}%`, width: `${Math.max(2, w * 100)}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rows of one layer */

function LayerRows(p: {
  compact: boolean; layer: Layer; project: Project; view: View; expanded: boolean; selected: boolean; sel: Sel; len: number; time: number;
  focusPath: { layer: Id; path: string } | null; onFocusPath: (f: { layer: Id; path: string }) => void;
  onToggle: () => void; onSelect: () => void; onVisible: () => void; onAddKey: (path: string) => void;
  onOpenClip: (id: Id, el: Element) => void; onOpenKey: (ref: KeyRef, el: Element) => void; onGoTo: (t: number) => void;
}) {
  const { layer: l, view: v } = p;
  const followed = trackMarks(l, p.project.time.fps);
  const tracks = p.project.tracks.filter(t => t.layer === l.id);
  const lanes = clipLanes(l.clips);
  const rowH = 44 + (lanes.lanes - 1) * 22;
  const clipH = lanes.lanes > 1 ? 20 : 30;
  const overlaps = clipOverlaps(l.clips);
  const paths = p.expanded ? animatablePaths(l) : [];
  const tracked = new Set(tracks.map(t => t.path));
  const x = (t: number) => timeToX(v, t);
  const span = l.span;
  return (
    <>
      <div className={`tl-head${p.selected ? ' sel' : ''}`} style={{ minHeight: rowH }}>
        <button type="button" className="mini" aria-expanded={p.expanded} aria-label={`${p.expanded ? 'Ocultar' : 'Mostrar'} las propiedades animadas de «${l.name}»`} onClick={p.onToggle}>
          <Icon d={p.expanded ? I.caretDown : I.caret} />
        </button>
        <svg className="kind" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label={KIND_NAME[l.kind]} role="img">{KIND_ICON[l.kind]}</svg>
        <button type="button" className="name" onClick={p.onSelect} aria-pressed={p.selected} title={l.name}>{l.name}</button>
        {!p.compact && <button type="button" className="mini" aria-pressed={l.visible} aria-label={`${l.visible ? 'Ocultar' : 'Mostrar'} «${l.name}»`} onClick={p.onVisible}><Icon d={l.visible ? I.eye : I.eyeOff} /></button>}
      </div>
      <div className={`tl-lane${p.selected ? ' sel' : ''}`} style={{ minHeight: rowH }} data-act="lane" data-layer={l.id}>
        {span && <><span className="outside" style={{ left: 0, width: Math.max(0, x(span.in)) }} /><span className="outside" style={{ left: x(span.out), right: 0 }} /></>}
        <div className={`tl-span${span ? '' : ' all'}`} style={{ left: x(span?.in ?? 0), width: Math.max(2, ((span?.out ?? p.len) - (span?.in ?? 0)) * v.pps) }}>
          <button type="button" className="h" data-act="span-in" data-layer={l.id} aria-label={`Entrada de «${l.name}»: ${formatTime(span?.in ?? 0)}`} style={{ left: 0 }} />
          <button type="button" className="h" data-act="span-out" data-layer={l.id} aria-label={`Salida de «${l.name}»: ${formatTime(span?.out ?? p.len)}`} style={{ left: '100%' }} />
        </div>
        {overlaps.map(o => (
          <span key={`${o.a}-${o.b}`} className="tl-trans" style={{ left: x(o.start), width: Math.max(4, (o.end - o.start) * v.pps) }} title="Transición: los dos clips actúan a la vez"><span>⇄</span></span>
        ))}
        {l.clips.map(c => <ClipBlock key={c.id} clip={c} v={v} lane={lanes.lane.get(c.id) ?? 0} h={clipH} selected={p.sel?.kind === 'clip' && p.sel.id === c.id} kind={l.kind} onOpen={p.onOpenClip} />)}
        {followed.map((tr, n) => (
          <span key={`tr${tr.index}`} className="tl-track" style={{ left: x(tr.from), width: Math.max(2, (tr.to - tr.from) * v.pps), top: 1 + n * 3 }} aria-hidden="true" title={`Seguimiento ${n + 1}: ${formatTime(tr.from)}–${formatTime(tr.to)}`} />
        ))}
        {followed.flatMap((tr, n) => tr.keys.map(k => (
          <button key={`tk${tr.index}-${k.t}`} type="button" data-act="tk" data-t={k.t} className={`tl-tk ${k.role}`} style={{ left: x(k.t), top: n * 3 }}
            aria-label={`${TK_NAME[k.role]} del seguimiento${followed.length > 1 ? ` ${n + 1}` : ''} de «${l.name}» en ${formatTime(k.t)}: ir ahí`}
            title={`${TK_NAME[k.role]} · ${formatTime(k.t)}`} onClick={() => p.onGoTo(k.t)} />
        )))}
      </div>
      {p.expanded && tracks.map(tr => {
        const info = pathInfo(l, tr.path);
        const label = info?.label ?? tr.path;
        const val = trackValue(tr.keys, p.time);
        const focused = p.focusPath?.layer === l.id && p.focusPath.path === tr.path;
        return (
          <PathRow key={tr.path} compact={p.compact} layerId={l.id} path={tr.path} label={label} info={info} value={val} keys={tr.keys} v={v} focused={focused} sel={p.sel}
            onFocus={() => p.onFocusPath({ layer: l.id, path: tr.path })} onAdd={() => p.onAddKey(tr.path)} onOpenKey={p.onOpenKey} />
        );
      })}
      {p.expanded && (
        <>
          <div className="tl-head add">
            <select aria-label={`Animar una propiedad de «${l.name}»: añade una llave en el cabezal`} value="" onChange={e => { if (e.target.value) p.onAddKey(e.target.value); }}>
              <option value="">＋ Llave…</option>
              {groupPaths(paths.filter(pi => !tracked.has(pi.path))).map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map(pi => <option key={pi.path} value={pi.path}>{pi.label}</option>)}</optgroup>
              ))}
            </select>
          </div>
          <div className="tl-lane add" data-act="lane" data-layer={l.id} />
        </>
      )}
    </>
  );
}

const TK_NAME = { clave: 'Clave', correccion: 'Corrección', oculto: 'Objeto oculto', inicio: 'Inicio' } as const;

/** The tracked parts of a layer's mask: their stretch and their keyframes (from the names of their frames). */
function trackMarks(l: Layer, fps: number): Array<{ index: number; from: number; to: number; keys: Array<{ t: number; role: keyof typeof TK_NAME }> }> {
  const out: Array<{ index: number; from: number; to: number; keys: Array<{ t: number; role: keyof typeof TK_NAME }> }> = [];
  (l.mask?.parts ?? []).forEach((part, index) => {
    if (part.kind !== 'raster' || part.origin !== 'track' || !part.frames?.length) return;
    const f = part.frames;
    const keys = keysOfFrames(f);
    if (!keys.includes(f.length - 1)) keys.push(f.length - 1);
    out.push({
      index, from: f[0].t, to: f[f.length - 1].t + 1 / Math.max(1, fps),
      keys: keys.map(i => ({ t: f[i].t, role: (roleOf(f[i].media.name) || 'inicio') as keyof typeof TK_NAME })),
    });
  });
  return out;
}

function groupPaths(list: PathInfo[]): Array<[string, PathInfo[]]> {
  const m = new Map<string, PathInfo[]>();
  for (const p of list) { const g = m.get(p.group); if (g) g.push(p); else m.set(p.group, [p]); }
  return [...m.entries()];
}

function ClipBlock({ clip: c, v, lane, h, selected, kind, onOpen }: { clip: AnimClip; v: View; lane: number; h: number; selected: boolean; kind: LayerKind; onOpen: (id: Id, el: Element) => void }) {
  const def = templateById(c.template);
  const left = timeToX(v, c.start), width = Math.max(14, c.dur * v.pps);
  const name = def?.name ?? `${c.template} (no disponible)`;
  const fits = def ? def.kinds.includes(kind) : false;
  const badges = [c.reverse ? '⇆' : '', c.repeat > 1 ? `×${c.repeat}` : '', c.pingpong ? '↔' : '', c.ease.kind !== 'linear' ? '∿' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" data-act="clip" data-clip={c.id} className={`tl-clip g-${def?.group ?? 'x'}${c.reverse ? ' rev' : ''}${selected ? ' sel' : ''}${def && fits ? '' : ' unknown'}`}
      style={{ left, width, top: 7 + lane * 22, height: h }}
      aria-label={`Clip «${name}»${c.reverse ? ' al revés' : ''}, de ${formatTime(c.start)} a ${formatTime(c.start + c.dur)}${c.repeat > 1 ? `, ${c.repeat} veces` : ''}. Curva: ${easeLabel(c.ease)}.${def && !fits ? ' No funciona en esta capa.' : ''}`}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen(c.id, e.currentTarget); } }}>
      <span className="edge l" data-act="clip-l" aria-hidden="true" />
      <span className="t">{name}</span>
      {width > 90 && badges && <span className="badges" aria-hidden="true">{badges}</span>}
      <span className="edge r" data-act="clip-r" aria-hidden="true" />
      <span className="ramp" aria-hidden="true" />
    </button>
  );
}

function PathRow(p: {
  compact: boolean; layerId: Id; path: string; label: string; info: PathInfo | null; value: unknown; keys: Array<{ t: number; v: unknown; ease: Ease }>; v: View; focused: boolean; sel: Sel;
  onFocus: () => void; onAdd: () => void; onOpenKey: (ref: KeyRef, el: Element) => void;
}) {
  const shown = typeof p.value === 'number' ? (Math.abs(p.value) >= 100 ? p.value.toFixed(0) : p.value.toFixed(2)) : String(p.value ?? '');
  const isColor = p.info?.type === 'color' && typeof p.value === 'string';
  return (
    <>
      <div className={`tl-head path${p.focused ? ' focus' : ''}`} onClick={p.onFocus}>
        <button type="button" className="name" onClick={p.onFocus} aria-pressed={p.focused} title={`${p.label} (K pone una llave aquí)`}>{p.label}</button>
        {isColor ? <span className="swatch" style={{ background: String(p.value) }} aria-label={String(p.value)} /> : !p.compact && <span className="val">{shown}</span>}
        <button type="button" className="mini" aria-label={`Llave de «${p.label}» en el cabezal`} title="Llave en el cabezal (K)" onClick={e => { e.stopPropagation(); p.onAdd(); }}><Icon d={I.key} /></button>
      </div>
      <div className="tl-lane path" data-act="lane" data-layer={p.layerId}>
        {p.keys.slice(0, -1).map((k, i) => (
          <span key={`s${i}`} className="tl-seg" style={{ left: timeToX(p.v, k.t), width: Math.max(0, (p.keys[i + 1].t - k.t) * p.v.pps), ...(k.ease.kind === 'hold' ? { background: 'transparent', borderTop: '1px dashed #4a453e' } : {}) }} />
        ))}
        {p.keys.map(k => {
          const selected = p.sel?.kind === 'keys' && p.sel.refs.some(r => r.layer === p.layerId && r.path === p.path && Math.abs(r.t - k.t) < 1e-4);
          const cls = k.ease.kind === 'hold' ? 'hold' : k.ease.kind === 'step' ? 'step' : k.ease.kind === 'linear' ? '' : 'curve';
          return (
            <button key={k.t} type="button" data-act="key" data-layer={p.layerId} data-path={p.path} data-t={k.t} className={`tl-key ${cls}${selected ? ' sel' : ''}`} style={{ left: timeToX(p.v, k.t) }}
              aria-label={`Llave de «${p.label}» en ${formatTime(k.t)}: ${typeof k.v === 'number' ? k.v.toFixed(3) : String(k.v)}. Curva: ${easeLabel(k.ease)}.`}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); p.onOpenKey({ layer: p.layerId, path: p.path, t: k.t }, e.currentTarget); } }} />
          );
        })}
      </div>
    </>
  );
}
