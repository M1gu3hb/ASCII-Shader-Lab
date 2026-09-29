/**
 * The photo studio's dice. Two scopes:
 *   - «Capa»: a new style for the selected layer: an ASCII layer rolls the lab's generator (core
 *     rollProject), a real-characters layer rolls its alphabet, cell, tone and colours here;
 *   - «Todo»: every unlocked ASCII and characters layer at once, plus the finishes' settings (unless
 *     «Efectos» is locked) and, when «Selección» is not kept, a small move of the rectangular and elliptic
 *     zones of the masks.
 * Locks: the lab's groups (forma, color, glifos, movimiento, efectos) and the studio's keep set
 * (seleccion = masks stay, paleta = colours stay). A layer with its own lock (Layer.locked) never changes.
 * Deterministic: the same seed on the same project gives the same result (src/random Rng, no Math.random).
 */
import { FINISHES } from '../fx/index';
import { CHARSET_LIST } from '../glyphs/charsets';
import { rollProject, type KeepLock } from '../project/dice';
import { cloneProject } from '../project/normalize';
import type { GlyphStyle, GlyphsLayer, Id, Layer, Project } from '../project/types';
import { CURATED, Rng, type LockGroup } from '../random';

export interface StudioDice { locks: LockGroup[]; keep: KeepLock[]; seed: string; seen?: Set<string> }

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A new characters style (glyphs layer), honouring the locks. */
export function rollGlyphs(g: GlyphStyle, rng: Rng, locks: LockGroup[], keep: KeepLock[]): GlyphStyle {
  const out = { ...g, palette: [...g.palette] };
  if (!locks.includes('glifos')) {
    const pool = CHARSET_LIST.filter(c => !c.user && c.id !== g.charset);
    out.charset = rng.pick(pool).id;
    out.fill = 'ramp';
    out.edge = rng.chance(0.3) ? r2(rng.range(0.1, 0.6)) : 0;
    out.contrast = r2(rng.range(0.8, 1.8));
    out.gamma = r2(rng.range(0.7, 1.4));
    out.invert = rng.chance(0.2) ? !g.invert : g.invert;
  }
  if (!locks.includes('forma')) {
    out.cell = Math.round(rng.range(6, 16));
    out.aspect = rng.pick([1, 1.4, 1.7, 2]);
  }
  if (!locks.includes('color') && !keep.includes('paleta')) {
    const pal = rng.pick(CURATED);
    const mode = rng.pick(['mono', 'source', 'palette'] as const);
    out.color = mode;
    out.ink = pal.stops[pal.stops.length - 1];
    out.palette = [...pal.stops];
    if (out.paper !== null) out.paper = pal.bg;
  }
  return out;
}

/** The finishes' settings shaken within their ranges (kind and order stay). */
function rollFinishes(l: Layer, rng: Rng): void {
  for (const f of l.finishes) {
    const def = FINISHES.find(d => d.kind === f.kind);
    if (!def) continue;
    f.amount = r2(rng.range(0.45, 1));
    for (const p of def.params) {
      if (!rng.chance(0.5)) continue;
      if (p.type === 'range') f.params[p.key] = Math.round((rng.range(p.min, p.max) / p.step)) * p.step;
      else if (p.type === 'select' && p.key !== 'palette' && p.key !== 'color') f.params[p.key] = rng.pick(p.options)[0];
    }
  }
}

/** Rectangles and ellipses of a mask moved and resized a little (at most 6 % of the frame). */
function nudgeMask(l: Layer, rng: Rng): void {
  for (const part of l.mask?.parts ?? []) {
    if (part.kind !== 'rect' && part.kind !== 'ellipse') continue;
    part.x = r2(part.x + rng.range(-0.06, 0.06));
    part.y = r2(part.y + rng.range(-0.06, 0.06));
    const s = rng.range(0.9, 1.1);
    part.w = r2(part.w * s);
    part.h = r2(part.h * s);
  }
}

/** One layer rolled (an ASCII style through the lab's generator, characters here). Unchanged when locked or of another kind. */
export function rollLayer(p: Project, id: Id, o: StudioDice): Project {
  const l = p.layers.find(x => x.id === id);
  if (!l || l.locked) return p;
  if (l.kind === 'ascii') return rollProject(p, { layer: id, locks: o.locks, keep: o.keep, seed: `${o.seed}:${id}`, ...(o.seen ? { seen: o.seen } : {}) }).project;
  if (l.kind === 'glyphs') {
    const q = cloneProject(p);
    const g = q.layers.find(x => x.id === id) as GlyphsLayer;
    g.glyphs = rollGlyphs(g.glyphs, new Rng(`${o.seed}:${id}:glifos`), o.locks, o.keep);
    q.updated = Date.now();
    return q;
  }
  return p;
}

/** The whole composition rolled (see the top of this file). */
export function rollComposition(p: Project, o: StudioDice): Project {
  let q = p;
  for (const l of p.layers) if (!l.locked && (l.kind === 'ascii' || l.kind === 'glyphs')) q = rollLayer(q, l.id, o);
  q = q === p ? cloneProject(p) : q;
  for (const l of q.layers) {
    if (l.locked) continue;
    const rng = new Rng(`${o.seed}:${l.id}:todo`);
    if (!o.locks.includes('efectos') && l.finishes.length) rollFinishes(l, rng.fork('acabados'));
    if (!o.keep.includes('seleccion') && l.mask) nudgeMask(l, rng.fork('zonas'));
  }
  q.updated = Date.now();
  return q;
}

/** Layers the dice can change in a project (for the button's reason when there are none). */
export const rollable = (p: Project) => p.layers.filter(l => !l.locked && (l.kind === 'ascii' || l.kind === 'glyphs' || l.finishes.length > 0));

/** A fresh seed (an identity for a roll; what it draws is decided by the seed alone). */
export function freshSeed(): string {
  const A = 'abcdefghijkmnopqrstuvwxyz23456789';
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => A[x % A.length]).join('');
}
