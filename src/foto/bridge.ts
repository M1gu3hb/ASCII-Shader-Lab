/**
 * Bridges with the lab:
 *   - «Abrir estilo en el laboratorio»: an ASCII layer's recipe (with the picture it reads, stored in the
 *     media store) opens in the lab as a new entry of its history;
 *   - «Usar estilo del laboratorio»: the lab's favourites and recent history (read-only, from the lab's own
 *     storage) as styles for the selected ASCII layer;
 *   - arriving from the lab («Llevar al estudio de foto»): a project with the photo and one ASCII layer.
 */
import { createStore, getMany } from 'idb-keyval';
import { PATTERN_IDS } from '../engine/catalog';
import { cloneRecipe, normalizeRecipe, type MediaRef, type Recipe } from '../engine/recipe';
import { evaluate } from '../project/evaluate';
import { newLayer, projectFromRecipe } from '../project/normalize';
import { putMedia } from '../project/persist';
import { addLayer, updateLayer, useProject } from '../project/store';
import type { AsciiLayer, Id, Project } from '../project/types';
import { normalizeEntry, normalizeFavorite, type Entry, type Favorite } from '../studio/history';
import { putHandoff, takeHandoff } from './handoff';
import { viewCompositor } from './scheduler';
import { say } from './ui';

/* ------------------------------------------------------------------ foto → lab */

/** The recipe an ASCII layer would be in the lab, with the picture it reads as the piece's image. */
async function labRecipe(l: AsciiLayer, p: Project): Promise<Recipe> {
  const r = cloneRecipe(l.style);
  r.interact = { ...r.interact, mode: 'none', auto: false };
  delete r.media.ref;
  if (l.source === 'style') {
    if (r.source === 'image' || r.source === 'video' || r.source === 'camera') r.source = 'pattern';
    return r;
  }
  if (l.source !== 'below') {
    const s = p.sources.find(x => x.id === l.source);
    const m = s?.media[0];
    if (s && m?.id && (s.kind === 'image' || s.kind === 'cutout' || s.kind === 'video')) {
      r.source = m.kind === 'video' ? 'video' : 'image';
      r.media.ref = { ...m };
      r.media.fit = l.fit === 'contain' ? 'contain' : l.fit === 'fill' ? 'stretch' : 'cover';
      return r;
    }
  }
  // 'below' (or a missing file): the composite under the layer, rendered and stored as a picture
  const i = p.layers.findIndex(x => x.id === l.id);
  const only = p.layers.slice(0, Math.max(0, i)).map(x => x.id);
  if (only.length) {
    const c = document.createElement('canvas');
    await viewCompositor().render(evaluate(p, useProject.getState().time), c, { scale: Math.min(1, 2048 / Math.max(p.canvas.w, p.canvas.h)), quality: 'final', only });
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
    if (blob) {
      const ref = await putMedia(blob, { kind: 'image', name: `${p.name} (debajo de ${l.name}).png`, w: c.width, h: c.height });
      const { stored: _s, ...clean } = ref;
      r.source = 'image';
      r.media.ref = clean;
      return r;
    }
  }
  r.source = 'pattern';
  return r;
}

export async function openInLab(l: AsciiLayer, p: Project) {
  say('Preparando el estilo para el laboratorio…');
  const recipe = await labRecipe(l, p);
  recipe.meta = { ...recipe.meta, name: `${l.name} · ${p.name}`.slice(0, 80) };
  const k = await putHandoff({ kind: 'foto-to-lab', recipe, name: recipe.meta.name ?? l.name, at: Date.now() });
  // what is pending in this project is saved before leaving
  const { saveNow } = await import('../project/store');
  await saveNow();
  location.href = `/studio/#foto=${k}`;
}

/* ------------------------------------------------------------------ lab → foto */

/** Opens a hand-off from the lab (#lab=<key>) as a new project. Null when there is none (or it expired). */
export async function projectFromLab(k: string): Promise<Project | null> {
  const h = await takeHandoff(k);
  if (!h || h.kind !== 'lab-to-foto') return null;
  const recipe = normalizeRecipe(h.recipe, PATTERN_IDS);
  return projectFromRecipe(recipe, h.ref, { ...(h.labEntry ? { labEntry: h.labEntry } : {}), ...(h.video ? { video: h.video } : {}), ...(h.name ? { name: h.name } : {}) });
}

/* ------------------------------------------------------------------ the lab's styles */

export interface LabStyle { id: string; name: string; recipe: Recipe; thumb?: string; fav: boolean; when: number }

let labDb: ReturnType<typeof createStore> | null = null;

/** The lab's favourites (first) and its latest history entries, read from the lab's storage. */
export async function readLabStyles(limit = 60): Promise<LabStyle[]> {
  try {
    const st = (labDb ??= createStore('keyval-store', 'keyval'));
    const [favRaw, idx] = await getMany(['mt.v2.favorites', 'mt.v3.history'], st) as [unknown, { ids?: unknown[] } | undefined];
    const favs = (Array.isArray(favRaw) ? favRaw : []).map(normalizeFavorite).filter((f): f is Favorite => !!f);
    const ids = (Array.isArray(idx?.ids) ? idx!.ids : []).filter((x): x is string => typeof x === 'string').slice(-limit).reverse();
    const [bodies, thumbs] = await Promise.all([getMany(ids.map(i => 'mt.v3.e:' + i), st), getMany(ids.map(i => 'mt.v3.t:' + i), st)]);
    const entries = ids.map((id, i) => (bodies[i] ? normalizeEntry({ ...(bodies[i] as object), id, thumb: thumbs[i] }) : null)).filter((e): e is Entry => !!e);
    return [
      ...favs.map(f => ({ id: 'f:' + f.id, name: f.name, recipe: f.recipe, ...(f.thumb ? { thumb: f.thumb } : {}), fav: true, when: f.updated })),
      ...entries.map(e => ({ id: 'e:' + e.id, name: e.label ?? e.recipe.meta.name ?? (e.kind === 'azar' ? 'Azar' : 'Pieza'), recipe: e.recipe, ...(e.thumb ? { thumb: e.thumb } : {}), fav: false, when: e.updated ?? e.created })),
    ];
  } catch {
    return [];
  }
}

/** A lab recipe as an ASCII layer's style (the layer keeps reading its own source). */
export function styleFromLab(r: Recipe): Recipe {
  const s = cloneRecipe(normalizeRecipe(r, PATTERN_IDS));
  s.interact = { ...s.interact, mode: 'none', auto: false };
  delete s.media.ref;
  return s;
}

/** Applies a lab style to the selected ASCII layer, or adds a new ASCII layer with it. */
export function applyLabStyle(st: LabStyle): Id | null {
  const p = useProject.getState().project;
  if (!p) return null;
  const style = styleFromLab(st.recipe);
  const sel = p.layers.find(l => l.id === useProject.getState().selection[0]);
  if (sel?.kind === 'ascii') {
    updateLayer(sel.id, x => { (x as AsciiLayer).style = style; });
    say(`Estilo «${st.name}» del laboratorio aplicado a «${sel.name}».`);
    return sel.id;
  }
  const photo = p.layers.find(l => l.kind === 'photo' && l.source);
  const source = photo && photo.kind === 'photo' ? photo.source : 'style';
  const own = style.source === 'pattern' || style.source === 'text';
  const layer = newLayer('ascii', { name: st.name.slice(0, 60), source: own && source === 'style' ? 'style' : source, style, opaque: source === 'style' });
  addLayer(layer);
  say(`Capa ASCII nueva con el estilo «${st.name}» del laboratorio.`);
  return layer.id;
}

export type { MediaRef };
