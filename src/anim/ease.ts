/**
 * Named speed curves in Spanish for keyframes and clips: each one is plain Ease data (a CSS cubic-bezier,
 * a step or a hold), so projects keep working without this list and the curve editor can start from any
 * of them. Pure.
 */
import { easeAt } from '../project/ease';
import type { Ease } from '../project/types';

export interface EasePreset {
  id: string;
  name: string;
  /** One line on how it moves. */
  blurb: string;
  ease: Ease;
}

const bz = (a: number, b: number, c: number, d: number): Ease => ({ kind: 'bezier', p: [a, b, c, d] });

export const EASE_PRESETS: EasePreset[] = [
  { id: 'lineal', name: 'Lineal', blurb: 'Velocidad constante, sin aceleración.', ease: { kind: 'linear' } },
  { id: 'suave', name: 'Suave', blurb: 'Arranca y se detiene despacio: el movimiento natural por defecto.', ease: bz(0.45, 0, 0.55, 1) },
  { id: 'acelera', name: 'Acelera', blurb: 'Empieza despacio y termina rápido (una salida).', ease: bz(0.55, 0, 1, 0.45) },
  { id: 'frena', name: 'Frena', blurb: 'Empieza rápido y se posa despacio (una llegada).', ease: bz(0, 0.55, 0.45, 1) },
  { id: 'impulso', name: 'Impulso', blurb: 'Un arranque muy rápido que se asienta largo rato.', ease: bz(0.16, 1, 0.3, 1) },
  { id: 'rebote-contenido', name: 'Rebote contenido', blurb: 'Se pasa un poco del final y vuelve, sin exagerar.', ease: bz(0.34, 1.45, 0.64, 1) },
  { id: 'anticipacion', name: 'Anticipación', blurb: 'Retrocede un poco antes de ir hacia delante.', ease: bz(0.5, -0.35, 0.75, 1) },
  { id: 'anticipa-y-rebota', name: 'Anticipa y rebota', blurb: 'Toma impulso hacia atrás y se pasa al llegar.', ease: bz(0.68, -0.55, 0.27, 1.55) },
  { id: 'lento-medio', name: 'Lento en el medio', blurb: 'Rápido al principio y al final, casi quieto en el centro.', ease: bz(0.1, 0.75, 0.9, 0.25) },
  { id: 'escalon', name: 'Escalón', blurb: 'Salta al valor siguiente enseguida.', ease: { kind: 'step' } },
  { id: 'mantener', name: 'Mantener', blurb: 'Se queda en su valor hasta la siguiente llave y ahí salta.', ease: { kind: 'hold' } },
  { id: 'css-in', name: 'Entrada (CSS)', blurb: 'La curva ease-in de CSS.', ease: { kind: 'in' } },
  { id: 'css-out', name: 'Salida (CSS)', blurb: 'La curva ease-out de CSS.', ease: { kind: 'out' } },
  { id: 'css-inout', name: 'Entrada y salida (CSS)', blurb: 'La curva ease-in-out de CSS.', ease: { kind: 'inOut' } },
];

export const easePreset = (id: string) => EASE_PRESETS.find(e => e.id === id);

/** A copy of a preset's ease (linear when the id is unknown). */
export function easeFromPreset(id: string): Ease {
  const e = easePreset(id)?.ease ?? { kind: 'linear' };
  return e.kind === 'bezier' ? { kind: 'bezier', p: [...e.p] } : { kind: e.kind };
}

/** The preset an ease is (to 3 decimals), or null for a custom curve. */
export function presetOf(e: Ease): EasePreset | null {
  for (const pr of EASE_PRESETS) {
    const a = pr.ease;
    if (a.kind !== e.kind) continue;
    if (a.kind !== 'bezier' || e.kind !== 'bezier') return pr;
    if (a.p.every((v, i) => Math.abs(v - e.p[i]) < 5e-4)) return pr;
  }
  return null;
}

/** A short Spanish label for any ease («Suave», «Curva propia»). */
export function easeLabel(e: Ease): string {
  return presetOf(e)?.name ?? 'Curva propia';
}

/** Whether two eases are the same curve. */
export function sameEase(a: Ease, b: Ease): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'bezier' && b.kind === 'bezier') return a.p.every((v, i) => Math.abs(v - b.p[i]) < 1e-9);
  return true;
}

/** Samples of an ease for a small curve drawing: n + 1 points (x, y). */
export function easeSamples(e: Ease, n = 32): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const x = i / n; out.push([x, easeAt(e, x)]); }
  return out;
}
