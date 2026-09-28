/**
 * The photo and video studio's foundation, headless: what the studio UI (/studio/foto/) builds on.
 *
 *   types.ts       the project model (contract)
 *   normalize.ts   normalizeProject (never throws), new projects and layers, ids
 *   evaluate.ts    evaluate(project, t) → FrameState (spans, keyframes, clips)
 *   clips.ts       animation templates: registry, timing, deterministic noise (templates.ts: the first two)
 *   masks.ts       masks → alpha (pure CPU, cached canvases)
 *   sources.ts     pictures at t: images, sequences, cut-outs, video frames (preview / frame-exact)
 *   compositor.ts  render(FrameState, canvas, {scale, quality, transparent}) — preview = export
 *   export.ts      stills, single layers, masks, originals, the frame loop, thumbnails
 *   file.ts        the project file (.zip) and what else a dropped file may be
 *   persist.ts     saving in this browser, autosave, media collection
 *   versions.ts    versions (history of rolls, variations, saved moments)
 *   dice.ts        the dice on ASCII layers, with locks
 *   store.ts       the zustand store (project, undo/redo, versions, saving)
 */
export * from './types';
export * from './normalize';
export * from './evaluate';
export * from './clips';
export { easeAt, cubicBezier } from './ease';
export * from './masks';
export * from './sources';
export { Compositor, canvasFilterWorks, engineStyle, sharedCompositor, sourceFit } from './compositor';
export type { CompositorOptions, RenderOptions, RenderReport, LayerReport } from './compositor';
export * from './export';
export * from './file';
export * from './persist';
export * from './versions';
export * from './dice';
export * from './refs';
export { fitRect, cssFilter } from './adjust';
export { fontStack, ensureFont, wrapText } from './draw2d';
