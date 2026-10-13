/**
 * What a family layer reads on the CPU besides its parameters (FamilyMeta.reads), the twin of the shader's
 * globals (families/sample.ts and engine/glsl/programs.ts): the layer's transform, the stack below it at the
 * cell being evaluated, and the piece's source. The basic engine's field pass sets it before each layer and
 * each cell of a layer that reads; analytic twins call `famSrc` and read `FAM.below` / `FAM.belowC`.
 * Pure: no DOM.
 */

/** The piece's source at a point of the canvas (screen heights, origin at the centre, y up): rgb and luminance into out[0..3]. */
export type ScreenSampler = (px: number, py: number, out: Float64Array) => void;

export const FAM = {
  /** 0: patterns (nothing to read), 1: a picture or video, 2: text (FamilySrcKind in the shader). */
  kind: 0 as 0 | 1 | 2,
  src: null as ScreenSampler | null,
  /** The stack below the layer at this cell: its value, and its colour (white with no colour layer below). */
  below: 0,
  belowC: new Float64Array([1, 1, 1]),
  /** The layer's transform: cos and sin of its rotation, its scale (figure fit included) and offset. */
  c: 1, s: 0, sc: 1, ox: 0, oy: 0,
};

/** The source at layer point (x, y), as the shader's famSrc(q): rgb into out[0..2], luminance into out[3]. */
export function famSrc(x: number, y: number, out: Float64Array) {
  if (!FAM.src) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  const qx = x / FAM.sc, qy = y / FAM.sc;
  FAM.src(FAM.c * qx - FAM.s * qy + FAM.ox, FAM.s * qx + FAM.c * qy + FAM.oy, out);
}

/** famSrcKind() of the shader. */
export const famSrcKind = () => FAM.kind;
