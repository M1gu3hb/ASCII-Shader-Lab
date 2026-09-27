import type { EngineStats, GridSnapshot, MediaKind } from './engine';
import type { Recipe } from './recipe';

export type RendererKind = 'webgl2' | 'basic';
export type MediaEl = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

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
  set(next: Recipe, o?: { transition?: boolean }): void;
  play(): void;
  pause(): void;
  setMedia(kind: MediaKind, el: MediaEl | null): void;
  hasMedia(kind: MediaKind): boolean;
  /** Resolves once fonts are loaded and glyph tables are rebuilt with them. */
  ready(): Promise<void>;
  /** Renders a frame synchronously at time t. */
  renderAt(t: number, realT?: number): void;
  renderNow(): void;
  drawTo(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** Character grid of the current frame (text, ANSI and SVG exports). */
  readGrid(): GridSnapshot;
  accent(): string;
  setPointer(x: number, y: number, on: boolean): void;
  destroy(): void;
}
