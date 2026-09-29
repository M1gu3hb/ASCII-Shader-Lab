/**
 * Runs what the sheet planned: renders and encodes in this browser, reports progress, stops when cancelled,
 * and says afterwards what happened (sound, fallbacks, what text could not keep). Nothing is uploaded.
 */
import type { Compositor } from '../../project/compositor';
import { exportCutout, exportLayer, exportMask, exportMatte, exportName, exportOriginal } from '../../project/export';
import { buildProjectFile } from '../../project/file';
import type { Project } from '../../project/types';
import { zip } from '../../shared/zip';
import type { FormatInfo, MovieFormat } from '../../video/index';
import { frameCount, readmeTextTime, type Plan } from './plan';
import { exportSized, pngDataUrl, renderSized } from './render';
import { glyphFrameAt, glyphFrames, frameSession, Cancelled } from './frames';
import { notesText } from './frameGrid';
import { compositionSvg, fontFaces, fontNote, fontsOf, rasterSvg, withFonts, type SvgDecision, type SvgLayerPart } from './svg';
import { movingText, readmeMarkdown, stillText, type MovingTextFormat, type StillTextFormat } from './text';
import { resolveSize, type ResolvedSize } from './sizes';

export interface Progress { done: number; total: number; label: string }

export interface JobOutput {
  files: Array<{ name: string; blob: Blob }>;
  /** Spanish notes shown after the export. */
  notes: string[];
  /** Something to paste somewhere (an HTML snippet, the README's Markdown), with a label. */
  snippet?: { label: string; code: string };
}

export interface JobContext {
  compositor?: Compositor;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
  /** The SVG decision and parts at plan.t (computed by the sheet for the preview). */
  svg?: { decision: SvgDecision; parts: SvgLayerPart[] };
  movies?: FormatInfo[] | null;
}

const MOVIES = new Set<string>(['mp4', 'webm', 'gif', 'png-zip']);

const AUDIO_NOTE: Record<string, string> = {
  copied: 'Sonido: el del video original, copiado tal cual y en sincronía.',
  reencoded: 'Sonido: el del video original, convertido para que quepa en este formato.',
  none: '',
  unsupported: 'Sin sonido: este navegador no puede llevar el sonido del video a este formato (el video sí se exportó).',
};

const check = (s: AbortSignal) => { if (s.aborted) throw new Cancelled(); };

/** The output size of a plan (the size picker's pixels). */
export const planSize = (p: Project, plan: Plan): ResolvedSize => resolveSize(plan.size, p.canvas, { dpi: plan.dpi, orient: plan.orient });

/** Even sizes for video encoders (the rest of the pipeline keeps whatever it gets). */
const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

export async function runJob(p: Project, plan: Plan, ctx: JobContext): Promise<JobOutput> {
  const say = (label: string, done = 0, total = 1) => ctx.onProgress({ done, total, label });
  const size = planSize(p, plan);
  switch (plan.what) {
    case 'proyecto': {
      say('Empaquetando el proyecto con sus archivos…');
      const blob = await buildProjectFile(p);
      const slug = p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'proyecto';
      return { files: [{ name: `${slug}.glyphos.zip`, blob }], notes: ['Ábrelo aquí o en otro navegador con «Abrir proyecto»: capas, máscaras, animaciones y tus archivos originales vuelven tal cual.'] };
    }
    case 'original': {
      if (!plan.target) throw new Error('Elige qué original exportar.');
      say('Leyendo el original…');
      const files = await exportOriginal(p, plan.target);
      if (!files.length) throw new Error('Ese archivo no está guardado en este navegador.');
      return { files, notes: [] };
    }
    case 'recorte': {
      if (!plan.target) throw new Error('Elige qué recorte exportar.');
      say('Leyendo el recorte…');
      const f = plan.format === 'matte' ? await exportMatte(p, plan.target) : await exportCutout(p, plan.target);
      if (!f) throw new Error('Ese recorte no está guardado en este navegador.');
      return { files: [f], notes: [] };
    }
    case 'capa': {
      if (!plan.target) throw new Error('Elige una capa.');
      const l = p.layers.find(x => x.id === plan.target);
      say(`Dibujando «${l?.name ?? 'la capa'}»…`);
      const blob = await exportLayer(p, plan.target, { t: plan.t, scale: size.w / p.canvas.w, ...(ctx.compositor ? { compositor: ctx.compositor } : {}) });
      return { files: [{ name: exportName(p, 'png', 'capa-' + (l?.name ?? '')), blob }], notes: [] };
    }
    case 'mascara': {
      if (!plan.target) throw new Error('Elige una capa con máscara.');
      const l = p.layers.find(x => x.id === plan.target);
      say('Dibujando la máscara…');
      const blob = await exportMask(p, plan.target, { t: plan.t, width: size.w, mode: plan.format === 'mask-alpha' ? 'alpha' : 'grey', ...(ctx.compositor ? { compositor: ctx.compositor } : {}) });
      if (!blob) throw new Error('Esa capa no tiene máscara.');
      return { files: [{ name: exportName(p, 'png', 'mascara-' + (l?.name ?? '')), blob }], notes: [] };
    }
    case 'texto':
      return textJob(p, plan, ctx);
    case 'resultado':
      break;
  }
  // the composition
  if (plan.format === 'png' || plan.format === 'jpeg' || plan.format === 'webp') {
    say('Dibujando la imagen a calidad final…');
    const blob = await exportSized(p, { w: size.w, h: size.h, fit: plan.fit, t: plan.t, transparent: plan.transparent, format: plan.format, quality: plan.quality, ...(ctx.compositor ? { compositor: ctx.compositor } : {}) });
    const notes: string[] = [];
    if (plan.format === 'jpeg' && plan.transparent) notes.push('JPEG no guarda transparencia: lo transparente salió sobre el color de fondo del proyecto.');
    if (!size.sameAspect) notes.push(plan.fit === 'cover' ? 'La proporción era otra: la composición se recortó al centro.' : 'La proporción era otra: la composición va entera, con bandas del color de fondo.');
    return { files: [{ name: exportName(p, plan.format === 'jpeg' ? 'jpg' : plan.format, plan.size === 'proyecto' ? '' : plan.size), blob }], notes };
  }
  if (plan.format === 'svg') {
    if (!ctx.svg?.decision.vector) throw new Error(`Aquí un SVG no sería fiel: ${ctx.svg?.decision.reasons.join(' ') ?? ''}`);
    say('Escribiendo el SVG…');
    let text = compositionSvg({ w: p.canvas.w, h: p.canvas.h, bg: p.canvas.bg, transparent: plan.transparent, title: p.name, parts: ctx.svg.parts });
    const notes = [...ctx.svg.decision.notes];
    if (plan.embedFonts) {
      const f = await fontFaces(fontsOf(ctx.svg.parts));
      text = withFonts(text, f.css);
      if (fontNote(f)) notes.push(fontNote(f));
    }
    return { files: [{ name: exportName(p, 'svg'), blob: new Blob([text], { type: 'image/svg+xml' }) }], notes };
  }
  if (plan.format === 'svg-img') {
    say('Dibujando la imagen para el SVG…');
    const c = await renderSized(p, { w: size.w, h: size.h, fit: plan.fit, t: plan.t, transparent: plan.transparent, ...(ctx.compositor ? { compositor: ctx.compositor } : {}) });
    const url = await pngDataUrl(c);
    c.width = c.height = 0;
    const why = ctx.svg?.decision.reasons.length ? ctx.svg.decision.reasons : ['la composición tiene píxeles.'];
    const text = rasterSvg({ w: size.w, h: size.h, title: p.name, png: url, why });
    return {
      files: [{ name: exportName(p, 'svg', 'imagen'), blob: new Blob([text], { type: 'image/svg+xml' }) }],
      notes: ['Este SVG lleva la composición como imagen PNG: no es vector y no gana nitidez al ampliarlo. Lo dice también dentro del archivo.'],
    };
  }
  if (plan.format === 'readme') return readmeJob(p, plan, ctx);
  if (MOVIES.has(plan.format)) return movieJob(p, plan, ctx, size);
  throw new Error('Ese formato no se puede exportar desde aquí.');
}

/* ------------------------------------------------------------------ moving pictures (lane video) */

async function movieJob(p: Project, plan: Plan, ctx: JobContext, size: ResolvedSize): Promise<JobOutput> {
  const m = await import('../../video/index');
  check(ctx.signal);
  const format = plan.format as MovieFormat;
  const video = format === 'mp4' || format === 'webm';
  const res = await m.exportMovie(p, {
    format, width: video ? even(size.w) : size.w, height: video ? even(size.h) : size.h, fps: plan.fps, start: plan.start, end: plan.end,
    audio: plan.audio, transparent: plan.transparent,
    ...(format === 'gif' ? { gif: { colors: plan.gif.colors, dither: plan.gif.dither, loop: plan.loop, palette: plan.gif.palette } as never } : {}),
    onProgress: pr => ctx.onProgress(pr), signal: ctx.signal,
  });
  const notes = [...res.notes];
  // what happened to the sound, said once (lane video's notes may already say it)
  if (video && !notes.some(n => /sonido|audio/i.test(n))) {
    const say = AUDIO_NOTE[res.audio];
    if (say && !(res.audio === 'none' && plan.audio === 'none')) notes.push(say);
  }
  if (plan.audio === 'none' && video && res.audio !== 'none') notes.push('Sin sonido, como pediste.');
  if (!size.sameAspect) notes.push('La proporción era otra: la imagen se recortó al centro.');
  const name = res.name || exportName(p, format === 'png-zip' ? 'zip' : format);
  const out: JobOutput = { files: [{ name, blob: res.blob }], notes };
  if (plan.dest === 'web' && (format === 'webm' || format === 'mp4')) {
    out.snippet = {
      label: 'Para tu web (es un video: el efecto no corre fuera del estudio)',
      code: `<video src="${name}" autoplay muted loop playsinline width="${size.w}" height="${size.h}" style="max-width:100%;height:auto"></video>`,
    };
  } else if (plan.dest === 'web' && format === 'gif') {
    out.snippet = {
      label: 'Para tu web (es un GIF: una imagen animada, no el efecto)',
      code: `<img src="${name}" alt="${p.name.replace(/"/g, '&quot;')}" width="${size.w}" height="${size.h}" style="max-width:100%;height:auto">`,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ real characters */

const STILL_TEXT = new Set<string>(['txt', 'ansi', 'html', 'svg-text', 'shell']);
const MOVING_TEXT = new Set<string>(['cast', 'node', 'python', 'html-anim', 'web']);

async function textJob(p: Project, plan: Plan, ctx: JobContext): Promise<JobOutput> {
  const id = plan.target;
  const layer = p.layers.find(l => l.id === id);
  if (!id || !layer || layer.kind !== 'glyphs') throw new Error('Elige una capa de caracteres reales.');
  // the file is named after the project, and the layer when its name adds something
  const what = layer.name.trim().toLowerCase() === p.name.trim().toLowerCase() ? '' : layer.name;
  if (STILL_TEXT.has(plan.format)) {
    ctx.onProgress({ done: 0, total: 1, label: 'Leyendo los caracteres…' });
    const s = frameSession(ctx.compositor ? { compositor: ctx.compositor } : {});
    try {
      const f = await glyphFrameAt(p, id, plan.t, s);
      if (!f) throw new Error('Falta la imagen de esta capa: no hay caracteres que escribir.');
      const out = stillText(f, plan.format as StillTextFormat, { depth: plan.depth, title: layer.name });
      const notes = notesText(f.notes);
      if (plan.format === 'svg-text' && plan.embedFonts) {
        const ff = await fontFaces([{ font: f.style.font, weight: f.style.weight }]);
        out.text = withFonts(out.text, ff.css);
        if (fontNote(ff)) notes.push(fontNote(ff));
      }
      return { files: [{ name: exportName(p, out.ext, what), blob: new Blob([out.text], { type: out.mime + ';charset=utf-8' }) }], notes };
    } finally { s.release(); }
  }
  if (MOVING_TEXT.has(plan.format)) {
    const total = frameCount(plan.start, plan.end, plan.fps);
    const fr = await glyphFrames(p, id, {
      fps: plan.fps, from: plan.start, to: plan.end, signal: ctx.signal,
      onProgress: (done, n) => ctx.onProgress({ done, total: n, label: `Cuadro ${done} de ${n}` }),
      ...(ctx.compositor ? { compositor: ctx.compositor } : {}),
    });
    if (!fr) throw new Error('Falta la imagen de esta capa: no hay caracteres que escribir.');
    check(ctx.signal);
    ctx.onProgress({ done: total, total, label: 'Escribiendo el archivo…' });
    const out = await movingText(fr, plan.format as MovingTextFormat, { depth: plan.depth, title: layer.name, loop: plan.loop, transparent: plan.transparent });
    const notes = notesText(fr.notes, fr.frames.length);
    const res: JobOutput = { files: [{ name: exportName(p, out.ext, [what, plan.format === 'web' ? 'web' : ''].filter(Boolean).join('-')), blob: new Blob([out.text], { type: out.mime + ';charset=utf-8' }) }], notes };
    if (plan.format === 'web') res.snippet = { label: 'Pega este bloque en tu página (texto real animado, sin dependencias)', code: out.text };
    return res;
  }
  throw new Error('Ese formato no es de texto.');
}

/* ------------------------------------------------------------------ README bundle */

async function readmeJob(p: Project, plan: Plan, ctx: JobContext): Promise<JobOutput> {
  const w = Math.min(plan.readmeW, 1600);
  const h = Math.max(1, Math.round((w * p.canvas.h) / p.canvas.w));
  const moving = plan.end > plan.start && !!ctx.movies?.find(f => f.format === 'gif' && f.available);
  const notes: string[] = [];
  let image: { name: string; blob: Blob };
  if (moving) {
    const m = await import('../../video/index');
    const res = await m.exportMovie(p, {
      format: 'gif', width: w, height: h, fps: Math.min(plan.fps, 24), start: plan.start, end: plan.end, audio: 'none', transparent: plan.transparent,
      gif: { colors: plan.gif.colors, dither: plan.gif.dither, loop: true } as never, onProgress: pr => ctx.onProgress(pr), signal: ctx.signal,
    });
    image = { name: 'pieza.gif', blob: res.blob };
    notes.push(...res.notes);
  } else {
    ctx.onProgress({ done: 0, total: 1, label: 'Dibujando la imagen…' });
    const blob = await exportSized(p, { w, h, fit: 'cover', t: plan.t, transparent: plan.transparent, format: 'png', ...(ctx.compositor ? { compositor: ctx.compositor } : {}) });
    image = { name: 'pieza.png', blob };
    if (p.time.duration > 0 && plan.end > plan.start) notes.push('Aquí no se puede escribir GIF: el README lleva una imagen fija del instante elegido.');
  }
  check(ctx.signal);
  let text: string | undefined;
  if (plan.readmeText) {
    const s = frameSession(ctx.compositor ? { compositor: ctx.compositor } : {});
    try {
      const at = readmeTextTime(plan, p.time.duration > 0 && plan.end > plan.start);
      const f = await glyphFrameAt(p, plan.readmeText, at, s);
      if (f) {
        text = stillText(f, 'txt').text;
        notes.push(...notesText(f.notes));
        if (at !== plan.t) notes.push(`El texto del README es el último cuadro del tramo (${at.toFixed(2).replace('.', ',')} s), donde la animación termina.`);
      }
    } finally { s.release(); }
  }
  const r = readmeMarkdown({ title: p.name, image: { file: image.name, alt: p.name, w, h, moving }, ...(text ? { text } : {}) });
  notes.push(...r.notes);
  const files = [
    { name: 'README.md', data: r.md },
    { name: image.name, data: image.blob },
    ...(text ? [{ name: 'pieza.txt', data: text }] : []),
  ];
  const bundle = await zip(files);
  return { files: [{ name: exportName(p, 'zip', 'readme'), blob: bundle }], notes, snippet: { label: 'Para tu README (con la imagen junto al archivo)', code: r.snippet } };
}
