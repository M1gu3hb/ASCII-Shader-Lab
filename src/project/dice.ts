/**
 * The dice of the photo studio (first version): a new style for an ASCII layer, drawn by the lab's own
 * generator (src/random roll()), honouring the lab's lock groups plus the studio's own «keep» set:
 *   - locks: 'forma' | 'color' | 'glifos' | 'movimiento' | 'efectos' (as in the lab); 'fuente' is always
 *     kept, because the layer's source (the photo, the layers below) is what feeds the style;
 *   - keep 'paleta': the colours stay (the same as locking 'color');
 *   - keep 'seleccion': the masks stay. This version never changes masks, so it always holds; a later dice
 *     that also moves or re-draws zones reads it.
 * A roll with a seed reproduces exactly; without one, fresh seeds are drawn (and looks already seen passed
 * over, like the lab). Pure: returns a new project, never changes the one given.
 */
import { mutate, roll, type LockGroup } from '../random';
import { cloneProject } from './normalize';
import type { AsciiLayer, Id, Project } from './types';

export type KeepLock = 'seleccion' | 'paleta';

export interface DiceOptions {
  /** The ASCII layer to change (default: the top one). */
  layer?: Id;
  locks?: LockGroup[];
  keep?: KeepLock[];
  /** Reproduce a roll exactly. */
  seed?: string;
  /** Looks already seen (fingerprints), to pass over. */
  seen?: Set<string>;
  /** Where fresh seeds come from (tests pass seeded ones). */
  fresh?: () => string;
  rand?: () => number;
}

export interface DiceResult {
  project: Project;
  /** The layer that changed (null: the project has no ASCII layer; nothing changed). */
  layer: Id | null;
  seed: string | null;
  /** The new style's look fingerprint. */
  fp: string | null;
}

/** The ASCII layer a roll acts on. */
export function diceTarget(p: Project, id?: Id): AsciiLayer | null {
  const list = p.layers.filter((l): l is AsciiLayer => l.kind === 'ascii');
  if (id) return list.find(l => l.id === id) ?? null;
  return list[list.length - 1] ?? null;
}

function lockSet(o: DiceOptions): LockGroup[] {
  const s = new Set<LockGroup>(o.locks ?? []);
  s.add('fuente');
  if (o.keep?.includes('paleta')) s.add('color');
  return [...s];
}

/** A new style for an ASCII layer (see the top of this file). */
export function rollProject(p: Project, o: DiceOptions = {}): DiceResult {
  const target = diceTarget(p, o.layer);
  if (!target) return { project: p, layer: null, seed: null, fp: null };
  const space = target.source === 'style' ? 'arte' : 'media';
  const base = target.style;
  const r = roll({ space, base, locks: lockSet(o), seen: o.seen ?? new Set(), ...(o.seed ? { seed: o.seed } : {}), ...(o.fresh ? { fresh: o.fresh } : {}), ...(o.rand ? { rand: o.rand } : {}) });
  const out = cloneProject(p);
  const l = out.layers.find(x => x.id === target.id) as AsciiLayer;
  l.style = r.recipe;
  // interaction needs a pointer: never part of a project
  l.style.interact = { ...l.style.interact, mode: 'none', auto: false };
  out.updated = Date.now();
  return { project: out, layer: l.id, seed: r.seed, fp: r.fp };
}

/** A variation of an ASCII layer's style (small changes, amount 0..1), with the same locks. */
export function varyProject(p: Project, o: DiceOptions & { amount?: number } = {}): DiceResult {
  const target = diceTarget(p, o.layer);
  if (!target) return { project: p, layer: null, seed: null, fp: null };
  const seed = o.seed ?? (o.fresh ? o.fresh() : Math.random().toString(36).slice(2, 10));
  const out = cloneProject(p);
  const l = out.layers.find(x => x.id === target.id) as AsciiLayer;
  l.style = mutate(target.style, o.amount ?? 0.35, seed, lockSet(o));
  l.style.interact = { ...l.style.interact, mode: 'none', auto: false };
  out.updated = Date.now();
  return { project: out, layer: l.id, seed, fp: null };
}
