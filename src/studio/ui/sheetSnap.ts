import { create } from 'zustand';

/**
 * The settings sheet on phones rests at one of three heights: «peek» (only its handle and the sections,
 * the piece almost whole above it), «half» (the piece above, the controls below) and «full» (the
 * controls, with the top bar still in view). Dragging its handle lands on the nearest one; a flick goes
 * one step its way; dragging it down past the peek closes it. Pure parts here, tested in
 * tests/unit/sheet-snap.test.ts; the sheet itself is in Panel.tsx.
 */
export type Snap = 'peek' | 'half' | 'full';
export type Rest = Snap | 'closed';

export const SNAP_NAME: Record<Snap, string> = { peek: 'sólo las secciones', half: 'media pantalla', full: 'pantalla completa' };

interface SheetState {
  snap: Snap;
  /** True while the handle is being dragged (the stage keeps its size until the sheet is let go). */
  dragging: boolean;
}

export const useSheet = create<SheetState>(() => ({ snap: 'half', dragging: false }));
export const setSnap = (snap: Snap) => { if (useSheet.getState().snap !== snap) useSheet.setState({ snap }); };

/**
 * The height of each rest for a sheet that can grow to `room` px (from the dock up to under the top bar)
 * and whose handle and sections take `peek` px. Half leaves the upper part of the room to the piece.
 */
export function snapHeights(room: number, peek: number): Record<Snap, number> {
  const full = Math.max(Math.round(room), Math.round(peek));
  const p = Math.min(Math.round(peek), full);
  const half = Math.min(full, Math.max(p + 96, Math.round(room * 0.54)));
  return { peek: p, half, full };
}

/** A drag shorter than this never counts as a flick (a tap that wobbles, a short correction). */
const FLICK_MIN_PX = 40;
/** Speed (px per ms) from which a release is a flick. */
const FLICK_SPEED = 0.55;

/**
 * Where a sheet let go at height `h` comes to rest. `dy` is how far it was dragged (positive: down) and
 * `v` its speed at release (px/ms, positive: down). A flick goes to the next rest in its direction from
 * where it was let go; otherwise the nearest rest wins (closed counts as a rest at height 0).
 */
export function settle(h: number, dy: number, v: number, heights: Record<Snap, number>): Rest {
  const rests: Array<[Rest, number]> = [['closed', 0], ['peek', heights.peek], ['half', heights.half], ['full', heights.full]];
  if (Math.abs(dy) >= FLICK_MIN_PX && Math.abs(v) >= FLICK_SPEED) {
    if (v > 0) {
      const below = rests.filter(([, x]) => x < h - 1);
      return below.length ? below[below.length - 1][0] : 'closed';
    }
    const above = rests.find(([, x]) => x > h + 1);
    return above ? above[0] : 'full';
  }
  let best: Rest = 'closed', d = Infinity;
  for (const [r, x] of rests) {
    const dd = Math.abs(x - h);
    // ties go to the taller rest: the sheet does not close by accident
    if (dd < d || (dd === d && r !== 'closed')) { d = dd; best = r; }
  }
  return best;
}

/** The next rest up (ArrowUp on the handle) or down (ArrowDown; below the peek it closes). */
export function step(from: Snap, dir: 1 | -1): Rest {
  const order: Rest[] = ['closed', 'peek', 'half', 'full'];
  const i = order.indexOf(from) + dir;
  return order[Math.max(0, Math.min(order.length - 1, i))];
}

/** What a press on the handle does: half → full → peek → half (a keyboard can reach every rest). */
export function cycle(from: Snap): Snap {
  return from === 'half' ? 'full' : from === 'full' ? 'peek' : 'half';
}
