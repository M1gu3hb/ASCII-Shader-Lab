/**
 * The editor's own UI state (one store per mounted editor): the tool, the selection, «Ajustar a», the
 * view options. The document itself lives in useGlifos; nothing here is saved with it.
 */
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { Glyph, GlyphDoc } from '../../doc';
import type { PathOp } from '../../geom/ops';
import { EMPTY_SEL, type Selection } from './selection';

export type ToolId = 'seleccionar' | 'pluma' | 'lapiz' | 'rectangulo' | 'elipse' | 'guia';

export const TOOLS: Array<{ id: ToolId; name: string; key: string; hint: string }> = [
  { id: 'seleccionar', name: 'Seleccionar', key: 'V', hint: 'Elige y mueve nodos, asas, contornos y componentes' },
  { id: 'pluma', name: 'Pluma', key: 'P', hint: 'Clic: nodo de esquina. Arrastrar: nodo suave. Clic en el primer nodo: cerrar' },
  { id: 'lapiz', name: 'Lápiz', key: 'N', hint: 'Dibuja a mano alzada un trazo con grosor' },
  { id: 'rectangulo', name: 'Rectángulo', key: 'R', hint: 'Arrastra para dibujar. Mayús: cuadrado' },
  { id: 'elipse', name: 'Elipse', key: 'E', hint: 'Arrastra para dibujar. Mayús: círculo' },
  { id: 'guia', name: 'Guía', key: 'G', hint: 'Clic: guía horizontal. Alt+clic: vertical. Arrastra una guía fuera para quitarla' },
];

export interface SnapPrefs { grid: boolean; step: number; lines: boolean; nodes: boolean }

export interface EdState {
  tool: ToolId;
  sel: Selection;
  snap: SnapPrefs;
  fill: boolean;
  /** Lápiz: stroke width (null: the style's weight) and whether the drawn loop is the contour itself. */
  pencilWidth: number | null;
  pencilClosed: boolean;
  /** Seleccionar drags the glyph's picture instead of the drawing. */
  moveImage: boolean;
  /** The view's scale (px per unit), shown by the zoom readout. */
  zoom: number;
  /** A drawing in progress with the pen (Esc or Enter end it). */
  penActive: boolean;
}

export function createEdStore(): StoreApi<EdState> {
  return createStore<EdState>(() => ({
    tool: 'seleccionar', sel: EMPTY_SEL, snap: { grid: false, step: 10, lines: true, nodes: true }, fill: true,
    pencilWidth: null, pencilClosed: false, moveImage: false, zoom: 1, penActive: false,
  }));
}

export const EdStoreCtx = createContext<StoreApi<EdState> | null>(null);

export function useEd<T>(pick: (s: EdState) => T): T {
  const st = useContext(EdStoreCtx);
  if (!st) throw new Error('useEd fuera del editor');
  return useStore(st, pick);
}

export function useEdStore(): StoreApi<EdState> {
  const st = useContext(EdStoreCtx);
  if (!st) throw new Error('useEdStore fuera del editor');
  return st;
}

export type ActionName =
  | 'duplicar' | 'eliminar' | 'reflejar-h' | 'reflejar-v' | 'cerrar' | 'abrir' | 'invertir' | 'solapamientos' | 'todo' | 'nada'
  | PathOp;

/** What the canvas offers to the toolbar and the keyboard. */
export interface CanvasApi {
  zoomBy(dir: 1 | -1): void;
  fit(): void;
  endPen(): boolean;
  /** Keyboard: select the next / previous node (false at either end, so Tab can leave the canvas). */
  stepNode(dir: 1 | -1): boolean;
}

/** The editor's operations, shared by the toolbar, canvas, inspector and panels. */
export interface EditorApi {
  ch: string;
  /** Glyph edits allowed (not read-only, not locked). */
  editable: boolean;
  /** Document edits allowed (guides, metrics): not read-only. */
  docEditable: boolean;
  /** One undoable edit of the open glyph; marks proposals corrected and empty glyphs drawn. */
  editPart(fn: (g: Glyph, d: GlyphDoc) => void, label: string, key?: string): boolean;
  editDoc(fn: (d: GlyphDoc) => void, label: string, key?: string): boolean;
  run(a: ActionName): void;
  rotate(deg: number): void;
  scale(sx: number, sy: number): void;
  /** Arrow keys: moves the selection (one undo step for a run of presses). */
  nudge(dx: number, dy: number): void;
  say(text: string): void;
  canvas: { current: CanvasApi | null };
}

export const EditorApiCtx = createContext<EditorApi | null>(null);

export function useEditorApi(): EditorApi {
  const a = useContext(EditorApiCtx);
  if (!a) throw new Error('useEditorApi fuera del editor');
  return a;
}
