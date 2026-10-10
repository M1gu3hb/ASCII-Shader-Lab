import { useEffect, useState } from 'react';
import type { SlotInfo } from '../families/host';
import { FamilyHost } from '../families/host';
import { familyById, isStateful } from '../families/registry';
import { familyLoadError } from '../families/models';
import { familyLayer, withPreset, applyLook } from '../families/recipes';
import type { Layer, Recipe } from '../engine/recipe';
import { freshSeed } from '../random/seeds';
import { getEngine } from './engineBridge';
import { edit, useStudio } from './store';

/**
 * The studio's side of the visual families (src/families): what the panels do to a family layer (presets,
 * seeds, parameters go through the recipe and its undo like any edit) and what they ask of the live engine
 * (how a run is going, reset and step, which never touch the recipe).
 */

/** Whether a recipe has a family with memory on: no perfect loop, and exports copy its state. */
export const hasStateful = (r: Recipe | undefined) => !!r && FamilyHost.layersOf(r).some(l => !!l.fam && isStateful(l.pattern));

/** A layer switching pattern: to a family it gets its first preset and a new seed; away from one it drops its settings. */
export function setLayerPattern(r: Recipe, i: number, id: string) {
  const l = r.layers[i];
  const meta = familyById(id);
  if (meta) {
    const fresh = familyLayer(meta, freshSeed());
    r.layers[i] = { ...l, pattern: id, scale: fresh.scale, speed: fresh.speed, fam: fresh.fam };
    // a family with memory cannot keep «Bucle perfecto»: the panel says so where the loop is set
    if (!meta.caps.loop) r.motion.loop = 0;
  } else {
    const { fam: _fam, ...rest } = l;
    r.layers[i] = { ...rest, pattern: id };
  }
}

export function applyFamilyPreset(i: number, presetId: string, withLook = false) {
  edit(r => {
    const l = r.layers[i];
    if (!l?.fam) return;
    r.layers[i] = withPreset(l, presetId);
    if (withLook) applyLook(r, familyById(l.pattern)?.presets.find(p => p.id === presetId));
  }, `fam-preset-${i}-${Date.now()}`);
}

export function newFamilySeed(i: number) {
  edit(r => { const f = r.layers[i]?.fam; if (f) { f.seed = freshSeed(); delete f.ck; } }, `fam-seed-${i}-${Date.now()}`);
}

/** Starts the stage's run of layer i over (from its seed and warm-up, or its saved state). */
export function resetFamily(i?: number) { getEngine()?.familyCommand({ kind: 'reset', layer: i }); }
/** Runs n steps of layer i's run now (useful while paused). */
export function stepFamily(i: number, n = 1) { getEngine()?.familyCommand({ kind: 'step', layer: i, n }); }

/** «Reintentar»: asks again for a family's code that did not arrive (the stage and its previews pick it up). */
export function retryFamilyLoad(id: string) { getEngine()?.familyCommand({ kind: 'retry', id }); }

/** Why a family's code could not be fetched, while that failure stands (refreshed a few times a second). */
export function useFamilyLoadError(id: string | undefined): string | undefined {
  const [err, setErr] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!id) { setErr(undefined); return; }
    let alive = true;
    const tick = () => { if (alive) setErr(familyLoadError(id)); };
    tick();
    const t = window.setInterval(tick, 400);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  return err;
}

/** How the stage's family runs are going, refreshed a few times a second while shown. */
export function useFamilyInfo(): SlotInfo[] {
  const [info, setInfo] = useState<SlotInfo[]>([]);
  const cursor = useStudio(s => s.cursor);
  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) setInfo(getEngine()?.familyInfo() ?? []); };
    tick();
    const id = window.setInterval(tick, 400);
    return () => { alive = false; clearInterval(id); };
  }, [cursor]);
  return info;
}

/** Index among the on-layers (what the engine calls a layer) of recipe layer i, or −1 when it is off. */
export function engineLayer(r: Recipe | undefined, i: number): number {
  if (!r || !r.layers[i]?.on) return -1;
  let k = 0;
  for (let j = 0; j < i; j++) if (r.layers[j].on) k++;
  return k < 4 ? k : -1;
}

export const isFamilyLayer = (l: Layer | undefined) => !!l && !!l.fam && !!familyById(l.pattern);
