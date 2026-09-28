import { create } from 'zustand';

/**
 * Character ramps people save («Tus rampas»): in this browser only (localStorage), like the other
 * preferences. A piece never depends on them: its recipe carries the characters themselves, so a
 * link, a favourite or a project opens with the same ramp anywhere.
 */
export interface SavedRamp { id: string; name: string; chars: string; created: number }

const KEY = 'mt.v2.ramps';
/** A ramp list stays short enough to scan. */
export const RAMPS_MAX = 40;

function load(): SavedRamp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(r => r && typeof r.chars === 'string' && r.chars && typeof r.name === 'string')
      .map(r => ({ id: String(r.id || Math.random().toString(36).slice(2)), name: r.name.slice(0, 40), chars: r.chars.slice(0, 400), created: Number(r.created) || 0 }))
      .slice(0, RAMPS_MAX);
  } catch {
    return [];
  }
}

export const useRamps = create<{ list: SavedRamp[]; saved: boolean }>(() => ({ list: load(), saved: true }));

function persist(list: SavedRamp[]) {
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { saved = false; }
  useRamps.setState({ list, saved });
}

/**
 * Saves a ramp (the same characters are kept once: saving them again renames them). Null when the list
 * is full: a saved ramp is never dropped to make room for another.
 */
export function saveRamp(name: string, chars: string): SavedRamp | null {
  const list = useRamps.getState().list;
  const clean = name.trim().slice(0, 40) || 'Mi rampa';
  const same = list.find(r => r.chars === chars);
  if (same) {
    const next = { ...same, name: clean };
    persist(list.map(r => (r.id === same.id ? next : r)));
    return next;
  }
  if (list.length >= RAMPS_MAX) return null;
  const r: SavedRamp = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: clean, chars, created: Date.now() };
  persist([r, ...list]);
  return r;
}

export function removeRamp(id: string) {
  persist(useRamps.getState().list.filter(r => r.id !== id));
}

/** The saved ramp with exactly these characters, if any. */
export const rampOf = (chars: string) => useRamps.getState().list.find(r => r.chars === chars);

// another tab saved or removed one: follow it
if (typeof addEventListener === 'function') {
  addEventListener('storage', e => { if (e.key === KEY) useRamps.setState({ list: load() }); });
}
