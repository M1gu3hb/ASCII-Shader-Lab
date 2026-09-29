/** The versions strip and the versions sheet show each version followed by the ones made from it. */

/** Versions in strip order: each root, then its descendants (depth 1 = a linked variant). */
export function orderVersions<V extends { id: string; parent?: string }>(list: V[]): Array<{ v: V; depth: number }> {
  const ids = new Set(list.map(v => v.id));
  const kids = new Map<string, V[]>();
  const roots: V[] = [];
  for (const v of list) {
    if (v.parent && ids.has(v.parent) && v.parent !== v.id) { const a = kids.get(v.parent) ?? []; a.push(v); kids.set(v.parent, a); }
    else roots.push(v);
  }
  const out: Array<{ v: V; depth: number }> = [];
  const seen = new Set<string>();
  const walk = (v: V, depth: number) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push({ v, depth: Math.min(depth, 1) });
    for (const c of kids.get(v.id) ?? []) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  for (const v of list) if (!seen.has(v.id)) walk(v, 0);
  return out;
}
