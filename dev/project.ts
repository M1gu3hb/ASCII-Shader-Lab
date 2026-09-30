/**
 * QA page for the photo and video studio's foundation (not part of the production build): sample projects
 * built in code over a synthetic photo, rendered by evaluate() + the compositor; a time scrubber that shows
 * what evaluate() returns; and window.mt, which tests/e2e/project.spec.ts drives (renders, exports,
 * saving and reopening, project files).
 */
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/martian-mono/latin-400.css';
import '@fontsource/martian-mono/latin-700.css';
import '@fontsource/martian-mono/latin-800.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import { paintLandscape } from '../src/shared/sample';
import { PRESETS } from '../src/studio/presets';
import { del as idbDel, set as idbSet } from 'idb-keyval';
import { gcMedia, hasMedia, put } from '../src/studio/mediaStore';
import type { MediaRef, Recipe } from '../src/engine/recipe';
import { evaluate } from '../src/project/evaluate';
import { Compositor } from '../src/project/compositor';
import { createSourceProvider } from '../src/project/sources';
import { cloneProject, newLayer, newProject, normalizeProject, projectFromImage, projectFromRecipe, projectFromSequence, projectFromVideo, uid } from '../src/project/normalize';
import * as store from '../src/project/store';
import type { Mask, Project } from '../src/project/types';
import * as exporting from '../src/project/export';
import * as persist from '../src/project/persist';
import * as file from '../src/project/file';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const status = (s: string) => { $('#status').textContent = s; };

/* ------------------------------------------------------------------ the sample photo */

/** The landscape of src/shared/sample.ts with a standing figure against the sun (the «subject»). */
function samplePhoto(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  const x = c.getContext('2d')!;
  paintLandscape(x);
  // the figure: dark, with a warm rim light from the sun behind it
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
  const shade = x.createLinearGradient(262, 0, 398, 0);
  shade.addColorStop(0, 'rgba(90,40,50,.0)'); shade.addColorStop(0.7, 'rgba(255,150,90,.18)'); shade.addColorStop(1, 'rgba(255,190,120,.35)');
  x.fillStyle = shade;
  x.fill(body);
  return c;
}

/** The figure's outline in frame units (for masks): body polygon and head ellipse. */
const FIGURE_POLY = [262, 600, 256, 520, 262, 430, 280, 350, 305, 310, 330, 300, 355, 310, 380, 350, 398, 430, 404, 520, 398, 600]
  .map((v, i) => (i % 2 ? v / 600 : v / 960));
const FIGURE_HEAD = { x: (330 - 40) / 960, y: (246 - 48) / 600, w: 80 / 960, h: 96 / 600 };

async function storePhoto(): Promise<MediaRef> {
  const c = samplePhoto();
  const blob = await new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png'));
  const r = await put(blob, { kind: 'image', name: 'atardecer.png', w: c.width, h: c.height });
  return { id: r.id, kind: 'image', name: 'atardecer.png', type: 'image/png', size: blob.size, w: c.width, h: c.height };
}

/* ------------------------------------------------------------------ samples */

const preset = (space: 'media' | 'arte' | 'tipo', id: string): Recipe => {
  const p = PRESETS[space].find(x => x.id === id)!;
  const r = p.make();
  r.interact = { ...r.interact, mode: 'none', auto: false };
  return r;
};

function circleSample(ref: MediaRef): Project {
  const p = projectFromImage(ref, { name: 'Foto con una zona circular en ASCII', duration: 4 });
  p.seed = 'circulo';
  const style = preset('media', 'retrato');
  style.glyph.cell = 9;
  const mask: Mask = { invert: false, feather: 14, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.583 - 0.19, y: 0.5 - 0.3, w: 0.38, h: 0.608, rot: 0, soft: 0, alpha: 1 }] };
  p.layers.push(newLayer('ascii', {
    name: 'Sol en ASCII', source: p.sources[0].id, style, opaque: true, mask,
    clips: [{ id: uid(), template: 'foto-a-ascii', start: 0.4, dur: 2, params: { modo: 'disolver' }, reverse: false, ease: { kind: 'inOut' }, repeat: 1, pingpong: false }],
  }));
  return p;
}

function subjectSample(ref: MediaRef): Project {
  const p = projectFromImage(ref, { name: 'Sujeto en caracteres reales sobre la foto borrosa', duration: 4 });
  p.seed = 'sujeto';
  const photo = p.layers[0];
  if (photo.kind === 'photo') photo.adjust = { ...photo.adjust, blur: 9, bright: -0.28, sat: 0.55 };
  const mask: Mask = {
    invert: false, feather: 2, opacity: 1,
    parts: [{ kind: 'polygon', op: 'add', pts: FIGURE_POLY, soft: 0, alpha: 1 }, { kind: 'ellipse', op: 'add', ...FIGURE_HEAD, rot: 0, soft: 0, alpha: 1 }],
  };
  p.layers.push(newLayer('glyphs', {
    name: 'Sujeto en caracteres', source: p.sources[0].id, mask,
    glyphs: {
      // the figure is dark: inverted, it fills with dense characters in a warm ink (like the horse made of text)
      charset: 'custom', chars: ' .:-=+*#%@', fill: 'ramp', font: 'jetbrains', weight: 700, cell: 9, aspect: 1.7,
      bright: 0.1, contrast: 1.6, gamma: 1, sat: 1, invert: true, edge: 0.35, cutoff: 0,
      color: 'mono', ink: '#ffd2a0', paper: null, palette: ['#0c0b0a', '#ff5b1f', '#ede6da'],
    },
    clips: [{ id: uid(), template: 'escritura', start: 0, dur: 3, params: {}, reverse: false, ease: { kind: 'linear' }, repeat: 1, pingpong: false }],
  }));
  // a thin outline so the subject reads even before real characters are drawn
  p.layers.push(newLayer('shape', { name: 'Contorno', shape: 'polyline', pts: FIGURE_POLY, stroke: '#ffb36b', width: 1.5, fill: null, dash: [4, 4], opacity: 0.8 }));
  return p;
}

function posterSample(ref: MediaRef): Project {
  const p = newProject({ name: 'Cartel editorial con líneas y etiquetas', w: 1080, h: 1350, bg: '#efe9df' });
  p.seed = 'cartel';
  const src = projectFromImage(ref).sources[0];
  p.sources.push(src);
  // the photo in a band across the middle of the poster
  const band: Mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.06, y: 0.25, w: 0.88, h: 0.5, rot: 0, soft: 0, alpha: 1 }] };
  p.layers.push(newLayer('photo', { name: 'Foto', source: src.id, fit: 'cover', mask: band, adjust: { bright: 0, contrast: 1.05, gamma: 1, sat: 0.85, hue: 0, temp: 0.2, blur: 0, sharpen: 0.3, invert: false, mono: false } }));
  // only the sun and its reflection become characters (like the campfire poster: only the flame)
  const style = preset('media', 'periodico');
  style.glyph.cell = 8;
  const zone: Mask = { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: 0.52, y: 0.36, w: 0.3, h: 0.34, rot: 0, soft: 0, alpha: 1 }] };
  p.layers.push(newLayer('ascii', { name: 'Sol tramado', source: src.id, style, opaque: true, mask: zone }));
  // dithered and halftone squares over the photo (like the fruit bowl: pixel squares among the letters)
  const square = (x: number, y: number, w: number): Mask => ({ invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x, y, w, h: w * 1080 / 1350, rot: 0, soft: 0, alpha: 1 }] });
  p.layers.push(newLayer('photo', {
    name: 'Cuadro tramado', source: src.id, fit: 'cover', mask: square(0.83, 0.43, 0.11),
    finishes: [{ kind: 'dither', on: true, amount: 1, params: { algo: 'atkinson', color: 'bn', ink: '#1c1a17', paper: '#efe9df', pixel: 3 } }],
  }));
  p.layers.push(newLayer('photo', {
    name: 'Cuadro en semitono', source: src.id, fit: 'cover', mask: square(0.36, 0.27, 0.12),
    finishes: [{ kind: 'halftone', on: true, amount: 1, params: { shape: 'dot', freq: 7, color: 'fuente', paper: '#efe9df' } }],
  }));
  p.layers.push(newLayer('shape', { name: 'Marco', shape: 'bracket', pts: [0.52, 0.36, 0.3, 0.34], stroke: '#1c1a17', width: 2, fill: null, dash: null }));
  p.layers.push(newLayer('shape', { name: 'Nota FL33', shape: 'callout', pts: [0.67, 0.45, 0.8, 0.2, 0.9, 0.2], stroke: '#1c1a17', width: 1.5, fill: null, dash: null, label: { text: 'FL33', font: 'jetbrains', size: 0.018, color: '#1c1a17' } }));
  p.layers.push(newLayer('shape', { name: 'Nota PW33', shape: 'callout', pts: [0.4, 0.66, 0.3, 0.7, 0.12, 0.7], stroke: '#efe9df', width: 1.5, fill: null, dash: null, label: { text: 'PW33', font: 'jetbrains', size: 0.018, color: '#efe9df' } }));
  p.layers.push(newLayer('shape', { name: 'Mira', shape: 'crosshair', pts: [0.3, 0.37, 0.09, 0.07], stroke: '#ff5b1f', width: 1.5, fill: null, dash: null, label: { text: 'SUJETO 01', font: 'jetbrains', size: 0.014, color: '#ff5b1f' } }));
  p.layers.push(newLayer('shape', { name: 'Regla', shape: 'line', pts: [0.06, 0.12, 0.94, 0.12], stroke: '#1c1a17', width: 2, fill: null, dash: null }));
  p.layers.push(newLayer('text', { name: 'Título', text: 'Teje luz', font: 'serif', weight: 400, italic: true, size: 0.085, color: '#1c1a17', align: 'left', box: { x: 0.06, y: 0.03, w: 0.9 }, tracking: -0.01, leading: 1, upper: false }));
  p.layers.push(newLayer('text', { name: 'Pie', text: 'GLYPHOS · estudio de foto · ensayo nº 3 — una foto, dos maneras de verla: píxeles y caracteres.', font: 'jetbrains', weight: 500, size: 0.017, color: '#1c1a17', align: 'left', box: { x: 0.06, y: 0.785, w: 0.6 }, tracking: 0.04, leading: 1.5, upper: true }));
  p.layers.push(newLayer('text', { name: 'En arco', text: 'con caracteres · con caracteres · ', font: 'jetbrains', weight: 500, size: 0.016, color: '#ff5b1f', align: 'center', box: { x: 0, y: 0, w: 1 }, tracking: 0.12, leading: 1, upper: true, path: { kind: 'circle', cx: 0.85, cy: 0.91, r: 0.055, start: 0 } }));
  p.layers.push(newLayer('text', { name: 'Espiral', text: 'la luz se vuelve letra y la letra vuelve a ser luz · ', font: 'jetbrains', weight: 400, size: 0.012, color: '#1c1a17', align: 'center', box: { x: 0, y: 0, w: 1 }, tracking: 0.05, leading: 1, upper: false, path: { kind: 'spiral', cx: 0.62, cy: 0.925, r: 0.05, start: 0, turns: 2.2 } }));
  return p;
}

function zonesSample(ref: MediaRef): Project {
  const p = projectFromImage(ref, { name: 'Dos zonas con estilos distintos y grano', duration: 4 });
  p.seed = 'zonas';
  const grain = { kind: 'grain' as const, on: true, amount: 0.6, params: {} };
  p.layers[0].finishes = [grain];
  const a = preset('media', 'fosforo');
  a.glyph.cell = 8;
  p.layers.push(newLayer('ascii', {
    name: 'Fósforo (izquierda)', source: p.sources[0].id, style: a, opaque: true, finishes: [grain],
    mask: { invert: false, feather: 0, opacity: 1, parts: [{ kind: 'rect', op: 'add', x: -0.1, y: -0.1, w: 0.52, h: 1.2, rot: 8, soft: 10, alpha: 1 }] },
  }));
  const b = preset('media', 'bloques');
  b.glyph.cell = 12;
  p.layers.push(newLayer('ascii', {
    name: 'Bloques (derecha)', source: p.sources[0].id, style: b, opaque: false, blend: 'screen', finishes: [grain],
    mask: { invert: false, feather: 16, opacity: 0.95, parts: [{ kind: 'ellipse', op: 'add', x: 0.55, y: 0.18, w: 0.4, h: 0.64, rot: 0, soft: 0, alpha: 1 }, { kind: 'rect', op: 'subtract', x: 0.55, y: 0.62, w: 0.4, h: 0.3, rot: 0, soft: 6, alpha: 0.8 }] },
  }));
  // the photo's own opacity rises from nothing, keyframed (a track, not a clip)
  p.tracks.push({ layer: p.layers[2].id, path: 'opacity', keys: [{ t: 0, v: 0, ease: { kind: 'out' } }, { t: 1.5, v: 1, ease: { kind: 'linear' } }] });
  return p;
}

function transparentSample(): Project {
  const p = newProject({ name: 'Recorte transparente', w: 640, h: 640, transparent: true, bg: '#0c0b0a' });
  p.seed = 'transparente';
  const style = preset('arte', 'bermellon');
  style.glyph.cell = 10;
  p.layers.push(newLayer('ascii', {
    name: 'Patrón en círculo', source: 'style', style, opaque: false,
    mask: { invert: false, feather: 20, opacity: 1, parts: [{ kind: 'ellipse', op: 'add', x: 0.12, y: 0.12, w: 0.76, h: 0.76, rot: 0, soft: 0, alpha: 1 }] },
  }));
  p.layers.push(newLayer('text', { name: 'Sello', text: 'GLYPHOS', font: 'martian', weight: 800, size: 0.1, color: '#ff5b1f', align: 'center', box: { x: 0, y: 0.44, w: 1 }, tracking: 0.08, leading: 1, upper: true }));
  p.layers.push(newLayer('shape', { name: 'Aro', shape: 'ellipse', pts: [0.06, 0.06, 0.88, 0.88], stroke: '#ede6da', width: 3, fill: null, dash: [10, 8] }));
  return p;
}

/* ------------------------------------------------------------------ page */

interface Sample { name: string; project: Project }
const samples: Sample[] = [];
/** ?motor=basico draws the ASCII layers with the Canvas 2D engine (as a browser without WebGL 2 does). */
const BASIC = new URLSearchParams(location.search).get('motor') === 'basico';
const compositor = new Compositor(BASIC ? { force: 'basic' } : {});

async function renderInto(c: HTMLCanvasElement, p: Project, t: number, scale: number) {
  return compositor.render(evaluate(p, t), c, { scale });
}

function fnv(d: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pixelsOf = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;

async function decode(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

/** Differences between two canvases: pixels that differ, the largest channel difference, alpha stats. */
function diff(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  if (a.width !== b.width || a.height !== b.height) return { same: false, size: [a.width, a.height, b.width, b.height], differ: -1, max: 255 };
  const x = pixelsOf(a), y = pixelsOf(b);
  let differ = 0, max = 0;
  for (let i = 0; i < x.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(x[i + k] - y[i + k]));
    if (d) { differ++; if (d > max) max = d; }
  }
  return { same: differ === 0, size: [a.width, a.height], differ, max };
}

function alphaStats(c: HTMLCanvasElement) {
  const d = pixelsOf(c);
  let clear = 0, solid = 0, partial = 0;
  for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) clear++; else if (d[i] === 255) solid++; else partial++; }
  return { clear, solid, partial, total: d.length / 4 };
}

const mt = {
  ready: false,
  error: '' as string,
  samples,
  compositor,
  evaluate,
  /** Renders sample i at t and scale into a new canvas; returns its size, a hash of its pixels, how varied they are, and the report. */
  async render(i: number, t = 0, scale = 1) {
    const c = document.createElement('canvas');
    const report = await renderInto(c, samples[i].project, t, scale);
    const d = pixelsOf(c);
    // every pixel: every 4th one reads the same column of each cell when cells are 2 or 4 px wide (the
    // first column, empty in most glyphs), which once passed for glyphs not being drawn at all
    let s = 0, s2 = 0, n = 0;
    for (let k = 0; k < d.length; k += 4) { const l = (d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11) * (d[k + 3] / 255); s += l; s2 += l * l; n++; }
    const mean = s / n;
    return { w: c.width, h: c.height, hash: fnv(d), std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), report };
  },
  /**
   * Media collections: the lab's (as after «Vaciar historial»: nothing referenced, no grace) keeps the files
   * of saved projects; the studio's keeps the files of lab entries; once nothing uses a file, it goes.
   */
  async gcCheck() {
    const ref = photoRef!;
    const id = ref.id!;
    const out: Record<string, unknown> = {};
    await persist.saveProject(samples[0].project);
    await gcMedia(new Set(), 0);
    out.labKeepsStudio = await hasMedia(id);
    for (const s of await persist.listProjects()) await persist.deleteProject(s.id);
    // a lab history entry that uses the photo (as the lab saves it)
    await idbSet('mt.v3.e:prueba', { id: 'prueba', recipe: { media: { ref } }, origin: { media: {} } });
    await persist.collectStudioMedia([], 0);
    out.studioKeepsLab = await hasMedia(id);
    await idbDel('mt.v3.e:prueba');
    const freed = await persist.collectStudioMedia([], 0);
    out.freed = freed.count;
    out.goneWhenUnused = !(await hasMedia(id));
    // back for the other checks
    await storePhoto();
    out.restored = await hasMedia(id);
    return out;
  },
  /** Exports sample i as a still (PNG unless asked) and compares it with render() at scale 1. */
  async exportMatches(i: number, t = 0, format: 'png' | 'jpeg' | 'webp' = 'png') {
    const p = samples[i].project;
    const c = document.createElement('canvas');
    await renderInto(c, p, t, 1);
    const blob = await exporting.exportStill(p, { format, t, compositor });
    const back = await decode(blob);
    return { type: blob.type, bytes: blob.size, ...diff(c, back), alpha: alphaStats(back) };
  },
  /** Saves sample i in the projects store, reads it back, renders both: same pixels? */
  async saveReopen(i: number, t = 0) {
    const p = samples[i].project;
    const saved = await persist.saveProject(p);
    const back = await persist.loadProject(p.id);
    if (!back) return { saved, reopened: false };
    const a = document.createElement('canvas'), b = document.createElement('canvas');
    await renderInto(a, p, t, 0.5);
    await renderInto(b, back, t, 0.5);
    const list = await persist.listProjects();
    return { saved, reopened: true, listed: list.some(x => x.id === p.id), equalJson: JSON.stringify(back) === JSON.stringify(p), ...diff(a, b) };
  },
  /** Packs sample i as a project file, opens it back, renders both: same pixels? */
  async fileRoundTrip(i: number, t = 0) {
    const p = samples[i].project;
    const blob = await file.buildProjectFile(p);
    const res = await file.openProjectFile(blob);
    if (!res.ok) return { ok: false, reason: res.reason, message: res.message };
    const a = document.createElement('canvas'), b = document.createElement('canvas');
    await renderInto(a, p, t, 0.5);
    await renderInto(b, res.project, t, 0.5);
    return { ok: true, bytes: blob.size, newId: res.project.id !== p.id, layers: res.project.layers.length, ...diff(a, b) };
  },
  /** Evaluates sample i at t: what shows, with the clips' progress. */
  state(i: number, t: number) {
    const s = evaluate(samples[i].project, t);
    return s.layers.map(l => ({ name: l.layer.name, kind: l.layer.kind, opacity: Math.round(l.layer.opacity * 1000) / 1000, clips: l.clips.map(c => `${c.template} ${c.p.toFixed(3)}${c.active ? ' ▶' : ''}`) }));
  },
  /**
   * Video sources: a short clip is encoded here (WebM, one solid colour per frame), stored, and drawn at each
   * frame's time by a compositor with the frame-exact provider (mediabunny) and one with the preview provider
   * (a video element). Returns, per frame, the colour expected and the colour each drew (red channel).
   */
  async videoCheck() {
    const mb = await import('mediabunny');
    const fps = 10, n = 10, W = 160, H = 96;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.WebMOutputFormat(), target });
    const codec = (await mb.canEncodeVideo('vp9', { width: W, height: H })) ? 'vp9' : 'vp8';
    const src = new mb.CanvasSource(c, { codec, quality: mb.QUALITY_VERY_HIGH, keyFrameInterval: 0.5 });
    output.addVideoTrack(src, { frameRate: fps });
    await output.start();
    const red = (i: number) => 20 + i * 22;
    for (let i = 0; i < n; i++) {
      x.fillStyle = `rgb(${red(i)}, 90, ${230 - i * 20})`;
      x.fillRect(0, 0, W, H);
      await src.add(i / fps, 1 / fps);
    }
    await output.finalize();
    const blob = new Blob([target.buffer!], { type: 'video/webm' });
    const r = await put(blob, { kind: 'video', name: 'colores.webm', w: W, h: H });
    const ref: MediaRef = { id: r.id, kind: 'video', name: 'colores.webm', type: 'video/webm', size: blob.size, w: W, h: H };
    const p = projectFromVideo(ref, { duration: n / fps, fps });
    const exact = new Compositor({ provider: createSourceProvider({ video: 'exact' }) });
    const preview = new Compositor({ provider: createSourceProvider({ video: 'preview' }) });
    const out: Array<{ t: number; want: number; exact: number; preview: number }> = [];
    const probe = async (comp: Compositor, t: number) => {
      const cv = document.createElement('canvas');
      await comp.render(evaluate(p, t), cv, { scale: 1 });
      return cv.getContext('2d', { willReadFrequently: true })!.getImageData(W >> 1, H >> 1, 1, 1).data[0];
    };
    try {
      for (let i = 0; i < n; i++) {
        // the middle of each frame's time
        const t = (i + 0.5) / fps;
        out.push({ t, want: red(i), exact: await probe(exact, t), preview: await probe(preview, t) });
      }
      // past the end the video starts again (the project time loops over the file)
      out.push({ t: n / fps + 0.25 / fps, want: red(0), exact: await probe(exact, n / fps + 0.25 / fps), preview: await probe(preview, n / fps + 0.25 / fps) });
    } finally {
      exact.destroy(); exact.provider.release();
      preview.destroy(); preview.provider.release();
    }
    return { codec, bytes: blob.size, frames: out };
  },
  /**
   * A photo sequence (three solid colours, half a second each) and a cut-out (a PNG with real transparency)
   * drawn at several times: the photo of each time, the cut-out's alpha kept on a transparent project.
   */
  async sequenceCheck() {
    const solid = async (css: string, alpha = false) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 40;
      const x = c.getContext('2d')!;
      if (alpha) { x.fillStyle = css; x.beginPath(); x.arc(32, 20, 14, 0, Math.PI * 2); x.fill(); } else { x.fillStyle = css; x.fillRect(0, 0, 64, 40); }
      const blob = await new Promise<Blob>(res => c.toBlob(b => res(b!), 'image/png'));
      const r = await put(blob, { kind: 'image', name: css + '.png', w: 64, h: 40 });
      return { id: r.id, kind: 'image' as const, name: css + '.png', type: 'image/png', w: 64, h: 40 };
    };
    const refs = [await solid('#ff0000'), await solid('#00ff00'), await solid('#0000ff')];
    const p = projectFromSequence(refs, 0.5);
    const at = async (q: Project, t: number, px: [number, number]) => {
      const c = document.createElement('canvas');
      await compositor.render(evaluate(q, t), c, { scale: 1 });
      return Array.from(c.getContext('2d', { willReadFrequently: true })!.getImageData(px[0], px[1], 1, 1).data);
    };
    const seq = [];
    for (const t of [0.25, 0.75, 1.25, 1.75]) seq.push(await at(p, t, [32, 20]));
    const cut = newProject({ w: 64, h: 40, transparent: true });
    const ref = await solid('#ffaa00', true);
    cut.sources.push({ id: 'recorte', kind: 'cutout', name: 'recorte', media: [ref], w: 64, h: 40, cutout: { from: 'recorte', matte: ref } });
    cut.layers.push(newLayer('photo', { source: 'recorte', fit: 'contain' }));
    return { seq, cutoutCenter: await at(cut, 0, [32, 20]), cutoutCorner: await at(cut, 0, [1, 1]) };
  },
  /** A project with more ASCII layers than the engine budget: a warning, and the same pixels as with room for all. */
  async budgetCheck() {
    const p = cloneProject(samples[3].project);
    for (let i = 0; i < 3; i++) {
      const l = cloneProject(p).layers[1];
      p.layers.push({ ...l, id: uid(), opacity: 0.5, xf: { ...l.xf, x: 0.05 * (i + 1) } });
    }
    const tight = new Compositor({ maxEngines: 2, ...(BASIC ? { force: 'basic' as const } : {}) });
    const roomy = new Compositor({ maxEngines: 8, ...(BASIC ? { force: 'basic' as const } : {}) });
    const a = document.createElement('canvas'), b = document.createElement('canvas');
    try {
      const ra = await tight.render(evaluate(p, 1), a, { scale: 0.5 });
      const rb = await roomy.render(evaluate(p, 1), b, { scale: 0.5 });
      // a second frame through the shared engine (styles alternate in it)
      const ra2 = await tight.render(evaluate(p, 1), a, { scale: 0.5 });
      return { ascii: p.layers.filter(l => l.kind === 'ascii').length, warnings: ra.warnings, shared: ra.engines.shared, roomyWarnings: rb.warnings, again: ra2.warnings.length, ...diff(a, b) };
    } finally { tight.destroy(); roomy.destroy(); }
  },
  /** The store's autosave: an edit is saved a moment later, with its name, in the list of projects. */
  async autosaveCheck() {
    const p = cloneProject(samples[0].project);
    p.id = uid();
    store.openProject(p);
    const stop = store.startAutosave({ delay: 150 });
    store.edit(d => { d.name = 'Guardado solo'; }, 'nombre');
    await new Promise(res => setTimeout(res, 900));
    const listed = (await persist.listProjects()).find(x => x.id === p.id);
    const back = await persist.loadProject(p.id);
    store.undo();
    await stop();
    const after = await persist.loadProject(p.id);
    await persist.deleteProject(p.id);
    return { listedName: listed?.name ?? null, savedName: back?.name ?? null, afterUndo: after?.name ?? null, storage: store.useProject.getState().storage };
  },
  /** The other exports: one layer alone, a mask, the original file, a chosen width, WebP, and the frame loop. */
  async exportsCheck() {
    const p = samples[0].project;
    const layer = await exporting.exportLayer(p, p.layers[1].id, { t: 3, compositor });
    const layerC = await decode(layer);
    const mask = await exporting.exportMask(p, p.layers[1].id, { width: 320 });
    const maskC = mask ? await decode(mask) : null;
    const md = maskC ? pixelsOf(maskC) : null;
    const orig = await exporting.exportOriginal(p, p.sources[0].id);
    const stored = await (await import('../src/project/sources')).storeBlob(p.sources[0].media[0].id!);
    const small = await decode(await exporting.exportStill(p, { width: 480, t: 3, compositor }));
    const webp = await exporting.canEncode('webp') ? (await exporting.exportStill(p, { format: 'webp', t: 3, compositor })).type : 'sin WebP';
    const hashes: string[] = [];
    for await (const f of exporting.frames(p, { fps: 4, from: 0.5, to: 1.5, scale: 0.25 })) hashes.push(`${f.i}/${f.n}@${f.t}:${fnv(pixelsOf(f.canvas))}`);
    return {
      layer: { type: layer.type, alpha: alphaStats(layerC) },
      mask: maskC ? { w: maskC.width, h: maskC.height, center: md![((maskC.height >> 1) * maskC.width + (maskC.width * 0.583 | 0)) * 4], corner: md![0], alpha: alphaStats(maskC) } : null,
      original: { files: orig.length, same: !!stored && orig[0]?.blob.size === stored.blob.size, name: orig[0]?.name },
      small: [small.width, small.height], webp, frames: hashes,
    };
  },
  basic: BASIC,
  file, persist, exporting,
};
(window as unknown as { mt: typeof mt }).mt = mt;

let photoRef: MediaRef | null = null;

async function main() {
  status('guardando la foto de muestra en el navegador…');
  const ref = photoRef = await storePhoto();
  // (through normalizeProject, as every project the studio opens: finishes get their defaults)
  const add = (name: string, p: Project) => samples.push({ name, project: normalizeProject(p) });
  add('Foto con una zona circular en ASCII', circleSample(ref));
  add('Sujeto en caracteres reales sobre la foto borrosa', subjectSample(ref));
  add('Cartel editorial con líneas y etiquetas', posterSample(ref));
  add('Dos zonas con estilos distintos y grano', zonesSample(ref));
  add('Recorte transparente', transparentSample());
  add('Pieza del laboratorio llevada al estudio', projectFromRecipe(preset('media', 'neon'), ref));
  const grid = $('#samples');
  const pick = $<HTMLSelectElement>('#pick');
  for (const [i, s] of samples.entries()) {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    c.setAttribute('aria-label', s.name);
    const cap = document.createElement('figcaption');
    fig.append(c, cap);
    grid.append(fig);
    const t = s.project.time.duration > 0 ? Math.min(3.5, s.project.time.duration) : 0;
    status(`dibujando ${i + 1} de ${samples.length}…`);
    const r = await renderInto(c, s.project, t, 0.5);
    cap.innerHTML = `<b></b><span>${r.w}×${r.h} · t ${t} s · ${r.ms} ms${r.engines.webgl2 ? ` · ${r.engines.webgl2} WebGL` : ''}${r.engines.basic ? ` · ${r.engines.basic} básico` : ''}</span>`;
    cap.querySelector('b')!.textContent = s.name;
    for (const w of r.warnings) { const e = document.createElement('span'); e.className = 'warn'; e.textContent = w; cap.append(e); }
    const o = document.createElement('option');
    o.value = String(i); o.textContent = s.name;
    pick.append(o);
  }
  // the scrubber
  const time = $<HTMLInputElement>('#time'), tval = $('#tval'), sc = $<HTMLCanvasElement>('#scrubCanvas'), pre = $('#state');
  let busy = false, again = false;
  const show = async () => {
    if (busy) { again = true; return; }
    busy = true;
    const i = Number(pick.value), t = Number(time.value);
    tval.textContent = `${t.toFixed(2)} s`;
    const r = await renderInto(sc, samples[i].project, t, 0.5);
    pre.textContent = JSON.stringify({ t, ms: r.ms, capas: mt.state(i, t) }, null, 1);
    busy = false;
    if (again) { again = false; void show(); }
  };
  pick.addEventListener('change', () => { time.max = String(Math.max(0.1, samples[Number(pick.value)].project.time.duration)); void show(); });
  time.addEventListener('input', () => void show());
  let playing = 0;
  $('#play').addEventListener('click', () => {
    if (playing) { cancelAnimationFrame(playing); playing = 0; return; }
    const t0 = performance.now() - Number(time.value) * 1000;
    const step = () => {
      const d = Number(time.max);
      time.value = String(((performance.now() - t0) / 1000) % d);
      void show();
      playing = requestAnimationFrame(step);
    };
    playing = requestAnimationFrame(step);
  });
  await show();
  status(`listo: ${samples.length} muestras`);
  mt.ready = true;
}

main().catch(e => { mt.error = String((e as Error)?.stack ?? e); status('error: ' + (e as Error).message); console.error(e); });
