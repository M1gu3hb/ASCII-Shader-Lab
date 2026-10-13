import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { Recipe } from '../engine/recipe';
import { hashBytes } from './mediaStore';
import { CHECKPOINT_MAX, decodeCheckpoint, provideCheckpoint, type Checkpoint } from '../families/checkpoints';

/**
 * Where the saved states (checkpoints) of family layers live in this browser: their own IndexedDB store,
 * apart from photos and videos, keyed by content id (layer.fam.ck names them). Collected like media: only
 * states no recipe of the history, the collection or an undo step refers to, never within a grace time.
 * No engine code here (the store's collection imports it).
 */

export interface StoredState { id: string; family: string; size: number; added: number; blob: Blob }

let db: UseStore | null = null;
const store = () => (db ??= createStore('glyphos-estados', 'estados'));
/** States saved this recently are never collected (the recipe naming them may not be saved yet). */
const GRACE_MS = 5 * 60_000;

/** Keeps a checkpoint file; returns its content id (and whether this browser kept it). */
export async function putState(bytes: Uint8Array, family: string): Promise<{ id: string; stored: boolean }> {
  const id = await hashBytes(bytes);
  try {
    const had = await get<StoredState>(id, store());
    await set(id, had ? { ...had, added: Date.now() } : { id, family, size: bytes.length, added: Date.now(), blob: new Blob([bytes as BlobPart], { type: 'application/octet-stream' }) }, store());
    return { id, stored: true };
  } catch {
    return { id, stored: false };
  }
}

export async function stateBytes(id: string): Promise<Uint8Array | null> {
  try {
    const r = await get<StoredState>(id, store());
    return r?.blob instanceof Blob ? new Uint8Array(await r.blob.arrayBuffer()) : null;
  } catch { return null; }
}

/** Checkpoint ids recipes point to. */
export function stateIdsOf(recipes: Iterable<Recipe | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const r of recipes) for (const l of r?.layers ?? []) if (l.fam?.ck) ids.add(l.fam.ck);
  return ids;
}

/** Checkpoint ids in raw stored recipes (entries, favourites), as stored data says. */
export function rawStateIds(list: unknown[], ids: Set<string>) {
  const add = (r: unknown) => {
    const layers = (r as { layers?: unknown } | null)?.layers;
    if (!Array.isArray(layers)) return;
    for (const l of layers) { const ck = (l as { fam?: { ck?: unknown } } | null)?.fam?.ck; if (typeof ck === 'string' && ck) ids.add(ck); }
  };
  for (const x of list) { const o = x as { recipe?: unknown; origin?: unknown } | null; add(o?.recipe); add(o?.origin); }
}

/** Deletes saved states nothing refers to (never within the grace time). */
export async function gcStates(referenced: Set<string>, grace = GRACE_MS): Promise<number> {
  let n = 0;
  try {
    const now = Date.now();
    for (const [id, r] of await entries<string, StoredState>(store())) {
      if (referenced.has(id) || (r && now - r.added < grace)) continue;
      await del(id, store());
      n++;
    }
  } catch { /* unreadable: collect nothing */ }
  return n;
}


/** Reads a checkpoint file (from a project or a session) into this browser and the engines. */
export async function importState(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length > CHECKPOINT_MAX) return null;
  let c: Checkpoint;
  try { c = decodeCheckpoint(bytes); } catch { return null; }
  const { id } = await putState(bytes, c.family);
  provideCheckpoint(id, c);
  return id;
}

