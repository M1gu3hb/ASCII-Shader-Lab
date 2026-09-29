/**
 * The ToolHost (src/foto/tools/types.ts): what the shell gives every tool. One host for the studio's
 * lifetime; it reads the live viewport, the selection and the options bar each time it is asked.
 */
import { fitRect } from '../project/adjust';
import { sourceFit } from '../project/compositor';
import { evaluate } from '../project/evaluate';
import { useProject } from '../project/store';
import type { Id, Layer, LayerFit, MaskOp, Project } from '../project/types';
import { openCutout } from './actions';
import { selectTool } from './keys';
import { setPreview, viewCompositor, type LivePart } from './scheduler';
import { toolById } from './tools/index';
import type { Tool, ToolHost } from './tools/types';
import { say, setUI, ui } from './ui';
import { currentView } from './view';

/** The active tool object (null for none and for the built-in hand). */
export function activeTool(): Tool | null {
  const id = ui().tool;
  return id && id !== 'mano' ? toolById(id) ?? null : null;
}

let overlayRedraw: () => void = () => undefined;
/** The viewport tells the host how to redraw its overlay. */
export function setOverlayRedraw(fn: () => void) { overlayRedraw = fn; }

/**
 * Beyond the base contract, the optional additions lane «tools» asked for: preview with `replace` (the part
 * being edited stands in for that index of the mask), setTool (switch tools, e.g. after a gesture) and
 * openCutout (the «Recorte» panel).
 */
export interface StudioHost extends ToolHost {
  preview(part: LivePart | null): void;
  setTool(id: string | null): void;
  openCutout(): void;
  videoPixels(sourceId: Id, maxSide?: number): Promise<HTMLCanvasElement | null>;
}

export const host: StudioHost = {
  view: () => currentView(),
  target: () => useProject.getState().selection[0] ?? null,
  op: () => ui().op,
  setOp: (op: MaskOp) => setUI({ op }),
  redrawOverlay: () => overlayRedraw(),
  preview: (part: LivePart | null) => setPreview(part),
  sourcePixels: () => sourcePixels(),
  say: (msg: string) => say(msg),
  setTool: (id: string | null) => { if (ui().tool !== id) selectTool(id); },
  openCutout: () => openCutout(),
  videoPixels: (id: Id, maxSide?: number) => videoPixels(id, maxSide),
};

/** A source's picture at the current time, placed like its first layer places it (see ToolHost.videoPixels). */
export async function videoPixels(sourceId: Id, maxSide = 4096): Promise<HTMLCanvasElement | null> {
  const s = useProject.getState();
  const p = s.project;
  const src = p?.sources.find(x => x.id === sourceId);
  if (!p || !src) return null;
  const prov = viewCompositor().provider;
  const lf = evaluate(p, s.time).layers.find(l => l.source?.id === sourceId);
  const d = src.duration ?? 0;
  const st = lf?.srcTime ?? (d > 0 ? ((s.time % d) + d) % d : s.time);
  if (!(await prov.prepare(src, st))) return null;
  const img = prov.frame(src, st);
  if (!img) return null;
  const k = Math.min(1, maxSide / Math.max(p.canvas.w, p.canvas.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(p.canvas.w * k)); out.height = Math.max(1, Math.round(p.canvas.h * k));
  const r = fitRect(img.width, img.height, out.width, out.height, sourceFit(p, sourceId));
  const x = out.getContext('2d')!;
  x.fillStyle = '#000';
  x.fillRect(0, 0, out.width, out.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, r.x, r.y, r.w, r.h);
  return out;
}

const hasSource = (l: Layer): l is Layer & { source: string; fit?: LayerFit } => 'source' in l && typeof (l as { source?: unknown }).source === 'string';

/**
 * The target layer's source at the project's canvas size at the current time: its own picture placed with
 * its fit; for 'below', the composite of the layers under it; for anything else (a pattern-only ASCII
 * layer, text, shapes), the layer itself drawn alone. Null without a target or when a picture is missing.
 */
export async function sourcePixels(layerId?: Id | null): Promise<HTMLCanvasElement | null> {
  const s = useProject.getState();
  const p = s.project;
  const id = layerId ?? s.selection[0];
  if (!p || !id) return null;
  const index = p.layers.findIndex(l => l.id === id);
  const layer = p.layers[index];
  if (!layer) return null;
  const t = s.time;
  const out = document.createElement('canvas');
  out.width = p.canvas.w; out.height = p.canvas.h;
  if (hasSource(layer) && layer.source !== 'below' && layer.source !== 'style' && layer.source) {
    const src = p.sources.find(x => x.id === layer.source);
    if (!src) return null;
    const prov = viewCompositor().provider;
    const lf = evaluate(p, t).layers.find(l => l.layer.id === id);
    const st = lf?.srcTime ?? t;
    if (!(await prov.prepare(src, st))) return null;
    const img = prov.frame(src, st);
    if (!img) return null;
    const fit = (layer as { fit?: LayerFit }).fit ?? 'cover';
    const r = fitRect(img.width, img.height, out.width, out.height, fit);
    const x = out.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, r.x, r.y, r.w, r.h);
    return out;
  }
  const only = hasSource(layer) && layer.source === 'below' ? p.layers.slice(0, index).map(l => l.id) : [id];
  if (!only.length) return null;
  await viewCompositor().render(evaluate(p, t), out, { scale: 1, quality: 'final', transparent: true, only });
  return out;
}

/** The bottom-most photo layer's source placed in the frame: the «original» of before/after. */
export function originalOf(p: Project): { source: Id; fit: LayerFit } | null {
  for (const l of p.layers) if (l.kind === 'photo' && l.source && l.visible) return { source: l.source, fit: l.fit };
  for (const l of p.layers) if (hasSource(l) && l.source !== 'below' && l.source !== 'style' && l.source) return { source: l.source, fit: l.fit ?? 'cover' };
  return null;
}
