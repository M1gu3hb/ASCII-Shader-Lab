/**
 * Glyph layers as text, frame by frame, in the browser: the same feed, grid, font and clip hooks as the
 * compositor (compositor.ts drawGlyphLayer), then applyFrame (frameGrid.ts) for what the clips do per cell.
 */
import { cellColors, ensureGlyphFont, glyphGridWith, gridDims, sampleOf, type GlyphGrid } from '../../glyphs/index';
import type { CellGrid } from '../../project/clips';
import { Compositor, sourceFit } from '../../project/compositor';
import { fitRect } from '../../project/adjust';
import { evaluate, frameTimes, type LayerFrame } from '../../project/evaluate';
import { coverageOfImage, rasterizeMask } from '../../project/masks';
import { createSourceProvider, type SourceProvider } from '../../project/sources';
import type { GlyphStyle, GlyphsLayer, Id, Mask, Project } from '../../project/types';
import { finishDef } from '../../fx/index';
import { applyFrame, blankGrid, cellCoverage, emptyNotes, frameStyle, mergeNotes, padGrid, type FrameEffects, type FrameNotes } from './frameGrid';

export interface FrameSession {
  provider: SourceProvider;
  compositor: Compositor;
  /** The feed canvas (the layer's picture at the output size), reused so a still picture is sampled once. */
  feed: HTMLCanvasElement;
  covers: Map<string, Float32Array>;
  release(): void;
}

/** What frames of one export share (one frame-exact provider, one compositor for 'below' feeds). */
export function frameSession(o: { compositor?: Compositor } = {}): FrameSession {
  const own = !o.compositor;
  const compositor = o.compositor ?? new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
  const feed = document.createElement('canvas');
  return {
    provider: compositor.provider, compositor, feed, covers: new Map(),
    release() {
      if (own) { compositor.destroy(); compositor.provider.release(); }
      feed.width = feed.height = 0;
      this.covers.clear();
    },
  };
}

function maskTimeless(m: Mask): boolean {
  return m.parts.every(p => (p.kind !== 'raster' || !p.frames?.length) && p.kind !== 'color');
}

/** The layer's mask(s) at t, averaged per cell (null without a mask). */
async function maskCells(p: Project, lf: LayerFrame, t: number, W: number, H: number, grid: GlyphGrid, s: FrameSession): Promise<Float32Array | null> {
  const masks: Mask[] = [];
  if (lf.layer.mask && !lf.layer.mask.off && lf.layer.mask.parts.length) masks.push(lf.layer.mask);
  masks.push(...lf.within);
  if (!masks.length) return null;
  const key = `${W}x${H}|${grid.cols}x${grid.rows}|${grid.cw}x${grid.ch}|${JSON.stringify(masks)}${masks.every(maskTimeless) ? '' : '@' + t}`;
  const hit = s.covers.get(key);
  if (hit) return hit;
  let acc: Float32Array | null = null;
  for (const m of masks) {
    for (const part of m.parts) {
      if (part.kind === 'raster') for (const r of [part.media, ...(part.frames ?? []).map(f => f.media)]) await s.provider.prepareMedia(r);
      if (part.kind === 'color') { const src = p.sources.find(x => x.id === part.source); if (src) await s.provider.prepare(src, t); }
    }
    const cov = rasterizeMask(m, {
      w: W, h: H, scale: 1, t,
      raster: ref => { const img = s.provider.image(ref); return img ? coverageOfImage(img, W, H) : null; },
      pixels: id => {
        const src = p.sources.find(x => x.id === id);
        const img = src ? s.provider.frame(src, t) : null;
        if (!img) return null;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        const r = fitRect(img.width, img.height, W, H, sourceFit(p, id));
        x.drawImage(img, r.x, r.y, r.w, r.h);
        const d = x.getImageData(0, 0, W, H).data;
        c.width = c.height = 0;
        return d;
      },
    });
    if (!acc) acc = cov;
    else for (let i = 0; i < acc.length; i++) acc[i] *= cov[i];
  }
  const cells = cellCoverage(acc!, W, H, grid.cols, grid.rows, grid.cw, grid.ch);
  if (s.covers.size > 24) s.covers.clear();
  s.covers.set(key, cells);
  return cells;
}


export interface GlyphFrame {
  grid: GlyphGrid;
  /** The style to write it with (colour mode 'source': the colours in `grid.rgb` are final). */
  style: GlyphStyle;
  /** Background of the text outputs: the layer's paper, else the project's background. */
  bg: string;
  /** Whether the layer has paper (a background of its own). */
  paper: boolean;
  notes: FrameNotes;
  name: string;
}

/**
 * The glyph layer `layerId` at time t as drawn (see the top of this file), at the project's size. Null when
 * the layer is not a glyph layer or its picture is missing; a blank frame when it does not show at t.
 * `layer: false` leaves out what belongs to the layer as a whole (opacity, position, turn, blend): an SVG
 * carries those itself.
 */
export async function glyphFrameAt(p: Project, layerId: Id, t: number, s: FrameSession, o: { layer?: boolean } = {}): Promise<GlyphFrame | null> {
  const whole = o.layer !== false;
  const base = p.layers.find(l => l.id === layerId);
  if (!base || base.kind !== 'glyphs') return null;
  const W = p.canvas.w, H = p.canvas.h;
  const notes = emptyNotes();
  const state = evaluate(p, t);
  const lf = state.layers.find(l => l.layer.id === layerId);
  const bgOf = (st: GlyphStyle) => st.paper ?? p.canvas.bg;
  if (!lf || lf.layer.opacity <= 0) {
    const d = gridDims(base.glyphs, { w: W, h: H });
    notes.blank++;
    return { grid: blankGrid(d.cols, d.rows, d.cw, d.ch, W, H), style: frameStyle(base.glyphs), bg: bgOf(base.glyphs), paper: base.glyphs.paper !== null, notes, name: base.name };
  }
  const l = lf.layer as GlyphsLayer;
  await ensureGlyphFont(l.glyphs.font, l.glyphs.weight, sampleOf(l.glyphs) + '█▌_' + lf.glyphs);
  // the picture the grid reads: as the compositor feeds it
  let feed: HTMLCanvasElement = s.feed;
  let version: string | undefined;
  if (l.source === 'below') {
    const below = state.layers.slice(0, state.layers.indexOf(lf)).map(x => x.layer.id);
    feed = document.createElement('canvas');
    if (below.length) await s.compositor.render(state, feed, { scale: 1, quality: 'final', only: below, transparent: state.transparent });
    else {
      feed.width = W; feed.height = H;
      if (!state.transparent) { const x = feed.getContext('2d')!; x.fillStyle = state.bg; x.fillRect(0, 0, W, H); }
    }
  } else {
    const src = lf.source;
    if (!src || !(await s.provider.prepare(src, lf.srcTime))) return null;
    const img = s.provider.frame(src, lf.srcTime);
    if (!img) return null;
    version = `${src.id}:${src.media.map(m => m.id ?? '?').join(',')}@${src.kind === 'image' || src.kind === 'cutout' ? 0 : lf.srcTime}|${l.fit ?? 'cover'}|${W}x${H}`;
    if (feed.dataset.v !== version) {
      if (feed.width !== W) feed.width = W;
      if (feed.height !== H) feed.height = H;
      const x = feed.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      x.filter = 'none';
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.clearRect(0, 0, W, H);
      const r = fitRect(img.width, img.height, W, H, l.fit ?? 'cover');
      x.drawImage(img, r.x, r.y, r.w, r.h);
      feed.dataset.v = version;
    }
  }
  const style = { ...l.glyphs };
  const grid = glyphGridWith(feed, style, { w: W, h: H }, version ? { version } : {});
  if (feed !== s.feed) feed.width = feed.height = 0;
  const colors = cellColors(grid, style);
  const cg: CellGrid = { cols: grid.cols, rows: grid.rows, cw: grid.cw, ch: grid.ch, w: W, h: H, chars: grid.chars, lum: grid.lum, colors };
  const coverage = await maskCells(p, lf, t, W, H, grid, s);
  const fx: FrameEffects = {
    cells: lf.cells ? lf.cells(cg) : null,
    reveal: lf.reveal ? lf.reveal(cg) : null,
    tiles: lf.tiles ? lf.tiles(cg) : null,
    coverage,
    ...(whole ? { opacity: l.opacity, offset: { x: l.xf.x * W, y: l.xf.y * H } } : {}),
  };
  const out = applyFrame(grid, colors, fx, notes);
  const px: string[] = [];
  for (const f of l.finishes) if (f.on && f.amount > 0) px.push((finishDef(f.kind)?.name ?? f.kind).toLowerCase());
  if (whole && (l.xf.rot || l.xf.scale !== 1)) px.push('el giro o la escala de la capa');
  if (lf.stretch) px.push('el estiramiento de la capa');
  if (whole && l.blend !== 'normal') px.push(`el modo de fusión («${l.blend}»)`);
  notes.pixels = [...new Set(px)];
  return { grid: out, style: frameStyle(l.glyphs), bg: bgOf(l.glyphs), paper: l.glyphs.paper !== null, notes, name: base.name };
}

export interface GlyphFrames {
  frames: GlyphGrid[];
  times: number[];
  fps: number;
  cols: number;
  rows: number;
  bg: string;
  paper: boolean;
  style: GlyphStyle;
  notes: FrameNotes;
  name: string;
}

export class Cancelled extends Error {
  constructor() { super('Cancelado.'); this.name = 'AbortError'; }
}

/** The frames of a glyph layer over a stretch (t = from + i / fps), padded to one size, as drawn. */
export async function glyphFrames(p: Project, layerId: Id, o: {
  fps: number; from: number; to: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void; compositor?: Compositor;
}): Promise<GlyphFrames | null> {
  const times = frameTimes(p, { fps: o.fps, from: o.from, to: o.to });
  const s = frameSession(o.compositor ? { compositor: o.compositor } : {});
  const grids: GlyphGrid[] = [];
  let notes = emptyNotes();
  let first: GlyphFrame | null = null;
  try {
    for (let i = 0; i < times.length; i++) {
      if (o.signal?.aborted) throw new Cancelled();
      const f = await glyphFrameAt(p, layerId, times[i], s);
      if (!f) return null;
      first ??= f;
      grids.push(f.grid);
      notes = mergeNotes(notes, f.notes);
      o.onProgress?.(i + 1, times.length);
      // let the page breathe (progress, the cancel button)
      if (i % 3 === 2) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    s.release();
  }
  const cols = Math.max(...grids.map(g => g.cols)), rows = Math.max(...grids.map(g => g.rows));
  if (grids.some(g => g.cols !== cols || g.rows !== rows)) notes.resized = true;
  return {
    frames: grids.map(g => padGrid(g, cols, rows)), times, fps: o.fps, cols, rows,
    bg: first!.bg, paper: first!.paper, style: first!.style, notes, name: first!.name,
  };
}

/** Whether a glyph layer's characters change over time (clips, keyframes, a moving picture). */
export function glyphLayerMoves(p: Project, layerId: Id): boolean {
  const l = p.layers.find(x => x.id === layerId);
  if (!l || l.kind !== 'glyphs') return false;
  if (!(p.time.duration > 0)) return false;
  if (l.clips.length || l.span || p.tracks.some(t => t.layer === l.id)) return true;
  if (l.source === 'below') {
    const i = p.layers.indexOf(l);
    return p.layers.slice(0, i).some(x => x.visible && (x.clips.length || x.span || p.tracks.some(t => t.layer === x.id) || ('source' in x && movingSource(p, x.source as string)) || (x.kind === 'ascii' && x.style.motion.speed !== 0)));
  }
  return movingSource(p, l.source);
}

function movingSource(p: Project, id: string): boolean {
  const s = p.sources.find(x => x.id === id);
  return !!s && (s.kind === 'video' || (s.kind === 'sequence' && s.media.length > 1));
}
