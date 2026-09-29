/**
 * Test hooks (only with ?qa in the address): the e2e specs push a spec-local tool into the palette, read
 * the viewport's canvas once a final render has settled, and look at the open project. Nothing here is
 * used by the studio itself.
 */
import * as ps from '../project/store';
import { useProject } from '../project/store';
import type { Project } from '../project/types';
import { host } from './host';
import { forceScale, onRendered, schedulerState, settled, viewCompositor } from './scheduler';
import { TOOLS } from './tools/index';
import type { Tool } from './tools/types';
import { setUI, ui } from './ui';

declare global {
  interface Window { __foto?: Record<string, unknown> }
}

function fnv(d: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function installQA() {
  const reports: unknown[] = [];
  onRendered(r => { reports.push({ seq: r.seq, light: r.light, scale: r.scale, ms: r.report.ms, layers: r.report.layers.map(l => [l.kind, l.ms]) }); if (reports.length > 50) reports.shift(); });
  window.__foto = {
    host,
    TOOLS,
    /** The project store's verbs (a test tool edits through them, as real tools do). */
    ps,
    ui,
    setUI,
    project: (): Project | null => useProject.getState().project,
    store: () => useProject.getState(),
    engines: () => { const r = ui().render; return { warnings: r.warnings }; },
    /** Adds a tool to the palette (tests only) and re-renders the palette. */
    addTool(t: Tool) {
      if (!TOOLS.some(x => x.id === t.id)) TOOLS.push(t);
      setUI({ toolsV: ui().toolsV + 1 });
    },
    /** Waits for a final render (forced to `scale` when given) and returns the art canvas's pixels as a hash + a PNG data URL. */
    async settle(scale?: number) {
      forceScale(scale ?? null);
      const r = await settled();
      const c = document.querySelector<HTMLCanvasElement>('.fv-art');
      if (!r || !c) return null;
      const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
      return { w: c.width, h: c.height, hash: fnv(d), scale: r.scale, light: r.light, ms: r.report.ms };
    },
    release: () => forceScale(null),
    sched: schedulerState,
    reports: () => reports,
    compositor: viewCompositor,
  };
}
