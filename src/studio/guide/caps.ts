import { videoEncoderGap, videoEncoderWhy, videoSupportAt } from '../caps';

export interface ClipCaps {
  mp4: boolean;
  webm: boolean;
  /** Why a format is missing, in plain words ('' when both are there). */
  why: string;
}

/**
 * Which video files this browser can render at w×h, and why not when it cannot. Every capability
 * check of the guided paths goes through this one function, backed by the shared capability probes
 * (src/studio/caps.ts) so the guide and the export sheet always agree.
 */
export async function clipCaps(w: number, h: number): Promise<ClipCaps> {
  const gap = videoEncoderGap();
  if (gap === 'no-webcodecs') {
    return { mp4: false, webm: false, why: 'Este navegador no tiene WebCodecs, que hace falta para crear el video fotograma a fotograma. Chrome y Edge actualizados lo tienen; el GIF no lo necesita (lo hace el propio estudio).' };
  }
  if (gap) return { mp4: false, webm: false, why: videoEncoderWhy(gap) + ' El GIF sí se puede: lo hace el propio estudio.' };
  const s = await videoSupportAt(w, h).catch(() => ({ mp4: false, webm: false }));
  if (!s.mp4 && !s.webm) return { ...s, why: `Este navegador no puede codificar video de ${w}×${h}. El GIF sí se puede: lo hace el propio estudio.` };
  if (!s.mp4) return { ...s, why: 'Este navegador no codifica H.264, así que aquí no hay MP4: el WebM sirve para la web y la mayoría de editores.' };
  if (!s.webm) return { ...s, why: 'Este navegador no codifica WebM; el MP4 sirve para redes sociales y editores.' };
  return { ...s, why: '' };
}
