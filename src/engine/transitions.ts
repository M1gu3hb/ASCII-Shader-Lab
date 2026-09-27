/**
 * Transitions between two pieces on a live stage: the old frame comes apart into glyphs and the new one
 * resolves out of them. Both engines draw the same ones (COMPOSE_FS in glsl/programs.ts, and
 * basic/transition.ts for the Canvas 2D engine), cell by cell on the screen grid, so they look alike.
 * The clock of a transition starts with the first frame of the new piece (see the engines' set()).
 */
export type TransitionKind = 'tejido' | 'disolucion' | 'lluvia' | 'iris' | 'barrido' | 'mosaico';

export interface TransitionInfo {
  id: TransitionKind;
  name: string;
  /** What it looks like, for the choice in the dice settings. */
  blurb: string;
  /** Costs more on the basic engine (it redraws the frame block by block): left out of the low-load set. */
  heavy?: boolean;
}

export const TRANSITIONS: TransitionInfo[] = [
  { id: 'tejido', name: 'Tejido', blurb: 'una trama de glifos cruza la pieza' },
  { id: 'disolucion', name: 'Disolución', blurb: 'cada celda se deshace por la rampa de glifos' },
  { id: 'lluvia', name: 'Lluvia', blurb: 'la pieza nueva cae en columnas' },
  { id: 'iris', name: 'Iris', blurb: 'se abre en círculo desde el centro o desde el puntero' },
  { id: 'barrido', name: 'Barrido', blurb: 'un escaneo en diagonal' },
  { id: 'mosaico', name: 'Mosaico', blurb: 'de celdas grandes a finas', heavy: true },
];

/** Index of each kind in the compose shader (uTransKind). */
export const TRANSITION_INDEX: Record<TransitionKind, number> = { tejido: 0, disolucion: 1, lluvia: 2, iris: 3, barrido: 4, mosaico: 5 };

export interface TransitionSpec {
  kind: TransitionKind;
  /** Seconds. */
  duration: number;
  /** Where an iris opens, 0..1 of the canvas from the top left (default: the centre). */
  origin?: [number, number];
  /** Direction of a sweep: 1 left to right, -1 right to left (going back in the history). */
  dir?: 1 | -1;
  /** Varies the random parts (which cells go first) from one transition to the next. */
  seed?: number;
}

export const DEFAULT_TRANSITION: TransitionSpec = { kind: 'tejido', duration: 0.85 };

/** `true` (the default transition), a spec, or nothing. */
export function transitionOf(t: boolean | TransitionSpec | null | undefined): TransitionSpec | null {
  if (!t) return null;
  if (t === true) return DEFAULT_TRANSITION;
  const kind = TRANSITIONS.some(x => x.id === t.kind) ? t.kind : 'tejido';
  return { ...t, kind, duration: Math.min(3, Math.max(0.12, Number.isFinite(t.duration) ? t.duration : 0.85)) };
}

/** Mosaico's block size (in cells) at progress p: 16, 8, 4, 2, then 1 (the piece itself). */
export const mosaicBlock = (p: number) => 16 >> Math.min(4, Math.max(0, Math.floor(p * 5)));
