/**
 * The sound of a movie export, written next to the rendered picture in the same mediabunny Output, in lockstep
 * with it (advance(t) after each video frame), so memory stays bounded whatever the length.
 *
 * Routes (decided by formats.ts audioRouteFor from the plan of audioplan.ts):
 *   copy    one straight stretch whose codec fits the container: a composable mediabunny Conversion copies the
 *           packets of that trimmed range (no re-encoding; it handles edit lists and priming);
 *   encode  anything else (loops, silences, a codec the container refuses): the source is decoded
 *           (AudioSampleSink), cut into the plan's segments on a continuous timeline with silence in the gaps, and
 *           encoded again (Opus, or AAC where the browser has an encoder);
 *   none / unsupported   no audio track, with the reason in the notes.
 */
import type { Output } from 'mediabunny';
import type { BlobResolver } from '../project/sources';
import type { Id, Project, Source } from '../project/types';
import { pickAudioSource, planAudio, type AudioPlan } from './audioplan';
import { audioRouteFor, type EncodeCaps } from './formats';

type Mb = typeof import('mediabunny');

export interface AudioOutcome { audio: 'copied' | 'reencoded' | 'none' | 'unsupported'; notes: string[] }

export interface AudioJob {
  readonly outcome: AudioOutcome;
  /** Writes the sound up to `t` seconds of the export (call after each video frame). */
  advance(t: number): Promise<void>;
  /** Writes what is left (up to the export's end). */
  finish(): Promise<void>;
  /** Stops and frees everything (inputs, decoders). Safe to call twice. */
  close(): Promise<void>;
}

export interface SoundProbe { source: Source; codec: string | null; decodable: boolean; sampleRate: number; channels: number }

type SoundOfFile = Omit<SoundProbe, 'source'>;
/** Per stored file (media id): what its sound is (files never change under their content id). */
const fileSound = new Map<string, Promise<SoundOfFile | null>>();

/** What the file of a video source has for sound (null: no sound track or not readable). */
export async function probeSound(s: Source, blobOf: BlobResolver): Promise<SoundProbe | null> {
  const ref = s.media[0];
  if (!ref?.id) return null;
  let job = fileSound.get(ref.id);
  if (!job) {
    job = (async () => {
      const got = await blobOf(ref.id!);
      if (!got) return null;
      const mb = await import('mediabunny');
      const input = new mb.Input({ source: new mb.BlobSource(got.blob), formats: mb.ALL_FORMATS });
      try {
        const a = await input.getPrimaryAudioTrack();
        if (!a) return null;
        const decodable = typeof AudioDecoder !== 'undefined' && (await a.canDecode().catch(() => false));
        return { codec: a.codec ?? null, decodable, sampleRate: a.sampleRate, channels: a.numberOfChannels };
      } catch {
        return null;
      } finally {
        input.dispose();
      }
    })();
    fileSound.set(ref.id, job);
    // a file missing now may be stored later: do not remember a miss
    void job.then(r => { if (!r) fileSound.delete(ref.id!); });
  }
  const r = await job;
  return r ? { source: s, ...r } : null;
}

/** The sound source of an export: the preferred one, else the bottom-most video source whose file has sound. */
export async function findSound(p: Project, prefer: Id | undefined, blobOf: BlobResolver): Promise<SoundProbe | null> {
  const probes = new Map<string, SoundProbe | null>();
  for (const s of p.sources) if (s.kind === 'video') probes.set(s.id, await probeSound(s, blobOf));
  const src = pickAudioSource(p, prefer ?? null, s => !!probes.get(s.id));
  return src ? probes.get(src.id) ?? null : null;
}

const none = (notes: string[] = []): AudioJob => ({
  outcome: { audio: 'none', notes }, advance: async () => {}, finish: async () => {}, close: async () => {},
});

/**
 * Adds the export's sound track to `output` (before output.start()). `format` is the container; `caps` what this
 * browser encodes. Never throws for sound problems: they end in 'unsupported' with a note.
 */
export async function prepareAudio(
  mb: Mb, output: Output, p: Project,
  o: { format: 'mp4' | 'webm'; start: number; end: number; fps: number; mode: 'keep' | 'none'; prefer?: Id; caps: EncodeCaps; blob: BlobResolver },
): Promise<AudioJob> {
  if (o.mode === 'none') return none(p.sources.some(s => s.kind === 'video') ? ['Sin sonido: elegiste no incluirlo.'] : []);
  const sound = await findSound(p, o.prefer, o.blob);
  if (!sound) return none();
  const plan = planAudio(p, { start: o.start, end: o.end, fps: o.fps, source: sound.source });
  if (!plan.segments.length) return none([`Sin sonido: «${sound.source.name}» no se ve en este tramo.`]);
  const route = audioRouteFor(o.format, { has: true, codec: sound.codec, decodable: sound.decodable }, o.caps, plan.straight);
  if (route.route === 'unsupported') {
    return { ...none(), outcome: { audio: 'unsupported', notes: [`Sin sonido: ${route.why}`] } };
  }
  const ref = sound.source.media[0];
  const got = ref.id ? await o.blob(ref.id) : null;
  if (!got) return none();
  const input = new mb.Input({ source: new mb.BlobSource(got.blob), formats: mb.ALL_FORMATS });
  try {
    if (route.route === 'copy') return await copyJob(mb, output, input, plan, sound);
    if (route.route === 'encode') return await encodeJob(mb, output, input, plan, sound, route.codec);
  } catch (e) {
    input.dispose();
    return { ...none(), outcome: { audio: 'unsupported', notes: [`Sin sonido: no se pudo preparar (${String((e as Error)?.message ?? e).slice(0, 120)}).`] } };
  }
  input.dispose();
  return none();
}

/** The packets of one trimmed range, copied (composable Conversion, research.md §4.2). */
async function copyJob(mb: Mb, output: Output, input: import('mediabunny').Input, plan: AudioPlan, sound: SoundProbe): Promise<AudioJob> {
  const seg = plan.segments[0];
  const first = await (await input.getPrimaryAudioTrack())!.getFirstTimestamp();
  const conv = await mb.Conversion.init({
    input, output, composable: true, tracks: 'primary', showWarnings: false,
    video: { discard: true },
    audio: {},
    trim: { start: first + seg.src, end: first + seg.src + seg.dur },
  });
  if (!conv.utilizedTracks.some(t => t.type === 'audio')) {
    input.dispose();
    return { ...none(), outcome: { audio: 'unsupported', notes: ['Sin sonido: el contenedor no acepta el sonido de este video.'] } };
  }
  let closed = false;
  return {
    outcome: { audio: 'copied', notes: [`Sonido original de «${sound.source.name}» (${(sound.codec ?? '').toUpperCase()}), copiado sin recomprimir.`, ...plan.notes] },
    async advance(t) { if (!closed) await conv.execute({ until: t }); },
    async finish() { if (!closed) await conv.execute(); },
    async close() {
      if (closed) return;
      closed = true;
      if (conv.state === 'idle' || conv.state === 'executing') await conv.cancel().catch(() => undefined);
      input.dispose();
    },
  };
}

/** Decoded, cut to the plan (silence in its gaps) and encoded again. */
async function encodeJob(mb: Mb, output: Output, input: import('mediabunny').Input, plan: AudioPlan, sound: SoundProbe, codec: 'aac' | 'opus'): Promise<AudioJob> {
  const track = (await input.getPrimaryAudioTrack())!;
  const first = await track.getFirstTimestamp();
  const channels = Math.min(2, Math.max(1, sound.channels || 2));
  // Opus works at 48 kHz; AAC keeps the source's rate when it is a common one
  const sr = codec === 'opus' ? 48000 : [44100, 48000].includes(sound.sampleRate) ? sound.sampleRate : 48000;
  const src = new mb.AudioSampleSource({ codec, quality: mb.QUALITY_HIGH });
  output.addAudioTrack(src);
  const sink = new mb.AudioSampleSink(track);
  const total = Math.round(plan.total * sr);
  const CHUNK = 4096;
  /** Frames written so far on the export's timeline. */
  let written = 0;
  let seg = 0;
  let it: AsyncGenerator<import('mediabunny').AudioSample, void, unknown> | null = null;
  /** Samples of the current decoded chunk not written yet: planar f32 at `sr`, with their timeline position. */
  let pending: { planes: Float32Array[]; pos: number; len: number } | null = null;
  let closed = false;

  const writePlanes = async (planes: Float32Array[], len: number) => {
    if (len <= 0) return;
    const data = new Float32Array(len * channels);
    for (let c = 0; c < channels; c++) data.set(planes[Math.min(c, planes.length - 1)].subarray(0, len), c * len);
    const s = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: channels, sampleRate: sr, timestamp: written / sr });
    await src.add(s);
    s.close();
    written += len;
  };
  const silence = async (upto: number) => {
    while (written < upto) {
      const n = Math.min(CHUNK, upto - written);
      await writePlanes(Array.from({ length: channels }, () => new Float32Array(n)), n);
    }
  };

  /** The next decoded audio of the current segment, resampled to `sr` and placed on the timeline. */
  const nextChunk = async (): Promise<boolean> => {
    while (seg < plan.segments.length) {
      const g = plan.segments[seg];
      const segStart = Math.round(g.out * sr), segEnd = Math.round((g.out + g.dur) * sr);
      if (!it) it = sink.samples(first + g.src, first + g.src + g.dur);
      const r = await it.next();
      if (r.done) { it = null; seg++; if (written < segEnd && seg >= plan.segments.length) await silence(Math.min(total, segEnd)); continue; }
      const smp = r.value;
      try {
        const n = smp.numberOfFrames, rate = smp.sampleRate;
        const planes: Float32Array[] = [];
        for (let c = 0; c < Math.min(channels, smp.numberOfChannels); c++) {
          const buf = new Float32Array(n);
          smp.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
          planes.push(buf);
        }
        if (!planes.length) continue;
        // position on the export timeline of the sample's first frame
        const at = g.out + (smp.timestamp - first - g.src);
        let res = planes, len = n;
        if (rate !== sr) {
          len = Math.max(1, Math.round((n * sr) / rate));
          res = planes.map(p => resampleLinear(p, len));
        }
        let pos = Math.round(at * sr);
        // cut to the segment
        let from = 0;
        if (pos < segStart) { from = segStart - pos; pos = segStart; }
        const to = Math.min(len, from + (segEnd - pos));
        if (to <= from) continue;
        pending = { planes: res.map(p => p.subarray(from, to)), pos, len: to - from };
        return true;
      } finally {
        smp.close();
      }
    }
    return false;
  };

  const advance = async (t: number) => {
    const upto = Math.min(total, Math.round(t * sr));
    while (!closed && written < upto) {
      if (!pending && !(await nextChunk())) { await silence(upto); break; }
      const pd = pending!;
      if (pd.pos > written) { await silence(Math.min(pd.pos, upto)); if (written < pd.pos || written >= upto) break; }
      // skip what overlaps what is already written (packet boundaries)
      const skip = Math.max(0, written - pd.pos);
      if (skip >= pd.len) { pending = null; continue; }
      const n = Math.min(pd.len - skip, upto - written);
      await writePlanes(pd.planes.map(p => p.subarray(skip, skip + n)), n);
      if (skip + n >= pd.len) pending = null;
      else pending = { planes: pd.planes, pos: pd.pos, len: pd.len };
    }
  };

  return {
    outcome: {
      audio: 'reencoded',
      notes: [`Sonido de «${sound.source.name}» convertido a ${codec === 'aac' ? 'AAC' : 'Opus'}${sound.codec ? ` (el original es ${sound.codec.toUpperCase()})` : ''}.`, ...plan.notes],
    },
    advance,
    async finish() { await advance(plan.total + 1); },
    async close() {
      if (closed) return;
      closed = true;
      const g = it as AsyncGenerator<unknown> | null;
      if (g) await g.return(undefined).catch(() => undefined);
      it = null;
      input.dispose();
    },
  };
}

/** Linear resampling of one channel to `len` frames (only when the source's rate differs from the encoder's). */
export function resampleLinear(src: Float32Array, len: number): Float32Array {
  const out = new Float32Array(len);
  if (src.length === 0) return out;
  const k = src.length / len;
  for (let i = 0; i < len; i++) {
    const x = (i + 0.5) * k - 0.5;
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(src.length - 1, x0 + 1);
    const f = Math.min(1, Math.max(0, x - x0));
    out[i] = src[x0] * (1 - f) + src[x1] * f;
  }
  return out;
}
