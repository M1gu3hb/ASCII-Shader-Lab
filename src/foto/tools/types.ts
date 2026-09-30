/**
 * Tools of the photo studio's viewport (selection, brushes, object selection…). CONTRACT between the studio
 * shell (viewport, panels: lane «studio») and the tools (lane «tools»): the shell owns the viewport, the
 * overlay canvas, pan/zoom and the tool palette; each tool receives pointer events in frame units and edits
 * the open project through src/project/store (edit, updateLayer…), so every change is one undo step.
 *
 * Units: points are frame units (0..1 of the output frame, origin top-left), as in src/project/types.ts.
 */
import type { ReactNode } from 'react';
import type { Id, MaskOp, MaskPart } from '../../project/types';

export interface Pt {
  x: number;
  y: number;
}

export interface View {
  /** The frame (the project canvas) as drawn in the viewport, in viewport CSS px. */
  frame: { x: number; y: number; w: number; h: number };
  /** The project canvas in px (project.canvas.w/h). */
  canvas: { w: number; h: number };
  /** Viewport CSS px per frame unit along the frame's shorter side (for hit tolerances and brush sizes). */
  zoom: number;
  /** Client coordinates (PointerEvent.clientX/Y) → frame units. */
  toFrame(clientX: number, clientY: number): Pt;
  /** Frame units → viewport CSS px (for drawing on the overlay). */
  toScreen(p: Pt): Pt;
}

export interface ToolEvent {
  /** Frame units. */
  p: Pt;
  /** Viewport CSS px. */
  s: Pt;
  /** 0..1 (0.5 when the device does not report it). */
  pressure: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  button: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, ⌘ on macOS. */
  mod: boolean;
  time: number;
  native: PointerEvent;
}

export interface ToolHost {
  view(): View;
  /** The layer the tool acts on (the selected one), or null when there is none. */
  target(): Id | null;
  /** The operation chosen in the options bar (touch has no modifier keys); tools may override it with shift/alt. */
  op(): MaskOp;
  setOp(op: MaskOp): void;
  /** Redraws the overlay (handles, rubber bands); cheap, call it on every move. */
  redrawOverlay(): void;
  /**
   * Shows a part being drawn as a live preview of the composition without committing it (not in history);
   * null clears it. The shell renders at preview scale while this is set.
   * `replace` (optional, added by lane «tools»): the index of a part of that layer's mask the preview stands in
   * for (a part being edited with its handles), instead of being appended after the last part. A shell that
   * ignores it shows the old and the new part together until the edit ends (the overlay stays exact).
   */
  preview(part: { layer: Id; part: MaskPart; replace?: number } | null): void;
  /** Pixels of the target layer's source at the current time, at the project canvas size (colour pick, magnetic lasso, object selection). */
  sourcePixels(): Promise<HTMLCanvasElement | null>;
  /** Status line + screen-reader announcement (Spanish). */
  say(msg: string): void;
  /**
   * Optional (added by lane «tools»): switches the active tool by id (the part editor's «Editar con pinceles»
   * opens a brush; the object tool's «Recortar fondo»). Shells without it hide those buttons.
   */
  setTool?(id: string): void;
  /**
   * Optional (added by lane «tools»): opens the «Recorte» panel (CutoutPanel) for the target's source. Shells
   * without it hide the object tool's link to it.
   */
  openCutout?(): void;
  /**
   * Optional (added by lane «video-studio»): a video source's picture at the current time, placed in the frame
   * the way the first layer showing it places it (its fit), at the project canvas size scaled down to `maxSide`:
   * the frame object tracking reads. Null when the picture is not there.
   */
  videoPixels?(sourceId: Id, maxSide?: number): Promise<HTMLCanvasElement | null>;
}

export interface Tool {
  id: string;
  /** Spanish name and one line on how to use it, including touch («Arrastra… · En teléfono: …»). */
  name: string;
  hint: string;
  /** Keyboard shortcut (one letter), shown in the palette and the help sheet. */
  shortcut?: string;
  group: 'seleccion' | 'pincel' | 'objeto' | 'dibujo';
  /** Inline SVG markup, 24 × 24 viewBox, stroke/fill currentColor. */
  icon: string;
  cursor?: string;
  /** false: a one-finger drag pans the view instead of reaching the tool (touch). */
  draws: boolean;
  activate?(host: ToolHost): void;
  deactivate?(host: ToolHost): void;
  down?(e: ToolEvent, host: ToolHost): void;
  move?(e: ToolEvent, host: ToolHost): void;
  up?(e: ToolEvent, host: ToolHost): void;
  /** The gesture was cancelled (pointercancel, a second finger arrived, Escape). */
  cancel?(host: ToolHost): void;
  /** Keyboard use of the tool (arrows move/resize, Enter commits, Escape cancels). Return true when handled. */
  onKey?(e: KeyboardEvent, host: ToolHost): boolean;
  /** Draws handles and previews on the overlay; ctx is already scaled to viewport CSS px. */
  overlay?(ctx: CanvasRenderingContext2D, host: ToolHost): void;
  /** Options bar while active (size, hardness, tolerance, add/subtract…). */
  Options?: (props: { host: ToolHost }) => ReactNode;
}
