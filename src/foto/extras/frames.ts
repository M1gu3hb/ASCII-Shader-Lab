/**
 * An animation as numbered PNG frames in a .zip (the frame loop of src/project/export.ts: the same
 * compositor call as the preview, frame-exact). The format any editor or encoder takes; the export sheet's
 * video and GIF use the same loop where this browser can encode them.
 */
import { exportName, frames } from '../../project/export';
import type { Project } from '../../project/types';
import { zip, type ZipInput } from '../../shared/zip';

export interface FramesOptions {
  fps?: number;
  /** Output width in px (the project's aspect is kept); default the project's width, at most 1920. */
  width?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/** Width and number of frames a frames export will have (the sheet shows them before it starts). */
export function framesPlan(p: Project, o: FramesOptions = {}) {
  const fps = o.fps ?? p.time.fps;
  const width = Math.min(o.width ?? p.canvas.w, 1920);
  const n = p.time.duration > 0 ? Math.max(1, Math.round(p.time.duration * fps)) : 1;
  return { fps, width, height: Math.round((width * p.canvas.h) / p.canvas.w), n };
}

export async function exportFramesZip(p: Project, o: FramesOptions = {}): Promise<{ blob: Blob; name: string; n: number } | null> {
  const plan = framesPlan(p, o);
  const files: ZipInput[] = [];
  const pad = String(plan.n).length;
  for await (const f of frames(p, { fps: plan.fps, width: plan.width, ...(o.signal ? { signal: o.signal } : {}) })) {
    const blob = await new Promise<Blob | null>(res => f.canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('No se pudo codificar un cuadro PNG.');
    files.push({ name: `cuadro-${String(f.i + 1).padStart(Math.max(3, pad), '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    o.onProgress?.(f.i + 1, f.n);
  }
  if (o.signal?.cancelled) return null;
  files.push({
    name: 'LEEME.txt',
    data: `${p.name}\n${plan.n} cuadros PNG de ${plan.width} × ${plan.height} px a ${plan.fps} cuadros por segundo (${p.time.duration.toFixed(2)} s).\nHechos con el estudio de foto y video de GLYPHOS: los mismos cuadros que la vista previa.\nPara un video: ffmpeg -framerate ${plan.fps} -i cuadro-%0${Math.max(3, pad)}d.png -pix_fmt yuv420p video.mp4\n`,
  });
  return { blob: await zip(files), name: exportName(p, 'zip', 'cuadros'), n: plan.n };
}
