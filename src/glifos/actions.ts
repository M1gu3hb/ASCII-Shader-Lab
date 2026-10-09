/**
 * Actions on one character or a group (the board's selection, a whole group, everything): accept, lock,
 * discard a proposal, mark references. Each is one undo step and says what it did and what it left alone;
 * nothing here touches a locked glyph, and nothing replaces a drawing the person made or corrected.
 */
import { MARKS, emptyGlyph, hasDrawing, type Glyph, type GlyphDoc } from './doc';
import { edit, useGlifos } from './state';

export interface ActionResult { changed: string[]; kept: Array<{ ch: string; why: string }> }

function run(chars: string[], label: string, fn: (g: Glyph, d: GlyphDoc) => string | null): ActionResult {
  const res: ActionResult = { changed: [], kept: [] };
  const doc = useGlifos.getState().doc;
  if (!doc) return res;
  const todo = chars.filter(c => doc.glyphs[c]);
  edit(d => {
    for (const ch of todo) {
      const why = fn(d.glyphs[ch], d);
      if (why) res.kept.push({ ch, why }); else res.changed.push(ch);
    }
  }, label, { glyphs: todo });
  return res;
}

/** Accept: a proposal or a drawing becomes final. Locked and empty glyphs stay as they are. */
export const acceptGlyphs = (chars: string[]) => run(chars, chars.length === 1 ? `Aceptar ${chars[0]}` : `Aceptar ${chars.length} caracteres`, g => {
  if (g.status === 'bloqueado') return 'bloqueado';
  if (!hasDrawing(g)) return 'sin dibujo';
  if (g.status === 'aceptado') return 'ya aceptado';
  g.status = 'aceptado';
  return null;
});

/** Lock: nothing (the assistant, a group action) changes it until unlocked. */
export const lockGlyphs = (chars: string[]) => run(chars, 'Bloquear', g => {
  if (g.status === 'bloqueado') return 'ya bloqueado';
  if (!hasDrawing(g)) return 'sin dibujo';
  g.status = 'bloqueado';
  return null;
});

export const unlockGlyphs = (chars: string[]) => run(chars, 'Desbloquear', g => {
  if (g.status !== 'bloqueado') return 'no estaba bloqueado';
  g.status = g.origin === 'asistente' && !g.corrected ? 'propuesto' : 'dibujado';
  return null;
});

/**
 * Discard proposals: back to empty. A proposal the person corrected is only discarded when `corrected` is
 * explicitly allowed (the UI asks first).
 */
export const discardProposals = (chars: string[], corrected = false) => run(chars, 'Descartar propuestas', (g, d) => {
  if (g.status !== 'propuesto') return g.status === 'bloqueado' ? 'bloqueado' : 'no es una propuesta';
  if (g.corrected && !corrected) return 'corregida por ti';
  d.glyphs[g.ch] = emptyGlyph(g.ch, d);
  return null;
});

/** Clears a glyph the person drew (explicit, one character, undoable). */
export function clearGlyph(ch: string) {
  return run([ch], `Borrar ${ch}`, (g, d) => {
    if (g.status === 'bloqueado') return 'bloqueado';
    const fresh = emptyGlyph(ch, d);
    // the picture stays as a guide: clearing the outline never loses what the person imported
    if (g.raster) fresh.raster = { ...g.raster, use: 'guia' };
    d.glyphs[ch] = fresh;
    return null;
  });
}

/**
 * References: characters the assistant learns the style from. A reference with a drawing is locked at once
 * (the original never changes behind the person's back); removing it as a reference leaves it locked.
 */
export function toggleReference(ch: string): ActionResult {
  const doc = useGlifos.getState().doc;
  if (!doc?.glyphs[ch]) return { changed: [], kept: [] };
  const on = !doc.refs.includes(ch);
  if (on && !hasDrawing(doc.glyphs[ch])) return { changed: [], kept: [{ ch, why: 'sin dibujo: dibújalo o impórtalo primero' }] };
  edit(d => {
    d.refs = on ? [...d.refs, ch].slice(0, 12) : d.refs.filter(c => c !== ch);
    if (on) d.glyphs[ch].status = 'bloqueado';
  }, on ? `Usar ${ch} como referencia` : `Quitar ${ch} de las referencias`, { glyphs: [ch] });
  return { changed: [ch], kept: [] };
}

/**
 * Builds accented letters from their base and mark (components, placed by anchors). Never on a glyph that is
 * drawn, accepted, locked or corrected; reports the ones whose pieces are missing.
 */
export function composeAccents(chars?: string[]): ActionResult {
  const doc = useGlifos.getState().doc;
  const list = (chars ?? Object.keys(MARKS)).filter(c => MARKS[c] && doc?.glyphs[c]);
  return run(list, 'Componer acentos', (g, d) => {
    if (g.status !== 'vacio' && !(g.status === 'propuesto' && !g.corrected)) return g.status === 'bloqueado' ? 'bloqueado' : 'ya tiene dibujo';
    const mk = MARKS[g.ch];
    const base = d.glyphs[mk.base] && hasDrawing(d.glyphs[mk.base]) ? mk.base : mk.base === 'ı' && d.glyphs.i && hasDrawing(d.glyphs.i) ? 'i' : null;
    if (!base) return `falta ${mk.base}`;
    if (!d.glyphs[mk.mark] || !hasDrawing(d.glyphs[mk.mark])) return `falta el acento ${mk.mark}`;
    const b = d.glyphs[base], m = d.glyphs[mk.mark];
    const at = b.anchors.find(a => a.name === mk.anchor), mat = m.anchors.find(a => a.name === '_' + mk.anchor);
    // without anchors: the mark centred over the base's advance, above its x-height or cap height
    const top = /\p{Lu}/u.test(g.ch) ? d.metrics.cap : d.metrics.xh;
    const dx = at && mat ? at.x - mat.x : (b.adv - m.adv) / 2;
    const dy = at && mat ? at.y - mat.y : top + d.metrics.upm * 0.06;
    g.components = [{ of: base, dx: 0, dy: 0 }, { of: mk.mark, dx: Math.round(dx), dy: Math.round(dy) }];
    g.contours = [];
    g.adv = b.adv;
    g.origin = 'componentes';
    g.status = 'propuesto';
    return null;
  });
}

/** One line saying what an action did and what it left alone (for the status line). */
export function describeResult(verb: string, r: ActionResult): string {
  const parts = [r.changed.length ? `${verb}: ${r.changed.length}` : `Nada que ${verb.toLowerCase()}`];
  const why = new Map<string, string[]>();
  for (const k of r.kept) why.set(k.why, [...(why.get(k.why) ?? []), k.ch]);
  for (const [w, cs] of why) parts.push(`${cs.length} sin cambiar (${w}: ${cs.slice(0, 8).join(' ')}${cs.length > 8 ? '…' : ''})`);
  return parts.join(' · ');
}
