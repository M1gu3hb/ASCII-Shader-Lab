import { weaveIntro, type Effect, type WeaveTarget } from '../../shared/glyphfx';
import { level } from './level';
import { effectiveBg } from './swap';

/**
 * The studio's opening: the interface forms out of characters around the piece (weaveIntro), about
 * 2.4 s (half with low motion, none with reduced motion), once per browser session. The interface is
 * live under it from the first frame, and any key, click or touch ends it.
 */

const KEY = 'mt.intro';

const seen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* storage unavailable: it may play again */ } };

/** What forms, and how: surfaces first (their own colour), the controls on them outlined. */
const PARTS: Array<[string, WeaveTarget['kind']]> = [
  ['.topbar', 'panel'],
  ['.topbar .spaces button', 'control'],
  ['.topbar .tb-right button', 'control'],
  ['.stage-top .vbar-sel', 'control'],
  ['.panel', 'panel'],
  ['.panel .recipes', 'control'],
  ['.panel .ptabs .tab', 'control'],
  ['.seedline', 'panel'],
  ['.deck', 'panel'],
  ['.deck .act.dice', 'control'],
  ['.comp-card', 'panel'],
];

function targets(): WeaveTarget[] {
  const out: WeaveTarget[] = [];
  for (const [sel, kind] of PARTS) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      out.push({ rect: r, kind, bg: kind === 'panel' ? effectiveBg(el) : undefined });
    }
  }
  return out;
}

let running: Effect | null = null;
/** Once per page too (sessionStorage may be unavailable). */
let played = false;

/**
 * Plays the opening now if it has not played in this session. Returns false when it did not (already
 * seen, reduced motion, nothing to weave).
 */
export function playIntro(): boolean {
  if (played || running || seen() || level() === 'none' || typeof document === 'undefined') return false;
  const t = targets();
  if (!t.length) return false;
  played = true;
  markSeen();
  running = weaveIntro(t, { duration: 2400, cell: 9 });
  void running.done.then(() => { running = null; });
  return true;
}

/** Ends the opening at once (e.g. a dialog opens over it). */
export function endIntro() { running?.cancel(); }
