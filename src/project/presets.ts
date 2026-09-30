/**
 * Saved settings («Ajustes guardados»): a look made on one photo or video, reusable on another.
 *
 *   scope 'layer'    one layer: its style (ASCII recipe, characters, photo adjustments, text, shape), its
 *                    finishes, its animation clips and keyframes, and the geometric parts of its mask;
 *   scope 'project'  every layer and the timeline, with the canvas and the time settings.
 *
 * Media is never inside a setting: the layers' sources become slots ('slot-main' = the picture the project
 * is about, 'slot-cut' = its cut-out, 'slot-2'… = more pictures) that applyPreset binds to the new project's
 * own sources. Mask parts in frame units (rectangles, ellipses, polygons, strokes, gradients, colour ranges)
 * are kept; painted, object or cut-out masks (raster parts) belong to one photo and are dropped, with a note
 * saying so. Clip and keyframe times can be scaled to the new project's length.
 *
 * Settings are saved in this browser (IndexedDB 'glyphos-presets') and travel as small .glyphos-ajuste.json
 * files; a file is validated like a project (normalizeProject), never trusted.
 */
import { createStore, del, get, getMany, keys, set, type UseStore } from 'idb-keyval';
import type { Recipe } from '../engine/recipe';
import { cloneProject, frameFor, LIMITS, newLayer, normalizeProject, uid } from './normalize';
import type { Id, Layer, MaskPart, Project, Source, Track } from './types';

export const PRESET_VERSION = 1 as const;
export const PRESET_EXT = '.glyphos-ajuste.json';
/** A setting file larger than this is not read (a real one is a few kilobytes plus its small picture). */
export const PRESET_MAX_BYTES = 2_000_000;

export type SlotId = string;
export const SLOT_MAIN = 'slot-main';
export const SLOT_CUT = 'slot-cut';
const SLOT_RE = /^slot-(main|cut|[0-9]{1,2})$/;

export interface Preset {
  kind: 'glyphos-preset';
  v: typeof PRESET_VERSION;
  id: Id;
  name: string;
  created: number;
  updated: number;
  scope: 'layer' | 'project';
  /** What it was made on: the frame, the timeline's length, the kind of picture. */
  from: { w: number; h: number; duration: number; kind: 'image' | 'video' | 'sequence' | 'none'; follows?: boolean };
  /** Layers whose sources are slots (see the top of this file). */
  layers: Layer[];
  tracks: Track[];
  /** Project scope: the canvas and the time settings. */
  canvas?: Project['canvas'];
  time?: Project['time'];
  /** What was left out when it was saved (in Spanish). */
  notes: string[];
  /** A small picture (data URL). */
  thumb?: string;
}

export interface PresetSummary { id: Id; name: string; scope: Preset['scope']; updated: number; layers: number; kinds: string[]; thumb?: string; animated: boolean }

/* ------------------------------------------------------------------ slots */

/** The picture a project is about: the bottom photo layer's source (not a cut-out), else the first one. */
export function mainSourceOf(p: Project): Source | null {
  for (const l of p.layers) {
    if (l.kind !== 'photo' || !l.source) continue;
    const s = p.sources.find(x => x.id === l.source);
    if (s && s.kind !== 'cutout') return s;
  }
  return p.sources.find(s => s.kind !== 'cutout') ?? p.sources[0] ?? null;
}

function slotter(p: Project): (id: string) => string {
  const main = mainSourceOf(p);
  const others = p.sources.filter(s => s.id !== main?.id && s.kind !== 'cutout');
  return (id: string) => {
    if (id === 'below' || id === 'style' || !id) return id;
    if (id === main?.id) return SLOT_MAIN;
    const s = p.sources.find(x => x.id === id);
    if (s?.kind === 'cutout') return SLOT_CUT;
    const i = others.findIndex(x => x.id === id);
    return i >= 0 ? `slot-${Math.min(99, i + 2)}` : SLOT_MAIN;
  };
}

const kindOfProject = (p: Project): Preset['from']['kind'] => {
  const m = mainSourceOf(p);
  return !m ? 'none' : m.kind === 'video' ? 'video' : m.kind === 'sequence' ? 'sequence' : 'image';
};

/** A layer made portable: slots instead of sources, raster mask parts dropped (with a note). */
function portable(l: Layer, slot: (id: string) => string, notes: string[]): Layer {
  const c = JSON.parse(JSON.stringify(l)) as Layer;
  if ('source' in c && typeof c.source === 'string') (c as { source: string }).source = slot(c.source);
  if (c.mask) {
    const parts: MaskPart[] = [];
    let dropped = 0;
    for (const part of c.mask.parts) {
      if (part.kind === 'raster') { dropped++; continue; }
      if (part.kind === 'color') parts.push({ ...part, source: slot(part.source) });
      else parts.push(part);
    }
    if (dropped) {
      notes.push(`La máscara de «${l.name}» tenía ${dropped === 1 ? 'una zona pintada o recortada' : `${dropped} zonas pintadas o recortadas`}: dependen de esa foto y no se guardan; las zonas geométricas sí.`);
    }
    c.mask = parts.length || !dropped ? { ...c.mask, parts } : null;
  }
  return c;
}

/* ------------------------------------------------------------------ making */

export function presetFromLayer(p: Project, layerId: Id, name?: string): Preset | null {
  const l = p.layers.find(x => x.id === layerId);
  if (!l) return null;
  const notes: string[] = [];
  const now = Date.now();
  return settled({
    kind: 'glyphos-preset', v: PRESET_VERSION, id: uid(), name: (name ?? l.name).trim().slice(0, 80) || l.name, created: now, updated: now, scope: 'layer',
    from: { w: p.canvas.w, h: p.canvas.h, duration: p.time.duration, kind: kindOfProject(p) },
    layers: [portable(l, slotter(p), notes)],
    tracks: p.tracks.filter(t => t.layer === l.id).map(t => JSON.parse(JSON.stringify(t)) as Track),
    notes,
  });
}

/** A setting in the form a saved one has (validated like any file: every value in range, finishes complete). */
const settled = (p: Preset): Preset => normalizePreset(p) ?? p;

export function presetFromProject(p: Project, name?: string): Preset {
  const notes: string[] = [];
  const slot = slotter(p);
  const now = Date.now();
  return settled({
    kind: 'glyphos-preset', v: PRESET_VERSION, id: uid(), name: (name ?? p.name).trim().slice(0, 80) || 'Ajuste', created: now, updated: now, scope: 'project',
    from: { w: p.canvas.w, h: p.canvas.h, duration: p.time.duration, kind: kindOfProject(p), follows: followsOwnPicture(p) },
    layers: p.layers.map(l => portable(l, slot, notes)),
    tracks: JSON.parse(JSON.stringify(p.tracks)) as Track[],
    canvas: { ...p.canvas }, time: { ...p.time }, notes,
  });
}

/** A lab style (a recipe: «Usar estilo del laboratorio») as a setting of one ASCII layer over the photo. */
export function presetFromRecipe(style: Recipe, name: string): Preset {
  const now = Date.now();
  const layer = newLayer('ascii', { name: name.slice(0, 60) || 'Estilo del laboratorio', source: SLOT_MAIN, style, opaque: true });
  return settled({
    kind: 'glyphos-preset', v: PRESET_VERSION, id: uid(), name: name.trim().slice(0, 80) || 'Estilo del laboratorio', created: now, updated: now, scope: 'layer',
    from: { w: 1920, h: 1080, duration: 0, kind: 'image' }, layers: [layer], tracks: [], notes: [],
  });
}

/* ------------------------------------------------------------------ applying */

export interface ApplyOptions {
  /** Layer settings: replace this layer (keeping its place and, for the main picture, its source); else a new layer goes on top. */
  target?: Id | null;
  /** Scale clip and keyframe times from the setting's length to the project's. */
  scaleTime?: boolean;
  /**
   * Project settings: 'auto' keeps the new picture's shape when the setting followed its own picture's shape,
   * and uses the setting's canvas when it was a designed format (a poster); 'preset' / 'keep' force one.
   */
  canvas?: 'auto' | 'preset' | 'keep';
}

export interface ApplyResult { project: Project; notes: string[]; layers: Id[] }

/** The setting on another project (a copy; one edit in the studio). Pure. */
export function applyPreset(target: Project, preset: Preset, o: ApplyOptions = {}): ApplyResult {
  const p = cloneProject(target);
  const notes: string[] = [];
  const main = mainSourceOf(p);
  const cut = p.sources.find(s => s.kind === 'cutout' && (!main || s.cutout?.from === main.id)) ?? p.sources.find(s => s.kind === 'cutout') ?? null;
  const others = p.sources.filter(s => s.id !== main?.id && s.kind !== 'cutout');
  let missCut = false, missOther = false;
  const bind = (slotId: string): string => {
    if (slotId === 'below' || slotId === 'style') return slotId;
    if (!main) return 'below';
    if (slotId === SLOT_CUT) { if (cut) return cut.id; missCut = true; return main.id; }
    const m = /^slot-([0-9]+)$/.exec(slotId);
    if (m) { const s = others[Number(m[1]) - 2]; if (s) return s.id; missOther = true; return main.id; }
    return main.id;
  };
  // times
  const fromD = preset.from.duration, toD = p.time.duration;
  let k = 1;
  const animated = preset.tracks.length > 0 || preset.layers.some(l => l.clips.length || l.span);
  if (o.scaleTime && fromD > 0 && toD > 0 && Math.abs(toD - fromD) > 1e-3) k = toD / fromD;
  // new ids everywhere (the same setting can be applied twice)
  const ids = new Map<Id, Id>();
  const layers: Layer[] = preset.layers.map(l0 => {
    const l = JSON.parse(JSON.stringify(l0)) as Layer;
    const nid = uid();
    ids.set(l.id, nid);
    l.id = nid;
    if ('source' in l && typeof l.source === 'string') (l as { source: string }).source = bind(l.source);
    if (l.mask) l.mask.parts = l.mask.parts.map(part => (part.kind === 'color' ? { ...part, source: bind(part.source) } : part)).filter(part => part.kind !== 'color' || part.source !== 'below');
    l.clips = l.clips.map(c => ({ ...c, id: uid(), start: c.start * k, dur: c.dur * k }));
    if (l.span) l.span = { in: l.span.in * k, out: l.span.out * k };
    return l;
  });
  const tracks: Track[] = preset.tracks.filter(t => ids.has(t.layer)).map(t => ({ ...t, layer: ids.get(t.layer)!, keys: t.keys.map(key => ({ ...key, t: key.t * k })) }));
  if (preset.scope === 'project') {
    p.layers = layers;
    p.tracks = tracks;
    if (preset.canvas) {
      const look = { bg: preset.canvas.bg, transparent: preset.canvas.transparent };
      // following the picture: the new photo's own shape (at its size, as a project made from it would be)
      const own = main && main.w > 0 && main.h > 0 ? frameFor(main.w, main.h) : { w: p.canvas.w, h: p.canvas.h };
      if (o.canvas === 'keep') p.canvas = { ...p.canvas, ...look };
      else if (o.canvas !== 'preset' && followsPicture(preset)) p.canvas = { ...p.canvas, w: own.w, h: own.h, ...look };
      else p.canvas = { ...preset.canvas };
    }
    if (preset.time) p.time = { ...p.time, fps: preset.time.fps, loop: preset.time.loop };
  } else {
    const t = o.target ? p.layers.findIndex(l => l.id === o.target) : -1;
    const layer = layers[0];
    if (!layer) return { project: p, notes, layers: [] };
    if (t >= 0) {
      const old = p.layers[t];
      // the layer keeps reading what the old one read when the setting was about the main picture
      if ('source' in old && 'source' in layer && typeof old.source === 'string' && (preset.layers[0] as { source?: string }).source === SLOT_MAIN) (layer as { source: string }).source = old.source;
      p.layers[t] = layer;
      p.tracks = p.tracks.filter(x => x.layer !== old.id);
    } else p.layers.push(layer);
    p.tracks.push(...tracks);
  }
  // a still project gets the setting's length when the setting animates
  if (animated && p.time.duration <= 0 && fromD > 0) {
    p.time = { ...p.time, duration: fromD };
    notes.push(`El ajuste anima sus capas: el proyecto dura ahora ${fromD.toFixed(1)} s.`);
  } else if (animated && fromD > 0 && toD > 0 && k === 1 && Math.abs(toD - fromD) > 0.05) {
    notes.push(`El ajuste se hizo para ${fromD.toFixed(1)} s y este proyecto dura ${toD.toFixed(1)} s: sus animaciones conservan sus tiempos (puedes escalarlos).`);
  }
  if (missCut) notes.push('El ajuste usaba un recorte del sujeto y esta foto no tiene: esas capas leen la foto completa. Usa «Quitar fondo» y vuelve a aplicarlo.');
  if (missOther) notes.push('El ajuste usaba más de una foto: las capas de las demás leen la foto principal.');
  if (!main && layers.some(l => 'source' in l)) notes.push('Este proyecto no tiene foto: las capas del ajuste leen lo que haya debajo.');
  notes.push(...preset.notes);
  return { project: normalizeProject(p), notes, layers: layers.map(l => l.id) };
}

/** Whether a project's canvas has its main picture's shape (1 % tolerance). */
function followsOwnPicture(p: Project): boolean {
  const m = mainSourceOf(p);
  if (!m || !(m.w > 0 && m.h > 0)) return false;
  return Math.abs(p.canvas.w / p.canvas.h - m.w / m.h) < 0.01 * (m.w / m.h);
}

/** Whether a project setting followed its own picture's shape (then it follows the new picture's too). */
export const followsPicture = (preset: Preset): boolean => preset.from.follows ?? true;

/* ------------------------------------------------------------------ validation */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/**
 * Any input → a valid setting, or null when it is not one. Accepts a setting or a setting file
 * ({ glyphos: 'ajuste', version, preset }); every layer goes through the project's own validation, sources
 * that are not slots become the main picture, raster mask parts (media the file does not carry) are dropped.
 */
export function normalizePreset(input: unknown): Preset | null {
  try {
    let o = obj(input);
    if (o.glyphos === 'ajuste') o = obj(o.preset);
    if (o.kind !== 'glyphos-preset') return null;
    const scope = o.scope === 'project' ? 'project' : o.scope === 'layer' ? 'layer' : null;
    if (!scope) return null;
    const from = obj(o.from);
    // the layers and keyframes as a project would have them (all the checks and limits of normalizeProject)
    const tmp = normalizeProject({ kind: 'glyphos-project', layers: Array.isArray(o.layers) ? o.layers : [], tracks: Array.isArray(o.tracks) ? o.tracks : [], sources: [], canvas: o.canvas, time: o.time });
    const layers = tmp.layers.slice(0, scope === 'layer' ? 1 : tmp.layers.length).map(l => {
      if ('source' in l && typeof l.source === 'string' && l.source !== 'below' && l.source !== 'style' && !SLOT_RE.test(l.source)) (l as { source: string }).source = SLOT_MAIN;
      if (l.mask) {
        l.mask.parts = l.mask.parts.filter(p => p.kind !== 'raster').map(p => (p.kind === 'color' && !SLOT_RE.test(p.source) ? { ...p, source: SLOT_MAIN } : p));
      }
      return l;
    });
    if (!layers.length) return null;
    const ids = new Set(layers.map(l => l.id));
    const num = (v: unknown, fb: number, a: number, z: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(z, Math.max(a, v)) : fb);
    const kinds = ['image', 'video', 'sequence', 'none'] as const;
    const now = Date.now();
    const p: Preset = {
      kind: 'glyphos-preset', v: PRESET_VERSION,
      id: typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(o.id) ? o.id : uid(),
      name: clean(o.name, 80) || 'Ajuste',
      created: num(o.created, now, 0, 8.64e15), updated: num(o.updated, now, 0, 8.64e15), scope,
      from: {
        w: Math.round(num(from.w, 1920, LIMITS.canvasMin, LIMITS.canvasMax)), h: Math.round(num(from.h, 1080, LIMITS.canvasMin, LIMITS.canvasMax)),
        duration: num(from.duration, 0, 0, LIMITS.duration), kind: (kinds as readonly string[]).includes(from.kind as string) ? from.kind as Preset['from']['kind'] : 'image',
        ...(typeof from.follows === 'boolean' ? { follows: from.follows } : {}),
      },
      layers,
      tracks: tmp.tracks.filter(t => ids.has(t.layer)),
      notes: (Array.isArray(o.notes) ? o.notes : []).map(n => clean(n, 300)).filter(Boolean).slice(0, 10),
    };
    if (scope === 'project') { p.canvas = tmp.canvas; p.time = tmp.time; }
    if (typeof o.thumb === 'string' && o.thumb.length < 400_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.thumb)) p.thumb = o.thumb;
    return p;
  } catch {
    return null;
  }
}

/** The setting as a file's text. */
export function presetFileText(p: Preset): string {
  return JSON.stringify({ glyphos: 'ajuste', version: PRESET_VERSION, preset: p });
}

export function presetFileName(p: Preset): string {
  const slug = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'ajuste';
  return `${slug}${PRESET_EXT}`;
}

/** Reads a setting file (text). Null with a reason when it is not one. */
export function readPresetText(text: string): { ok: true; preset: Preset } | { ok: false; message: string } {
  if (text.length > PRESET_MAX_BYTES) return { ok: false, message: 'Ese archivo es demasiado grande para ser un ajuste guardado.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, message: 'Ese archivo no es un ajuste de GLYPHOS (no es JSON válido).' }; }
  const o = obj(raw);
  if (o.glyphos === 'ajuste' && typeof o.version === 'number' && o.version > PRESET_VERSION) return { ok: false, message: 'Ese ajuste se hizo con una versión más nueva del estudio.' };
  const p = normalizePreset(raw);
  if (!p) return { ok: false, message: o.kind === 'glyphos-project' ? 'Es un proyecto, no un ajuste: ábrelo con «Abrir un proyecto».' : 'Ese archivo no es un ajuste de GLYPHOS.' };
  return { ok: true, preset: p };
}

export function summaryOfPreset(p: Preset): PresetSummary {
  return {
    id: p.id, name: p.name, scope: p.scope, updated: p.updated, layers: p.layers.length, kinds: [...new Set(p.layers.map(l => l.kind))],
    animated: p.tracks.length > 0 || p.layers.some(l => l.clips.length > 0), ...(p.thumb ? { thumb: p.thumb } : {}),
  };
}

/* ------------------------------------------------------------------ this browser */

let db: UseStore | null = null;
const store = () => (db ??= createStore('glyphos-presets', 'presets'));
const K = 'a:';

export async function savePreset(p: Preset): Promise<boolean> {
  try { await set(K + p.id, p, store()); return true; } catch { return false; }
}

export async function loadPreset(id: Id): Promise<Preset | null> {
  try { return normalizePreset(await get(K + id, store())); } catch { return null; }
}

/** Saved settings, the most recently changed first. */
export async function listPresets(): Promise<Preset[]> {
  try {
    const ks = (await keys<string>(store())).filter(k => typeof k === 'string' && k.startsWith(K));
    const all = (await getMany(ks, store())).map(normalizePreset).filter((p): p is Preset => !!p);
    return all.sort((a, b) => b.updated - a.updated);
  } catch { return []; }
}

export async function deletePreset(id: Id): Promise<void> {
  try { await del(K + id, store()); } catch { /* storage unavailable */ }
}

export async function renamePreset(id: Id, name: string): Promise<Preset | null> {
  const p = await loadPreset(id);
  const n = clean(name, 80);
  if (!p || !n) return null;
  const q = { ...p, name: n, updated: Date.now() };
  await savePreset(q);
  return q;
}

export async function duplicatePreset(id: Id): Promise<Preset | null> {
  const p = await loadPreset(id);
  if (!p) return null;
  const now = Date.now();
  const q: Preset = { ...JSON.parse(JSON.stringify(p)) as Preset, id: uid(), name: `${p.name} (copia)`.slice(0, 80), created: now, updated: now };
  await savePreset(q);
  return q;
}
