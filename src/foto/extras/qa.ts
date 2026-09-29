/**
 * Test hooks of the extras (only with ?qa in the address): window.__extras. The e2e specs and the
 * screenshot scripts render posters of the open project, read presets and drive the sheets through them.
 * Nothing here is used by the studio itself.
 */
import { Compositor } from '../../project/compositor';
import { evaluate } from '../../project/evaluate';
import { applyPoster, POSTERS, posterFields, posterFrame, posterInputOf, type PosterFormat } from '../../project/posters';
import { subjectBoxFor, toneOf } from './subject';
import { newLayer, uid } from '../../project/normalize';
import { putMedia } from '../../project/persist';
import { storeBlob } from '../../project/sources';
import { edit, useProject } from '../../project/store';
import type { Project, Source } from '../../project/types';
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
    /**
     * A stand-in for «Quitar fondo» → «Recorte como capa» (tests and screenshots, where the cut-out model is
     * not downloaded): an oval matte around the middle, the cut-out and the source and layer the panel makes.
     */
    async fakeCutout(cx = 0.46, cy = 0.46, rx = 0.23, ry = 0.42) {
      const p = useProject.getState().project;
      const main = p?.sources.find(s => s.kind === 'image');
      const got = main?.media[0]?.id ? await storeBlob(main.media[0].id) : null;
      if (!p || !main || !got) return null;
      const bmp = await createImageBitmap(got.blob);
      const w = bmp.width, h = bmp.height;
      const oval = (c: HTMLCanvasElement, bg: string | null) => {
        c.width = w; c.height = h;
        const x = c.getContext('2d')!;
        if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
        x.filter = `blur(${Math.round(Math.min(w, h) * 0.01)}px)`;
        x.fillStyle = '#ffffff';
        x.beginPath(); x.ellipse(cx * w, cy * h, rx * w, ry * h, 0, 0, Math.PI * 2); x.fill();
        return c;
      };
      const matte = oval(document.createElement('canvas'), '#000000');
      const cut = document.createElement('canvas');
      cut.width = w; cut.height = h;
      const cx2 = cut.getContext('2d')!;
      cx2.drawImage(bmp, 0, 0);
      cx2.globalCompositeOperation = 'destination-in';
      cx2.drawImage(oval(document.createElement('canvas'), null), 0, 0);
      bmp.close();
      const blob = (c: HTMLCanvasElement) => new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png'));
      const { stored: _a, ...cutRef } = await putMedia(await blob(cut), { kind: 'image', name: 'recorte-prueba.png', w, h });
      const { stored: _b, ...matteRef } = await putMedia(await blob(matte), { kind: 'image', name: 'mate-prueba.png', w, h });
      const src: Source = { id: uid(), kind: 'cutout', name: 'Recorte de prueba', media: [cutRef], w, h, cutout: { from: main.id, matte: matteRef } };
      const layer = newLayer('photo', { name: 'Recorte', source: src.id });
      edit(d => { d.sources.push(src); d.layers.splice(1, 0, layer); });
      return { source: src.id, layer: layer.id };
    },
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
