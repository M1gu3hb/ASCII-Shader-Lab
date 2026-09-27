import { syntheticPhoto } from '../../shared/sample';

export const SAMPLE_NAME = 'paisaje-de-ejemplo.png';

/**
 * The example photo as a real PNG file (the synthetic landscape, 960×600). It goes through the
 * normal file handling, so it is stored and restored like any photo the person picks.
 */
export async function samplePhotoFile(): Promise<File> {
  const c = syntheticPhoto();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('png'))), 'image/png'));
  return new File([blob], SAMPLE_NAME, { type: 'image/png', lastModified: Date.UTC(2026, 0, 1) });
}
