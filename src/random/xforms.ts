import { XFORMS } from '../engine/catalog';
import type { LetterAnimKind, Xform, XformKind } from '../engine/recipe';
import type { Archetype } from './archetypes';
import { round, type Rng } from './prng';

/*
 * Transformations of the photo or the letters, and letters that move: how the dice draw them (versions 3 and
 * later; version 5 adds the library's letter animations to the weights, gen5.ts).
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type XW = Partial<Record<XformKind, number>>;
/** Which transformations suit each style (the rest of the styles use DEFAULT_XF). */
const XF_BY_ARCH: Record<string, XW> = {
  minimal: { semitono: 1.2, bandas: 1, bloques: 0.5, contorno: 0.5, ondular: 0.6 },
  neon: { contorno: 2, canales: 1, estela: 1.2, caleido: 0.8, ondular: 0.6 },
  retro: { bloques: 1.5, bandas: 1.3, semitono: 1, canales: 0.8 },
  tinta: { semitono: 1.6, contorno: 1, bandas: 1.2, arrastre: 0.5 },
  glitch: { arrastre: 2, canales: 1.8, bloques: 1, desplazar: 1, estela: 0.8 },
  brutal: { bandas: 1.6, bloques: 1.3, contorno: 1, semitono: 0.8 },
  organico: { ondular: 1.6, desplazar: 1.4, caleido: 0.7, estela: 0.6 },
  op: { caleido: 1.8, semitono: 1.2, canales: 0.8, bandas: 0.6 },
  geometrico: { caleido: 1.5, bloques: 1.2, semitono: 1, contorno: 0.6 },
  cosmico: { caleido: 1.2, estela: 1.2, desplazar: 1, contorno: 0.8 },
  vapor: { ondular: 1.3, canales: 1.2, caleido: 1, bandas: 0.8 },
  fractal: { caleido: 1.6, desplazar: 1.2, contorno: 0.8 },
};
const DEFAULT_XF: XW = { semitono: 1, contorno: 1, bandas: 1, caleido: 1, ondular: 0.8, canales: 0.7, bloques: 0.7, arrastre: 0.6, desplazar: 0.6 };
/** Ranges of the kind's own setting the dice keep to (outside them a transformation rarely looks good). */
const XF_P: Partial<Record<XformKind, [number, number]>> = {
  semitono: [0.05, 0.4], contorno: [0, 0.5], bandas: [0, 0.35], bloques: [0.1, 0.5], arrastre: [0.15, 0.5], ondular: [0.1, 0.6], estela: [0.2, 0.7],
};
export const TEXT_ANIM_W: Partial<Record<LetterAnimKind, number>> = { ola: 1.2, rebote: 1, latido: 0.8, revolver: 1, palabras: 0.9, explosion: 0.8, brillo: 1 };
export const MSG_ANIM_W: Partial<Record<LetterAnimKind, number>> = { ola: 1, rebote: 0.8, revolver: 1.2, color: 1.2, explosion: 0.4 };

/** A few transformations for a source, in an order that reads well (moves first, then colour, then light). */
export function drawXforms(rng: Rng, A: Archetype, n: number, moving: boolean, pool?: XformKind[]): Xform[] {
  const w: XW = { ...(XF_BY_ARCH[A.id] ?? DEFAULT_XF) };
  if (!moving) delete w.estela;
  if (pool) for (const k of Object.keys(w) as XformKind[]) if (!pool.includes(k)) delete w[k];
  const out: Xform[] = [];
  for (let i = 0; i < n && Object.keys(w).length; i++) {
    const kind = rng.weighted(w);
    delete w[kind];
    const info = XFORMS.find(x => x.id === kind)!;
    const pr = XF_P[kind] ?? [0, 1];
    out.push({ kind, on: true, amount: round(clamp(info.defaults.amount * rng.range(0.75, 1.1), 0.15, 1)), p: round(rng.range(pr[0], pr[1])) });
  }
  const order: XformKind[] = ['caleido', 'desplazar', 'ondular', 'bloques', 'arrastre', 'bandas', 'semitono', 'contorno', 'canales', 'estela'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
