import { hasWebCodecs, videoSupport } from '../exporting';

export interface ClipCaps {
  mp4: boolean;
  webm: boolean;
  /** Why a format is missing, in plain words ('' when both are there). */
  why: string;
}

/**
 * Which video files this browser can render at w×h, and why not when it cannot. Every capability
 * check of the guided paths goes through this one function, so it can switch to the shared
 * capability module in one place.
 */
export async function clipCaps(w: number, h: number): Promise<ClipCaps> {
  if (!hasWebCodecs()) {
    return { mp4: false, webm: false, why: 'Este navegador no tiene WebCodecs, que hace falta para crear el video fotograma a fotograma. Chrome y Edge actualizados lo tienen; el GIF funciona en cualquiera.' };
  }
  const s = await videoSupport(w, h).catch(() => ({ mp4: false, webm: false }));
  if (!s.mp4 && !s.webm) return { ...s, why: `Este navegador no puede codificar video de ${w}×${h}. El GIF funciona en cualquiera.` };
  if (!s.mp4) return { ...s, why: 'Este navegador no codifica H.264, así que aquí no hay MP4: el WebM sirve para la web y la mayoría de editores.' };
  if (!s.webm) return { ...s, why: 'Este navegador no codifica WebM; el MP4 sirve para redes sociales y editores.' };
  return { ...s, why: '' };
}
