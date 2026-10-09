/**
 * The state of «Crea tus GLYPHOS» (zustand): the open document, what is selected, undo/redo.
 *
 * Documents in the store are never changed in place. An edit copies the document and the glyphs it touches
 * (the rest are shared), so undo keeps whole documents cheaply and a drag of 60 steps a second stays light.
 * Edits with the same `key` within COALESCE_MS (the steps of a drag, the keys of a number field) are one
 * undo step. Every edit bumps `rev` and `updated`; the autosaver (autosave.ts) listens with onDocChange.
 */
import { create } from 'zustand';
import { emptyGlyph, type Glyph, type GlyphDoc } from './doc';

export const UNDO_LIMIT = 300;
export const COALESCE_MS = 700;

export type SaveState = 'guardado' | 'pendiente' | 'guardando' | 'conflicto' | 'lleno' | 'sin-almacenamiento' | 'solo-lectura' | 'error';

export interface GlifosState {
  doc: GlyphDoc | null;
  /** A document from a newer format, or one another tab took over: shown, never written. */
  readOnly: string | null;
  /** The character open in the editor. */
  current: string | null;
  /** Characters selected on the board (for actions on a group). */
  picked: string[];
  canUndo: boolean;
  canRedo: boolean;
  /** The label of what undo / redo would revert. */
  undoLabel: string;
  redoLabel: string;
  save: SaveState;
  saveNote: string;
}

export const useGlifos = create<GlifosState>(() => ({
  doc: null, readOnly: null, current: null, picked: [], canUndo: false, canRedo: false, undoLabel: '', redoLabel: '',
  save: 'guardado', saveNote: '',
}));

const S = () => useGlifos.getState();

interface Step { doc: GlyphDoc; label: string }
let past: Step[] = [];
let future: Step[] = [];
let lastKey = '';
let lastAt = 0;
const listeners = new Set<(doc: GlyphDoc, why: 'edit' | 'undo' | 'redo' | 'open') => void>();

/** The autosaver and the preview listen to every new document. */
export function onDocChange(fn: (doc: GlyphDoc, why: 'edit' | 'undo' | 'redo' | 'open') => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function publish(doc: GlyphDoc, why: 'edit' | 'undo' | 'redo' | 'open') {
  useGlifos.setState({
    doc, canUndo: past.length > 0, canRedo: future.length > 0,
    undoLabel: past[past.length - 1]?.label ?? '', redoLabel: future[future.length - 1]?.label ?? '',
  });
  for (const l of [...listeners]) l(doc, why);
}

/** Opens a document (undo history starts empty). `readOnly` says why it cannot be written, if so. */
export function openDoc(doc: GlyphDoc, readOnly: string | null = null) {
  past = []; future = []; lastKey = ''; lastAt = 0;
  const cur = S().current;
  useGlifos.setState({ readOnly, current: cur && doc.glyphs[cur] ? cur : doc.chars.find(c => c !== ' ') ?? null, picked: [], save: readOnly ? 'solo-lectura' : 'guardado', saveNote: readOnly ?? '' });
  publish(doc, 'open');
}

export function closeDoc() {
  past = []; future = [];
  useGlifos.setState({ doc: null, readOnly: null, current: null, picked: [], canUndo: false, canRedo: false, undoLabel: '', redoLabel: '' });
}

/**
 * The document-level copy an edit works on: a new object, a new glyphs map, and the listed glyphs deep-
 * copied (everything else shared with the previous document).
 */
function draft(doc: GlyphDoc, glyphs: string[] | 'all'): GlyphDoc {
  const d: GlyphDoc = { ...doc, metrics: { ...doc.metrics }, style: { ...doc.style, source: { ...doc.style.source } }, glyphs: { ...doc.glyphs }, chars: [...doc.chars], kern: { ...doc.kern }, ramp: { order: [...doc.ramp.order], manual: doc.ramp.manual }, refs: [...doc.refs], images: { ...doc.images }, license: { ...doc.license }, published: [...doc.published], guides: doc.guides.map(g => ({ ...g })) };
  const list = glyphs === 'all' ? Object.keys(d.glyphs) : glyphs;
  for (const ch of list) if (d.glyphs[ch]) d.glyphs[ch] = structuredClone(d.glyphs[ch]);
  return d;
}

export interface EditOptions {
  /** Edits with the same key within COALESCE_MS are one undo step. */
  key?: string;
  /** Glyphs the edit changes (deep-copied first); 'all' for document-wide changes. Default: none. */
  glyphs?: string[] | 'all';
}

/** Changes the document. Returns false when it is read-only or nothing is open. */
export function edit(fn: (d: GlyphDoc) => void, label: string, o: EditOptions = {}): boolean {
  const s = S();
  if (!s.doc || s.readOnly) return false;
  const prev = s.doc;
  const next = draft(prev, o.glyphs ?? []);
  fn(next);
  next.rev = prev.rev + 1;
  next.updated = Date.now();
  const now = performance.now();
  if (!(o.key && o.key === lastKey && now - lastAt < COALESCE_MS && past.length)) {
    past.push({ doc: prev, label });
    if (past.length > UNDO_LIMIT) past.shift();
  }
  lastKey = o.key ?? '';
  lastAt = now;
  future = [];
  publish(next, 'edit');
  return true;
}

/** Changes one glyph (created empty if the board did not have it yet). */
export function editGlyph(ch: string, fn: (g: Glyph, d: GlyphDoc) => void, label: string, key?: string): boolean {
  return edit(d => {
    if (!d.glyphs[ch]) { d.glyphs[ch] = emptyGlyph(ch, d); if (!d.chars.includes(ch)) d.chars.push(ch); }
    fn(d.glyphs[ch], d);
  }, label, { key, glyphs: [ch] });
}

export function undo(): boolean {
  const s = S();
  const step = past.pop();
  if (!step || !s.doc || s.readOnly) { if (step) past.push(step); return false; }
  future.push({ doc: s.doc, label: step.label });
  lastKey = '';
  // the restored document keeps counting revisions forward: storage never sees a revision twice
  publish({ ...step.doc, rev: s.doc.rev + 1, updated: Date.now() }, 'undo');
  return true;
}

export function redo(): boolean {
  const s = S();
  const step = future.pop();
  if (!step || !s.doc || s.readOnly) { if (step) future.push(step); return false; }
  past.push({ doc: s.doc, label: step.label });
  lastKey = '';
  publish({ ...step.doc, rev: s.doc.rev + 1, updated: Date.now() }, 'redo');
  return true;
}

export const setCurrent = (ch: string | null) => useGlifos.setState({ current: ch });
export const setPicked = (chars: string[]) => useGlifos.setState({ picked: chars });
export const setSaveState = (save: SaveState, saveNote = '') => useGlifos.setState({ save, saveNote });
/** Another tab saved this document: this one stops writing it and says so. */
export const becomeReadOnly = (why: string) => useGlifos.setState({ readOnly: why, save: 'conflicto', saveNote: why });
