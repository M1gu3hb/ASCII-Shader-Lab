/**
 * Starting points of the photo studio: small project recipes built with the core helpers over a photo
 * (the person's, or the sample landscape until they pick one). Each is an ordinary project: every layer,
 * mask and finish can be changed afterwards.
 */
import type { MediaRef, Recipe } from '../engine/recipe';
import { newLayer, newProject, projectFromImage, sourceFromMedia } from '../project/normalize';
import { putMedia } from '../project/persist';
import type { Mask, Project } from '../project/types';
import { syntheticPhoto } from '../shared/sample';
import { PRESETS } from '../studio/presets';

export interface Template {
  id: string;
  name: string;
  blurb: string;
  make: (ref: MediaRef) => Project;
}

const preset = (space: 'media' | 'arte', id: string, cell?: number): Recipe => {
  const p = PRESETS[space].find(x => x.id === id) ?? PRESETS[space][0];
  const r = p.make();
  r.interact = { ...r.interact, mode: 'none', auto: false };
  if (cell) r.glyph.cell = cell;
  return r;
};

const shapeMask = (kind: 'rect' | 'ellipse', x: number, y: number, w: number, h: number, feather = 0, soft = 0): Mask =>
  ({ invert: false, feather, opacity: 1, parts: [{ kind, op: 'add', x, y, w, h, rot: 0, soft, alpha: 1 }] });

export const TEMPLATES: Template[] = [
  {
    id: 'completo', name: 'Foto → ASCII completo', blurb: 'Toda la foto en caracteres con su propio color, como en el laboratorio.',
    make: ref => {
      const p = projectFromImage(ref, { name: 'Foto en ASCII' });
      const style = preset('media', 'retrato', 9);
      p.layers.push(newLayer('ascii', { name: 'ASCII', source: p.sources[0].id, style, opaque: true }));
      return p;
    },
  },
  {
    id: 'sujeto', name: 'Sujeto en caracteres sobre foto', blurb: 'Caracteres reales en el centro; la foto, oscura y suave, alrededor.',
    make: ref => {
      const p = projectFromImage(ref, { name: 'Sujeto en caracteres' });
      const photo = p.layers[0];
      if (photo.kind === 'photo') photo.adjust = { ...photo.adjust, blur: 8, bright: -0.25, sat: 0.6 };
      p.layers.push(newLayer('glyphs', {
        name: 'Sujeto en caracteres', source: p.sources[0].id, mask: shapeMask('ellipse', 0.28, 0.12, 0.44, 0.78, 18),
        glyphs: {
          charset: 'estandar', chars: '', fill: 'ramp', font: 'jetbrains', weight: 700, cell: 9, aspect: 1.7, bright: 0.05, contrast: 1.4, gamma: 1, sat: 1,
          invert: false, edge: 0.3, cutoff: 0, color: 'source', ink: '#ffd2a0', paper: null, palette: ['#0c0b0a', '#ff5b1f', '#ede6da'],
        },
      }));
      p.meta.note = 'Ajusta la zona del sujeto en «Máscara» o con «Quitar fondo».';
      return p;
    },
  },
  {
    id: 'zonas', name: 'Zonas circulares', blurb: 'Parches redondos de letras y un cuadro tramado sobre la foto.',
    make: ref => {
      const p = projectFromImage(ref, { name: 'Zonas circulares' });
      const src = p.sources[0].id;
      const k = p.canvas.w / p.canvas.h;
      const circle = (cx: number, cy: number, r: number) => shapeMask('ellipse', cx - r, cy - r * k, r * 2, r * 2 * k, 4);
      p.layers.push(newLayer('ascii', { name: 'Círculo · fósforo', source: src, style: preset('media', 'fosforo', 8), opaque: true, mask: circle(0.3, 0.42, 0.16) }));
      p.layers.push(newLayer('ascii', { name: 'Círculo · bloques', source: src, style: preset('media', 'bloques', 12), opaque: true, mask: circle(0.7, 0.58, 0.13) }));
      p.layers.push(newLayer('photo', {
        name: 'Cuadro tramado', source: src, fit: 'cover', mask: shapeMask('rect', 0.52, 0.12, 0.16, 0.16 * k),
        finishes: [{ kind: 'dither', on: true, amount: 1, params: { algo: 'atkinson', color: 'bn', ink: '#1c1a17', paper: '#efe9df', pixel: 3 } }],
      }));
      return p;
    },
  },
  {
    id: 'cartel', name: 'Cartel editorial', blurb: 'Formato 4:5 con la foto en banda, una zona tramada, título y anotaciones.',
    make: ref => {
      const p = newProject({ name: 'Cartel editorial', w: 1080, h: 1350, bg: '#efe9df' });
      const src = sourceFromMedia(ref);
      p.sources.push(src);
      p.meta = { origin: 'photo' };
      p.layers.push(newLayer('photo', {
        name: 'Foto', source: src.id, fit: 'cover', mask: shapeMask('rect', 0.06, 0.25, 0.88, 0.5),
        adjust: { bright: 0, contrast: 1.05, gamma: 1, sat: 0.85, hue: 0, temp: 0.2, blur: 0, sharpen: 0.3, invert: false, mono: false },
      }));
      p.layers.push(newLayer('ascii', { name: 'Zona tramada', source: src.id, style: preset('media', 'periodico', 8), opaque: true, mask: shapeMask('rect', 0.52, 0.36, 0.3, 0.34) }));
      p.layers.push(newLayer('shape', { name: 'Marco', shape: 'bracket', pts: [0.52, 0.36, 0.3, 0.34], stroke: '#1c1a17', width: 2, fill: null, dash: null }));
      p.layers.push(newLayer('shape', { name: 'Nota FL33', shape: 'callout', pts: [0.67, 0.45, 0.8, 0.2, 0.9, 0.2], stroke: '#1c1a17', width: 1.5, fill: null, dash: null, label: { text: 'FL33', font: 'jetbrains', size: 0.018, color: '#1c1a17' } }));
      p.layers.push(newLayer('shape', { name: 'Regla', shape: 'line', pts: [0.06, 0.12, 0.94, 0.12], stroke: '#1c1a17', width: 2, fill: null, dash: null }));
      p.layers.push(newLayer('text', { name: 'Título', text: 'Teje luz', font: 'serif', weight: 400, italic: true, size: 0.085, color: '#1c1a17', align: 'left', box: { x: 0.06, y: 0.03, w: 0.9 }, tracking: -0.01, leading: 1, upper: false }));
      p.layers.push(newLayer('text', { name: 'Pie', text: 'GLYPHOS · estudio de foto — una foto, dos maneras de verla: píxeles y caracteres.', font: 'jetbrains', weight: 500, size: 0.017, color: '#1c1a17', align: 'left', box: { x: 0.06, y: 0.785, w: 0.6 }, tracking: 0.04, leading: 1.5, upper: true }));
      return p;
    },
  },
  {
    id: 'brillo', name: 'Superposición con brillo', blurb: 'Caracteres sobre la foto original con resplandor y un leve barrido de movimiento.',
    make: ref => {
      const p = projectFromImage(ref, { name: 'Superposición con brillo' });
      const style = preset('media', 'retrato', 10);
      style.color = { ...style.color, mode: 'source' };
      p.layers.push(newLayer('ascii', {
        name: 'ASCII con brillo', source: p.sources[0].id, style, opaque: false, blend: 'screen', opacity: 0.9,
        finishes: [
          { kind: 'glow', on: true, amount: 0.85, params: {} },
          { kind: 'motionblur', on: true, amount: 0.35, params: {} },
        ],
      }));
      return p;
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find(t => t.id === id);

let sample: MediaRef | null = null;
/** The sample landscape as a stored photo (for templates before the person picks one). */
export async function sampleRef(): Promise<MediaRef> {
  if (sample) return sample;
  const c = syntheticPhoto();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  const { stored: _s, ...ref } = await putMedia(blob, { kind: 'image', name: 'paisaje de muestra.png', w: c.width, h: c.height });
  sample = ref;
  return ref;
}
