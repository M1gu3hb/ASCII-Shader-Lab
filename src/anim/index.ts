/**
 * GLYPHOS animation library. One import registers every template with the project's clip registry
 * (src/project/clips.ts) and gives the helpers the studio and its timeline use:
 *
 *   import { libraryByGroup, newClip, EASE_PRESETS, addKey, choreograph } from '../anim';
 *
 * Catalogs (each registers its templates when it loads):
 *   project/templates.ts  «Foto → ASCII», «Escritura de terminal» (registered by evaluate.ts itself)
 *   typing.ts             typed, erased, decoded, counted characters; rain; cursor; words into the figure
 *   reveals.ts            iris, scanner, spiral, blinds, regions at different times, neon, flicker, strobe,
 *                         photo-sequence transitions
 *   resolution.ts         coarse → fine, down to one glyph, born from one glyph, pixels, halftone, dither
 *   motion.ts             fragments (in, out, both), puzzle, curtain, TV off, slide-in, glitch, shake,
 *                         magnet, shuffle, lens, turning wave, wave, breathing, float, marquee
 *   styles.ts             style tours, state sequences, random changes within limits, regions of style,
 *                         zones that swap
 *   color.ts              single palette, palette cycling, hue drift, colour wave, light sweep, glow pulse,
 *                         grain and scanline flicker
 * Helpers:
 *   kit.ts     the shared math (orders, holds, zones, per-cell effects) templates are written with
 *   ease.ts    named speed curves in Spanish;  curve.ts  the curve editor model
 *   keys.ts    animatable paths and keyframe edits; loops
 *   edit.ts    clip and span edits, overlaps (transitions)
 *   library.ts groups, variants, new clips;  choreo.ts  entry + centre + exit layouts and presets
 */
import '../project/templates';
import './typing';
import './reveals';
import './resolution';
import './motion';
import './styles';
import './color';

export { templates, templateById, paramsOf, clipTime, listItems, type TemplateDef, type TemplateGroup, type TemplateParamDef, type ClipEffect, type ClipContext } from '../project/clips';
export * from './ease';
export * from './curve';
export * from './keys';
export * from './edit';
export * from './library';
export * from './choreo';
export { STYLE_STATES, STYLE_OPTIONS, styleSets } from './styles';
export { flashCentres } from './reveals';
export { paletteLoop } from './color';
export { withHolds, orderField, ORDER_OPTIONS, COLOR_SETS, GLYPH_POOLS, neutralCell } from './kit';
