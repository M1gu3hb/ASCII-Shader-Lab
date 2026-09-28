/**
 * QA page of the photo studio's tools (not part of the site): a project from a test photo with a photo layer and
 * an ASCII layer (the target), rendered by evaluate() + the compositor, an overlay canvas, and a minimal ToolHost
 * (fit-to-window view with a zoom slider, pointer routing with two-finger pan/pinch on touch, add/subtract/
 * intersect, preview(part) re-rendered at a reduced scale, sourcePixels, say). The palette comes from TOOLS.
 * window.qa drives it from tests/e2e/tools.spec.ts and the screenshot script. The real UX lives in the studio
 * shell (/studio/foto/); this page only exercises the tools.
 *
 *   ?foto=guitarra (default) | retrato | sintetica   the photo
 *   ?capa=glifos                                       the target is a real-characters layer instead
 *   ?inicio=foto                                       the target starts hidden (a mask with nothing in it),
 *                                                      so the photo shows until a part is added
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource-variable/inter-tight';
import '../src/shared/tokens.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TOOLS, toolById } from '../src/foto/tools';
import type { Pt, Tool, ToolEvent, ToolHost, View } from '../src/foto/tools/types';
import { CutoutPanel } from '../src/foto/cutout';
import { evaluate } from '../src/project/evaluate';
import { Compositor, sourceFit } from '../src/project/compositor';
import { fitRect } from '../src/project/adjust';
import { cloneProject, newLayer, projectFromImage } from '../src/project/normalize';
import { putMedia } from '../src/project/persist';
import { storeBlob } from '../src/project/sources';
import * as store from '../src/project/store';
import type { Id, Layer, MaskOp, MaskPart, Project } from '../src/project/types';
import { PRESETS } from '../src/studio/presets';
import { paintLandscape } from '../src/shared/sample';
import { contourTool } from '../src/foto/tools/contour';
import { asciiBrush, eraseBrush, flattenTimings, restoreBrush } from '../src/foto/tools/brushes';
import { objectTool } from '../src/foto/tools/objectTool';
import { lassoTool } from '../src/foto/tools/freeform';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const statusEl = $('status');
const stage = $('stage');
const art = $<HTMLCanvasElement>('art');
const overlay = $<HTMLCanvasElement>('overlay');

const says: string[] = [];
const say = (m: string) => { says.push(m); statusEl.textContent = m; };

/* ------------------------------------------------------------------ the project */

const FIXTURES: Record<string, string> = {
  guitarra: new URL('../tests/fixtures/photos/guitarra-mantas.jpg', import.meta.url).href,
  retrato: new URL('../tests/fixtures/photos/retrato-pelo.jpg', import.meta.url).href,
};

async function photoBlob(which: string): Promise<{ blob: Blob; name: string; w: number; h: number }> {
  if (which === 'sintetica') {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 600;
    paintLandscape(c.getContext('2d')!);
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
    return { blob, name: 'atardecer.png', w: 960, h: 600 };
  }
  const url = FIXTURES[which] ?? FIXTURES.guitarra;
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const out = { blob, name: url.split('/').pop()!, w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

let photo: { blob: Blob; name: string; w: number; h: number } | null = null;

async function makeProject(): Promise<Project> {
  photo ??= await photoBlob(params.get('foto') ?? 'guitarra');
  const { stored: _s, ...ref } = await putMedia(photo.blob, { kind: 'image', name: photo.name, w: photo.w, h: photo.h });
  const p = projectFromImage(ref, { name: 'Prueba de herramientas' });
  p.seed = 'herramientas';
  const src = p.sources[0].id;
  if (params.get('capa') === 'glifos') {
    p.layers.push(newLayer('glyphs', { name: 'Caracteres', source: src }));
  } else {
    const style = PRESETS.media.find(x => x.id === 'retrato')!.make();
    style.interact = { ...style.interact, mode: 'none', auto: false };
    style.glyph = { ...style.glyph, cell: 10 };
    p.layers.push(newLayer('ascii', { name: 'ASCII', source: src, style, opaque: true }));
  }
  if (params.get('inicio') === 'foto') {
    // nothing shows yet: an empty rectangle that adds nothing (the first part added starts from it)
    p.layers[p.layers.length - 1].mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0, y: 0, w: 0, h: 0, rot: 0, soft: 0, alpha: 1 }] };
  }
  return p;
}

/* ------------------------------------------------------------------ view */

const view = { zoom: 1, panX: 0, panY: 0 };
let dpr = Math.min(2, window.devicePixelRatio || 1);

function frameRect() {
  const p = store.useProject.getState().project ?? { canvas: { w: 1, h: 1 } };
  const r = stage.getBoundingClientRect();
  const fit = Math.min((r.width - 24) / p.canvas.w, (r.height - 24) / p.canvas.h);
  const k = Math.max(0.01, fit * view.zoom);
  const w = p.canvas.w * k, h = p.canvas.h * k;
  return { x: (r.width - w) / 2 + view.panX, y: (r.height - h) / 2 + view.panY, w, h, left: r.left, top: r.top };
}

const hostView = (): View => {
  const p = store.useProject.getState().project!;
  const f = frameRect();
  return {
    frame: { x: f.x, y: f.y, w: f.w, h: f.h },
    canvas: { w: p.canvas.w, h: p.canvas.h },
    zoom: Math.min(f.w, f.h),
    toFrame: (cx, cy) => ({ x: (cx - f.left - f.x) / f.w, y: (cy - f.top - f.y) / f.h }),
    toScreen: (q: Pt) => ({ x: f.x + q.x * f.w, y: f.y + q.y * f.h }),
  };
};

/* ------------------------------------------------------------------ rendering */

const compositor = new Compositor();
let previewPart: { layer: Id; part: MaskPart; replace?: number } | null = null;
let dirty = false, rendering = false;
let renderCount = 0;
const renderMs: number[] = [];

function withPreview(p: Project): Project {
  if (!previewPart) return p;
  const q = cloneProject(p);
  const l = q.layers.find(x => x.id === previewPart!.layer);
  if (!l) return p;
  const m = l.mask ?? { invert: false, feather: 0, opacity: 1, parts: [] };
  const parts = m.parts.slice();
  if (previewPart.replace !== undefined && previewPart.replace >= 0 && previewPart.replace < parts.length) parts[previewPart.replace] = previewPart.part;
  else parts.push(previewPart.part);
  l.mask = { ...m, parts };
  return q;
}

function scheduleRender() {
  dirty = true;
  if (!rendering) requestAnimationFrame(() => void renderNow());
}

async function renderNow() {
  if (!dirty || rendering) return;
  dirty = false;
  rendering = true;
  try {
    const p = store.useProject.getState().project;
    if (!p) return;
    const f = frameRect();
    // the view's own resolution (never above the project's); a lighter one while a part is previewed
    let scale = Math.min(1, (f.w * dpr) / p.canvas.w);
    if (previewPart) scale *= 0.75;
    const t0 = performance.now();
    const off = document.createElement('canvas');
    await compositor.render(evaluate(withPreview(p), store.useProject.getState().time), off, { scale, quality: previewPart ? 'preview' : 'final' });
    renderMs.push(Math.round(performance.now() - t0));
    art.width = off.width; art.height = off.height;
    art.getContext('2d')!.drawImage(off, 0, 0);
    off.width = off.height = 0;
    Object.assign(art.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
    renderCount++;
  } catch (e) {
    say(`No se pudo dibujar: ${(e as Error).message}`);
  } finally {
    rendering = false;
    if (dirty) requestAnimationFrame(() => void renderNow());
    else idleWaiters.splice(0).forEach(r => r());
  }
}
const idleWaiters: Array<() => void> = [];
const idle = () => new Promise<void>(r => { if (!dirty && !rendering) r(); else idleWaiters.push(r); });

let overlayQueued = false;
function redrawOverlay() {
  if (overlayQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() => { overlayQueued = false; drawOverlay(); });
}
function drawOverlay() {
  if (!store.useProject.getState().project) return;
  const r = stage.getBoundingClientRect();
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
  const ctx = overlay.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the frame's edge, faint
  const f = frameRect();
  ctx.strokeStyle = 'rgba(237,230,218,.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, Math.round(f.w) - 1, Math.round(f.h) - 1);
  active?.overlay?.(ctx, host);
}

/* ------------------------------------------------------------------ source pixels */

const pixelCache = new Map<string, HTMLCanvasElement>();
async function sourcePixels(): Promise<HTMLCanvasElement | null> {
  const p = store.useProject.getState().project;
  if (!p) return null;
  const l = p.layers.find(x => x.id === target());
  let id: string | null = l && 'source' in l && typeof l.source === 'string' && p.sources.some(s => s.id === l.source) ? l.source : null;
  id ??= p.layers.find(x => x.kind === 'photo')?.kind === 'photo' ? (p.layers.find(x => x.kind === 'photo') as { source: string }).source : null;
  const s = p.sources.find(x => x.id === id);
  if (!s?.media[0]?.id) return null;
  const key = `${s.id}|${s.media[0].id}|${p.canvas.w}x${p.canvas.h}|${sourceFit(p, s.id)}`;
  const had = pixelCache.get(key);
  if (had) return had;
  const got = await storeBlob(s.media[0].id);
  if (!got) return null;
  const bmp = await createImageBitmap(got.blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const c = document.createElement('canvas');
  c.width = p.canvas.w; c.height = p.canvas.h;
  const r = fitRect(bmp.width, bmp.height, c.width, c.height, sourceFit(p, s.id));
  c.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, r.x, r.y, r.w, r.h);
  bmp.close();
  pixelCache.set(key, c);
  return c;
}

/* ------------------------------------------------------------------ host */

let op: MaskOp = 'add';
let targetId: Id | null = null;
const target = () => {
  const p = store.useProject.getState().project;
  if (targetId && p?.layers.some(l => l.id === targetId)) return targetId;
  return p?.layers[p.layers.length - 1]?.id ?? null;
};

let active: Tool | null = null;

const host: ToolHost = {
  view: hostView,
  target,
  op: () => op,
  setOp(o) { op = o; syncOp(); },
  redrawOverlay,
  preview(part) { previewPart = part; scheduleRender(); },
  sourcePixels,
  say,
  setTool(id) { selectTool(id); },
  openCutout() { openCutout(); },
};

function syncOp() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-op]')) b.setAttribute('aria-pressed', String(b.dataset.op === op));
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-op]')) b.addEventListener('click', () => host.setOp(b.dataset.op as MaskOp));

/* ------------------------------------------------------------------ palette and options */

const palette = $('palette');
const optsRoot = createRoot($('opts'));

function renderPalette() {
  palette.textContent = '';
  let group = '';
  for (const t of TOOLS) {
    if (group && t.group !== group) palette.appendChild(document.createElement('hr'));
    group = t.group;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tool = t.id;
    b.title = `${t.name}${t.shortcut ? ` (${t.shortcut})` : ''} — ${t.hint}`;
    b.setAttribute('aria-label', `${t.name}${t.shortcut ? `, atajo ${t.shortcut}` : ''}`);
    b.setAttribute('aria-pressed', String(active === t));
    b.innerHTML = t.icon + (t.shortcut ? `<kbd>${t.shortcut}</kbd>` : '');
    b.addEventListener('click', () => { selectTool(t.id); stage.focus(); });
    palette.appendChild(b);
  }
}

function selectTool(id: string) {
  const t = toolById(id);
  if (!t || t === active) return;
  active?.deactivate?.(host);
  previewPart = null;
  active = t;
  stage.style.cursor = t.cursor ?? 'default';
  t.activate?.(host);
  for (const b of palette.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
  optsRoot.render(t.Options ? createElement(t.Options, { host }) : null);
  say(`${t.name}: ${t.hint}`);
  redrawOverlay();
  scheduleRender();
}

/* ------------------------------------------------------------------ pointer routing */

const pointers = new Map<number, { x: number; y: number }>();
let gesture: 'tool' | 'pan' | 'pinch' | null = null;
let pinch: { d: number; cx: number; cy: number; zoom: number; panX: number; panY: number } | null = null;
let spaceDown = false;
let panFrom: { x: number; y: number; panX: number; panY: number } | null = null;
const mac = /Mac|iPhone|iPad/.test(navigator.platform);

function toolEvent(e: PointerEvent): ToolEvent {
  const v = hostView();
  const r = stage.getBoundingClientRect();
  return {
    p: v.toFrame(e.clientX, e.clientY),
    s: { x: e.clientX - r.left, y: e.clientY - r.top },
    pressure: e.pointerType === 'pen' ? e.pressure : e.pointerType === 'touch' ? 0.5 : 0.5,
    pointerType: (e.pointerType as ToolEvent['pointerType']) || 'mouse',
    button: e.button,
    shift: e.shiftKey,
    alt: e.altKey,
    mod: mac ? e.metaKey : e.ctrlKey,
    time: e.timeStamp,
    native: e,
  };
}

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

stage.addEventListener('pointerdown', e => {
  stage.focus({ preventScroll: true });
  try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'touch' && pointers.size >= 2) {
    // two fingers always move the view, and cancel what the first finger started
    if (gesture === 'tool') active?.cancel?.(host);
    gesture = 'pinch';
    pinch = { ...pinchState(), zoom: view.zoom, panX: view.panX, panY: view.panY };
    return;
  }
  if (e.button === 1 || spaceDown || (e.pointerType === 'touch' && active && !active.draws)) {
    gesture = 'pan';
    panFrom = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
    return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  gesture = 'tool';
  active?.down?.(toolEvent(e), host);
});

stage.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture === 'pinch' && pinch && pointers.size >= 2) {
    const s = pinchState();
    view.zoom = Math.min(8, Math.max(0.25, pinch.zoom * (s.d / Math.max(1, pinch.d))));
    view.panX = pinch.panX + (s.cx - pinch.cx);
    view.panY = pinch.panY + (s.cy - pinch.cy);
    syncZoom();
    return;
  }
  if (gesture === 'pan' && panFrom) {
    view.panX = panFrom.panX + e.clientX - panFrom.x;
    view.panY = panFrom.panY + e.clientY - panFrom.y;
    syncZoom();
    return;
  }
  if (gesture === 'tool' || !gesture) active?.move?.(toolEvent(e), host);
});

function endPointer(e: PointerEvent, cancelled: boolean) {
  const was = gesture;
  pointers.delete(e.pointerId);
  if (was === 'tool') {
    if (cancelled) active?.cancel?.(host); else active?.up?.(toolEvent(e), host);
    gesture = null;
  } else if (!pointers.size) { gesture = null; pinch = null; panFrom = null; }
}
stage.addEventListener('pointerup', e => endPointer(e, false));
stage.addEventListener('pointercancel', e => endPointer(e, true));
stage.addEventListener('pointerleave', () => { if (!gesture) redrawOverlay(); });
stage.addEventListener('wheel', e => {
  e.preventDefault();
  view.zoom = Math.min(8, Math.max(0.25, view.zoom * Math.exp(-e.deltaY * 0.0015)));
  syncZoom();
}, { passive: false });

const zoomInput = $<HTMLInputElement>('zoom');
function syncZoom() {
  zoomInput.value = String(view.zoom);
  scheduleRender();
  redrawOverlay();
}
zoomInput.addEventListener('input', () => { view.zoom = Number(zoomInput.value); syncZoom(); });
$('fit').addEventListener('click', () => { view.zoom = 1; view.panX = view.panY = 0; syncZoom(); });

/* ------------------------------------------------------------------ keyboard */

window.addEventListener('keydown', e => {
  const el = document.activeElement as HTMLElement | null;
  const inField = !!el && el !== stage && el !== document.body && (el.matches('input, select, textarea, [role=slider]') || !!el.closest('#cutout'));
  if (e.key === ' ' && !inField && !e.repeat) spaceDown = true;
  if (inField) return;
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
  if (active?.onKey?.(e, host)) { e.preventDefault(); return; }
  if (!mod && !e.altKey && e.key.length === 1) {
    const t = TOOLS.find(x => x.shortcut?.toLowerCase() === e.key.toLowerCase());
    if (t) { e.preventDefault(); selectTool(t.id); }
  }
});
window.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

/* ------------------------------------------------------------------ undo, cutout */

const undoBtn = $<HTMLButtonElement>('undo'), redoBtn = $<HTMLButtonElement>('redo');
undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());

const cutoutAside = $('cutout');
const cutoutRoot = createRoot($('cutoutRoot'));
function openCutout() {
  cutoutAside.hidden = false;
  cutoutRoot.render(createElement(CutoutPanel, { host, onClose: closeCutout }));
}
function closeCutout() { cutoutAside.hidden = true; cutoutRoot.render(null); stage.focus(); }
$('openCutout').addEventListener('click', openCutout);
$('closeCutout').addEventListener('click', closeCutout);

store.useProject.subscribe((s, prev) => {
  if (s.project !== prev.project) { scheduleRender(); redrawOverlay(); }
  undoBtn.disabled = !s.canUndo;
  redoBtn.disabled = !s.canRedo;
  const l = s.project?.layers.find(x => x.id === target());
  $('info').textContent = l ? `capa «${l.name}» · ${l.mask?.parts.length ?? 0} partes · ${store.undoDepth().past} pasos` : '';
});

new ResizeObserver(() => { dpr = Math.min(2, window.devicePixelRatio || 1); scheduleRender(); redrawOverlay(); }).observe(stage);

/* ------------------------------------------------------------------ QA hooks */

function pixelsAt(c: HTMLCanvasElement, pts: Array<[number, number]>) {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  return pts.map(([fx, fy]) => Array.from(x.getImageData(Math.min(c.width - 1, Math.floor(fx * c.width)), Math.min(c.height - 1, Math.floor(fy * c.height)), 1, 1).data));
}

const qa = {
  ready: false,
  error: '',
  says,
  get tool() { return active?.id ?? null; },
  tools: () => TOOLS.map(t => ({ id: t.id, name: t.name, shortcut: t.shortcut ?? '', group: t.group, draws: t.draws, hint: t.hint })),
  selectTool,
  setOp: (o: MaskOp) => host.setOp(o),
  project: () => store.useProject.getState().project,
  target,
  setTarget(id: Id) { targetId = id; active?.deactivate?.(host); active?.activate?.(host); redrawOverlay(); },
  layers: () => store.useProject.getState().project!.layers.map(l => ({ id: l.id, kind: l.kind, name: l.name, parts: l.mask?.parts.length ?? 0 })),
  parts: (id?: Id): MaskPart[] => (store.useProject.getState().project!.layers.find(l => l.id === (id ?? target()))?.mask?.parts ?? []).map(p => JSON.parse(JSON.stringify(p))),
  undo: () => store.undo(),
  redo: () => store.redo(),
  undoDepth: () => store.undoDepth(),
  idle,
  renders: () => ({ count: renderCount, ms: renderMs.slice(-20) }),
  /** Frame point → client coordinates (for page.mouse / touch). */
  client(p: Pt) {
    const f = frameRect();
    return { x: f.left + f.x + p.x * f.w, y: f.top + f.y + p.y * f.h };
  },
  /** Colours of a fresh final render at a fixed scale, at frame points. */
  async sample(pts: Array<[number, number]>, scale = 0.5) {
    const c = document.createElement('canvas');
    await compositor.render(evaluate(store.useProject.getState().project!, 0), c, { scale });
    const out = pixelsAt(c, pts);
    c.width = c.height = 0;
    return out;
  },
  /** Adds a real-characters layer on top (for «Restaurar original» across layers). */
  addGlyphs() {
    const p = store.useProject.getState().project!;
    const l = newLayer('glyphs', { name: 'Caracteres', source: p.sources[0].id });
    store.addLayer(l);
    targetId = null;
    return l.id;
  },
  async reset() {
    active?.deactivate?.(host);
    store.openProject(await makeProject());
    targetId = null;
    view.zoom = 1; view.panX = view.panY = 0;
    active?.activate?.(host);
    syncZoom();
    await idle();
  },
  setZoom(z: number) { view.zoom = z; syncZoom(); },
  timings() {
    return {
      contour: { ...contourTool.stats },
      brushCommitMs: { ascii: asciiBrush.lastCommitMs, erase: eraseBrush.lastCommitMs, restore: restoreBrush.lastCommitMs },
      flatten: { ...flattenTimings },
      object: { ...objectTool.timings, decodeMs: objectTool.timings.decodeMs.slice() },
      lasso: lassoTool.lastSimplified ?? null,
      renders: renderMs.slice(-10),
    };
  },
  overlayPixels() {
    const x = overlay.getContext('2d', { willReadFrequently: true })!;
    const d = x.getImageData(0, 0, overlay.width, overlay.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  },
  hasPreview: () => !!previewPart,
  layer: (id: Id): Layer | undefined => store.useProject.getState().project!.layers.find(l => l.id === id),
  openCutout,
  closeCutout,
  store,
};
(window as unknown as { qa: typeof qa }).qa = qa;

try {
  store.openProject(await makeProject());
  renderPalette();
  selectTool(params.get('herramienta') ?? 'rectangulo');
  syncOp();
  scheduleRender();
  await idle();
  qa.ready = true;
  document.documentElement.dataset.ready = '1';
  say('Listo. Elige una herramienta y dibuja sobre la foto.');
} catch (e) {
  qa.error = (e as Error).message || String(e);
  say(`Error: ${qa.error}`);
}
