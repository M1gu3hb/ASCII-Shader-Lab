/**
 * Facts the format decisions need, probed in this browser: which still formats it encodes (canvas.toBlob,
 * never assumed), what lane video's movieFormats() says it can write, the glyph layers and whether they move,
 * and whether an SVG of the composition at an instant would be faithful (the glyph frames are computed to
 * know: a clip that moves characters by fractions of a cell at that instant makes it not).
 */
import { charsetInfo } from '../../glyphs/index';
import { finishDef } from '../../fx/index';
import { canEncode } from '../../project/export';
import { dependsOnTime, evaluate } from '../../project/evaluate';
import type { Project } from '../../project/types';
import type { FormatInfo, MovieOptions } from '../../video/index';
import type { Facts, GlyphFact } from './formats';
import { glyphFrameAt, glyphLayerMoves, type FrameSession } from './frames';
import { svgDecision, type SvgDecision, type SvgLayerInfo, type SvgLayerPart } from './svg';

export const projectMoves = (p: Project) => p.time.duration > 0 && dependsOnTime(p);

export function glyphFacts(p: Project): GlyphFact[] {
  return p.layers.filter(l => l.kind === 'glyphs').map(l => ({ id: l.id, name: l.name, moves: glyphLayerMoves(p, l.id), visible: l.visible }));
}

/** The only visible layer, when it is a glyph layer. */
export function soloGlyph(p: Project): string | null {
  const vis = p.layers.filter(l => l.visible);
  return vis.length === 1 && vis[0].kind === 'glyphs' ? vis[0].id : null;
}

export async function stillCaps(): Promise<{ jpeg: boolean; webp: boolean }> {
  const [jpeg, webp] = await Promise.all([canEncode('jpeg'), canEncode('webp')]);
  return { jpeg, webp };
}

/**
 * What lane video can write for this project at these options. Built against the contract (movieFormats);
 * when the module also has movieFormatsFor (sized probing), it is asked with the sheet's size and range.
 * Resolves [] when this version has no movie export (the sheet then says so).
 */
export async function movieCaps(p: Project, o: Pick<MovieOptions, 'width' | 'height' | 'fps' | 'start' | 'end' | 'transparent'>): Promise<FormatInfo[]> {
  try {
    const m = await import('../../video/index') as typeof import('../../video/index') & { movieFormatsFor?: (p: Project, o: Record<string, unknown>) => Promise<FormatInfo[]> };
    if (typeof m.movieFormatsFor === 'function') return await m.movieFormatsFor(p, o);
    return await m.movieFormats(p);
  } catch {
    return [];
  }
}

const BLOCKY = new Set(['blocks', 'braille']);

/** Whether an SVG of the composition at t is faithful, and the parts to write it with when it is. */
export async function svgFacts(p: Project, t: number, s: FrameSession): Promise<{ decision: SvgDecision; parts: SvgLayerPart[] }> {
  const state = evaluate(p, t);
  const infos: SvgLayerInfo[] = [];
  const parts: SvgLayerPart[] = [];
  for (const lf of state.layers) {
    const l = lf.layer;
    if (l.opacity <= 0) continue;
    const info: SvgLayerInfo = {
      name: l.name, kind: l.kind, blend: l.blend,
      finishes: l.finishes.filter(f => f.on && f.amount > 0).map(f => (finishDef(f.kind)?.name ?? f.kind).toLowerCase()),
      mask: !!(l.mask && !l.mask.off && l.mask.parts.length),
      pixelClips: !!(lf.stretch || lf.within.length || (lf.tiles && l.kind !== 'glyphs')),
    };
    if (l.kind === 'glyphs') {
      const f = await glyphFrameAt(p, l.id, t, s, { layer: false });
      if (f) {
        info.cellMoves = f.notes.rounded + f.notes.turned + f.notes.scaled > 0;
        const mode = charsetInfo(l.glyphs.charset).mode;
        info.blocks = BLOCKY.has(mode) || /[▀-▟⠀-⣿]/.test(f.grid.chars.join(''));
        parts.push({ layer: l, glyph: { grid: f.grid, style: f.style }, opacity: l.opacity });
      }
    } else if (l.kind === 'text' || l.kind === 'shape') parts.push({ layer: l, opacity: l.opacity });
    infos.push(info);
  }
  return { decision: svgDecision(infos), parts };
}

/** Everything formatsFor needs, but the movie formats (probed separately: they depend on size and range). */
export async function baseFacts(p: Project, t: number, s: FrameSession, transparent: boolean): Promise<Omit<Facts, 'movies'> & { svgParts: SvgLayerPart[] }> {
  const [stills, svg] = await Promise.all([stillCaps(), svgFacts(p, t, s)]);
  return {
    moving: projectMoves(p), duration: p.time.duration, transparent, stills,
    glyphs: glyphFacts(p), shaderAscii: p.layers.filter(l => l.kind === 'ascii').length, soloGlyph: soloGlyph(p),
    svg: svg.decision, svgParts: svg.parts,
  };
}
