/**
 * The extras' own interface state (zustand): which of their sheets is open and what it starts with. Kept
 * apart from the studio's ui.ts so the extras mount with one line each and never change the shell's types.
 */
import { create } from 'zustand';
import type { MediaRef } from '../../engine/recipe';

export type ExtrasSheet = 'carteles' | 'ajustes' | 'secuencia' | 'paralaje' | 'palabras';

export interface ExtrasState {
  sheet: ExtrasSheet | null;
  /** 'new': start a new project (start screen); 'open': work on the open project. */
  mode: 'new' | 'open';
  /** The poster the sheet starts on. */
  poster: string | null;
  /** Photos picked on the start screen for a sequence (already stored). */
  photos: MediaRef[];
  /** A saved setting chosen on the start screen, waiting for a photo. */
  preset: string | null;
  /** Show trim, bleed and safe-area guides over the viewport when the canvas has a known size. */
  guides: boolean;
}

export const useExtras = create<ExtrasState>(() => ({ sheet: null, mode: 'open', poster: null, photos: [], preset: null, guides: true }));

export function openExtras(sheet: ExtrasSheet, o: Partial<Omit<ExtrasState, 'sheet'>> = {}) {
  useExtras.setState({ mode: 'open', poster: null, photos: [], preset: null, ...o, sheet });
}

export const closeExtras = () => useExtras.setState({ sheet: null, photos: [] });
