/**
 * The tool palette of the photo studio, in display order. Lane «tools» fills it (rectangle, ellipse,
 * polygon, lasso, precise contour, brushes, colour, object selection, part editing); the shell renders
 * whatever is here and copes with an empty list.
 */
import type { Tool } from './types';

export type { Pt, Tool, ToolEvent, ToolHost, View } from './types';

export const TOOLS: Tool[] = [];

export const toolById = (id: string): Tool | undefined => TOOLS.find(t => t.id === id);
