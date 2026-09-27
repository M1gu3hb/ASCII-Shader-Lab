/**
 * What a recipe uses that the basic (Canvas 2D) engine does not draw like the WebGL 2 engine.
 * The basic engine ports the whole pipeline, so today only patterns without a CPU twin can show up here.
 * Pure: no DOM.
 */
import { PATTERNS } from '../catalog';
import type { Recipe } from '../recipe';
import { BASIC_APPROX, BASIC_PATTERNS } from './patterns';

export interface BasicGap { id: string; label: string }

/**
 * Effects the basic engine leaves out, if any: [id, label, is it used by this recipe?].
 * Empty on purpose: glow, bloom, CRT curvature, chromatic aberration, flicker, grid, grain,
 * scanlines, vignette and every pointer mode are rendered.
 */
const FX_GAPS: Array<[string, string, (r: Recipe) => boolean]> = [];

/** Spanish labels of what this recipe uses that the basic engine does not render faithfully. Empty when it does. */
export function unsupportedFeatures(r: Recipe): BasicGap[] {
  const out: BasicGap[] = [];
  const seen = new Set<string>();
  for (const l of r.layers.filter(x => x.on).slice(0, 4)) {
    if (seen.has(l.pattern)) continue;
    seen.add(l.pattern);
    if (BASIC_PATTERNS[l.pattern] && !BASIC_APPROX.has(l.pattern)) continue;
    const name = PATTERNS.find(p => p.id === l.pattern)?.name ?? l.pattern;
    out.push({ id: 'pattern:' + l.pattern, label: `${name} (aproximado)` });
  }
  for (const [id, label, used] of FX_GAPS) if (used(r)) out.push({ id, label });
  return out;
}
