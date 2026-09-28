/**
 * The ToolHost (src/foto/tools/types.ts): what the shell gives every tool. One host for the studio's
 * lifetime; it reads the live viewport, the selection and the options bar each time it is asked.
 */
import { fitRect } from '../project/adjust';
import { evaluate } from '../project/evaluate';
import { useProject } from '../project/store';
import type { Id, Layer, LayerFit, MaskOp, MaskPart, Project } from '../project/types';
import { setPreview, viewCompositor } from './scheduler';
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

export const host: ToolHost = {
  view: () => currentView(),
  target: () => useProject.getState().selection[0] ?? null,
  op: () => ui().op,
  setOp: (op: MaskOp) => setUI({ op }),
  redrawOverlay: () => overlayRedraw(),
  preview: (part: { layer: Id; part: MaskPart } | null) => setPreview(part),
  sourcePixels: () => sourcePixels(),
  say: (msg: string) => say(msg),
};

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
