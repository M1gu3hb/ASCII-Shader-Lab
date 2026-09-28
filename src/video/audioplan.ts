/**
 * Which sound an export carries and where (pure; audio.ts writes it).
 *
 * The sound is the one of ONE video source of the project: by default the source of the bottom-most layer that
 * shows a video with sound (usually the original video at the bottom of the stack); MovieOptions.audioSource
 * picks another. It follows that source's picture exactly: at export time t the sound is the file's sound at the
 * same time the picture is taken from (evaluate(...).layers[k].srcTime), so a video that loops loops its sound,
 * and nothing is heard while no layer shows that source (outside its span).
 *
 * Stretches where the picture does not advance at normal speed (a speed change, reverse playback, a frozen
 * frame — possible through evaluate's source times) are left silent rather than played at the wrong speed:
 * `gaps` lists them with the reason, `notes` says so in Spanish.
 */
import { evaluate, frameTimes } from '../project/evaluate';
import type { Id, Project, Source } from '../project/types';

export interface AudioSeg {
  /** Seconds from the start of the export. */
  out: number;
  /** Seconds into the source (its own clock, as its picture). */
  src: number;
  dur: number;
}

export type GapReason = 'hidden' | 'speed' | 'reverse' | 'still';
export interface AudioGap { out: number; dur: number; why: GapReason }

export interface AudioPlan {
  source: Source | null;
  segments: AudioSeg[];
  gaps: AudioGap[];
  /** Length of the export in seconds. */
  total: number;
  /** One segment from the start to the end: a straight copy of a trimmed range is possible. */
  straight: boolean;
  notes: string[];
}

const EPS = 1e-6;

/** Video sources shown by layers, bottom to top, each once. */
export function videoSourcesInOrder(p: Project): Source[] {
  const out: Source[] = [];
  for (const l of p.layers) {
    if (!('source' in l)) continue;
    const s = p.sources.find(x => x.id === l.source);
    if (s?.kind === 'video' && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * The source whose sound goes out: `prefer` when it is a video source with sound, else the bottom-most video
 * source with sound. `hasAudio` answers for each source (the project's flag, or what the file really has).
 */
export function pickAudioSource(p: Project, prefer?: Id | null, hasAudio: (s: Source) => boolean = s => !!s.hasAudio): Source | null {
  const list = videoSourcesInOrder(p).filter(hasAudio);
  if (prefer) {
    const s = list.find(x => x.id === prefer);
    if (s) return s;
  }
  return list[0] ?? null;
}

/** Source time of `sourceId` at project time t (the bottom-most layer showing it), or null when none shows it. */
export function sourceClock(p: Project, sourceId: Id, t: number): number | null {
  const lf = evaluate(p, t).layers.find(l => l.source?.id === sourceId);
  return lf ? lf.srcTime : null;
}

const fmt = (s: number) => `${(Math.round(s * 10) / 10).toString().replace('.', ',')} s`;

/**
 * The plan for an export of [start, end) at `fps` (the same frame times as the picture). `clock` is for tests
 * (defaults to sourceClock on the project).
 */
export function planAudio(
  p: Project,
  o: { start?: number; end?: number; fps?: number; source: Source | null; clock?: (t: number) => number | null },
): AudioPlan {
  const fps = o.fps && o.fps > 0 ? o.fps : p.time.fps;
  const times = frameTimes(p, { fps, from: o.start ?? 0, to: o.end ?? p.time.duration });
  const dt = 1 / fps;
  const total = times.length * dt;
  const plan: AudioPlan = { source: o.source, segments: [], gaps: [], total, straight: false, notes: [] };
  const src = o.source;
  if (!src) return plan;
  const clock = o.clock ?? ((t: number) => sourceClock(p, src.id, t));
  const d = src.duration && src.duration > 0 ? src.duration : Infinity;
  const s = times.map(t => clock(t));
  const start = times[0];

  const addSeg = (out: number, from: number, dur: number) => {
    if (dur <= EPS) return;
    const last = plan.segments[plan.segments.length - 1];
    if (last && Math.abs(last.out + last.dur - out) < EPS && Math.abs(last.src + last.dur - from) < 1e-4) last.dur += dur;
    else plan.segments.push({ out, src: from, dur });
  };
  const addGap = (out: number, dur: number, why: GapReason) => {
    if (dur <= EPS) return;
    const last = plan.gaps[plan.gaps.length - 1];
    if (last && last.why === why && Math.abs(last.out + last.dur - out) < EPS) last.dur += dur;
    else plan.gaps.push({ out, dur, why });
  };

  // how the picture advances from frame i to i+1: 1 (normal, possibly wrapping at the end of the file) or a gap
  const classify = (i: number): 'normal' | GapReason => {
    const a = s[i], b = s[i + 1];
    if (a === null) return 'hidden';
    if (b === null || b === undefined) return 'normal';
    const delta = b - a;
    if (Math.abs(delta - dt) < 1e-4) return 'normal';
    // the file ended and started again
    if (Number.isFinite(d) && b < a && Math.abs(a + dt - d - b) < 1e-4) return 'normal';
    if (Math.abs(delta) < 1e-6) return 'still';
    return delta > 0 ? 'speed' : 'reverse';
  };
  let prevClass: 'normal' | GapReason = 'normal';
  for (let i = 0; i < times.length; i++) {
    const out = times[i] - start;
    let c = classify(i);
    // the last frame has no next one: it continues like the one before (or plays normally)
    if (i === times.length - 1 && s[i] !== null && i > 0) c = prevClass === 'hidden' ? 'normal' : prevClass;
    prevClass = c;
    if (c !== 'normal') { addGap(out, dt, c); continue; }
    const a = s[i]!;
    if (a + dt > d + EPS) {
      // wraps inside this frame
      const first = Math.max(0, d - a);
      addSeg(out, a, first);
      addSeg(out + first, 0, dt - first);
    } else addSeg(out, a, dt);
  }
  plan.straight = plan.gaps.length === 0 && plan.segments.length === 1 && plan.segments[0].out < EPS && Math.abs(plan.segments[0].dur - total) < 1e-4;

  const hidden = plan.gaps.filter(g => g.why === 'hidden');
  const moved = plan.gaps.filter(g => g.why !== 'hidden');
  if (plan.segments.some((g, k) => k > 0 && g.src < plan.segments[k - 1].src + plan.segments[k - 1].dur - 1e-3)) plan.notes.push('El video se repite y su sonido también.');
  if (hidden.length) plan.notes.push(`Sin sonido mientras «${src.name}» no se ve (${hidden.map(g => `${fmt(g.out)}–${fmt(g.out + g.dur)}`).join(', ')}).`);
  if (moved.length) {
    const why = [...new Set(moved.map(g => (g.why === 'reverse' ? 'en reversa' : g.why === 'still' ? 'congelados' : 'con otra velocidad')))].join(' o ');
    plan.notes.push(`Sin sonido en los tramos ${why} (${moved.map(g => `${fmt(g.out)}–${fmt(g.out + g.dur)}`).join(', ')}): ese sonido no se acelera ni se invierte aquí.`);
  }
  return plan;
}
