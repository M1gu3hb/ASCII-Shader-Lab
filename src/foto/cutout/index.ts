/**
 * The «Recorte» panel of the photo studio (background removal, refinement, previews, transparent PNG).
 * CONTRACT between the shell (lane «studio»: mounts it lazily in the inspector/sheet and opens it from the
 * «Quitar fondo» action and the discreet recommendation) and lane «tools» (implements it on src/cutout).
 * It edits the open project through src/project/store; the shell only passes the host.
 *
 * Implementation: Panel.tsx (the UI and the model/consent/refine flow) and apply.ts (what it does to the project,
 * one undo step each).
 */
export { CutoutPanel, cutoutPanelQA } from './Panel';
export type { CutoutPanelProps } from './Panel';
