/**
 * The «Recorte» panel of the photo studio (background removal, refinement, previews, transparent PNG).
 * CONTRACT between the shell (lane «studio»: mounts it lazily in the inspector/sheet and opens it from the
 * «Quitar fondo» action and the discreet recommendation) and lane «tools» (implements it on src/cutout).
 * It edits the open project through src/project/store; the shell only passes the host.
 */
import type { ReactNode } from 'react';
import type { Id } from '../../project/types';
import type { ToolHost } from '../tools/types';

export interface CutoutPanelProps {
  host: ToolHost;
  /** The source to cut out (defaults to the target layer's source). */
  source?: Id;
  onClose(): void;
}

export function CutoutPanel(_props: CutoutPanelProps): ReactNode {
  return null;
}
