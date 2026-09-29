/**
 * Sizes, memory and time of movie exports (pure: unit-tested in node).
 */
import type { Project } from '../project/types';

/** Seconds, in Spanish, for the ETA. */
export function etaText(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 10) return 'unos segundos';
  if (s < 90) return `≈${Math.round(s / 5) * 5} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `≈${m} min` : `≈${Math.round(m / 60)} h`;
}

/* ------------------------------------------------------------------ size */

export interface OutSize { W: number; H: number; scale: number; notes: string[] }

/** Longest side the video encoders are asked for (4K). */
export const VIDEO_MAX_SIDE = 3840;

/**
 * The output size: `width`/`height` (one of them keeps the project's aspect; both: the frame is covered and the
 * rest cropped, centred), even for video encoders (4:2:0 needs it), ≤ 4K for video. The render scale covers it.
 */
export function outputSize(p: Pick<Project, 'canvas'>, o: { width?: number; height?: number }, video: boolean): OutSize {
  const pw = p.canvas.w, ph = p.canvas.h;
  const notes: string[] = [];
  let W = o.width && o.width > 0 ? Math.round(o.width) : 0, H = o.height && o.height > 0 ? Math.round(o.height) : 0;
  if (!W && !H) { W = pw; H = ph; }
  else if (!H) H = Math.max(1, Math.round((W * ph) / pw));
  else if (!W) W = Math.max(1, Math.round((H * pw) / ph));
  if (video && Math.max(W, H) > VIDEO_MAX_SIDE) {
    const k = VIDEO_MAX_SIDE / Math.max(W, H);
    W = Math.round(W * k); H = Math.round(H * k);
    notes.push(`Video reducido a ${W}×${H}: los codificadores del navegador llegan hasta 4K.`);
  }
  if (video) { W = Math.max(2, W - (W % 2)); H = Math.max(2, H - (H % 2)); }
  const scale = Math.max(W / pw, H / ph);
  if (Math.abs(W / H - pw / ph) > 0.01) notes.push(`El cuadro de ${pw}×${ph} se recorta al centro para llenar ${W}×${H}.`);
  return { W, H, scale, notes };
}

/* ------------------------------------------------------------------ memory */

/**
 * Bytes of an encoded video (the bitrate our Quality('very-high', bitrate mode) asks mediabunny for: 3 Mb/s for
 * 1080p H.264 × 3.86, scaled by pixels^0.95 and the codec's efficiency), plus 128 kb/s of sound; ×1.6 with alpha
 * (a second stream). An estimate for the memory check, not a promise.
 */
export function videoBytes(codec: 'avc' | 'hevc' | 'vp9' | 'vp8' | 'av1', w: number, h: number, seconds: number, alpha = false): number {
  const eff = { avc: 1, hevc: 0.6, vp9: 0.6, av1: 0.4, vp8: 1.2 }[codec];
  const bitrate = 3e6 * Math.pow((w * h) / (1920 * 1080), 0.95) * eff * 0.3 * Math.exp(2.5538) * (alpha ? 1.6 : 1) + 128e3;
  return (bitrate * Math.max(0, seconds)) / 8;
}

/** How big a file the export may build in memory here: 1.5 GB, 400 MB on devices that report ≤ 4 GB of memory. */
export function memoryCap(deviceMemory = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined): number {
  return deviceMemory !== undefined && deviceMemory <= 4 ? 400e6 : 1.5e9;
}

const mbText = (b: number) => (b >= 1e9 ? `${(Math.round(b / 1e8) / 10).toString().replace('.', ',')} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

export { mbText };
