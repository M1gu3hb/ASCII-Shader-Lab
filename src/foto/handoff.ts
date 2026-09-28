/**
 * Hand-offs between the lab (/studio/) and the photo studio (/studio/foto/): a small record in IndexedDB
 * under a random key, and only that key in the address (#lab=… or #foto=…). The media itself is already in
 * the shared media store, so nothing big ever goes in a URL, and it works across the cross-origin
 * isolated photo studio (IndexedDB is per origin). A record is read once and deleted; stale ones (over an
 * hour old) are swept on the next hand-off. Tiny on purpose: the lab imports it.
 */
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { MediaRef, Recipe } from '../engine/recipe';

export interface LabToFoto {
  kind: 'lab-to-foto';
  recipe: Recipe;
  /** The picture the piece was made with (already in the media store), or null for patterns and text. */
  ref: MediaRef | null;
  video?: { duration: number; fps?: number };
  labEntry?: string;
  name?: string;
  at: number;
}

export interface FotoToLab {
  kind: 'foto-to-lab';
  recipe: Recipe;
  name: string;
  at: number;
}

export type Handoff = LabToFoto | FotoToLab;

let db: UseStore | null = null;
const store = () => (db ??= createStore('glyphos-handoff', 'h'));
const HOUR = 3600_000;

function key(): string {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export async function putHandoff(h: Handoff): Promise<string> {
  const k = key();
  try {
    for (const [ek, v] of await entries<string, Handoff>(store())) if (!v || Date.now() - (v.at ?? 0) > HOUR) await del(ek, store());
  } catch { /* nothing to sweep */ }
  await set(k, h, store());
  return k;
}

/** Reads a hand-off once (it is deleted). Null when missing, stale or not valid. */
export async function takeHandoff(k: string): Promise<Handoff | null> {
  if (!/^[a-z0-9]{4,32}$/.test(k)) return null;
  try {
    const h = await get<Handoff>(k, store());
    await del(k, store());
    if (!h || typeof h !== 'object' || Date.now() - (h.at ?? 0) > HOUR) return null;
    if ((h.kind !== 'lab-to-foto' && h.kind !== 'foto-to-lab') || !h.recipe || typeof h.recipe !== 'object') return null;
    return h;
  } catch { return null; }
}
