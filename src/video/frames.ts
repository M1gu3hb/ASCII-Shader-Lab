/**
 * Frames for the export loop, streamed.
 *
 * The core's frame-exact provider (project/sources.ts openExactVideo) answers each seek with
 * CanvasSink.getCanvas(t), which starts a new decoder at the key frame before t every time: exact, but a whole
 * group of pictures decoded per exported frame (tens of frames for one). An export knows every time it will ask
 * for in advance, so this provider hands mediabunny the whole list at once (canvasesAtTimestamps: each packet
 * decoded once, a few frames ahead, bounded memory) and serves them in order. The pictures are the same: the
 * same CanvasSink settings (size, fit 'fill', alpha), the same timestamps (the file's first timestamp + t), drawn
 * the same way into the canvas the compositor reads. Anything asked out of order, images, sequences and masks go
 * to the core provider (exact mode), which also falls back to the video element when WebCodecs cannot decode.
 *
 * Also here: a frame's raster masks trimmed to the one or two stored pictures it shows (the compositor prepares
 * every picture of a mask part; a tracked mask has one per frame).
 */
import { evaluate, type FrameState } from '../project/evaluate';
import { rasterFrames } from '../project/masks';
import { createSourceProvider, FRAME_EPS, storeBlob, type BlobResolver, type Drawable, type SourceProvider } from '../project/sources';
import type { MaskPart, Project, Source } from '../project/types';

type Mb = typeof import('mediabunny');

/** Same sizing as project/sources.ts (fitSize). */
function fitSize(w: number, h: number, maxSide: number) {
  const k = Math.min(1, maxSide / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** The source time each export frame asks of a video source (as the compositor computes it). */
export function sourceTimesOf(p: Project, s: Source, times: readonly number[]): number[] {
  const d = s.duration ?? 0;
  return times.map(t => {
    const st = evaluate(p, t);
    const lf = st.layers.find(l => l.source?.id === s.id);
    if (lf) return lf.srcTime;
    return d > 0 ? ((st.t % d) + d) % d : st.t;
  });
}

/** Video sources a project's frames may need (layer sources and colour-mask sources). */
export function videoSourcesUsed(p: Project): Source[] {
  const ids = new Set<string>();
  for (const l of p.layers) {
    if ('source' in l && typeof l.source === 'string') ids.add(l.source);
    for (const part of l.mask?.parts ?? []) if (part.kind === 'color') ids.add(part.source);
  }
  return p.sources.filter(s => s.kind === 'video' && ids.has(s.id));
}

interface Stream {
  plan: number[];
  at: number;
  it: AsyncGenerator<import('mediabunny').WrappedCanvas | null, void, unknown> | null;
  input: import('mediabunny').Input | null;
  canvas: HTMLCanvasElement | null;
  last: number;
  /** The last frame asked for came from the core provider (out of plan). */
  fallback: boolean;
  first: number;
  dead: boolean;
}

export interface StreamStats { streamed: number; fallback: number }

export interface StreamProvider extends SourceProvider {
  stats(): StreamStats;
  /** release(), waiting until the decoders are closed. */
  close(): Promise<void>;
}

/**
 * A SourceProvider for an export of `times`: video frames streamed in order (see the top of this file).
 * `maxSide` matches the core's exact provider (3840).
 */
export function createStreamProvider(p: Project, times: readonly number[], o: { blob?: BlobResolver; maxSide?: number } = {}): StreamProvider {
  const blobOf = o.blob ?? storeBlob;
  const maxSide = o.maxSide ?? 3840;
  const base = createSourceProvider({ video: 'exact', blob: blobOf });
  const streams = new Map<string, Stream>();
  const stats: StreamStats = { streamed: 0, fallback: 0 };
  let mbP: Promise<Mb> | null = null;
  for (const s of videoSourcesUsed(p)) {
    streams.set(s.id, { plan: sourceTimesOf(p, s, times), at: 0, it: null, input: null, canvas: null, last: NaN, fallback: false, first: 0, dead: false });
  }

  async function open(s: Source, st: Stream): Promise<boolean> {
    if (st.it) return true;
    if (st.dead) return false;
    try {
      if (typeof VideoDecoder === 'undefined') throw new Error('no WebCodecs');
      const ref = s.media[0];
      const got = ref?.id ? await blobOf(ref.id) : null;
      if (!got) throw new Error('missing');
      const mb = await (mbP ??= import('mediabunny'));
      const input = new mb.Input({ source: new mb.BlobSource(got.blob), formats: mb.ALL_FORMATS });
      st.input = input;
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error('undecodable');
      const [dw, dh, first] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight(), track.getFirstTimestamp()]);
      const size = fitSize(dw, dh, maxSide);
      const sink = new mb.CanvasSink(track, { width: size.w, height: size.h, fit: 'fill', poolSize: 2, alpha: true });
      st.first = first;
      st.canvas = document.createElement('canvas');
      st.canvas.width = size.w; st.canvas.height = size.h;
      st.it = sink.canvasesAtTimestamps(st.plan.map(t => first + Math.max(0, t) + FRAME_EPS));
      return true;
    } catch {
      st.dead = true;
      st.input?.dispose();
      st.input = null;
      return false;
    }
  }

  async function closeAll() {
    const waits: Array<Promise<unknown>> = [];
    for (const st of streams.values()) {
      if (st.it) waits.push(st.it.return(undefined).catch(() => undefined));
      st.it = null;
      if (st.canvas) { st.canvas.width = st.canvas.height = 0; st.canvas = null; }
      st.dead = true;
    }
    await Promise.all(waits);
    // the decoders close once their pump sees the end: give it a turn, then drop the files
    await new Promise(r => setTimeout(r, 0));
    for (const st of streams.values()) { st.input?.dispose(); st.input = null; }
    base.release();
  }

  return {
    async prepare(source, t) {
      const st = streams.get(source.id);
      if (!st || source.kind !== 'video') return base.prepare(source, t);
      if (t === st.last && !st.fallback) return true;
      if (st.at < st.plan.length && Math.abs(st.plan[st.at] - t) < 1e-9 && (await open(source, st))) {
        // frames between the last one served and this one were asked by nobody (a skipped plan entry): pass them
        const r = await st.it!.next();
        st.at++;
        const wc = r.done ? null : r.value;
        if (wc) {
          const x = st.canvas!.getContext('2d')!;
          x.clearRect(0, 0, st.canvas!.width, st.canvas!.height);
          x.drawImage(wc.canvas as CanvasImageSource, 0, 0, st.canvas!.width, st.canvas!.height);
          st.last = t;
          st.fallback = false;
          stats.streamed++;
          return true;
        }
      } else if (st.at < st.plan.length && st.plan[st.at] < t) {
        // the loop skipped ahead in the plan (should not happen): resynchronise on the next matching entry
        const k = st.plan.findIndex((v, i) => i >= st.at && Math.abs(v - t) < 1e-9);
        if (k > st.at && st.it) {
          while (st.at < k) { const r = await st.it.next(); st.at++; if (r.done) break; }
          return this.prepare(source, t);
        }
      }
      // out of plan (or before the file's first frame): the core provider, frame-exact
      st.fallback = true;
      stats.fallback++;
      const ok = await base.prepare(source, t);
      st.last = t;
      return ok;
    },
    frame(source, t) {
      const st = streams.get(source.id);
      if (!st || source.kind !== 'video') return base.frame(source, t);
      if (!st.fallback && st.canvas && t === st.last) return st.canvas as Drawable;
      return base.frame(source, t);
    },
    prepareMedia: ref => base.prepareMedia(ref),
    image: ref => base.image(ref),
    missing: () => base.missing(),
    release() { void closeAll(); },
    close: () => closeAll(),
    stats: () => ({ ...stats }),
  };
}

/* ------------------------------------------------------------------ masks of a frame */

function trimPart(part: MaskPart, t: number): MaskPart {
  if (part.kind !== 'raster' || !part.frames || part.frames.length <= 2) return part;
  const f = part.frames;
  const pick = rasterFrames(part, t);
  const keep = f.filter(x => x.media === pick.a || x.media === pick.b);
  // before the first frame the part shows its own media (and, interpolated, the first frame)
  if (!keep.length) keep.push(f[0]);
  return { ...part, frames: keep };
}

/**
 * The frame with every tracked (per-frame) raster mask reduced to the pictures it shows at this time: the same
 * pixels (rasterFrames picks the same ones), a few pictures decoded instead of all of them.
 */
export function trimMaskFrames(state: FrameState): FrameState {
  let changed = false;
  const layers = state.layers.map(lf => {
    const m = lf.layer.mask;
    if (!m || !m.parts.some(p => p.kind === 'raster' && (p.frames?.length ?? 0) > 2)) return lf;
    changed = true;
    return { ...lf, layer: { ...lf.layer, mask: { ...m, parts: m.parts.map(p => trimPart(p, state.t)) } } };
  });
  return changed ? { ...state, layers } : state;
}

/** evaluate + trimMaskFrames: the state the export and the playback render. */
export const frameAt = (p: Project, t: number): FrameState => trimMaskFrames(evaluate(p, t));
