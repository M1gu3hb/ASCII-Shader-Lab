/**
 * What is under a layer's mask: the mean brightness (0..1) of the photo inside the layer's mask, read small
 * (48 px) from the pictures the viewport already decoded. The dice use it so a roll inside a mask keeps its
 * characters readable against the photo around them (dice.ts fitMasked).
 */
import { fitRect } from '../project/adjust';
import { coverageOfImage, rasterizeMask } from '../project/masks';
import { useProject } from '../project/store';
import type { Id, Layer, LayerFit, Project } from '../project/types';
import { originalOf } from './host';
import { viewCompositor } from './scheduler';

const S = 48;

const masked = (l: Layer) => !!l.mask && !l.mask.off && l.mask.parts.some(p => !p.off);

/** Mean brightness under the layer's mask, or null (no mask, or no picture to read). */
export function brightnessUnder(p: Project, id: Id): number | null {
  const l = p.layers.find(x => x.id === id);
  if (!l || !masked(l)) return null;
  // the layer's own photo when it reads one; else the photo at the bottom (what shows around the zone)
  const own = 'source' in l && typeof l.source === 'string' && l.source !== 'below' && l.source !== 'style' ? { source: l.source, fit: ((l as { fit?: LayerFit }).fit ?? 'cover') as LayerFit } : null;
  const o = own ?? originalOf(p);
  const src = o ? p.sources.find(s => s.id === o.source) : null;
  if (!src || !o) return null;
  const prov = viewCompositor().provider;
  const t = useProject.getState().time;
  const img = prov.frame(src, t);
  if (!img) return null;
  const h = Math.max(4, Math.round((S * p.canvas.h) / p.canvas.w));
  const c = document.createElement('canvas');
  c.width = S; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const r = fitRect(img.width, img.height, S, h, o.fit);
  x.drawImage(img, r.x, r.y, r.w, r.h);
  const d = x.getImageData(0, 0, S, h).data;
  let cov: Float32Array;
  try {
    cov = rasterizeMask(l.mask!, {
      w: S, h, scale: S / p.canvas.w, t,
      raster: ref => { const im = prov.image(ref); return im ? coverageOfImage(im, S, h) : null; },
      pixels: sid => (sid === src.id ? d : null),
    });
  } catch { return null; }
  let sum = 0, wsum = 0;
  for (let i = 0; i < cov.length; i++) {
    const w = cov[i];
    if (w <= 0.01) continue;
    const q = i * 4;
    sum += w * ((0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2]) / 255);
    wsum += w;
  }
  c.width = c.height = 0;
  return wsum > 0.5 ? sum / wsum : null;
}
