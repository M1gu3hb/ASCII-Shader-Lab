/**
 * The stored files a project uses: originals of its sources, cut-outs and their mattes, painted and
 * tracked masks. Pure functions (no storage), shared by persistence (what the media collection must keep),
 * project files (what travels in the .zip) and exports (the originals).
 */
import type { MediaRef } from '../engine/recipe';
import type { Project } from './types';

export type MediaRole = 'original' | 'secuencia' | 'recorte' | 'mate' | 'mascara';

export interface ProjectMedia { ref: MediaRef; role: MediaRole; /** Source or layer it belongs to. */ owner: string }

/** Every media reference of a project, in order, each stored file once (by id; refs without an id too). */
export function projectMedia(p: Project): ProjectMedia[] {
  const out: ProjectMedia[] = [];
  const seen = new Set<string>();
  const add = (ref: MediaRef | undefined, role: MediaRole, owner: string) => {
    if (!ref) return;
    const k = ref.id ?? `?${out.length}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ref, role, owner });
  };
  for (const s of p.sources) {
    const role: MediaRole = s.kind === 'sequence' ? 'secuencia' : s.kind === 'cutout' ? 'recorte' : 'original';
    for (const m of s.media) add(m, role, s.id);
    if (s.cutout) add(s.cutout.matte, 'mate', s.id);
  }
  for (const l of p.layers) {
    for (const part of l.mask?.parts ?? []) {
      if (part.kind !== 'raster') continue;
      add(part.media, 'mascara', l.id);
      for (const f of part.frames ?? []) add(f.media, 'mascara', l.id);
    }
    if (l.kind === 'ascii') add(l.style.media.ref, 'original', l.id);
  }
  return out;
}

/** Ids of the stored files a project uses. */
export function projectMediaIds(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const m of projectMedia(p)) if (m.ref.id) ids.add(m.ref.id);
  return ids;
}

/**
 * The same project with media ids replaced (old id → new id), in place; refs whose id is not in the map
 * are left as they are. Used when a project file is opened and its files are stored again.
 */
export function rewriteMediaIds(p: Project, map: ReadonlyMap<string, string>): Project {
  const fix = (ref: MediaRef | undefined) => { if (ref?.id && map.has(ref.id)) ref.id = map.get(ref.id)!; };
  for (const s of p.sources) {
    s.media.forEach(fix);
    if (s.cutout) fix(s.cutout.matte);
  }
  for (const l of p.layers) {
    for (const part of l.mask?.parts ?? []) {
      if (part.kind !== 'raster') continue;
      fix(part.media);
      for (const f of part.frames ?? []) fix(f.media);
    }
    if (l.kind === 'ascii') fix(l.style.media.ref);
  }
  return p;
}
