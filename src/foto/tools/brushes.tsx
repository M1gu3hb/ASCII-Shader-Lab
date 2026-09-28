/**
 * Brushes: «Pasar a ASCII» (B: paints the target layer in, op add), «Borrar efecto» (E: paints it out, op
 * subtract) and «Restaurar original» (R: paints every non-photo layer above the bottom photo out at once, so the
 * original photo shows; one undo step for all of them). ⌥ while starting a stroke paints the opposite way.
 *
 * Each stroke is one MaskStrokePart (one undo step): diameter as a fraction of the frame's shorter side ([ and ]
 * change it; a slider on touch), hardness, strength, the pen's pressure when it reports one, and smoothing (a
 * lazy brush: the brush trails the pointer on a string, so small tremors do not show). The brush's circle
 * follows the pointer on the overlay.
 *
 * Many strokes make a mask slow to draw (and a mask holds 64 parts): past AUTO_FLATTEN (brush.ts) the strokes
 * are rasterised in the background into one or two MaskRasterParts with the same pixels, and the next stroke's
 * undo step swaps them in; «Aplanar trazos» does it at once (its own undo step).
 */
import type { Id, Layer, MaskOp, MaskPart, MaskStrokePart } from '../../project/types';
import { defaultMask, LIMITS } from '../../project/normalize';
import { edit, useProject } from '../../project/store';
import { LazyBrush, needsFlatten, planFlatten, stepSize, StrokeBuilder, strokeLoad, strokeRuns } from './brush';
import { dist, type Pt } from './geom';
import { ICONS } from './icons';
import * as draw from './overlay';
import { setLive, setSettings, settings, useLive, useSettings } from './state';
import { canvasSize, editableTarget, layerById, mapping, partsOf, project, rasterPart, screenPerPx, storeCoverage } from './target';
import type { Tool, ToolEvent, ToolHost } from './types';
import { Button, Note, Slider, Switch, pct } from './ui';
import { fromScreen } from './freeform';

type Mode = 'ascii' | 'erase' | 'restore';

/* ------------------------------------------------------------------ flattening */

interface Flat { layer: Id; before: string[]; after: MaskPart[] }
const flatCache = new Map<Id, Flat>();
const flatJobs = new Map<Id, Promise<void>>();
export const flattenTimings: { lastMs: number; lastW: number; lastH: number; runs: number } = { lastMs: 0, lastW: 0, lastH: 0, runs: 0 };

/** The size flattened pictures are made at: the project's frame, at most 2560 px on its longer side. */
function flatSize(p: { canvas: { w: number; h: number } }) {
  const k = Math.min(1, 2560 / Math.max(p.canvas.w, p.canvas.h));
  return { w: Math.max(1, Math.round(p.canvas.w * k)), h: Math.max(1, Math.round(p.canvas.h * k)), scale: k };
}

/** Computes (and stores) the flattened version of a layer's mask as it is now. */
export async function computeFlatten(layerId: Id): Promise<Flat | null> {
  const p = project();
  const l = p?.layers.find(x => x.id === layerId);
  if (!p || !l?.mask) return null;
  const parts = l.mask.parts.slice();
  if (!strokeRuns(parts).length) return null;
  const t0 = performance.now();
  const size = flatSize(p);
  const plans = planFlatten(parts, { w: size.w, h: size.h, scale: size.scale, t: 0 });
  const after = parts.slice();
  for (const plan of plans) {
    const pieces: MaskPart[] = [];
    for (const pc of plan.pieces) pieces.push(rasterPart(await storeCoverage(pc.coverage, size.w, size.h, 'trazos-aplanados.png'), pc.op, { origin: 'paint' }));
    after.splice(plan.start, plan.end - plan.start, ...pieces);
  }
  flattenTimings.lastMs = Math.round(performance.now() - t0);
  flattenTimings.lastW = size.w; flattenTimings.lastH = size.h; flattenTimings.runs = plans.length;
  return { layer: layerId, before: parts.map(x => JSON.stringify(x)), after };
}

/** Starts flattening a layer in the background when it carries too many strokes. */
function scheduleFlatten(layerId: Id) {
  const l = layerById(layerId);
  if (!l || !needsFlatten(partsOf(l)) || flatJobs.has(layerId)) return;
  // when the page is idle (not in the middle of the next stroke)
  const idle = (f: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => f(), { timeout: 1500 }) : setTimeout(f, 300));
  const job = new Promise<void>(r => idle(() => r())).then(() => computeFlatten(layerId)).then(f => { if (f) flatCache.set(layerId, f); }).catch(() => undefined).finally(() => flatJobs.delete(layerId));
  flatJobs.set(layerId, job);
}

/**
 * The parts of a layer with a ready flattening swapped in, when the mask still starts with the parts it was
 * made from (strokes added since then stay after it). Otherwise the parts as they are.
 */
function withFlattened(layerId: Id, parts: MaskPart[]): MaskPart[] {
  const f = flatCache.get(layerId);
  if (!f) return parts;
  const ok = f.before.length <= parts.length && f.before.every((j, i) => j === JSON.stringify(parts[i]));
  flatCache.delete(layerId);
  return ok ? [...f.after, ...parts.slice(f.before.length)] : parts;
}

/** «Aplanar trazos» now (its own undo step). */
export async function flattenNow(host: ToolHost, layerId: Id): Promise<boolean> {
  setLive({ flattening: true });
  try {
    const f = await computeFlatten(layerId);
    if (!f) { host.say('No hay trazos seguidos que aplanar en esta máscara.'); return false; }
    const cur = partsOf(layerById(layerId));
    const ok = f.before.length <= cur.length && f.before.every((j, i) => j === JSON.stringify(cur[i]));
    if (!ok) { host.say('La máscara cambió mientras se aplanaba: inténtalo otra vez.'); return false; }
    edit(p => {
      const t = p.layers.find(x => x.id === layerId);
      if (t?.mask) t.mask.parts = [...f.after, ...t.mask.parts.slice(f.before.length)];
    });
    host.say(`Trazos aplanados: ${f.before.length} partes → ${f.after.length}; la máscara se ve igual y se dibuja más rápido.`);
    return true;
  } finally {
    setLive({ flattening: false });
    refreshCount(layerId);
  }
}

function refreshCount(layerId: Id | null) {
  const l = layerById(layerId);
  setLive({ strokes: strokeLoad(partsOf(l)).strokes });
}

/* ------------------------------------------------------------------ layers a stroke paints */

/** «Restaurar original»: every non-photo layer above the bottom photo layer (unlocked). */
export function restoreLayers(): Layer[] {
  const p = project();
  if (!p) return [];
  const bottom = p.layers.findIndex(l => l.kind === 'photo');
  return p.layers.filter((l, i) => i > bottom && l.kind !== 'photo' && !l.locked);
}

/* ------------------------------------------------------------------ the tool */

const NAMES: Record<Mode, string> = { ascii: 'Pasar a ASCII', erase: 'Borrar efecto', restore: 'Restaurar original' };

export function makeBrushTool(mode: Mode): Tool & { lastCommitMs: number } {
  let stroke: { layers: Id[]; op: MaskOp; lazy: LazyBrush; b: StrokeBuilder; size: number; touch: boolean } | null = null;
  /** Pointer position on screen (for the brush circle), null when it left. */
  let hover: Pt | null = null;
  let hoverTouch = false;

  const radiusScreen = (host: ToolHost, size = settings().brushSize) => {
    const s = canvasSize(host);
    return ((size * Math.min(s.w, s.h)) / 2) * screenPerPx(host) * mapping(host).scale;
  };

  const partNow = (): MaskStrokePart | null => {
    if (!stroke || !stroke.b.length) return null;
    const st = settings();
    return stroke.b.part({ op: stroke.op, size: stroke.size, hardness: st.brushHardness, alpha: st.brushStrength });
  };

  /** Adds the brush's position (screen px) as a point. */
  const addAt = (host: ToolHost, s: Pt, pressure: number, force = false) => {
    if (!stroke) return;
    const f = fromScreen(host, s);
    stroke.b.add(mapping(host).toLayer(f), s, pressure, force);
  };

  const tool: Tool & { lastCommitMs: number } = {
    id: mode === 'ascii' ? 'pasar-a-ascii' : mode === 'erase' ? 'borrar-efecto' : 'restaurar-original',
    name: NAMES[mode],
    hint: mode === 'ascii'
      ? 'Pinta donde quieras ver esta capa (los caracteres). [ y ] cambian el tamaño; ⌥ al empezar borra. En teléfono: pinta con un dedo; el tamaño está en las opciones.'
      : mode === 'erase'
        ? 'Pinta donde quieras quitar el efecto de esta capa. [ y ] cambian el tamaño; ⌥ al empezar vuelve a pintarlo. En teléfono: pinta con un dedo; el tamaño está en las opciones.'
        : 'Pinta donde quieras ver la foto original: quita todas las capas de efecto de encima a la vez. [ y ] cambian el tamaño. En teléfono: pinta con un dedo.',
    shortcut: mode === 'ascii' ? 'B' : mode === 'erase' ? 'E' : 'R',
    group: 'pincel',
    icon: mode === 'ascii' ? ICONS.brushAscii : mode === 'erase' ? ICONS.erase : ICONS.restore,
    cursor: 'none',
    draws: true,
    lastCommitMs: 0,

    activate(host) { refreshCount(host.target()); },
    deactivate(host) { stroke = null; hover = null; host.preview(null); },

    down(e, host) {
      hoverTouch = e.pointerType === 'touch';
      let layers: Id[];
      if (mode === 'restore') {
        layers = restoreLayers().map(l => l.id);
        if (!layers.length) { host.say('No hay capas de efecto encima de la foto que restaurar.'); return; }
      } else {
        const l = editableTarget(host);
        if (!l) return;
        layers = [l.id];
      }
      const st = settings();
      const base: MaskOp = mode === 'ascii' ? 'add' : 'subtract';
      const op: MaskOp = e.alt && mode !== 'restore' ? (base === 'add' ? 'subtract' : 'add') : base;
      const r = radiusScreen(host, st.brushSize);
      const pen = e.pointerType === 'pen' && st.brushPressure;
      stroke = {
        layers, op, size: st.brushSize, touch: hoverTouch,
        lazy: new LazyBrush(e.s, st.brushSmoothing * Math.max(6, Math.min(60, r * 0.8))),
        b: new StrokeBuilder(Math.max(1.5, r * 0.18), pen),
      };
      addAt(host, e.s, e.pressure, true);
      hover = e.s;
      if (mode !== 'restore') host.preview({ layer: layers[0], part: partNow()! });
      host.redrawOverlay();
    },

    move(e, host) {
      hover = e.s;
      hoverTouch = e.pointerType === 'touch';
      if (!stroke) { host.redrawOverlay(); return; }
      const co = e.native?.getCoalescedEvents?.() ?? [];
      const samples = co.length > 1 ? co.map(c => ({ s: host.view().toScreen(host.view().toFrame(c.clientX, c.clientY)), pr: c.pressure || e.pressure })) : [{ s: e.s, pr: e.pressure }];
      let moved = false;
      for (const q of samples) if (stroke.lazy.update(q.s)) { addAt(host, stroke.lazy.brush, q.pr); moved = true; }
      if (moved && mode !== 'restore') host.preview({ layer: stroke.layers[0], part: partNow()! });
      host.redrawOverlay();
    },

    up(e, host) {
      if (!stroke) return;
      addAt(host, stroke.lazy.brush, e.pressure, true);
      const part = partNow();
      const s = stroke;
      stroke = null;
      host.preview(null);
      if (!part) { host.redrawOverlay(); return; }
      const t0 = performance.now();
      const layers = s.layers.filter(id => { const l = layerById(id); return l && !l.locked; });
      const full = layers.filter(id => partsOf(layerById(id)).length >= LIMITS.parts);
      if (full.length) {
        // make room: flatten now and ask to paint again
        host.say('La máscara está llena de partes: aplanando los trazos. Vuelve a pintar ese trazo en un momento.');
        for (const id of full) void flattenNow(host, id);
        return;
      }
      edit(p => {
        for (const id of layers) {
          const l = p.layers.find(x => x.id === id);
          if (!l) continue;
          l.mask ??= defaultMask();
          l.mask.parts = [...withFlattened(id, l.mask.parts), part];
        }
      });
      tool.lastCommitMs = Math.round((performance.now() - t0) * 10) / 10;
      const n = layers.length;
      host.say(mode === 'restore'
        ? `Original restaurado en ${n} ${n === 1 ? 'capa' : 'capas'}`
        : s.op === 'add' ? 'Trazo pintado: la capa se ve ahí' : 'Trazo borrado: ahí se ve lo de debajo');
      for (const id of layers) scheduleFlatten(id);
      refreshCount(host.target());
      host.redrawOverlay();
    },

    cancel(host) { stroke = null; host.preview(null); host.redrawOverlay(); },

    onKey(e, host) {
      if (e.metaKey || e.ctrlKey || e.altKey) return false;
      if (e.key === '[' || e.key === ']') {
        const next = stepSize(settings().brushSize, e.key === ']' ? 1 : -1);
        setSettings({ brushSize: next });
        const s = canvasSize(host);
        host.say(`Pincel de ${Math.round(next * Math.min(s.w, s.h))} px`);
        host.redrawOverlay();
        return true;
      }
      if (e.key === 'Escape' && stroke) { tool.cancel!(host); return true; }
      return false;
    },

    overlay(ctx, host) {
      const st = settings();
      const r = radiusScreen(host, stroke?.size ?? st.brushSize);
      // the stroke so far, faintly (the composition preview may take a moment to catch up)
      if (stroke && stroke.b.length) {
        const pts = stroke.b.pts, v = host.view(), m = mapping(host);
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const q = v.toScreen(m.toFrame({ x: pts[i], y: pts[i + 1] }));
          ctx.moveTo(q.x + r, q.y);
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
        }
        draw.veil(ctx, mode === 'ascii' && stroke.op === 'add' ? draw.BONE : '#b9b2a6', mode === 'restore' ? 0.28 : 0.12);
        ctx.restore();
        if (st.brushSmoothing > 0 && hover && dist(hover, stroke.lazy.brush) > 1) draw.segment(ctx, stroke.lazy.brush, hover, { dash: [2, 3], alpha: 0.7 });
      }
      const at = stroke ? stroke.lazy.brush : hover;
      if (!at || (hoverTouch && !stroke)) return;
      draw.circle(ctx, at, r);
      if (st.brushHardness < 0.98 && r * st.brushHardness > 3) draw.circle(ctx, at, r * st.brushHardness, { alpha: 0.4, dash: [2, 3] });
      draw.crosshair(ctx, at, 3);
    },

    Options: ({ host }) => <BrushOptions host={host} mode={mode} />,
  };
  return tool;
}

function BrushOptions({ host, mode }: { host: ToolHost; mode: Mode }) {
  const st = useSettings();
  const strokes = useLive(s => s.strokes);
  const flattening = useLive(s => s.flattening);
  const p = useProject(s => s.project);
  const target = layerById(host.target());
  const side = p ? Math.min(p.canvas.w, p.canvas.h) : 1000;
  const n = mode === 'restore' ? restoreLayers().length : 0;
  const count = target ? strokeLoad(partsOf(target)).strokes : strokes;
  return (
    <div className="tl-opts" data-tool={mode}>
      <span className="tl-title">{NAMES[mode]}</span>
      <Slider label="Tamaño" value={st.brushSize} min={0.004} max={0.5} step={0.002} format={v => `${Math.round(v * side)} px`} onChange={v => { setSettings({ brushSize: v }); host.redrawOverlay(); }} hint="Diámetro del pincel en la imagen final ([ y ] lo cambian)" />
      <Slider label="Dureza" value={st.brushHardness} min={0} max={1} step={0.05} format={pct} onChange={v => setSettings({ brushHardness: v })} hint="100 %: borde nítido; menos: borde que se desvanece" />
      <Slider label="Intensidad" value={st.brushStrength} min={0.05} max={1} step={0.05} format={pct} onChange={v => setSettings({ brushStrength: v })} />
      <Slider label="Suavizado" value={st.brushSmoothing} min={0} max={1} step={0.05} format={pct} onChange={v => setSettings({ brushSmoothing: v })} hint="El pincel sigue al puntero con un poco de retraso y quita los temblores" />
      <Switch label="Presión del lápiz" checked={st.brushPressure} onChange={v => setSettings({ brushPressure: v })} hint="Solo con un lápiz que informe la presión" />
      {mode === 'restore'
        ? <Note tone="quiet">{n ? `Quita el efecto de ${n} ${n === 1 ? 'capa' : 'capas'} a la vez; la foto de abajo no cambia.` : 'No hay capas de efecto encima de la foto.'}</Note>
        : (
          <>
            <Button disabled={!target || count < 2 || flattening} onClick={() => { if (target) void flattenNow(host, target.id); }} title="Convierte los trazos seguidos en una imagen de máscara: se ve igual y dibuja más rápido">
              {flattening ? 'Aplanando…' : `Aplanar trazos${count ? ` (${count})` : ''}`}
            </Button>
          </>
        )}
    </div>
  );
}

export const asciiBrush = makeBrushTool('ascii');
export const eraseBrush = makeBrushTool('erase');
export const restoreBrush = makeBrushTool('restore');

/** For tests and the QA page. */
export const __brushInternals = { flatCache, flatJobs, withFlattened, scheduleFlatten };
export type { ToolEvent };
