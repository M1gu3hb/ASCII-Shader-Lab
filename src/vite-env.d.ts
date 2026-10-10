/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** '1' makes the photo and video studio public (src/shared/site.ts, FOTO_STUDIO); unset, it is paused. */
  readonly VITE_FOTO_STUDIO?: string;
  /** '1' makes «Crea tus GLYPHOS» public (src/shared/site.ts, GLIFOS_STUDIO); unset, it is paused. */
  readonly VITE_GLIFOS_STUDIO?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module 'virtual:mt-runtime' {
  const code: string;
  export default code;
}
declare module 'virtual:mt-runtime-basic' {
  /** The runtime with the basic engine (Canvas 2D). */
  export const runtime: string;
  /** One self-registering script per CPU pattern (id → code). */
  export const patterns: Record<string, string>;
  /** One self-registering script per visual family (id → code): its model, or its analytic CPU twin. */
  export const families: Record<string, string>;
}
declare module 'opentype.js' {
  const opentype: { parse(buf: ArrayBuffer): unknown };
  export default opentype;
}
declare module 'gifenc' {
  export function GIFEncoder(opts?: { auto?: boolean }): {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string; oneBitAlpha?: boolean | number }): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}
