/**
 * Test hooks of the extras (only with ?qa in the address): window.__extras. The e2e specs and the
 * screenshot scripts render posters of the open project, read presets and drive the sheets through them.
 * Nothing here is used by the studio itself.
 */
import { Compositor } from '../../project/compositor';
import { evaluate } from '../../project/evaluate';
import { applyPoster, POSTERS, posterFields, posterFrame, posterInputOf, type PosterFormat } from '../../project/posters';
import { subjectBoxFor, toneOf } from './subject';
import { useProject } from '../../project/store';
import type { Project } from '../../project/types';
import { canvasMeasure, posterFonts } from './render';
import { openExtras, useExtras } from './state';

declare global {
  interface Window { __extras?: Record<string, unknown> }
}

export function installExtrasQA() {
  if (window.__extras) return;
  window.__extras = {
    posters: () => POSTERS.map(p => ({ id: p.id, name: p.name, format: p.format })),
    state: () => useExtras.getState(),
    open: openExtras,
    fields: () => { const p = useProject.getState().project; return p ? posterFields(p) : []; },
    /** The open project as poster `id` (not applied), rendered `width` px wide: a PNG data URL. */
    async posterShot(id: string, format: PosterFormat, width = 900): Promise<{ url: string; w: number; h: number; ms: number; layers: number } | null> {
      const p = useProject.getState().project;
      if (!p) return null;
      await posterFonts();
      const input = posterInputOf(p);
      const fr = posterFrame(format);
      const [tone, subjectBox] = await Promise.all([toneOf(input?.main), subjectBoxFor(p, fr.w, fr.h)]);
      const forced = (window as unknown as { __tone?: number }).__tone;
      const r = applyPoster(p, id, { format, measure: canvasMeasure, tone: typeof forced === "number" ? forced : tone, subjectBox });
      console.log("extras tone", tone);
      if (!r) return null;
      return shot(r.project, width);
    },
    shot,
  };
}

async function shot(p: Project, width: number, t = 0) {
  const c = new Compositor({ maxEngines: 3 });
  const canvas = document.createElement('canvas');
  const t0 = performance.now();
  try {
    await c.render(evaluate(p, t), canvas, { scale: width / p.canvas.w, quality: 'final' });
    return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height, ms: Math.round(performance.now() - t0), layers: p.layers.length };
  } finally {
    c.destroy();
    canvas.width = canvas.height = 0;
  }
}
