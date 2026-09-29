/**
 * Keyframes as data: which properties of a layer can be animated (with their Spanish names, kinds and
 * ranges), and pure helpers to add, move, delete and ease keys on a project draft, plus loops (the whole
 * project, a clip's repeat or ping-pong). The store's edit(fn) hands these functions its copy:
 *
 *   edit(d => addKey(d, layer.id, 'glyphs.cell', time))           // a key at the playhead with the value there
 *   edit(d => moveKey(d, layer.id, 'opacity', 1.2, 1.5), 'drag')  // one undo step per drag (same key)
 */
import { FINISHES } from '../fx/index';
import { CHARSET_LIST } from '../glyphs/index';
import type { ParamValue } from '../project/clips';
import { getPath, trackValue } from '../project/evaluate';
import type { AnimClip, Ease, Id, Layer, Project, Track } from '../project/types';

export interface PathInfo {
  path: string;
  /** Spanish name and the group it is listed under. */
  label: string;
  group: 'Capa' | 'Máscara' | 'Estilo' | 'Color' | 'Tono' | 'Efectos' | 'Acabados' | 'Ajustes' | 'Texto' | 'Forma';
  type: 'number' | 'color' | 'string' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  /** For strings that pick from a list (charsets…): [value, label]. */
  options?: Array<[string, string]>;
}

const n = (path: string, label: string, group: PathInfo['group'], min: number, max: number, step = 0.01): PathInfo => ({ path, label, group, type: 'number', min, max, step });
const c = (path: string, label: string, group: PathInfo['group']): PathInfo => ({ path, label, group, type: 'color' });

/** Every property of this layer a key can animate (only those it has: a paper colour only when it has one…). */
export function animatablePaths(layer: Layer): PathInfo[] {
  const out: PathInfo[] = [
    n('opacity', 'Opacidad', 'Capa', 0, 1),
    n('xf.x', 'Posición horizontal', 'Capa', -1, 1, 0.005),
    n('xf.y', 'Posición vertical', 'Capa', -1, 1, 0.005),
    n('xf.scale', 'Escala', 'Capa', 0.1, 4),
    n('xf.rot', 'Giro', 'Capa', -360, 360, 0.5),
  ];
  if (layer.mask) {
    out.push(n('mask.feather', 'Borde suave de la máscara', 'Máscara', 0, 200, 1), n('mask.opacity', 'Fuerza de la máscara', 'Máscara', 0, 1));
    layer.mask.parts.forEach((pt, i) => {
      const k = `Parte ${i + 1}`;
      if (pt.kind === 'rect' || pt.kind === 'ellipse') {
        out.push(
          n(`mask.parts.${i}.x`, `${k}: x`, 'Máscara', -1, 2, 0.005), n(`mask.parts.${i}.y`, `${k}: y`, 'Máscara', -1, 2, 0.005),
          n(`mask.parts.${i}.w`, `${k}: ancho`, 'Máscara', 0, 3, 0.005), n(`mask.parts.${i}.h`, `${k}: alto`, 'Máscara', 0, 3, 0.005),
          n(`mask.parts.${i}.rot`, `${k}: giro`, 'Máscara', -360, 360, 0.5),
        );
      }
      if ('soft' in pt) out.push(n(`mask.parts.${i}.soft`, `${k}: suavidad`, 'Máscara', 0, 200, 1));
      out.push(n(`mask.parts.${i}.alpha`, `${k}: fuerza`, 'Máscara', 0, 1));
    });
  }
  switch (layer.kind) {
    case 'photo':
      out.push(
        n('adjust.bright', 'Brillo', 'Ajustes', -1, 1), n('adjust.contrast', 'Contraste', 'Ajustes', 0, 3), n('adjust.gamma', 'Gamma', 'Ajustes', 0.2, 3),
        n('adjust.sat', 'Saturación', 'Ajustes', 0, 3), n('adjust.hue', 'Tono', 'Ajustes', -180, 180, 1), n('adjust.temp', 'Temperatura', 'Ajustes', -1, 1),
        n('adjust.blur', 'Desenfoque', 'Ajustes', 0, 60, 0.5), n('adjust.sharpen', 'Enfoque', 'Ajustes', 0, 1),
      );
      break;
    case 'ascii': {
      out.push(
        n('style.glyph.cell', 'Tamaño de celda', 'Estilo', 3, 96, 0.5), n('style.glyph.aspect', 'Proporción de celda', 'Estilo', 0.8, 3),
        n('style.glyph.weight', 'Peso', 'Estilo', 100, 900, 100), n('style.glyph.scale', 'Tamaño del glifo', 'Estilo', 0.3, 2),
        { path: 'style.glyph.charset', label: 'Juego de caracteres', group: 'Estilo', type: 'string' },
        n('style.glyph.edge', 'Contornos', 'Estilo', 0, 1), n('style.glyph.dither', 'Tramado', 'Estilo', 0, 1),
        n('style.tone.bright', 'Brillo', 'Tono', -1, 1), n('style.tone.contrast', 'Contraste', 'Tono', 0, 3), n('style.tone.gamma', 'Gamma', 'Tono', 0.2, 3),
        n('style.tone.levels', 'Bandas de tono', 'Tono', 0, 16, 1),
        n('style.color.hue', 'Giro de tono', 'Color', 0, 1), n('style.color.shift', 'Desplazamiento de la rampa', 'Color', -2, 2), n('style.color.sat', 'Saturación', 'Color', 0, 2),
        c('style.color.bg', 'Fondo', 'Color'),
        n('style.fx.glow', 'Resplandor', 'Efectos', 0, 1), n('style.fx.bloom', 'Bloom', 'Efectos', 0, 1), n('style.fx.scan', 'Líneas', 'Efectos', 0, 1),
        n('style.fx.grain', 'Grano', 'Efectos', 0, 1), n('style.fx.flicker', 'Parpadeo', 'Efectos', 0, 1),
        n('style.media.mix', 'Patrón sobre la imagen', 'Efectos', 0, 1), n('style.media.reveal', 'Foto a través del ASCII', 'Efectos', 0, 1),
        n('style.motion.speed', 'Velocidad del patrón', 'Efectos', -3, 3),
      );
      layer.style.color.stops.forEach((_, i) => out.push(c(`style.color.stops.${i}`, `Color ${i + 1} de la rampa`, 'Color')));
      break;
    }
    case 'glyphs': {
      const g = layer.glyphs;
      out.push(
        n('glyphs.cell', 'Tamaño de celda', 'Estilo', 3, 64, 0.5), n('glyphs.aspect', 'Proporción de celda', 'Estilo', 0.8, 3), n('glyphs.weight', 'Peso', 'Estilo', 100, 900, 100),
        { path: 'glyphs.charset', label: 'Juego de caracteres', group: 'Estilo', type: 'string', options: CHARSET_LIST.map(cs => [cs.id, cs.name]) },
        n('glyphs.bright', 'Brillo', 'Tono', -1, 1), n('glyphs.contrast', 'Contraste', 'Tono', 0, 3), n('glyphs.gamma', 'Gamma', 'Tono', 0.2, 3),
        n('glyphs.sat', 'Saturación', 'Tono', 0, 3), n('glyphs.edge', 'Contornos', 'Tono', 0, 1), n('glyphs.cutoff', 'Umbral de vacío', 'Tono', 0, 1),
        c('glyphs.ink', 'Tinta', 'Color'),
      );
      if (g.paper !== null) out.push(c('glyphs.paper', 'Papel', 'Color'));
      g.palette.forEach((_, i) => out.push(c(`glyphs.palette.${i}`, `Color ${i + 1} de la paleta`, 'Color')));
      break;
    }
    case 'text':
      out.push(
        n('size', 'Tamaño', 'Texto', 0.005, 0.5, 0.001), c('color', 'Color', 'Texto'), n('tracking', 'Espaciado', 'Texto', -0.2, 1, 0.005),
        n('leading', 'Interlineado', 'Texto', 0.6, 3), n('box.x', 'Caja: x', 'Texto', -1, 2, 0.005), n('box.y', 'Caja: y', 'Texto', -1, 2, 0.005),
        n('box.w', 'Caja: ancho', 'Texto', 0.02, 3, 0.005), { path: 'text', label: 'Texto', group: 'Texto', type: 'string' },
      );
      break;
    case 'shape':
      out.push(n('width', 'Grosor', 'Forma', 0, 60, 0.5));
      if (layer.stroke !== null) out.push(c('stroke', 'Trazo', 'Forma'));
      if (layer.fill !== null) out.push(c('fill', 'Relleno', 'Forma'));
      for (let i = 0; i < layer.pts.length; i++) out.push(n(`pts.${i}`, `Punto ${(i >> 1) + 1}: ${i % 2 ? 'y' : 'x'}`, 'Forma', -1, 2, 0.005));
      break;
  }
  layer.finishes.forEach((f, i) => {
    const def = FINISHES.find(d => d.kind === f.kind);
    const name = def?.name ?? f.kind;
    out.push(n(`finishes.${i}.amount`, `${name}: cantidad`, 'Acabados', 0, 1));
    for (const p of def?.params ?? []) {
      if (p.type === 'range') out.push(n(`finishes.${i}.params.${p.key}`, `${name}: ${p.label.toLowerCase()}`, 'Acabados', p.min, p.max, p.step));
      else if (p.type === 'color') out.push(c(`finishes.${i}.params.${p.key}`, `${name}: ${p.label.toLowerCase()}`, 'Acabados'));
    }
  });
  return out;
}

/** The info of one path of a layer (null when the layer has no such property). */
export function pathInfo(layer: Layer, path: string): PathInfo | null {
  return animatablePaths(layer).find(p => p.path === path) ?? null;
}

/* ------------------------------------------------------------------ reading */

export const trackOf = (p: Pick<Project, 'tracks'>, layer: Id, path: string): Track | undefined => p.tracks.find(t => t.layer === layer && t.path === path);
export const tracksOf = (p: Pick<Project, 'tracks'>, layer: Id): Track[] => p.tracks.filter(t => t.layer === layer);

/**
 * The value a property has at t from the layer and its keys (without clips: what a new key there starts
 * from). undefined when the layer has no such property.
 */
export function valueAt(p: Project, layer: Id, path: string, t: number): ParamValue | undefined {
  const tr = trackOf(p, layer, path);
  if (tr && tr.keys.length) return trackValue(tr.keys, t);
  const l = p.layers.find(x => x.id === layer);
  const v = l ? getPath(l, path) : undefined;
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
}

/** Every key time of a layer (or of the whole project), sorted and without repeats: snapping targets. */
export function keyTimes(p: Pick<Project, 'tracks'>, layer?: Id): number[] {
  const s = new Set<number>();
  for (const tr of p.tracks) if (!layer || tr.layer === layer) for (const k of tr.keys) s.add(k.t);
  return [...s].sort((a, b) => a - b);
}

/** A time on the frame grid of the project (keys land on frames). */
export function onFrame(t: number, fps: number): number {
  const f = fps > 0 ? fps : 30;
  return Math.max(0, Math.round(t * f) / f);
}

const SAME = 1e-4;

/* ------------------------------------------------------------------ writing (on a draft) */

/**
 * Adds (or replaces) the key of a layer's property at t. Without a value, the property's value at t is
 * used (so adding a key changes nothing until it is edited). Returns the key's time, or null when the
 * layer has no such property.
 */
export function addKey(d: Project, layer: Id, path: string, t: number, v?: ParamValue, ease: Ease = { kind: 'linear' }): number | null {
  const val = v ?? valueAt(d, layer, path, t);
  if (val === undefined || !d.layers.some(l => l.id === layer)) return null;
  let tr = trackOf(d, layer, path);
  if (!tr) { tr = { layer, path, keys: [] }; d.tracks.push(tr); }
  const at = Math.max(0, t);
  const k = tr.keys.find(x => Math.abs(x.t - at) < SAME);
  if (k) { k.v = val; k.ease = ease; } else tr.keys.push({ t: at, v: val, ease });
  tr.keys.sort((a, b) => a.t - b.t);
  return at;
}

/** Moves a key from one time to another (a key already there is replaced). Returns the new time. */
export function moveKey(d: Project, layer: Id, path: string, from: number, to: number): number | null {
  const tr = trackOf(d, layer, path);
  const k = tr?.keys.find(x => Math.abs(x.t - from) < SAME);
  if (!tr || !k) return null;
  const at = Math.max(0, to);
  tr.keys = tr.keys.filter(x => x === k || Math.abs(x.t - at) >= SAME);
  k.t = at;
  tr.keys.sort((a, b) => a.t - b.t);
  return at;
}

export interface KeyRef { layer: Id; path: string; t: number }

/** Moves several keys by dt (kept ≥ 0; the order inside each track is kept). */
export function shiftKeys(d: Project, refs: KeyRef[], dt: number): KeyRef[] {
  const minT = Math.min(...refs.map(r => r.t));
  const delta = Math.max(-minT, dt);
  const out: KeyRef[] = [];
  // move from the far end so keys never pass over each other
  const sorted = [...refs].sort((a, b) => (delta > 0 ? b.t - a.t : a.t - b.t));
  for (const r of sorted) { const at = moveKey(d, r.layer, r.path, r.t, r.t + delta); if (at !== null) out.push({ ...r, t: at }); }
  return out;
}

/** Deletes the key at t (the track goes with its last key). */
export function deleteKey(d: Project, layer: Id, path: string, t: number): boolean {
  const tr = trackOf(d, layer, path);
  if (!tr) return false;
  const before = tr.keys.length;
  tr.keys = tr.keys.filter(x => Math.abs(x.t - t) >= SAME);
  if (!tr.keys.length) d.tracks = d.tracks.filter(x => x !== tr);
  return tr.keys.length !== before;
}

/** Changes the easing of the key at t (it applies from this key to the next). */
export function setKeyEase(d: Project, layer: Id, path: string, t: number, ease: Ease): boolean {
  const k = trackOf(d, layer, path)?.keys.find(x => Math.abs(x.t - t) < SAME);
  if (!k) return false;
  k.ease = ease.kind === 'bezier' ? { kind: 'bezier', p: [...ease.p] } : { kind: ease.kind };
  return true;
}

/** Changes the value of the key at t. */
export function setKeyValue(d: Project, layer: Id, path: string, t: number, v: ParamValue): boolean {
  const k = trackOf(d, layer, path)?.keys.find(x => Math.abs(x.t - t) < SAME);
  if (!k) return false;
  k.v = v;
  return true;
}

/** Removes a whole track. */
export function deleteTrack(d: Project, layer: Id, path: string): void {
  d.tracks = d.tracks.filter(x => !(x.layer === layer && x.path === path));
}

/* ------------------------------------------------------------------ loops */

/** The whole project loops (players and exports repeat it). */
export function setProjectLoop(d: Project, on: boolean): void { d.time.loop = on; }

/** A clip's repeats inside its duration, and whether every other one runs back (ping-pong). */
export function setClipLoop(d: Project, clip: Id, repeat: number, pingpong: boolean): boolean {
  const c = findClip(d, clip);
  if (!c) return false;
  c.clip.repeat = Math.max(1, Math.min(100, Math.round(repeat)));
  c.clip.pingpong = pingpong;
  return true;
}

/** A clip and its layer, by id. */
export function findClip(p: Project, id: Id): { layer: Layer; clip: AnimClip; index: number } | null {
  for (const layer of p.layers) {
    const index = layer.clips.findIndex(c => c.id === id);
    if (index >= 0) return { layer, clip: layer.clips[index], index };
  }
  return null;
}
