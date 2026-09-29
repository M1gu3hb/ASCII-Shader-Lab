/**
 * Depth and parallax (additive helper of the animation library). Each layer has a depth (LayerBase.depth:
 * 0 = the frame's plane, positive = nearer the viewer, negative = farther). A camera move is written as
 * ordinary keyframes of each layer's placement (xf.x, xf.y, xf.scale), scaled by its depth, so the timeline
 * shows and edits them and every export plays them exactly:
 *
 *   pan     the camera slides and comes back: near layers move against it, far ones with it, the plane stays;
 *   zoom    the camera moves in: everything grows, near layers more than far ones;
 *   orbit   the camera circles the plane in a loop.
 *
 * Layers that fill the frame and move are drawn a little larger (overscan), so their edges never show.
 * PARALLAX_PRESETS: «Paralaje suave», «Acercamiento», «Órbita».
 */
import type { Ease, Id, Key, Layer, Project, Track } from '../project/types';

export type CameraKind = 'pan' | 'zoom' | 'orbit';

export interface CameraMove {
  kind: CameraKind;
  /** Strength: pan/orbit = the offset (frame units) of a layer at depth 1; zoom = extra scale of the plane. */
  amount: number;
  /** Pan direction in degrees (0 = the camera moves right). */
  dir?: number;
  /** Seconds of one move (a pan out and back, one orbit, the zoom). */
  dur: number;
  start?: number;
  ease?: Ease;
}

export interface ParallaxPreset { id: string; name: string; blurb: string; move: CameraMove }

export const PARALLAX_PRESETS: ParallaxPreset[] = [
  { id: 'suave', name: 'Paralaje suave', blurb: 'La cámara se desliza de lado y vuelve: lo cercano se mueve más que el fondo.', move: { kind: 'pan', amount: 0.03, dir: 0, dur: 6 } },
  { id: 'acercamiento', name: 'Acercamiento', blurb: 'La cámara avanza despacio: el sujeto crece más que el fondo.', move: { kind: 'zoom', amount: 0.12, dur: 5, ease: { kind: 'inOut' } } },
  { id: 'orbita', name: 'Órbita', blurb: 'La cámara da una vuelta alrededor del sujeto, en bucle.', move: { kind: 'orbit', amount: 0.028, dur: 6 } },
];

export const parallaxPreset = (id: string) => PARALLAX_PRESETS.find(p => p.id === id);

/** Keys per turn of a pan or an orbit (linear between them: smooth at studio frame rates). */
const STEPS = 24;
const PATHS = ['xf.x', 'xf.y', 'xf.scale'] as const;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5 || 0;

/** The camera's position at a fraction u (0..1) of the move: x, y in −1..1 and z in 0..1. */
export function cameraAt(m: CameraMove, u: number): { x: number; y: number; z: number } {
  const a = 2 * Math.PI * u;
  if (m.kind === 'pan') {
    const d = ((m.dir ?? 0) * Math.PI) / 180, s = Math.sin(a);
    return { x: s * Math.cos(d), y: s * Math.sin(d), z: 0 };
  }
  // an ellipse through the rest position (u = 0), half as tall as it is wide
  if (m.kind === 'orbit') return { x: Math.sin(a), y: 0.5 * (1 - Math.cos(a)), z: 0 };
  return { x: 0, y: 0, z: u };
}

/** Whether a layer fills the frame with a picture (then it is drawn larger while it moves). */
export function fillsFrame(p: Project, l: Layer): boolean {
  if (l.kind !== 'photo' && l.kind !== 'ascii' && l.kind !== 'glyphs') return false;
  if (l.mask && !l.mask.off && l.mask.parts.some(x => x.op === 'add' || x.op === 'intersect')) return false;
  const s = 'source' in l ? p.sources.find(x => x.id === l.source) : null;
  return !s || s.kind !== 'cutout';
}

export interface ParallaxPlan { tracks: Track[]; moved: Id[]; overscan: Record<Id, number> }

/** The keyframes of a camera move on every layer with a depth (pure). */
export function parallaxTracks(p: Project, m: CameraMove): ParallaxPlan {
  const start = Math.max(0, m.start ?? 0), dur = Math.max(0.2, m.dur);
  const tracks: Track[] = [];
  const moved: Id[] = [];
  const overscan: Record<Id, number> = {};
  const lin: Ease = { kind: 'linear' };
  for (const l of p.layers) {
    const depth = l.depth ?? 0;
    if (m.kind !== 'zoom' && Math.abs(depth) < 1e-3) continue;
    const base = l.xf;
    // pan/orbit: the most a layer moves; overscan covers it on both sides
    const reach = m.kind === 'zoom' ? 0 : Math.abs(m.amount * depth) * 1.02;
    const over = fillsFrame(p, l) && reach > 0 ? 1 + 2 * reach + 0.004 : 1;
    if (over > 1) overscan[l.id] = r5(over);
    const keys: Record<(typeof PATHS)[number], Key[]> = { 'xf.x': [], 'xf.y': [], 'xf.scale': [] };
    if (m.kind === 'zoom') {
      // (a far layer that fills the frame never shrinks: its edges would show)
      const k = Math.max(fillsFrame(p, l) ? 1 : 0.05, 1 + m.amount * (1 + depth * 0.6));
      const ease = m.ease ?? { kind: 'inOut' };
      keys['xf.scale'].push({ t: start, v: r5(base.scale), ease }, { t: start + dur, v: r5(base.scale * k), ease: lin });
      // off-centre layers drift outwards as they grow (a camera moving in along the centre line)
      if (Math.abs(base.x) > 1e-4 || Math.abs(base.y) > 1e-4) {
        keys['xf.x'].push({ t: start, v: r5(base.x), ease }, { t: start + dur, v: r5(base.x * k), ease: lin });
        keys['xf.y'].push({ t: start, v: r5(base.y), ease }, { t: start + dur, v: r5(base.y * k), ease: lin });
      }
    } else {
      for (let i = 0; i <= STEPS; i++) {
        const u = i / STEPS, c = cameraAt(m, u), t = start + u * dur;
        keys['xf.x'].push({ t: r5(t), v: r5(base.x - m.amount * depth * c.x), ease: lin });
        keys['xf.y'].push({ t: r5(t), v: r5(base.y - m.amount * depth * c.y), ease: lin });
      }
      if (over > 1) keys['xf.scale'].push({ t: start, v: r5(base.scale * over), ease: lin });
    }
    let any = false;
    for (const path of PATHS) {
      const ks = keys[path];
      if (!ks.length) continue;
      // a track whose value never changes is left out (the layer keeps its own value)
      if (path !== 'xf.scale' && ks.every(k => k.v === ks[0].v)) continue;
      tracks.push({ layer: l.id, path, keys: ks });
      any = true;
    }
    if (any) moved.push(l.id);
  }
  return { tracks, moved, overscan };
}

/**
 * Puts a camera move on a project (a draft, changed in place): its placement keys replace the layers' own
 * xf keys, the timeline grows to hold it and loops (pans and orbits end where they start). Returns what it did.
 */
export function applyParallax(d: Project, m: CameraMove): { moved: number; replaced: number } {
  const plan = parallaxTracks(d, m);
  const touched = new Set(plan.moved);
  const before = d.tracks.length;
  d.tracks = d.tracks.filter(t => !(touched.has(t.layer) && (PATHS as readonly string[]).includes(t.path)));
  const replaced = before - d.tracks.length;
  d.tracks.push(...plan.tracks);
  const end = Math.max(0, m.start ?? 0) + Math.max(0.2, m.dur);
  if (d.time.duration < end) d.time = { ...d.time, duration: +end.toFixed(3) };
  if (m.kind !== 'zoom') d.time = { ...d.time, loop: true };
  return { moved: plan.moved.length, replaced };
}

/** Removes the placement keys of every layer that has a depth (the camera move). Returns how many tracks went. */
export function removeParallax(d: Project): number {
  const deep = new Set(d.layers.filter(l => (l.depth ?? 0) !== 0 || d.tracks.some(t => t.layer === l.id && t.path === 'xf.scale')).map(l => l.id));
  const before = d.tracks.length;
  d.tracks = d.tracks.filter(t => !(deep.has(t.layer) && (PATHS as readonly string[]).includes(t.path)));
  return before - d.tracks.length;
}

/** Whether a project has a camera move (placement keys on layers with a depth). */
export const hasParallax = (p: Project) => p.tracks.some(t => (PATHS as readonly string[]).includes(t.path) && (p.layers.find(l => l.id === t.layer)?.depth ?? 0) !== 0);
