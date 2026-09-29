/**
 * The animation library (src/anim: 53 templates, choreographies, keyframe helpers) is loaded once, on
 * demand: it weighs about 80 KB (27 KB compressed), so the start screen does not wait for it. The editor
 * starts loading it as soon as a project opens; a project that already has clips is not drawn (nor
 * exported, nor turned into a thumbnail) before it is there, so its clips never render as unknown.
 */
import { useSyncExternalStore } from 'react';
import type { Project } from '../project/types';

let ready: Promise<void> | null = null;
let loaded = false;
/** The last try failed (offline, an old tab after a new version): projects are drawn without waiting. */
let failed = false;
const listeners = new Set<() => void>();

/** Loads (once) and registers every template of the library. */
export function loadAnim(): Promise<void> {
  return (ready ??= import('../anim/index').then(() => { loaded = true; failed = false; for (const f of listeners) f(); }, e => { ready = null; failed = true; throw e; }));
}

/** React: true once the library is there (templates' names, the pickers). */
export function useAnimReady(): boolean {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => loaded);
}

export const animLoaded = () => loaded;
/** Loaded, or failed to load: nothing more to wait for. */
export const animSettled = () => loaded || failed;

/** Whether drawing this project needs the library (it has clips). */
export const needsAnim = (p: Project | null | undefined) => !!p?.layers.some(l => l.clips.length > 0);

/** Resolves once the project can be drawn as it is (at once when it has no clips). */
export async function animFor(p: Project | null | undefined): Promise<void> {
  if (!animSettled() && needsAnim(p)) await loadAnim().catch(() => undefined);
}
