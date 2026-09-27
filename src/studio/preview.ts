import { create } from 'zustand';
import type { PreviewQuality, RendererKind } from '../engine/renderer';
import { TRANSITIONS, type TransitionKind, type TransitionSpec } from '../engine/transitions';

/**
 * How the live stage is drawn, remembered in this browser: the transition between pieces and the preview
 * quality. Neither changes a recipe or what exports render.
 */
export type TransitionChoice = 'auto' | TransitionKind | 'ninguna';
export type TransitionPace = 'corta' | 'normal';
export type Quality = 'auto' | 'alta' | 'equilibrada' | 'ligera';

interface PreviewState { transition: TransitionChoice; pace: TransitionPace; quality: Quality }

const KEY = 'mt.v3.preview';
const CHOICES: TransitionChoice[] = ['auto', ...TRANSITIONS.map(t => t.id), 'ninguna'];
export const QUALITIES: Array<{ id: Quality; name: string; blurb: string }> = [
  { id: 'auto', name: 'Auto', blurb: 'resolución completa; baja sola si los cuadros van lentos' },
  { id: 'alta', name: 'Alta', blurb: 'siempre la resolución completa, aunque vaya más lenta' },
  { id: 'equilibrada', name: 'Equilibrada', blurb: 'algo menos de resolución en pantallas densas' },
  { id: 'ligera', name: 'Ligera', blurb: 'menos resolución, hasta 30 cuadros por segundo y efectos de pantalla simplificados' },
];

function load(): PreviewState {
  const s: PreviewState = { transition: 'auto', pace: 'normal', quality: 'auto' };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<PreviewState>;
    if (CHOICES.includes(o.transition as TransitionChoice)) s.transition = o.transition!;
    if (o.pace === 'corta' || o.pace === 'normal') s.pace = o.pace;
    if (QUALITIES.some(q => q.id === o.quality)) s.quality = o.quality!;
  } catch { /* storage unavailable: defaults */ }
  return s;
}

export const usePreview = create<PreviewState>(load);

function save() {
  const { transition, pace, quality } = usePreview.getState();
  try { localStorage.setItem(KEY, JSON.stringify({ transition, pace, quality })); } catch { /* storage unavailable */ }
}

export function setTransitionChoice(transition: TransitionChoice) { usePreview.setState({ transition }); save(); }
export function setTransitionPace(pace: TransitionPace) { usePreview.setState({ pace }); save(); }
export function setQuality(quality: Quality) { usePreview.setState({ quality }); save(); }

/** What a quality setting asks of the live renderer (never of exports). */
export function qualityFor(q: Quality, kind: RendererKind): PreviewQuality {
  switch (q) {
    case 'alta': return { maxPixelRatio: 2, adaptive: false };
    case 'equilibrada': return { maxPixelRatio: 1.25, adaptive: true };
    case 'ligera': return { maxPixelRatio: 1, adaptive: true, maxFps: kind === 'basic' ? 20 : 30, simplify: true };
    default: return { maxPixelRatio: 2, adaptive: true };
  }
}

/** Cheaper, shorter transitions: the «Ligera» quality, or the basic engine unless the quality is «Alta». */
export function lowLoad(kind: RendererKind | null): boolean {
  const q = usePreview.getState().quality;
  return q === 'ligera' || (kind === 'basic' && q !== 'alta');
}

export interface TransitionContext {
  /** What changed the piece: a roll of the dice, a step through the history, something opened, a space. */
  cause: 'roll' | 'vary' | 'back' | 'forward' | 'jump' | 'open' | 'space';
  renderer: RendererKind | null;
  /** Where the pointer last was over the stage (0..1), if it was there a moment ago. */
  pointer?: [number, number] | null;
}

const ROLL_ORDER: TransitionKind[] = ['tejido', 'lluvia', 'barrido', 'disolucion', 'iris'];
let rollAt = Math.floor(Math.random() * ROLL_ORDER.length);

/**
 * The transition for a change, or null for none. «Auto» picks by what happened: the dice take turns
 * through the lively ones (an iris opens where the pointer is), stepping through the history sweeps in
 * the direction of the step, a variation dissolves, a space opens from the centre, something opened from
 * the collection or a link resolves from big cells. Under low load: short, and never the costly one.
 */
export function pickTransition(ctx: TransitionContext): TransitionSpec | null {
  const { transition, pace } = usePreview.getState();
  if (transition === 'ninguna') return null;
  const low = lowLoad(ctx.renderer);
  let duration = pace === 'corta' ? 0.45 : 0.85;
  if (low) duration = Math.min(duration, 0.5);
  const seed = Math.round(Math.random() * 997) / 10;
  const spec = (kind: TransitionKind, extra: Partial<TransitionSpec> = {}): TransitionSpec => ({ kind, duration, seed, ...extra });
  if (transition !== 'auto') {
    const info = TRANSITIONS.find(t => t.id === transition)!;
    if (low && info.heavy) return spec('disolucion');
    return spec(transition, transition === 'iris' && ctx.pointer ? { origin: ctx.pointer } : { dir: ctx.cause === 'back' ? -1 : 1 });
  }
  switch (ctx.cause) {
    case 'back': return spec('barrido', { dir: -1 });
    case 'forward': case 'jump': return spec('barrido', { dir: 1 });
    case 'vary': return spec('disolucion');
    case 'space': return spec(low ? 'disolucion' : 'iris', { origin: [0.5, 0.5] });
    case 'open': return spec(low ? 'disolucion' : 'mosaico');
    default: {
      rollAt = (rollAt + 1) % ROLL_ORDER.length;
      const kind = ROLL_ORDER[rollAt];
      return spec(kind, kind === 'iris' && ctx.pointer ? { origin: ctx.pointer } : {});
    }
  }
}
