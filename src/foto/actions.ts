/**
 * The studio's verbs, shared by buttons, the phone bar and the keyboard: the dice, versions, favourites,
 * undo/redo, zoom. Each says what it did (status line + screen reader).
 */
import { useProject, edit, undo as undoP, redo as redoP, commitVersion, restoreVersion, toggleFavorite, setVersionThumb } from '../project/store';
import type { Id, Project } from '../project/types';
import type { Version } from '../project/versions';
import { freshSeed, rollComposition, rollLayer, rollable } from './dice';
import { request } from './scheduler';
import { projectThumb } from './thumbs';
import { say, setUI, ui } from './ui';

const P = () => useProject.getState();
const seen = new Set<string>();

/** The layer «Azar · capa» acts on: the selected ASCII or characters layer, else the top ASCII layer. */
export function diceLayer(p: Project): Id | null {
  const sel = P().selection[0];
  const l = p.layers.find(x => x.id === sel);
  if (l && (l.kind === 'ascii' || l.kind === 'glyphs') && !l.locked) return l.id;
  for (let i = p.layers.length - 1; i >= 0; i--) { const x = p.layers[i]; if ((x.kind === 'ascii' || x.kind === 'glyphs') && !x.locked) return x.id; }
  return null;
}

const currentVersion = (): Version | undefined => { const v = P().versions; return v.list[v.cursor]; };

/** Makes the thumbnail of a version in the background. */
export function thumbVersion(v: Version | null | undefined) {
  if (!v) return;
  void projectThumb(v.project, 160).then(url => { if (url) setVersionThumb(v.id, url); });
}

/** Rolls the dice (scope from the deck: the selected layer or everything). */
export function azar(scope = ui().diceScope) {
  const p = P().project;
  if (!p) return;
  const locks = P().locks, keep = P().keep;
  const seed = freshSeed();
  let next: Project | null = null;
  let what = '';
  if (scope === 'capa') {
    const id = diceLayer(p);
    if (!id) {
      if (!rollable(p).length) { say('No hay nada que el dado pueda cambiar: añade una capa ASCII o de caracteres (o desbloquéala).'); return; }
      next = rollComposition(p, { locks, keep, seed, seen });
      what = 'la composición';
    } else {
      next = rollLayer(p, id, { locks, keep, seed, seen });
      what = `«${p.layers.find(l => l.id === id)?.name ?? 'la capa'}»`;
    }
  } else {
    if (!rollable(p).length) { say('No hay nada que el dado pueda cambiar: todas las capas están bloqueadas o no tienen estilo.'); return; }
    next = rollComposition(p, { locks, keep, seed, seen });
    what = 'la composición';
  }
  if (!next || next === p) { say('El dado no cambió nada (revisa los candados).'); return; }
  if (!P().versions.list.length) thumbVersion(commitVersion('inicio'));
  const parent = currentVersion()?.id;
  const out = next;
  edit(() => out);
  const v = commitVersion('azar', { ...(parent ? { parent } : {}), seed });
  thumbVersion(v);
  say(`Azar: nuevo estilo para ${what}. ← vuelve al anterior.`);
}

export function prev() {
  const vl = P().versions;
  if (vl.cursor <= 0) { say('Es la primera versión.'); return; }
  restoreVersion(vl.list[vl.cursor - 1].id);
  say(`Versión ${vl.cursor} de ${vl.list.length}.`);
}

/** Next version; at the end, a new roll (as the lab's →). */
export function next() {
  const vl = P().versions;
  if (vl.cursor < 0 || vl.cursor >= vl.list.length - 1) { azar(); return; }
  restoreVersion(vl.list[vl.cursor + 1].id);
  say(`Versión ${vl.cursor + 2} de ${vl.list.length}.`);
}

/** Restores a version exactly (every layer, mask and setting as it was). */
export function goVersion(id: Id) {
  const vl = P().versions;
  const i = vl.list.findIndex(v => v.id === id);
  if (i < 0) return;
  restoreVersion(id);
  say(`Versión ${i + 1} de ${vl.list.length} restaurada tal cual.`);
}

/** Keeps the project as it is now as a version (a branch of the current one). */
export function saveVersion(label?: string): Version | null {
  if (!P().project) return null;
  const parent = currentVersion()?.id;
  const v = commitVersion(P().versions.list.length ? 'guardado' : 'inicio', { ...(parent ? { parent } : {}), ...(label ? { label } : {}) });
  thumbVersion(v);
  say('Versión guardada: puedes seguir editando sin perderla.');
  return v;
}

/** ★ on the current version (the project as it is now is kept as a version first when it differs). */
export function favorite() {
  const p = P().project;
  if (!p) return;
  let v = currentVersion();
  if (!v || JSON.stringify(v.project) !== JSON.stringify(p)) v = saveVersion() ?? undefined;
  if (!v) return;
  toggleFavorite(v.id);
  const now = P().versions.list.find(x => x.id === v!.id)?.fav;
  say(now ? 'Guardada en favoritas ★.' : 'Quitada de favoritas.');
}

export function undo() { if (undoP()) say('Deshecho.'); else say('No hay nada que deshacer.'); }
export function redo() { if (redoP()) say('Rehecho.'); else say('No hay nada que rehacer.'); }

/* ------------------------------------------------------------------ zoom */

export function zoomFit() { setUI({ zoom: 'fit', pan: { x: 0, y: 0 } }); say('Vista ajustada a la ventana.'); }
export function zoomTo(k: number) { setUI({ zoom: k, pan: { x: 0, y: 0 } }); say(`Zoom al ${Math.round(k * 100)} %.`); }

/** Steps the zoom around the viewport's centre (the current zoom is read from the render scale when fitted). */
export function zoomStep(dir: 1 | -1, current: number) {
  const steps = [0.05, 0.1, 0.125, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
  const k = dir > 0 ? steps.find(s => s > current * 1.01) ?? 16 : [...steps].reverse().find(s => s < current * 0.99) ?? 0.05;
  setUI({ zoom: k });
  say(`Zoom al ${Math.round(k * 100)} %.`);
}

export function toggleCompare() {
  const on = !ui().compare;
  setUI({ compare: on });
  say(on ? 'Antes y después: arrastra el divisor (o usa ← →) para comparar con el original.' : 'Comparación cerrada.');
  request(false);
}
