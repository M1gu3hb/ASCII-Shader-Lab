/**
 * Templates that change how a layer is drawn: its style (charset, cell size, weight, colour, shader
 * settings), in sequences, at random within limits, region by region; and zones that trade places.
 *
 *   recorrido-estilos  «Recorrido de estilos»: one photo through a list of styles (a 'list' param), with a
 *                      transition between each (cut, flash, pixels, fade)
 *   secuencia          «Secuencia de estados»: photo, scattered, coarse, fine, ASCII… states with smooth
 *                      transitions and holds: de-fragmentation / resolution / recomposition sequences
 *   cambio-aleatorio   «Cambio aleatorio con límites»: seeded style jumps at a chosen rate, stable between
 *   regiones-estilo    «Regiones que cambian de estilo»: each region switches to another charset at its time
 *   zonas-intercambio  «Intercambio de zonas»: the layer's mask morphs into another layer's (or its mirror)
 *
 * STYLE_STATES is the vocabulary of styles these templates (and the timeline's pickers) use.
 */
import { charsetInfo } from '../glyphs/index';
import { hashString, rand01, registerTemplate, type ClipContext, type ClipEffect, type ParamValue, listItems } from '../project/clips';
import type { AsciiLayer, Finish, GlyphsLayer, Layer, Mask, MaskPart } from '../project/types';
import {
  ALL_KINDS, bool, cellX, cellY, clamp, clamp01, colorSet, gradientAt, geo, hueRotate, lerp, lumAt, noise2, num, orderField,
  P, perCell, regionField, smooth, span01, stagger, str, sweep,
} from './kit';

/* ------------------------------------------------------------------ the vocabulary of styles */

type Sets = Record<string, ParamValue>;
export interface StyleState {
  id: string;
  name: string;
  glyphs?: (l: GlyphsLayer) => Sets;
  ascii?: (l: AsciiLayer) => Sets;
}

const stops = (l: AsciiLayer, colors: string[]): Sets => {
  const out: Sets = { 'style.color.mode': 'ramp' };
  const n = l.style.color.stops.length;
  for (let i = 0; i < n; i++) out[`style.color.stops.${i}`] = gradientAt(colors, n > 1 ? i / (n - 1) : 1);
  return out;
};
const gCell = (l: GlyphsLayer, k: number) => Math.round(clamp(l.glyphs.cell * k, 3, 64) * 10) / 10;
const aCell = (l: AsciiLayer, k: number) => Math.round(clamp(l.style.glyph.cell * k, 3, 96) * 10) / 10;

export const STYLE_STATES: StyleState[] = [
  { id: 'propio', name: 'El de la capa', glyphs: () => ({}), ascii: () => ({}) },
  { id: 'fino', name: 'Fino (más celdas)', glyphs: l => ({ 'glyphs.cell': gCell(l, 0.6), 'glyphs.charset': 'estandar2' }), ascii: l => ({ 'style.glyph.cell': aCell(l, 0.6), 'style.glyph.charset': " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" }) },
  { id: 'grueso', name: 'Grueso (celdas grandes)', glyphs: l => ({ 'glyphs.cell': gCell(l, 2.4) }), ascii: l => ({ 'style.glyph.cell': aCell(l, 2.4) }) },
  { id: 'bloques', name: 'Bloques', glyphs: () => ({ 'glyphs.charset': 'bloques' }), ascii: () => ({ 'style.glyph.charset': ' ░▒▓█' }) },
  { id: 'braille', name: 'Braille', glyphs: () => ({ 'glyphs.charset': 'braille' }), ascii: () => ({ 'style.glyph.charset': ' ⠁⠃⠇⠏⠟⠿⡿⣿' }) },
  { id: 'puntos', name: 'Puntos', glyphs: () => ({ 'glyphs.charset': 'puntos' }), ascii: () => ({ 'style.glyph.charset': ' ·•●' }) },
  { id: 'lineas', name: 'Líneas', glyphs: () => ({ 'glyphs.charset': 'lineas' }), ascii: () => ({ 'style.glyph.charset': ' -=≡' }) },
  { id: 'binario', name: 'Binario', glyphs: () => ({ 'glyphs.charset': 'custom', 'glyphs.chars': ' 01', 'glyphs.color': 'mono', 'glyphs.ink': '#4fe36a' }), ascii: l => ({ 'style.glyph.charset': ' 01', ...stops(l, ['#0b3d12', '#4fe36a', '#c6ffc9']) }) },
  { id: 'matematico', name: 'Símbolos matemáticos', glyphs: () => ({ 'glyphs.charset': 'matematicos' }), ascii: () => ({ 'style.glyph.charset': ' ·∘+×=≠≈∞' }) },
  { id: 'contorno', name: 'Contornos', glyphs: () => ({ 'glyphs.edge': 0.9 }), ascii: () => ({ 'style.glyph.mode': 'lines', 'style.glyph.edge': 0.9 }) },
  { id: 'tramado', name: 'Tramado', glyphs: () => ({ 'glyphs.charset': 'bloques-trama' }), ascii: () => ({ 'style.glyph.dither': 0.85 }) },
  { id: 'bandas', name: 'Bandas de tono', glyphs: () => ({ 'glyphs.contrast': 2.4, 'glyphs.charset': 'minimalista' }), ascii: () => ({ 'style.tone.levels': 4 }) },
  { id: 'tinta', name: 'Tinta sobre papel', glyphs: () => ({ 'glyphs.color': 'mono', 'glyphs.ink': '#1c1a17', 'glyphs.paper': '#ede6da', 'glyphs.invert': true }), ascii: l => ({ ...stops(l, ['#1c1a17', '#3a342c']), 'style.color.bg': '#ede6da', 'style.tone.invert': true }) },
  { id: 'fosforo', name: 'Fósforo verde', glyphs: () => ({ 'glyphs.color': 'mono', 'glyphs.ink': '#4fe36a' }), ascii: l => stops(l, colorSet('fosforo')) },
  { id: 'ambar', name: 'Terminal ámbar', glyphs: () => ({ 'glyphs.color': 'mono', 'glyphs.ink': '#ffb000' }), ascii: l => stops(l, colorSet('ambar')) },
  { id: 'bermellon', name: 'Bermellón', glyphs: () => ({ 'glyphs.color': 'mono', 'glyphs.ink': '#ff5b1f' }), ascii: l => stops(l, ['#3a0f02', '#ff5b1f', '#ffd2a0']) },
  { id: 'cianotipo', name: 'Cianotipia', glyphs: () => ({ 'glyphs.color': 'mono', 'glyphs.ink': '#a5d7e8' }), ascii: l => stops(l, colorSet('cianotipo')) },
  { id: 'color', name: 'Color de la foto', glyphs: () => ({ 'glyphs.color': 'source' }), ascii: () => ({ 'style.color.mode': 'source' }) },
  { id: 'negrita', name: 'Negrita', glyphs: () => ({ 'glyphs.weight': 800 }), ascii: () => ({ 'style.glyph.weight': 800 }) },
  { id: 'ligera', name: 'Ligera', glyphs: () => ({ 'glyphs.weight': 200 }), ascii: () => ({ 'style.glyph.weight': 200 }) },
  { id: 'invertido', name: 'Invertido', glyphs: l => ({ 'glyphs.invert': !l.glyphs.invert }), ascii: l => ({ 'style.tone.invert': !l.style.tone.invert }) },
  { id: 'contraste', name: 'Mucho contraste', glyphs: () => ({ 'glyphs.contrast': 2.2 }), ascii: () => ({ 'style.tone.contrast': 1.9 }) },
  { id: 'brillo', name: 'Con resplandor', glyphs: () => ({ 'glyphs.bright': 0.15 }), ascii: () => ({ 'style.fx.glow': 0.8 }) },
];
export const STYLE_OPTIONS: Array<[string, string]> = STYLE_STATES.map(s => [s.id, s.name]);
export const styleState = (id: string) => STYLE_STATES.find(s => s.id === id);

/** The property changes that put a layer in a style state ({} when the kind has none). */
export function styleSets(layer: Readonly<Layer>, id: string): Sets {
  const s = styleState(id);
  if (!s) return {};
  if (layer.kind === 'glyphs') return s.glyphs?.(layer as GlyphsLayer) ?? {};
  if (layer.kind === 'ascii') return s.ascii?.(layer as AsciiLayer) ?? {};
  return {};
}

/** The layer's cell size scaled (glyph or engine), as a set. */
function cellSet(layer: Readonly<Layer>, k: number): Sets {
  if (layer.kind === 'glyphs') return { 'glyphs.cell': Math.round(clamp(layer.glyphs.cell * k, 2, 256) * 100) / 100 };
  if (layer.kind === 'ascii') return { 'style.glyph.cell': Math.round(clamp(layer.style.glyph.cell * k, 3, 96) * 100) / 100 };
  return {};
}

/* ------------------------------------------------------------------ Recorrido de estilos */

const TRANSITIONS: Array<[string, string]> = [['corte', 'Corte'], ['destello', 'Destello'], ['pixelado', 'Pixelado'], ['fundido', 'Fundido por negro'], ['parpadeo', 'Parpadeo entre los dos']];

/** A transition's finishes / opacity at distance d (0 = at the change, 1 = the window's edge). */
function transition(kind: string, d: number, before: boolean): { opacity?: number; finishes?: Finish[]; swap?: boolean } {
  const k = 1 - smooth(clamp01(d));
  switch (kind) {
    case 'destello': return { finishes: [{ kind: 'glow', on: true, amount: k, params: { threshold: 0.15, radius: 40, strength: 2.2, tint: '#ffffff', blend: 'add' } }] };
    case 'pixelado': return k > 0.02 ? { finishes: [{ kind: 'pixelate', on: true, amount: 1, params: { size: Math.round(2 + 30 * k), shape: 'square', gap: 0 } }] } : {};
    case 'fundido': return { opacity: 1 - k * 0.92 };
    case 'parpadeo': return { swap: k > 0.2 && Math.floor(d * 6) % 2 === (before ? 1 : 0) };
    default: return {};
  }
}

registerTemplate({
  id: 'recorrido-estilos',
  name: 'Recorrido de estilos',
  blurb: 'Una misma foto pasa por varios estilos: juegos de caracteres, densidades, pesos, colores y tamaños de celda, en el orden que elijas, con una transición entre cada uno.',
  group: 'transformación',
  kinds: ['glyphs', 'ascii'],
  dur: 5,
  params: [
    { key: 'estados', label: 'Estilos', type: 'list', options: STYLE_OPTIONS, def: 'propio,fino,bloques,braille,tinta,propio', min: 2, max: 10, help: 'En orden; se puede repetir uno.' },
    { key: 'transicion', label: 'Transición', type: 'select', options: TRANSITIONS, def: 'destello' },
    { key: 'ventana', label: 'Duración de la transición', type: 'range', min: 0, max: 0.6, step: 0.05, def: 0.25, help: 'Parte del tiempo de cada estilo que se va en el cambio.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const list = listItems(ctx.params.estados);
    const N = list.length;
    if (N < 1) return null;
    const p = ctx.p;
    const x = p * N;
    const k = Math.min(N - 1, Math.floor(x));
    const f = x - k;
    const win = num(ctx, 'ventana', 0.25) / 2;
    const kind = str(ctx, 'transicion', 'destello');
    // distance to the nearest change (in units of this state's time); none before the first / after the last
    let d = Infinity, before = false;
    if (k > 0 && f < win) { d = f / win; before = false; }
    if (k < N - 1 && 1 - f < win && (1 - f) / win < d) { d = (1 - f) / win; before = true; }
    const tr = Number.isFinite(d) ? transition(kind, d, before) : {};
    const id = tr.swap ? list[before ? k + 1 : k - 1] ?? list[k] : list[k];
    const set = styleSets(ctx.layer, id);
    const eff: ClipEffect = {};
    if (Object.keys(set).length) eff.set = set;
    if (tr.opacity !== undefined) eff.opacity = tr.opacity;
    if (tr.finishes) eff.finishes = tr.finishes;
    return Object.keys(eff).length ? eff : null;
  },
});

/* ------------------------------------------------------------------ Secuencia de estados */

interface StateVec { vis: number; cell: number; scatter: number; alpha: number }
const SEQ_STATES: Record<string, { name: string; v: StateVec }> = {
  foto: { name: 'Foto (sin caracteres)', v: { vis: 0, cell: 1, scatter: 0, alpha: 1 } },
  ascii: { name: 'ASCII (la capa)', v: { vis: 1, cell: 1, scatter: 0, alpha: 1 } },
  fino: { name: 'Fino', v: { vis: 1, cell: 0.6, scatter: 0, alpha: 1 } },
  medio: { name: 'Medio', v: { vis: 1, cell: 2, scatter: 0, alpha: 1 } },
  grueso: { name: 'Grueso', v: { vis: 1, cell: 4.5, scatter: 0, alpha: 1 } },
  disperso: { name: 'Disperso', v: { vis: 1, cell: 1, scatter: 1, alpha: 1 } },
  suelto: { name: 'Algo suelto', v: { vis: 1, cell: 1, scatter: 0.3, alpha: 1 } },
  fantasma: { name: 'Fantasma', v: { vis: 1, cell: 1, scatter: 0, alpha: 0.3 } },
};
const SEQ_OPTIONS: Array<[string, string]> = Object.entries(SEQ_STATES).map(([k, s]) => [k, s.name]);

registerTemplate({
  id: 'secuencia',
  name: 'Secuencia de estados',
  blurb: 'Una transformación en varios pasos: de foto a caracteres dispersos, que se recomponen gruesos y se afinan (o el orden que elijas), con pausas en cada estado.',
  group: 'transformación',
  kinds: ['glyphs', 'ascii'],
  dur: 6,
  params: [
    { key: 'estados', label: 'Estados', type: 'list', options: SEQ_OPTIONS, def: 'foto,disperso,grueso,medio,ascii', min: 2, max: 8 },
    { key: 'quieto', label: 'Tiempo quieto en cada estado', type: 'range', min: 0, max: 0.8, step: 0.05, def: 0.35 },
    { key: 'escalonado', label: 'Tamaño de celda a saltos', type: 'toggle', def: true, help: 'El tamaño de celda cambia de golpe a mitad de la transición: los caracteres no bailan.' },
    P.order('azar', ['azar', 'centro', 'izquierda', 'arriba', 'brillo', 'ruido']),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const list = listItems(ctx.params.estados).filter(s => SEQ_STATES[s]);
    if (list.length < 1) return null;
    const N = list.length;
    const still = num(ctx, 'quieto', 0.35);
    // N states on a line: each holds `still` of its share, the rest is the move to the next
    const x = clamp01(ctx.p) * (N - 1);
    const k = Math.min(N - 2, Math.floor(x));
    const f = N > 1 ? x - Math.max(0, k) : 0;
    const a = SEQ_STATES[list[Math.max(0, k)]].v, b = SEQ_STATES[list[Math.min(N - 1, Math.max(0, k) + 1)]].v;
    const m = N > 1 ? smooth(span01(f, still / 2, 1 - still / 2)) : 0;
    const v: StateVec = {
      vis: lerp(a.vis, b.vis, m), scatter: lerp(a.scatter, b.scatter, m), alpha: lerp(a.alpha, b.alpha, m),
      cell: bool(ctx, 'escalonado', true) ? (m < 0.5 ? a.cell : b.cell) : a.cell * Math.pow(b.cell / a.cell, m),
    };
    const eff: ClipEffect = {};
    if (Math.abs(v.cell - 1) > 1e-3) eff.set = cellSet(ctx.layer, v.cell);
    if (v.alpha < 1) eff.opacity = v.alpha;
    if (v.vis <= 0) return { ...eff, opacity: 0 };
    const seed = hashString(ctx.seed);
    const kind = str(ctx, 'orden', 'azar') as Parameters<typeof orderField>[0];
    if (v.vis < 1 || v.scatter > 0) {
      Object.assign(eff, perCell(ctx, g => {
        const G = geo(g);
        const o = orderField(kind, g, seed);
        const D = Math.hypot(G.w, G.h);
        return (i, c, r) => {
          const vis = v.vis < 1 ? sweep(o[i], v.vis, 0.2) : 1;
          if (v.scatter <= 0) return vis >= 1 ? null : { visible: vis };
          // a coherent flow field (by position, not by cell): the grid can change size without jitter
          const nx = cellX(G, c) / G.w, ny = cellY(G, r) / G.h;
          const ang = noise2(seed, nx * 2.5, ny * 2.5) * Math.PI * 2, len = D * 0.18 * (0.6 + 0.8 * (noise2(seed + 3, nx * 4, ny * 4) * 0.5 + 0.5));
          const s = v.scatter * (0.75 + 0.25 * o[i]);
          return { visible: vis, dx: Math.cos(ang) * len * s, dy: Math.sin(ang) * len * s, rot: noise2(seed + 5, nx * 3, ny * 3) * 180 * s };
        };
      }, { tileCell: 16 }));
    }
    return Object.keys(eff).length ? eff : null;
  },
});

/* ------------------------------------------------------------------ Cambio aleatorio con límites */

registerTemplate({
  id: 'cambio-aleatorio',
  name: 'Cambio aleatorio con límites',
  blurb: 'Saltos de estilo al azar a un ritmo fijo: tamaño de celda, juego de caracteres, tono y contraste dentro de los límites que marques. Entre saltos, todo queda quieto.',
  group: 'transformación',
  kinds: ['glyphs', 'ascii'],
  dur: 4,
  params: [
    { key: 'ritmo', label: 'Cambios por segundo', type: 'range', min: 0.5, max: 12, step: 0.5, def: 3 },
    { key: 'estilos', label: 'Estilos posibles', type: 'list', options: STYLE_OPTIONS, def: 'propio,fino,bloques,braille,puntos', min: 1, max: 12 },
    { key: 'celdaMin', label: 'Celda mínima', type: 'range', min: 0.4, max: 1, step: 0.05, def: 0.7, help: 'Veces el tamaño de celda de la capa.' },
    { key: 'celdaMax', label: 'Celda máxima', type: 'range', min: 1, max: 4, step: 0.1, def: 1.8 },
    { key: 'tono', label: 'Cambio de tono', type: 'range', min: 0, max: 180, step: 5, def: 40, unit: '°' },
    { key: 'volver', label: 'Volver al final', type: 'toggle', def: true, help: 'El último tramo vuelve al estilo de la capa.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const rate = num(ctx, 'ritmo', 3);
    const dur = Math.max(0.05, ctx.clip.dur / Math.max(1, ctx.clip.repeat));
    const total = Math.max(1, Math.round(rate * dur));
    const j = Math.min(total - 1, Math.floor(clamp01(ctx.p) * total + 1e-9));
    if (j === 0 || (bool(ctx, 'volver', true) && j === total - 1 && total > 2)) return null;
    const seed = hashString(ctx.seed);
    const list = listItems(ctx.params.estilos);
    const id = list[Math.floor(rand01(seed, j, 1) * list.length)] ?? 'propio';
    const lo = num(ctx, 'celdaMin', 0.7), hi = Math.max(lo, num(ctx, 'celdaMax', 1.8));
    const k = lo * Math.pow(hi / lo, rand01(seed, j, 2));
    const set: Sets = { ...cellSet(ctx.layer, k), ...styleSets(ctx.layer, id) };
    // the style's own cell size (fino, grueso) wins; the random one otherwise
    const hue = (rand01(seed, j, 3) * 2 - 1) * num(ctx, 'tono', 40);
    const l = ctx.layer;
    if (hue && l.kind === 'ascii') set['style.color.hue'] = ((l.style.color.hue + hue / 360) % 1 + 1) % 1;
    if (hue && l.kind === 'glyphs') {
      const ink = typeof set['glyphs.ink'] === 'string' ? (set['glyphs.ink'] as string) : l.glyphs.ink;
      set['glyphs.ink'] = hueRotate(ink, hue);
      l.glyphs.palette.forEach((c, i) => { set[`glyphs.palette.${i}`] = hueRotate(c, hue); });
    }
    return { set };
  },
});

/* ------------------------------------------------------------------ Regiones que cambian de estilo */

const REGION_CHARSETS: Array<[string, string]> = [['bloques', 'Bloques'], ['braille-densidad', 'Braille'], ['numerico', 'Numérico'], ['puntos', 'Puntos'], ['lineas', 'Líneas'], ['grises', 'Escala de grises'], ['matematicos', 'Símbolos matemáticos'], ['minimalista', 'Minimalista'], ['alfabetico', 'Alfabético']];

registerTemplate({
  id: 'regiones-estilo',
  name: 'Regiones que cambian de estilo',
  blurb: 'La imagen se divide en regiones y cada una cambia a otro juego de caracteres (y color) a su tiempo, hasta que toda la capa cambió.',
  group: 'transformación',
  kinds: ['glyphs'],
  dur: 3,
  params: [
    { key: 'partes', label: 'Regiones', type: 'select', options: [['voronoi', 'Voronoi'], ['bandas', 'Bandas'], ['brillo', 'Zonas de brillo'], ['rejilla', 'Rejilla']], def: 'voronoi' },
    { key: 'cuantas', label: 'Cuántas', type: 'range', min: 2, max: 24, step: 1, def: 8 },
    { key: 'juego', label: 'Nuevo juego de caracteres', type: 'select', options: REGION_CHARSETS, def: 'bloques' },
    { key: 'tenir', label: 'Cambiar también el color', type: 'toggle', def: true },
    P.color('color', 'Color nuevo', '#ff5b1f'),
    { key: 'vuelta', label: 'Ida y vuelta', type: 'toggle', def: false, help: 'Las regiones vuelven a su estilo antes de terminar.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const vuelta = bool(ctx, 'vuelta');
    const p = vuelta ? clamp01(1 - Math.abs(ctx.p * 2 - 1)) : ctx.p;
    if (p <= 0) return null;
    const seed = hashString(ctx.seed);
    const ramp = Array.from(charsetInfo(str(ctx, 'juego', 'bloques')).chars);
    const tint = bool(ctx, 'tenir', true) ? str(ctx, 'color', '#ff5b1f') : undefined;
    const K = Math.round(num(ctx, 'cuantas', 8));
    const mode = str(ctx, 'partes', 'voronoi') as 'voronoi' | 'bandas' | 'brillo' | 'rejilla';
    return {
      glyphs: ramp.join(''),
      cells: g => {
        const reg = regionField(mode, g, seed, K);
        const L = 0.3;
        return i => {
          const q = stagger(rand01(seed, reg[i], 43), p, L);
          if (q < 0.5 || !(g.chars && (g.chars[i] ?? ' ') !== ' ')) return null;
          const glyph = ramp[Math.min(ramp.length - 1, Math.max(1, Math.round(lumAt(g, i) * (ramp.length - 1))))] ?? '#';
          return tint ? { glyph, color: tint } : { glyph };
        };
      },
    };
  },
});

/* ------------------------------------------------------------------ Intercambio de zonas */

const RES = 48;

/** A mask shape part as a closed polygon of RES points in px (strokes and rasters: null, they stay as they are). */
function partPoly(part: MaskPart, W: number, H: number): number[] | null {
  if (part.kind === 'rect' || part.kind === 'ellipse') {
    const cx = (part.x + part.w / 2) * W, cy = (part.y + part.h / 2) * H, hw = (part.w * W) / 2, hh = (part.h * H) / 2;
    const a = (part.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const out: number[] = [];
    for (let k = 0; k < RES; k++) {
      const t = (k / RES) * Math.PI * 2 - Math.PI * 0.75;
      let x: number, y: number;
      if (part.kind === 'ellipse') { x = Math.cos(t) * hw; y = Math.sin(t) * hh; } else {
        // a square traced at constant angle speed (rays from the centre to the edge)
        const c = Math.cos(t), s = Math.sin(t), m = Math.max(Math.abs(c), Math.abs(s));
        x = (c / m) * hw; y = (s / m) * hh;
      }
      out.push(cx + x * ca - y * sa, cy + x * sa + y * ca);
    }
    return out;
  }
  if (part.kind === 'polygon') return resample(part.pts.map((v, i) => (i % 2 ? v * H : v * W)), RES);
  return null;
}

/** A closed polyline resampled to n points evenly spaced along its length. */
function resample(pts: number[], n: number): number[] {
  const m = pts.length / 2;
  if (m < 2) return Array.from({ length: n * 2 }, (_, i) => pts[i % 2] ?? 0);
  const seg: number[] = [];
  let L = 0;
  for (let i = 0; i < m; i++) { const j = (i + 1) % m; const d = Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]); seg.push(d); L += d; }
  const out: number[] = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * L;
    while (i < m - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const j = (i + 1) % m, f = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    out.push(lerp(pts[i * 2], pts[j * 2], f), lerp(pts[i * 2 + 1], pts[j * 2 + 1], f));
  }
  return out;
}

/** Rotates b's start so it lines up with a (least squares), trying both directions. */
function align(a: number[], b: number[]): number[] {
  const n = a.length / 2;
  let best = b, score = Infinity;
  for (const dir of [1, -1]) for (let s = 0; s < n; s++) {
    let e = 0;
    for (let k = 0; k < n; k += 3) { const j = ((dir * k + s) % n + n) % n; e += (a[k * 2] - b[j * 2]) ** 2 + (a[k * 2 + 1] - b[j * 2 + 1]) ** 2; }
    if (e < score) { score = e; best = Array.from({ length: n * 2 }, (_, q) => { const k = q >> 1; const j = ((dir * k + s) % n + n) % n; return b[j * 2 + (q & 1)]; }); }
  }
  return best;
}

const centroid = (pts: number[]) => { let x = 0, y = 0; const n = pts.length / 2; for (let i = 0; i < n; i++) { x += pts[i * 2]; y += pts[i * 2 + 1]; } return [x / n, y / n]; };

registerTemplate({
  id: 'zonas-intercambio',
  name: 'Intercambio de zonas',
  blurb: 'La zona de la capa (su máscara) se transforma en la zona de otra capa, o en su reflejo: dos capas con estilos distintos intercambian sus lugares.',
  group: 'transformación',
  kinds: ALL_KINDS,
  dur: 2,
  params: [
    { key: 'con', label: 'Hacia', type: 'select', options: [['arriba', 'La zona de la capa de arriba'], ['abajo', 'La zona de la capa de abajo'], ['espejo-h', 'Su reflejo horizontal'], ['espejo-v', 'Su reflejo vertical'], ['giro', 'Su giro de 180°']], def: 'espejo-h' },
    { key: 'curva', label: 'Arco del recorrido', type: 'range', min: -1, max: 1, step: 0.05, def: 0.25, help: 'Las zonas se cruzan en arco en vez de en línea recta.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    const own = ctx.layer.mask;
    if (p <= 0 || !own || !own.parts.length) return null;
    const { w: W, h: H } = ctx.project.canvas;
    const mode = str(ctx, 'con', 'espejo-h');
    let target: Mask | null = null;
    if (mode === 'arriba' || mode === 'abajo') {
      const layers = ctx.project.layers;
      const at = layers.findIndex(l => l.id === ctx.layer.id);
      const seq = mode === 'arriba' ? layers.slice(at + 1) : layers.slice(0, Math.max(0, at)).reverse();
      target = seq.find(l => l.mask && l.mask.parts.length)?.mask ?? null;
    }
    const mapPt = (x: number, y: number): [number, number] => mode === 'espejo-h' ? [W - x, y] : mode === 'espejo-v' ? [x, H - y] : [W - x, H - y];
    const src = own.parts.map(pt => partPoly(pt, W, H));
    const dst = target ? target.parts.map(pt => partPoly(pt, W, H)) : src.map(poly => {
      if (!poly) return null;
      const out: number[] = [];
      for (let i = 0; i < poly.length; i += 2) out.push(...mapPt(poly[i], poly[i + 1]));
      return out;
    });
    const e = smooth(p);
    const bend = num(ctx, 'curva', 0.25);
    const n = Math.max(src.length, dst.length);
    const parts: MaskPart[] = [];
    for (let k = 0; k < n; k++) {
      const sp = own.parts[k], a = src[k] ?? null;
      let b = dst[k] ?? null;
      if (!a && !b) { if (sp && p < 0.5) parts.push(sp); continue; }
      // an unmatched part grows from (or shrinks to) its centre
      const A = a ?? (() => { const c = centroid(b!); return b!.map((_, i) => c[i % 2]); })();
      b = b ?? (() => { const c = centroid(A); return A.map((_, i) => c[i % 2]); })();
      const B = align(A, b);
      const [ax, ay] = centroid(A), [bx, by] = centroid(B);
      // the path of the centre bends sideways (both zones pass each other instead of colliding)
      const off = Math.sin(Math.PI * e) * bend * 0.25;
      const nx = -(by - ay) * off, ny = (bx - ax) * off;
      const pts: number[] = [];
      for (let i = 0; i < A.length; i += 2) pts.push((lerp(A[i], B[i], e) + nx) / W, (lerp(A[i + 1], B[i + 1], e) + ny) / H);
      const tp = target?.parts[k];
      parts.push({
        kind: 'polygon', op: (e < 0.5 ? sp?.op : tp?.op ?? sp?.op) ?? 'add', pts,
        soft: lerp(sp && 'soft' in sp ? sp.soft : 0, tp && 'soft' in tp ? tp.soft : sp && 'soft' in sp ? sp.soft : 0, e),
        alpha: lerp(sp?.alpha ?? 1, tp?.alpha ?? sp?.alpha ?? 1, e),
      });
    }
    return {
      mask: {
        invert: e < 0.5 ? own.invert : target?.invert ?? own.invert,
        feather: lerp(own.feather, target?.feather ?? own.feather, e),
        opacity: lerp(own.opacity, target?.opacity ?? own.opacity, e),
        parts,
      },
    };
  },
});

/** A layer with a mask to try «Intercambio de zonas» on (QA pages and previews). */
export const exampleZone = (x: number): MaskPart => ({ kind: 'ellipse', op: 'add', x, y: 0.2, w: 0.4, h: 0.6, rot: 0, soft: 8, alpha: 1 });
