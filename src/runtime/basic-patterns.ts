/**
 * Stand-in for src/engine/basic/patterns.ts inside the exported runtime (scripts/runtime-plugin.ts points
 * the basic engine's field pass here). The exported code carries only the CPU patterns its piece uses:
 * each one is a small script that registers itself (Glyphos.__basic.add) after the runtime, with its own
 * copy of the cell size PX, so setPX reaches every registered pattern.
 */
import type { BasicPattern } from '../engine/basic/patterns';

/** A registered CPU pattern: its function, its per-frame preparation and its PX setter. */
export interface RuntimePattern extends BasicPattern { px(v: number): void }

export const BASIC_PATTERNS: Record<string, RuntimePattern> = {};

/** A piece whose pattern did not come with the code draws a flat mid-grey field instead of failing. */
const FLAT: RuntimePattern = { f: () => 0.5, px() {} };

export function setPX(v: number) {
  for (const k in BASIC_PATTERNS) BASIC_PATTERNS[k].px(v);
}

export function basicPattern(id: string): BasicPattern {
  return BASIC_PATTERNS[id] ?? BASIC_PATTERNS.nube ?? FLAT;
}

export const BASIC_APPROX: ReadonlyMap<string, string> = new Map();

export function addPattern(id: string, p: unknown) {
  const x = p as Partial<RuntimePattern> | null;
  if (x && typeof x.f === 'function') BASIC_PATTERNS[id] = { f: x.f, prep: x.prep, px: typeof x.px === 'function' ? x.px : () => {} };
}
