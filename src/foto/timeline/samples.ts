/**
 * Sample projects for animated previews (the library picker, the QA pages): a synthetic photo (the site's
 * sunset landscape with a standing figure), a short photo sequence, and one small project per template and
 * kind of layer, rendered by the core Compositor through a source provider that serves those canvases
 * (nothing is stored, nothing is fetched).
 */
import { paintLandscape } from '../../shared/sample';
import { defaultAsciiStyle, newLayer, newProject } from '../../project/normalize';
import { sequenceIndex } from '../../project/evaluate';
import type { Drawable, SourceProvider } from '../../project/sources';
import { templateById } from '../../project/clips';
import type { AnimClip, Layer, LayerKind, Mask, Project, Source } from '../../project/types';

export const SAMPLE_W = 480, SAMPLE_H = 300;

/** The sample photo: the landscape with a dark figure against the sun (960×600). */
export function samplePhoto(tint = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  const x = c.getContext('2d')!;
  paintLandscape(x);
  const body = new Path2D();
  body.ellipse(330, 246, 36, 44, 0, 0, Math.PI * 2);
  body.moveTo(262, 600);
  body.bezierCurveTo(254, 430, 276, 318, 330, 300);
  body.bezierCurveTo(384, 318, 406, 430, 398, 600);
  body.closePath();
  x.save();
  x.shadowColor = 'rgba(255,170,90,.9)';
  x.shadowBlur = 18;
  x.fillStyle = '#23141c';
  x.fill(body);
  x.restore();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(255,196,120,.55)';
  x.stroke(body);
  if (tint) {
    // variants for the sequence: the same place at other hours
    x.globalCompositeOperation = 'color';
    x.fillStyle = tint === 1 ? '#2b6cb0' : '#6b2bb0';
    x.globalAlpha = 0.55;
    x.fillRect(0, 0, 960, 600);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }
  return c;
}

const ref = (name: string) => ({ kind: 'image' as const, name, w: 960, h: 600 });
export const PHOTO: Source = { id: 'muestra-foto', kind: 'image', name: 'Atardecer', media: [ref('atardecer')], w: 960, h: 600 };
export const SERIES: Source = { id: 'muestra-serie', kind: 'sequence', name: 'Tres horas', media: [ref('a'), ref('b'), ref('c')], w: 960, h: 600, hold: 0.8 };

let pics: Record<string, HTMLCanvasElement[]> | null = null;
function pictures(): Record<string, HTMLCanvasElement[]> {
  return (pics ??= { [PHOTO.id]: [samplePhoto()], [SERIES.id]: [samplePhoto(), samplePhoto(1), samplePhoto(2)] });
}

/** A provider that serves the sample pictures (and, optionally, a picture of the caller's: the studio's photo). */
export function sampleProvider(extra?: () => Drawable | null): SourceProvider {
  return {
    async prepare(s) { return !!pictures()[s.id] || (s.id === PHOTO.id && !!extra?.()); },
    frame(s, t) {
      if (s.id === PHOTO.id) { const own = extra?.(); if (own) return own; }
      const list = pictures()[s.id];
      if (!list) return null;
      return s.kind === 'sequence' ? list[sequenceIndex(s, t)] ?? list[0] : list[0];
    },
    async prepareMedia() { return false; },
    image() { return null; },
    missing() { return []; },
    release() { /* the canvases are shared by every preview */ },
  };
}

/** The kind a template is best shown on (typing on text, cell moves on characters…). */
export function bestKind(template: string): LayerKind {
  const def = templateById(template);
  const kinds = def?.kinds ?? ['glyphs'];
  const prefer: Record<string, LayerKind> = { escritura: 'text', 'escritura-errores': 'text', borrado: 'text', cursor: 'text', 'entrada-estela': 'text', 'deriva-tono': 'photo', 'paleta-unica': 'glyphs', estrobo: 'photo', semitono: 'photo', tramado: 'photo', pixelado: 'photo', persianas: 'photo', iris: 'photo', cortina: 'photo', apagado: 'photo', temblor: 'text', respirar: 'photo', flotar: 'text', 'pulso-brillo': 'text', 'zonas-intercambio': 'ascii', 'secuencia-fotos': 'ascii', neon: 'text', escaneo: 'photo' };
  const want = prefer[template];
  if (want && kinds.includes(want)) return want;
  for (const k of ['glyphs', 'ascii', 'photo', 'text', 'shape'] as const) if (kinds.includes(k)) return k;
  return kinds[0];
}

/** The ASCII style of the samples: the lab's «Retrato» look, still (no pattern motion). */
function asciiStyle(cell = 7) {
  const s = defaultAsciiStyle();
  s.source = 'image';
  s.glyph = { ...s.glyph, cell, charset: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", edge: 0.25, font: 'jetbrains', weight: 500 };
  s.color = { ...s.color, mode: 'source', vivid: 0.6, bg: '#0b0a09' };
  s.motion = { ...s.motion, speed: 0 };
  s.interact = { ...s.interact, mode: 'none', auto: false };
  s.fx = { ...s.fx, vig: 0.25 };
  return s;
}

/** The layer a clip goes on, for a kind (ids fixed so previews share one ASCII engine and one grid). */
export function sampleLayer(kind: LayerKind, template = '', source = PHOTO.id, cell = 7): Layer {
  switch (kind) {
    case 'glyphs': {
      const words = template === 'palabras-figura';
      return newLayer('glyphs', {
        id: 'muestra-caracteres', name: 'Caracteres', source,
        glyphs: {
          ...newLayer('glyphs').glyphs,
          charset: words ? 'palabras' : template === 'cuenta' ? 'numerico' : 'estandar', fill: words ? 'words' : 'ramp',
          chars: words ? 'la luz se vuelve letra y la letra vuelve a ser luz ' : '',
          font: 'jetbrains', weight: 700, cell, aspect: 2, bright: 0.1, contrast: 1.35, gamma: 1, sat: 1, invert: false, edge: 0.2, cutoff: 0.06,
          color: 'mono', ink: '#f1e4cf', paper: null, palette: ['#0c0b0a', '#ff5b1f', '#ede6da'],
        },
      });
    }
    case 'ascii': return newLayer('ascii', { id: 'muestra-ascii', name: 'ASCII', source, style: asciiStyle(Math.max(6, cell)), opaque: true });
    case 'photo': return newLayer('photo', { id: 'muestra-foto-capa', name: 'Foto', source, fit: 'cover' });
    case 'text': return newLayer('text', {
      id: 'muestra-texto', name: 'Texto', text: template === 'cuenta' ? '2026 · 1080 × 1350\n60 fps · 4096 px' : 'Hola, luz.\nEsto es GLYPHOS: fotos que se vuelven letras.',
      font: 'jetbrains', weight: 700, size: 0.085, color: '#ede6da', align: 'left', box: { x: 0.07, y: 0.3, w: 0.86 }, tracking: 0, leading: 1.25, italic: false, upper: false,
    });
    case 'shape': return newLayer('shape', { id: 'muestra-forma', name: 'Forma', shape: 'ellipse', pts: [0.3, 0.14, 0.4, 0.72], stroke: '#ede6da', width: 4, fill: '#ff5b1f', dash: null });
  }
}

/**
 * A small project that shows one clip on a layer of that kind: the photo under character layers (dimmed
 * under glyphs, so the characters read), a dark stage under texts and shapes. `clip` defaults to the
 * template with its defaults over the whole project.
 */
export function sampleProject(template: string, kind: LayerKind, o: { clip?: Partial<AnimClip>; w?: number; h?: number; cell?: number } = {}): Project {
  const def = templateById(template);
  const dur = o.clip?.dur ?? def?.dur ?? 2;
  const p = newProject({ name: def?.name ?? template, w: o.w ?? SAMPLE_W, h: o.h ?? SAMPLE_H, duration: dur, bg: '#0c0b0a' });
  p.seed = 'muestra';
  const seq = template === 'secuencia-fotos';
  const src = seq ? SERIES : PHOTO;
  p.sources.push(src);
  if (kind === 'glyphs' || kind === 'ascii') {
    const under = newLayer('photo', { id: 'muestra-fondo', name: 'Foto', source: src.id, fit: 'cover' });
    if (kind === 'glyphs' && under.kind === 'photo') under.adjust = { ...under.adjust, bright: -0.62, sat: 0.55, contrast: 0.9 };
    p.layers.push(under);
  }
  const layer = sampleLayer(kind, template, src.id, o.cell ?? 7);
  if (template === 'zonas-intercambio') {
    // two zones in two styles: this one on the left trades places with its mirror
    const zone: Mask = { invert: false, feather: 6, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.06, y: 0.12, w: 0.42, h: 0.76, rot: 0, soft: 4, alpha: 1 }] };
    layer.mask = zone;
  }
  layer.clips = [{ id: 'muestra-clip', template, start: 0, dur, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false, ...o.clip }];
  p.layers.push(layer);
  return p;
}
