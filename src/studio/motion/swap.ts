import { glyphCurtain, type CurtainOptions, type Effect } from '../../shared/glyphfx';
import { level } from './level';

/**
 * Content swaps across the studio, «descomponer y recomponer»: the new content is already in place (and
 * usable) when this runs; a veil of ramp glyphs over it dissolves cell by cell. Each context has its own
 * measure, so a tab swap is light and a change of space is richer; nothing here waits or blocks input.
 *
 *   tab      a settings group or sheet tab: short, fine cells, from where the eye comes (left)
 *   choice   what a choice unfolds under it (the source, the kind of glyphs): shorter, from the top
 *   space    a creative space: the whole panel, coarser cells, longer, from the top
 *   view     a destination preview on the stage: from the centre, coarse cells
 *   step     a step of a guide: from the left, a little slower than a tab
 *   gallery  the components gallery and a piece's page: from the top, coarse
 *   panel    the settings panel appearing (or the guide taking its place)
 *
 * Under low motion (quality «Ligera», weak devices) the light ones are left out and the rest run at half
 * their length (glyphfx halves them); under reduced motion nothing runs.
 */
export type SwapKind = 'tab' | 'choice' | 'space' | 'view' | 'step' | 'gallery' | 'panel';

const PRESETS: Record<SwapKind, CurtainOptions & { light?: boolean; soft?: boolean }> = {
  tab: { duration: 190, cell: 8, origin: 'left', order: 0.7, light: true, soft: true },
  choice: { duration: 170, cell: 8, origin: 'top', order: 0.75, light: true, soft: true },
  space: { duration: 340, cell: 11, origin: 'top', order: 0.5 },
  view: { duration: 300, cell: 13, origin: 'center', order: 0.55 },
  step: { duration: 250, cell: 9, origin: 'left', order: 0.6, soft: true },
  gallery: { duration: 320, cell: 12, origin: 'top', order: 0.5 },
  panel: { duration: 280, cell: 10, origin: 'right', order: 0.55 },
};

const running = new WeakMap<Element, Effect>();

/** The colour behind an element: its own background or the first opaque one up the tree. */
export function effectiveBg(el: Element): string {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    const m = c.match(/[\d.]+/g);
    if (m && (m.length < 4 || parseFloat(m[3]) > 0.6)) return c;
  }
  return '#0c0b0a';
}

/** Runs the swap effect of `kind` over `el` (whose content has already changed). */
export function swap(el: Element | null | undefined, kind: SwapKind): Effect | null {
  if (!el || !el.isConnected) return null;
  const lv = level();
  const p = PRESETS[kind];
  if (lv === 'none' || (lv === 'low' && p.light)) return null;
  running.get(el)?.cancel();
  const host = el.closest('dialog[open]') ?? undefined;
  const fx = glyphCurtain(el, {
    ...p, host, bg: effectiveBg(el),
    // light swaps weave in a quieter ink, so a tab change never flashes
    ink: p.soft ? '#8c857a' : '#ede6da',
  });
  running.set(el, fx);
  void fx.done.then(() => { if (running.get(el) === fx) running.delete(el); });
  return fx;
}
