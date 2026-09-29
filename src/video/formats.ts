/**
 * What this browser can write (probed, never assumed) and what that means for each movie format.
 *
 * The decisions are pure (describeFormats, videoCodecFor, audioRouteFor: unit-tested with made-up browsers); the
 * probes (probeEncode, probeSound) ask WebCodecs through mediabunny and, for transparency, really encode and decode
 * a tiny transparent WebM: a browser that accepts the settings but drops the alpha plane is caught.
 */
import type { FormatInfo, MovieFormat } from './index';

export type VCodec = 'avc' | 'hevc' | 'vp9' | 'vp8' | 'av1';
export type ACodec = 'aac' | 'opus';

export interface EncodeCaps {
  /** Why frame-by-frame video cannot be encoded at all ('' when it can). */
  gap: '' | 'no-webcodecs' | 'no-encoders';
  /** Encodable at the export size. */
  video: Record<VCodec, boolean>;
  /** A transparent WebM with this codec round-trips here (encoded with its alpha plane and decoded back). */
  alpha: { vp9: boolean; vp8: boolean };
  /** Encodable audio (stereo, 48 kHz). */
  audio: Record<ACodec, boolean>;
}

export interface SoundInfo {
  /** A video source of the project has a sound track. */
  has: boolean;
  /** The chosen source's audio codec (mediabunny's name: 'aac', 'opus', 'mp3'…), null when unknown. */
  codec: string | null;
  /** This browser decodes it (needed to cut, loop or re-encode it). */
  decodable: boolean;
  /** The chosen source's name, for the notes. */
  name?: string;
}

/** Audio codecs each container accepts (mediabunny's Mp4OutputFormat / WebMOutputFormat). */
export const CONTAINER_AUDIO: Record<'mp4' | 'webm', readonly string[]> = {
  mp4: ['aac', 'opus', 'mp3', 'vorbis', 'flac', 'ac3', 'eac3', 'pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32'],
  webm: ['opus', 'vorbis'],
};

export const CODEC_NAME: Record<VCodec, string> = { avc: 'H.264', hevc: 'H.265', vp9: 'VP9', vp8: 'VP8', av1: 'AV1' };

/** The video codec an export uses: MP4 prefers H.264 (plays everywhere), then AV1, then VP9; WebM VP9, VP8, AV1. */
export function videoCodecFor(format: 'mp4' | 'webm', caps: EncodeCaps, transparent: boolean): { codec: VCodec; alpha: boolean } | null {
  if (caps.gap) return null;
  if (format === 'mp4') {
    for (const c of ['avc', 'av1', 'vp9'] as const) if (caps.video[c]) return { codec: c, alpha: false };
    return null;
  }
  if (transparent) {
    if (caps.video.vp9 && caps.alpha.vp9) return { codec: 'vp9', alpha: true };
    if (caps.video.vp8 && caps.alpha.vp8) return { codec: 'vp8', alpha: true };
  }
  for (const c of ['vp9', 'vp8', 'av1'] as const) if (caps.video[c]) return { codec: c, alpha: false };
  return null;
}

export type AudioRoute =
  | { route: 'none' }
  | { route: 'copy' }
  | { route: 'encode'; codec: ACodec }
  | { route: 'unsupported'; why: string };

/**
 * How the sound goes into an MP4/WebM: copied as is (the codec fits the container and the plan is one straight
 * stretch), re-encoded (AAC or Opus for MP4, Opus for WebM; needs the sound decodable here), or not possible.
 */
export function audioRouteFor(format: 'mp4' | 'webm', sound: SoundInfo, caps: EncodeCaps, straight: boolean): AudioRoute {
  if (!sound.has) return { route: 'none' };
  const fits = !!sound.codec && CONTAINER_AUDIO[format].includes(sound.codec);
  if (fits && straight) return { route: 'copy' };
  const options: ACodec[] = format === 'mp4' ? ['aac', 'opus'] : ['opus'];
  const enc = options.find(c => caps.audio[c]);
  const what = sound.codec ? sound.codec.toUpperCase() : 'del video';
  if (!sound.decodable) {
    return { route: 'unsupported', why: straight ? `El sonido (${what}) no cabe en ${format.toUpperCase()} y este navegador no lo decodifica para convertirlo.` : `Este navegador no decodifica el sonido (${what}), y hace falta para recortarlo, repetirlo o dejar silencios.` };
  }
  if (!enc) return { route: 'unsupported', why: `Este navegador no codifica ${format === 'mp4' ? 'AAC ni Opus' : 'Opus'}, y el sonido tiene que convertirse.` };
  return { route: 'encode', codec: enc };
}

const AUDIO_WORD = (r: AudioRoute, format: 'mp4' | 'webm') =>
  r.route === 'copy' ? 'con el sonido original, copiado tal cual'
    : r.route === 'encode' ? `con el sonido convertido a ${r.codec === 'aac' ? 'AAC' : 'Opus'}${r.codec === 'opus' && format === 'mp4' ? ' (Opus en MP4: lo reproducen los navegadores recientes; algunos editores y reproductores antiguos no)' : ''}`
      : r.route === 'unsupported' ? `sin sonido: ${r.why}` : 'sin sonido (el proyecto no tiene)';

/** The formats and what each can do here, in Spanish (FormatInfo is the contract of index.ts). */
export function describeFormats(caps: EncodeCaps, o: { transparent: boolean; sound: SoundInfo; straight: boolean; w: number; h: number; frames: number }): FormatInfo[] {
  const out: FormatInfo[] = [];
  const size = `${o.w}×${o.h}`;
  const noCodecs = caps.gap === 'no-webcodecs'
    ? 'Este navegador no tiene WebCodecs, la función con la que se codifica video cuadro a cuadro: usa GIF o la secuencia PNG.'
    : caps.gap === 'no-encoders' ? 'Este navegador no trae codificadores de video: usa GIF o la secuencia PNG.' : '';
  for (const format of ['mp4', 'webm'] as const) {
    const v = videoCodecFor(format, caps, o.transparent);
    const a = audioRouteFor(format, o.sound, caps, o.straight);
    const info: FormatInfo = {
      format, label: format === 'mp4' ? 'MP4' : 'WebM', limits: '', available: !!v, alpha: !!v?.alpha, audio: !!v && (a.route === 'copy' || a.route === 'encode'),
    };
    if (!v) {
      info.why = noCodecs || (format === 'mp4'
        ? `Este navegador no codifica H.264, AV1 ni VP9 a ${size}. Prueba WebM, un tamaño menor, GIF o la secuencia PNG.`
        : `Este navegador no codifica VP9, VP8 ni AV1 a ${size}. Prueba MP4, un tamaño menor, GIF o la secuencia PNG.`);
      info.limits = format === 'mp4' ? 'Video para redes, editores y reproductores.' : 'Video para la web.';
      out.push(info);
      continue;
    }
    info.label = `${format === 'mp4' ? 'MP4' : 'WebM'} (${CODEC_NAME[v.codec]})`;
    const parts: string[] = [];
    if (format === 'mp4') {
      if (v.codec === 'avc') parts.push('H.264: se abre en casi cualquier reproductor, editor y red social.');
      else if (v.codec === 'av1') parts.push('Este navegador no codifica H.264, así que va en AV1: lo reproducen Chrome, Edge y Firefox recientes y los equipos Apple con chip M3 o A17 Pro en adelante; muchas redes y editores aún no lo aceptan. Para H.264, exporta desde Chrome o Edge en Windows o macOS, o desde Safari.');
      else parts.push('Este navegador no codifica H.264 ni AV1, así que va en VP9: lo reproducen Chrome, Edge y Firefox; Safari y muchos editores no.');
      parts.push('Sin transparencia (MP4 no la guarda).');
    } else {
      parts.push(`${CODEC_NAME[v.codec]}: lo reproducen Chrome, Edge, Firefox y Safari recientes; varias redes sociales y editores prefieren MP4.`);
      if (v.alpha) parts.push('Con transparencia real (canal alfa): Chrome, Edge y Firefox la respetan; Safari puede mostrarla opaca.');
    }
    if (o.transparent && !v.alpha) parts.push('Este video no puede guardar la transparencia aquí: sale sobre el color de fondo del proyecto. Para transparencia usa la secuencia PNG (o GIF, con bordes duros).');
    parts.push(`Se exporta ${AUDIO_WORD(a, format)}.`);
    info.limits = parts.join(' ');
    out.push(info);
  }
  out.push({
    format: 'gif', label: 'GIF', available: true, alpha: o.transparent, audio: false,
    limits: `256 colores por cuadro (paleta común o una por cuadro, con o sin tramado), transparencia de 1 bit (bordes duros), sin sonido y archivos mucho más pesados que un video; hasta 1080 px de lado.${o.sound.has ? ' El sonido del video no se incluye.' : ''}`,
  });
  const zipOk = o.frames <= 0xffff;
  out.push({
    format: 'png-zip', label: 'Secuencia PNG (.zip)', available: zipOk, alpha: o.transparent, audio: false,
    ...(zipOk ? {} : { why: `Son ${o.frames} cuadros: un .zip admite 65 535 archivos. Acorta el tramo o baja los cuadros por segundo.` }),
    limits: `Un PNG por cuadro, sin pérdida${o.transparent ? ' y con transparencia real' : ''}, para editores de video y animación; sin sonido${o.sound.has ? ' (exporta aparte el original si lo necesitas)' : ''}. Pesa mucho más que un video.`,
  });
  return out;
}

/* ------------------------------------------------------------------ probes (browser) */

/** Why frame-by-frame video cannot be encoded here ('' when it can). WebKit without encoders closes the page when asked. */
export function encoderGap(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): EncodeCaps['gap'] {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return 'no-webcodecs';
  const webkitOnly = /AppleWebKit\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR)\//.test(ua);
  if (webkitOnly && typeof MediaRecorder === 'undefined') return 'no-encoders';
  return '';
}

const encodeProbes = new Map<string, Promise<EncodeCaps>>();
let alphaProbe: Promise<EncodeCaps['alpha']> | null = null;

/** What WebCodecs encodes at w×h (even sizes), cached per size. */
export function probeEncode(w: number, h: number): Promise<EncodeCaps> {
  const W = Math.max(2, w + (w % 2)), H = Math.max(2, h + (h % 2));
  const key = `${W}x${H}`;
  let p = encodeProbes.get(key);
  if (!p) {
    p = (async (): Promise<EncodeCaps> => {
      const gap = encoderGap();
      const none: EncodeCaps = { gap, video: { avc: false, hevc: false, vp9: false, vp8: false, av1: false }, alpha: { vp9: false, vp8: false }, audio: { aac: false, opus: false } };
      if (gap) return none;
      const mb = await import('mediabunny');
      const video = { ...none.video };
      for (const c of ['avc', 'hevc', 'vp9', 'vp8', 'av1'] as const) {
        try { video[c] = await mb.canEncodeVideo(c, { width: W, height: H, bitrate: 4e6 }); } catch { video[c] = false; }
      }
      const audio = { ...none.audio };
      if (typeof AudioEncoder !== 'undefined') {
        for (const c of ['aac', 'opus'] as const) {
          try { audio[c] = await mb.canEncodeAudio(c, { numberOfChannels: 2, sampleRate: 48000, bitrate: 128e3 }); } catch { audio[c] = false; }
        }
      }
      const alpha = await (alphaProbe ??= probeAlpha(video));
      return { gap, video, alpha, audio };
    })();
    encodeProbes.set(key, p);
  }
  return p;
}

/**
 * Encodes two 32×32 frames with a transparent half into a WebM (VP9, then VP8) and decodes them back: alpha counts
 * only if the transparent half comes back transparent and the opaque half opaque.
 */
async function probeAlpha(video: Record<VCodec, boolean>): Promise<EncodeCaps['alpha']> {
  const out = { vp9: false, vp8: false };
  if (typeof document === 'undefined') return out;
  const mb = await import('mediabunny');
  for (const codec of ['vp9', 'vp8'] as const) {
    if (!video[codec]) continue;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d')!;
      const target = new mb.BufferTarget();
      const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
      const src = new mb.CanvasSource(c, { codec, quality: mb.QUALITY_HIGH, alpha: 'keep' });
      output.addVideoTrack(src, { frameRate: 10 });
      await output.start();
      for (let i = 0; i < 2; i++) {
        x.clearRect(0, 0, 32, 32);
        x.fillStyle = '#ff5b1f';
        x.fillRect(0, 0, 16, 32);
        await src.add(i / 10, 1 / 10);
      }
      await output.finalize();
      const input = new mb.Input({ source: new mb.BufferSource(target.buffer!), formats: mb.ALL_FORMATS });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) continue;
        const sink = new mb.CanvasSink(track, { alpha: true, poolSize: 1 });
        const wc = await sink.getCanvas(0.05);
        if (!wc) continue;
        const r = document.createElement('canvas');
        r.width = r.height = 32;
        const rx = r.getContext('2d', { willReadFrequently: true })!;
        rx.drawImage(wc.canvas as CanvasImageSource, 0, 0, 32, 32);
        const solid = rx.getImageData(6, 16, 1, 1).data[3], clear = rx.getImageData(26, 16, 1, 1).data[3];
        out[codec] = solid > 200 && clear < 55;
      } finally { input.dispose(); }
    } catch { out[codec] = false; }
  }
  return out;
}

/** Whether a movie format name is one of ours. */
export const isMovieFormat = (f: unknown): f is MovieFormat => f === 'mp4' || f === 'webm' || f === 'gif' || f === 'png-zip';
