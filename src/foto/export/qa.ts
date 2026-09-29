/**
 * Test hooks of the export sheet (only with ?qa in the address, once the sheet's code has loaded):
 * window.__fotoExport. The e2e specs read text frames and draw them again with the studio's own glyph
 * drawing, to check that the text a frame exports is what the compositor draws for it. Not used by the studio.
 */
import { drawGlyphs, gridText } from '../../glyphs/index';
import { exportLayer } from '../../project/export';
import { useProject } from '../../project/store';
import { glyphFrameAt, glyphFrames, frameSession } from './frames';
import { svgFacts } from './facts';

declare global {
  interface Window { __fotoExport?: Record<string, unknown> }
}

const project = () => {
  const p = useProject.getState().project;
  if (!p) throw new Error('no project');
  return p;
};

async function toDataUrl(b: Blob): Promise<string> {
  return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b); });
}

export function installExportQA() {
  window.__fotoExport = {
    /** The text of a glyph layer's frame at t (what TXT exports), its size and what it could not keep. */
    async frameText(layerId: string, t: number) {
      const s = frameSession();
      try {
        const f = await glyphFrameAt(project(), layerId, t, s);
        return f ? { text: gridText(f.grid), cols: f.grid.cols, rows: f.grid.rows, notes: f.notes } : null;
      } finally { s.release(); }
    },
    /** The texts of a stretch of frames (what the players and .cast hold, without colours). */
    async framesText(layerId: string, o: { fps: number; from: number; to: number }) {
      const fr = await glyphFrames(project(), layerId, o);
      return fr ? { texts: fr.frames.map(g => gridText(g)), times: fr.times, cols: fr.cols, rows: fr.rows, notes: fr.notes } : null;
    },
    /**
     * A frame's characters drawn again with the studio's glyph drawing (transparent, the project's size) and
     * the compositor's own render of the layer alone at t, both as PNG data URLs.
     */
    async drawnVsText(layerId: string, t: number) {
      const p = project();
      const s = frameSession();
      try {
        const f = await glyphFrameAt(p, layerId, t, s);
        if (!f) return null;
        const c = document.createElement('canvas');
        c.width = p.canvas.w; c.height = p.canvas.h;
        const x = c.getContext('2d')!;
        drawGlyphs(x, f.grid, f.style);
        const text = await toDataUrl(await new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png')));
        const drawn = await toDataUrl(await exportLayer(p, layerId, { t }));
        return { text, drawn, w: c.width, h: c.height };
      } finally { s.release(); }
    },
    async svg(t: number) {
      const s = frameSession();
      try { return (await svgFacts(project(), t, s)).decision; } finally { s.release(); }
    },
  };
}
