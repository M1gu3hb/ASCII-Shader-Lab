/**
 * The tool palette of the photo studio, in display order. Lane «tools» fills it (rectangle, ellipse,
 * polygon, lasso, precise contour, brushes, colour, object selection, part editing); the shell renders
 * whatever is here and copes with an empty list.
 *
 * Shortcuts: V editar partes · M rectángulo · O elipse · P polígono · L lazo · K contorno preciso · W color ·
 * J objeto · G degradado · B pasar a ASCII · E borrar efecto · R restaurar original.
 */
import type { Tool } from './types';
import { asciiBrush, eraseBrush, restoreBrush } from './brushes';
import { colorTool } from './colorTool';
import { contourTool } from './contour';
import { editTool } from './editTool';
import { lassoTool, polygonTool } from './freeform';
import { gradientTool } from './gradientTool';
import { objectTool } from './objectTool';
import { ellipseTool, rectangleTool } from './shapes';

export type { Pt, Tool, ToolEvent, ToolHost, View } from './types';

export const TOOLS: Tool[] = [
  editTool,
  rectangleTool,
  ellipseTool,
  polygonTool,
  lassoTool,
  contourTool,
  colorTool,
  objectTool,
  gradientTool,
  asciiBrush,
  eraseBrush,
  restoreBrush,
];

export const toolById = (id: string): Tool | undefined => TOOLS.find(t => t.id === id);

export { useSettings, setSettings } from './state';
