import type { EngineStats, FamilyCommand, GestureInput, GridSnapshot, MediaKind } from './engine';
import type { FamilyBundle, SlotInfo } from '../families/host';
import type { Recipe } from './recipe';
import type { TransitionSpec } from './transitions';

export type RendererKind = 'webgl2' | 'basic';
export type MediaEl = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

/**
 * How a live canvas trades detail for fluidity (the studio's «Calidad» setting). It only changes how the
 * preview is drawn: the recipe, and what exports render, stay the same.
 */
export interface PreviewQuality {
  /** Upper bound for the device pixel ratio (the engines' maxPixelRatio option otherwise). */
  maxPixelRatio?: number;
  /** Frames per second at most (0 or absent: every display frame; the basic engine caps itself too). */
  maxFps?: number;
  /** Lower the resolution (WebGL) or the frame rate (basic) by itself when frames are slow. */
  adaptive?: boolean;
  /** Draw costly screen effects the cheap way (see each engine). */
  simplify?: boolean;
}

/**
 * What the studio, the exporters and the landing need from a renderer.
 * `AsciiEngine` (WebGL2, full feature set) and the Canvas 2D basic engine both implement it,
 * so everything above the engine works the same whichever one the browser can run.
 */
export interface Renderer {
  readonly kind: RendererKind;
  readonly canvas: HTMLCanvasElement;
  readonly recipe: Recipe;
  time: number;
  readonly isPlaying: boolean;
  readonly stats: EngineStats;
  readonly glyphChars: string[];
  /** Export engines can render with a transparent background. */
  transparent: boolean;
  /** Live input (e.g. microphone level, 0..1) that drives the pulse instead of the BPM clock. */
  externalPulse: number;
  /**
   * Shows another recipe. On a live canvas the change may wait a few frames for what the new piece needs
   * (its shader, its fonts), drawing the current one meanwhile; `transition` then starts with the first
   * frame of the new piece. Fixed-size (export) renderers apply it at once.
   */
  set(next: Recipe, o?: { transition?: boolean | TransitionSpec }): void;
  /** A change is still being prepared, or a transition is running (heavy side work should wait). */
  readonly busy: boolean;
  play(): void;
  pause(): void;
  setMedia(kind: MediaKind, el: MediaEl | null): void;
  hasMedia(kind: MediaKind): boolean;
  /** Resolves once fonts are loaded and glyph tables are rebuilt with them (and, WebGL, the shader is compiled). */
  ready(): Promise<void>;
  /** New size for a fixed-size (offscreen) renderer, so one can be reused for renders of any size. */
  setFixedSize(width: number, height: number, pixelRatio: number): void;
  /** Live canvases: see PreviewQuality. */
  setQuality(q: PreviewQuality): void;
  /**
   * Frames drawn before `until` (a performance.now() time) do not count as slow for the adaptive
   * resolution or frame rate: the page is busy with other work for a moment (offscreen renders).
   */
  holdAdaptive(until: number): void;
  /** Renders a frame synchronously at time t. */
  renderAt(t: number, realT?: number): void;
  renderNow(): void;
  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /**
   * Pixels of a region of the last frame (top-left origin), read without making the page wait for the GPU
   * (WebGL: through a pixel buffer and a fence; needs preserveDrawingBuffer).
   */
  snapshot(sx: number, sy: number, sw: number, sh: number): Promise<ImageData | null>;
  /** Character grid of the current frame (text, ANSI and SVG exports). */
  readGrid(): GridSnapshot;
  accent(): string;
  setPointer(x: number, y: number, on: boolean): void;
  /**
   * A pointer event given by code (fractions of the canvas, a time on the gesture clock): the pointer modes
   * take it like a real one, so a gesture can be replayed (engine/touch.ts). Fixed-size engines play it over
   * the frames renderAt draws one after another.
   */
  gesture(e: GestureInput): void;
  /**
   * Visual families with memory (families/host.ts): a copy of the live runs, which an export engine then
   * starts from (setFamilyStart) at piece time t0 — so a still, a clip or a grid shows the state on stage
   * without moving it; a live engine can take runs over from another (adoptFamilies).
   */
  familyState(): FamilyBundle;
  setFamilyStart(bundle: FamilyBundle | null, t0?: number): void;
  adoptFamilies(bundle: FamilyBundle): void;
  /** Starts a layer's run over from its base, or runs n steps now (while paused). */
  familyCommand(c: FamilyCommand): void;
  /** Where each family run is: steps, lag, modified state, missing checkpoint, loading or failed. */
  familyInfo(): SlotInfo[];
  destroy(): void;
}
