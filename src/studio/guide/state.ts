import { create } from 'zustand';
import { PRESETS } from '../presets';
import { applyRecipe, currentEntry, currentRecipe, rollDice, setSpace, setUI, useStudio } from '../store';
import { announce, toast } from '../toast';
import { PATHS, STEP_COUNT, relevantTab, type PathId } from './paths';

/**
 * Welcome dialog and guided paths. The guide only drives the studio through its normal actions
 * (presets, edits, the dice), so everything it does lands in the history: undoable, favouritable.
 */
interface GuideState {
  /** The «¿Qué quieres hacer?» dialog is open. */
  welcome: boolean;
  /** It opened by itself on a first visit (closing it leaves the dice hint). */
  first: boolean;
  path: PathId | null;
  step: number;
  /** Bumped when the guide's step title should take focus (start, step change). */
  focusTick: number;
  /** Palabra: the clip loops (on by default, so GIF and video loop without a jump). */
  wordLoop: boolean;
  /** Palabra: what the word field holds right now (it may be empty while the piece keeps the last word). */
  word: string | null;
}

export const useGuide = create<GuideState>(() => ({ welcome: false, first: false, path: null, step: 0, focusTick: 0, wordLoop: true, word: null }));

const G = useGuide.getState;
const setG = useGuide.setState;

export const DICE_HINT = 'Pulsa «Azar» (R) para tejer algo nuevo · ← → recorre tu historial · ★ guarda lo que te guste';

/** Settings panel shown before the guide took its place (restored when the guide closes). */
let panelBefore: boolean | null = null;

export function openWelcome(first = false) {
  setG({ welcome: true, first });
}

/**
 * Closes the welcome. 'close' (✕, Escape, outside click) keeps the piece as it is; 'explore' rolls
 * the dice once («Explorar libremente»); 'path' and 'silent' leave the rest to whoever called.
 */
export function closeWelcome(how: 'close' | 'explore' | 'path' | 'silent' = 'close') {
  const { welcome, first } = G();
  if (!welcome) return;
  setG({ welcome: false, first: false });
  if (how === 'explore') {
    if (G().path) exitGuide('close');
    if (useStudio.getState().space === 'componentes') setSpace('arte');
    const e = rollDice();
    announce(`Resultado nuevo: ${e.seed?.replace(/-/g, ' ') ?? ''}`);
  }
  if ((how === 'close' || how === 'explore') && first) setTimeout(() => toast(DICE_HINT, undefined, 7000), 300);
}

/** Puts the studio where a path starts: its space and a piece of the right kind. */
function prepare(path: PathId) {
  const e = currentEntry();
  if (path === 'foto') {
    setSpace('media'); // an image preset unless the piece already shows an image, a video or the camera
    return;
  }
  if (path === 'fondo') {
    if (useStudio.getState().space !== 'fondos') useStudio.setState({ space: 'fondos' });
    if (e?.space !== 'fondos' || currentRecipe().source !== 'pattern') {
      const p = PRESETS.fondos[0];
      applyRecipe(p.make(), 'receta', p.name);
    }
    return;
  }
  setSpace('tipo');
  if (currentRecipe().source !== 'text') {
    const p = PRESETS.tipo[0];
    applyRecipe(p.make(currentRecipe()), 'receta', p.name);
  }
}

export function startPath(path: PathId) {
  const g = G();
  if (g.welcome) closeWelcome('path');
  if (g.path === null) panelBefore = useStudio.getState().ui.panel;
  prepare(path);
  setUI({ panel: true, sheet: 'none', hideUI: false });
  setG({ path, step: 0, focusTick: g.focusTick + 1, wordLoop: true, word: null });
  announce(`Guía: ${PATHS[path].title}. Paso 1 de ${STEP_COUNT}.`);
}

export function goStep(step: number) {
  const g = G();
  if (!g.path) return;
  const s = Math.max(0, Math.min(STEP_COUNT - 1, step));
  if (s !== g.step) setG({ step: s, focusTick: g.focusTick + 1 });
}

/** Focus after the panel re-renders (the element may not exist yet). */
function focusSoon(selector: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector(selector) as HTMLElement | null)?.focus()));
}

/**
 * Leaves the guide, always keeping the piece. 'panel' («Ver todos los controles») opens the full
 * panel on the tab that continues the step; 'switch' (the person changed space) keeps the panel as it
 * is; 'close' and 'done' put back the panel as it was before the guide.
 */
export function exitGuide(how: 'close' | 'done' | 'panel' | 'switch') {
  const g = G();
  if (!g.path) return;
  const s = useStudio.getState();
  if (how === 'panel') {
    setUI({ panel: true, tab: { ...s.ui.tab, [s.space]: relevantTab(g.path, g.step) } });
    focusSoon('.panel .tab[aria-selected="true"]');
  } else if (how !== 'switch') {
    setUI({ panel: panelBefore ?? s.ui.panel });
    focusSoon('.topbar .guides-btn');
  }
  panelBefore = null;
  setG({ path: null, step: 0, word: null });
  if (how === 'done') toast('Listo. Tu pieza sigue aquí: ajústala, tira el dado o guárdala con ★.', undefined, 5000);
}
