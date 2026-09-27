/// <reference types="vite/client" />
declare module 'virtual:mt-runtime' {
  const code: string;
  export default code;
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
