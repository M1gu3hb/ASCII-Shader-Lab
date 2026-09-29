/**
 * The viewport's one render loop. Everything the art canvas shows comes from here: evaluate(project, t)
 * drawn by one Compositor (the same code the exports use). No work while nothing changes: a render runs
 * only after a change (an edit, a tool's live preview, a new time, a new viewport size) and a
 * requestAnimationFrame runs only while something is waiting to be drawn or a video plays.
 *
 * Two scales, one code path: while the person is interacting (a pointer is down, or changes keep coming
 * less than IDLE_MS apart) and a full render costs more than LIGHT_WHEN_MS, the frame is drawn at a reduced
 * scale, «Vista ligera»; once things settle, it is drawn again at the display's full resolution with quality
 * 'final'. When full renders are cheap they are simply kept during the interaction: changing scales has a
 * cost of its own (engines and character grids are re-derived for each size), so a light view that is not
 * needed would only be slower. «Siempre ligera» (Ajustes) forces the reduced scale.
 * At 100 % zoom (or more) the final render is exactly the export at 1× (tests/e2e/foto-export.spec.ts
 * compares them pixel for pixel).
 */
import { Compositor, type RenderReport } from '../project/compositor';
import { evaluate, type FrameState } from '../project/evaluate';
import { cloneProject, defaultMask } from '../project/normalize';
import { useProject } from '../project/store';
import type { Id, MaskPart, Project } from '../project/types';
import { setUI, ui, useFoto } from './ui';

/** Changes closer than this are one interaction (light renders); after it, the final render. */
export const IDLE_MS = 260;
/** A full render slower than this (ms) makes interactions use the light view. */
export const LIGHT_WHEN_MS = 90;
/** Light renders keep the frame's long side at least this many px (below it the picture is mush). */
const LIGHT_MIN_SIDE = 360;

export interface Rendered { state: FrameState; report: RenderReport; scale: number; light: boolean; project: Project; seq: number }

let comp: Compositor | null = null;
/** The viewport's compositor (created on first use; ASCII engines are pooled per layer inside it). */
export function viewCompositor(): Compositor {
  return (comp ??= new Compositor());
}

let art: HTMLCanvasElement | null = null;
let raf = 0;
let idleT = 0;
let busy = false;
/** Renders started so far (a render reports the number it started with). */
let seq = 0;
let dirty = false;
let needFinal = false;
let lastChange = 0;
/** The change before the last one: two changes close together are an interaction (a drag, a held key). */
let prevChange = -1e9;
let pointers = 0;
let displayScale = 0.5;
/** A tool's part drawn live (ToolHost.preview). */
let previewPart: { layer: Id; part: MaskPart } | null = null;
/** Tests and the pixel-exact check: render at this scale instead of the display's. */
let forced: number | null = null;
const listeners = new Set<(r: Rendered) => void>();

/** The project the viewport draws: the open one, with the live part of a tool appended to its target's mask. */
export function viewProject(): Project | null {
  const p = useProject.getState().project;
  if (!p || !previewPart) return p;
  const q = cloneProject(p);
  const l = q.layers.find(x => x.id === previewPart!.layer);
  if (l) l.mask = l.mask ? { ...l.mask, off: false, parts: [...l.mask.parts, previewPart.part] } : { ...defaultMask(), parts: [previewPart.part] };
  return q;
}

export function attachArt(c: HTMLCanvasElement | null) {
  art = c;
  if (c) request(false);
}

/** The display's render scale (render px per project px, ≤ 1): what a final render uses. */
export function setDisplayScale(s: number) {
  const v = Math.max(0.02, Math.min(1, s));
  if (Math.abs(v - displayScale) < 1e-4) return;
  displayScale = v;
  // zooming out keeps showing the sharper picture (the browser scales it down); zooming in, or far out, draws again
  if (v > finalScale * 1.02 || v < finalScale * 0.6) request(true);
}
/** Scale of the last final render, and what it cost (ms). */
let finalScale = 0;
let finalMs = 0;

export function forceScale(s: number | null) { forced = s; request(false); }

export function setPreview(p: { layer: Id; part: MaskPart } | null) {
  previewPart = p;
  request(true);
}
export const previewing = () => previewPart !== null;

export function onRendered(fn: (r: Rendered) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Something changed: draw again (light while the person keeps interacting). */
export function request(interacting = true) {
  const now = performance.now();
  if (interacting) { prevChange = lastChange; lastChange = now; }
  dirty = true;
  kick();
}

function kick() {
  if (!raf && art) raf = requestAnimationFrame(tick);
}

/** Light renders while a pointer is down, a tool previews, a video plays, or changes keep coming. */
const interactingNow = () => pointers > 0 || previewPart !== null || ui().playing
  || (lastChange - prevChange < IDLE_MS && performance.now() - lastChange < IDLE_MS);

function tick() {
  raf = 0;
  if (busy || !art) return;
  if (dirty) {
    const light = ui().quality === 'ligera' || (interactingNow() && (finalMs > LIGHT_WHEN_MS || Math.abs(finalScale - displayScale) > 1e-4));
    void run(light);
    return;
  }
  if (needFinal) {
    if (interactingNow()) {
      // wait for the interaction to settle (a timer, not a spinning animation frame)
      clearTimeout(idleT);
      const wait = pointers > 0 || previewPart ? IDLE_MS : Math.max(16, IDLE_MS - (performance.now() - lastChange));
      idleT = window.setTimeout(kick, wait);
      return;
    }
    void run(false);
  }
}

function scaleFor(p: Project, light: boolean): number {
  if (forced !== null) return forced;
  if (!light) return displayScale;
  const min = Math.min(1, LIGHT_MIN_SIDE / Math.max(p.canvas.w, p.canvas.h));
  return Math.min(displayScale, Math.max(displayScale * 0.5, min));
}

async function run(light: boolean) {
  const p = viewProject();
  const canvas = art;
  if (!p || !canvas) { dirty = false; return; }
  busy = true;
  dirty = false;
  const mine = ++seq;
  const scale = scaleFor(p, light);
  const t = useProject.getState().time;
  const state = evaluate(p, t);
  try {
    const report = await viewCompositor().render(state, canvas, { scale, quality: light ? 'preview' : 'final' });
    const lightDone = light && forced === null && ui().quality !== 'ligera';
    needFinal = lightDone;
    if (!light || forced !== null) { finalScale = scale; finalMs = report.ms; }
    const prev = ui().render;
    setUI({ render: { ms: report.ms, scale, light: lightDone || ui().quality === 'ligera', w: report.w, h: report.h, warnings: report.warnings, basic: report.engines.basic > 0 || (prev.basic && report.engines.webgl2 === 0), n: prev.n + 1 } });
    for (const fn of listeners) fn({ state, report, scale, light, project: p, seq: mine });
  } catch (e) {
    console.warn('foto: render failed', e);
  } finally {
    busy = false;
  }
  if (dirty || needFinal) kick();
}

/* ------------------------------------------------------------------ what triggers renders */

let stops: Array<() => void> = [];

/** Starts following the project, the playhead and the pointer (call once). */
export function startScheduler(): () => void {
  stops.forEach(f => f());
  const down = () => { pointers++; };
  const up = () => {
    pointers = Math.max(0, pointers - 1);
    // the drag is over: the final render follows (only when a light one is showing)
    if (!pointers && needFinal) kick();
  };
  addEventListener('pointerdown', down, true);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  const unsub = useProject.subscribe((s, prev) => {
    if (s.project !== prev.project) {
      // a different project (opened, not edited): a clean final render
      const other = !s.project || !prev.project || s.project.id !== prev.project.id;
      request(!other);
    } else if (s.time !== prev.time) request(true);
  });
  // «Siempre ligera» on or off: draw again at the scale it asks for
  const unsubUI = useFoto.subscribe((s, prev) => { if (s.quality !== prev.quality) request(false); });
  stops = [unsub, unsubUI, () => { removeEventListener('pointerdown', down, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); }];
  return () => { stops.forEach(f => f()); stops = []; };
}

/** The loop's state (tests and the QA hooks). */
export const schedulerState = () => ({ busy, dirty, needFinal, seq, pointers, displayScale, finalScale, finalMs, raf: raf !== 0, preview: previewPart !== null });

/** Frees the viewport's engines and pictures (leaving the editor). */
export function releaseViewport() {
  cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(idleT);
  comp?.destroy();
  comp = null;
  art = null;
  previewPart = null;
}

/** Waits for the next final (not light) render (tests, exports that want the viewport settled). */
export function settled(timeout = 20_000): Promise<Rendered | null> {
  // only a render that starts after this call shows what the project is now
  const want = seq + 1;
  return new Promise(res => {
    const t = setTimeout(() => { off(); res(null); }, timeout);
    const off = onRendered(r => { if (r.seq >= want && (!r.light || forced !== null)) { clearTimeout(t); off(); res(r); } });
    request(false);
  });
}
