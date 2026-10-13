/**
 * Components and anchors (pure): which glyphs may be used inside another, where a component's drawing is,
 * and «Colocar por anclas» (a mark's '_top' meets its base's 'top').
 */
import { DOC_LIMITS, hasDrawing, type Anchor, type ComponentRef, type Contour, type Glyph, type GlyphDoc, type Pt } from '../../doc';
import { glyphContours } from '../../compile';
import { transformContours } from '../../geom/ops';

/** Whether glyph `ch` uses `target`, directly or through its components (four levels, like compile). */
export function usesGlyph(doc: GlyphDoc, ch: string, target: string, depth = 0, seen: Set<string> = new Set()): boolean {
  if (ch === target) return true;
  const g = doc.glyphs[ch];
  if (!g || depth > 4 || seen.has(ch)) return false;
  seen.add(ch);
  return g.components.some(k => usesGlyph(doc, k.of, target, depth + 1, seen));
}

/** Whether `of` may go inside `ch`: not itself, not something that already uses `ch`, drawn, and room left. */
export function componentProblem(doc: GlyphDoc, ch: string, of: string): string | null {
  if (of === ch) return 'Un glifo no puede contenerse a sí mismo.';
  const base = doc.glyphs[of];
  if (!base || !hasDrawing(base)) return 'Ese carácter todavía no tiene dibujo.';
  if (usesGlyph(doc, of, ch)) return `«${of}» ya usa «${ch}»: se formaría un ciclo.`;
  if ((doc.glyphs[ch]?.components.length ?? 0) >= DOC_LIMITS.components) return `Un glifo admite hasta ${DOC_LIMITS.components} componentes.`;
  return null;
}

/** Characters that can be added as a component of `ch`, in the board's order. */
export const componentCandidates = (doc: GlyphDoc, ch: string): string[] => doc.chars.filter(c => c !== ' ' && !componentProblem(doc, ch, c));

/** The contours a component draws, placed (its base's current shape, moved and scaled). */
export function componentContours(doc: GlyphDoc, ref: ComponentRef): Contour[] {
  const s = ref.s ?? 1;
  return transformContours(glyphContours(doc, ref.of), [s, 0, 0, s, ref.dx, ref.dy]);
}

const placed = (a: Pt, ref: ComponentRef): Pt => ({ x: a.x * (ref.s ?? 1) + ref.dx, y: a.y * (ref.s ?? 1) + ref.dy });

/**
 * Where component `k` goes by anchors: for each of its mark anchors ('_top', then '_bottom', then any
 * other '_name'), the base anchor of the same name is looked for in the glyph's other components (as
 * placed) and then in the glyph's own anchors. Null when no pair is found.
 */
export function anchorPlacement(doc: GlyphDoc, g: Glyph, k: number): { dx: number; dy: number; anchor: string } | null {
  const ref = g.components[k];
  const mark = ref && doc.glyphs[ref.of];
  if (!mark) return null;
  const marks = mark.anchors.filter(a => a.name.startsWith('_') && a.name.length > 1);
  marks.sort((a, b) => rank(a.name) - rank(b.name));
  for (const ma of marks) {
    const name = ma.name.slice(1);
    let base: Pt | null = null;
    g.components.forEach((other, j) => {
      if (base || j === k) return;
      const a = doc.glyphs[other.of]?.anchors.find(x => x.name === name);
      if (a) base = placed(a, other);
    });
    if (!base) { const own = g.anchors.find(x => x.name === name); if (own) base = { x: own.x, y: own.y }; }
    if (base) {
      const s = ref.s ?? 1;
      const b = base as Pt;
      return { dx: b.x - ma.x * s, dy: b.y - ma.y * s, anchor: name };
    }
  }
  return null;
}

const rank = (n: string) => (n === '_top' ? 0 : n === '_bottom' ? 1 : 2);

export const ANCHOR_PRESETS = ['top', 'bottom', '_top', '_bottom'] as const;

/** Where a new anchor goes: over the drawing for 'top', at the baseline for 'bottom', at the mark's foot for '_top'… */
export function defaultAnchorPos(name: string, box: { x0: number; y0: number; x1: number; y1: number } | null, adv: number, xh: number): Pt {
  const x = box ? Math.round((box.x0 + box.x1) / 2) : Math.round(adv / 2);
  if (name === 'top') return { x, y: box ? Math.round(box.y1) : xh };
  if (name === 'bottom') return { x, y: box ? Math.round(Math.min(0, box.y0)) : 0 };
  if (name === '_top') return { x, y: box ? Math.round(box.y0) : 0 };
  if (name === '_bottom') return { x, y: box ? Math.round(box.y1) : 0 };
  return { x, y: box ? Math.round((box.y0 + box.y1) / 2) : Math.round(xh / 2) };
}

/** Anchor names are short labels: trimmed, at most 20 characters (the document's limit). */
export function cleanAnchorName(s: string): string | { error: string } {
  const n = s.trim().slice(0, 20);
  if (!n) return { error: 'Escribe un nombre.' };
  if (/\s/.test(n)) return { error: 'Sin espacios: por ejemplo «top» o «_top».' };
  return n;
}

export const anchorExists = (anchors: Anchor[], name: string, except = -1) => anchors.some((a, i) => i !== except && a.name === name);
