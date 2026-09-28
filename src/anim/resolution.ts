/**
 * Templates of resolution: cell size, a single glyph, and the print screens (pixels, halftone, dither)
 * that go from coarse to fine.
 *
 *   resolucion         «De grueso a fino»: huge cells that refine to the layer's own, in steps or smoothly
 *   un-glifo           «Hasta un solo glifo»: cells grow and then fold into one glyph that fills the frame
 *   nace-de-un-glifo   «Nace de un glifo»: one glyph at a point multiplies into the picture (rings, branches, spiral)
 *   pixelado           «Pixelado a nítido»: blocks that halve until the picture is sharp
 *   semitono           «Semitono que se afina»: big halftone dots that get finer and dissolve into the picture
 *   tramado            «Tramado que se afina»: a 1-bit dither in big pixels that gains tones and resolution
 */
import { DITHER_ALGOS } from '../fx/index';
import { hashString, registerTemplate, type CellGrid, type ClipContext, type ClipEffect } from '../project/clips';
import type { Finish, Layer } from '../project/types';
import {
  ALL_KINDS, bool, cellX, cellY, clamp, clamp01, easeInCubic, easeInOutCubic, easeOutBack, easeOutCubic, geo, lumAt, noise2, num, P, perCell, smooth,
  span01, str, TAU, withHolds,
} from './kit';

/** The cell size path of a layer and its limits (glyph cells 2..256 px, engine cells 3..96 px). */
function cellOf(layer: Readonly<Layer>): { path: string; cell: number; max: number; min: number } | null {
  if (layer.kind === 'glyphs') return { path: 'glyphs.cell', cell: layer.glyphs.cell, max: 256, min: 2 };
  if (layer.kind === 'ascii') return { path: 'style.glyph.cell', cell: layer.style.glyph.cell, max: 96, min: 3 };
  return null;
}

/** A cell size between `from` and the layer's own (geometric), in `steps` steps or smoothly (steps = 0). */
function cellAt(own: number, from: number, k: number, steps: number): number {
  const x = steps > 0 ? Math.min(steps, Math.floor(clamp01(k) * steps + 1e-9)) / steps : clamp01(k);
  return own * Math.pow(from / own, 1 - x);
}

/* ------------------------------------------------------------------ De grueso a fino */

registerTemplate({
  id: 'resolucion',
  name: 'De grueso a fino',
  blurb: 'La imagen empieza con celdas enormes y se afina hasta el tamaño de la capa, a saltos o de forma continua.',
  group: 'entrada',
  kinds: ['glyphs', 'ascii'],
  dur: 2.5,
  params: [
    { key: 'desde', label: 'Celda inicial', type: 'range', min: 8, max: 256, step: 1, def: 80, unit: 'px', help: 'En capas ASCII el máximo es 96 px.' },
    { key: 'modo', label: 'Cómo cambia', type: 'select', options: [['pasos', 'A saltos'], ['continuo', 'Continuo']], def: 'pasos' },
    { key: 'pasos', label: 'Saltos', type: 'range', min: 2, max: 12, step: 1, def: 5, when: { modo: ['pasos'] } },
    { key: 'destello', label: 'Destello en cada salto', type: 'toggle', def: false, when: { modo: ['pasos'] } },
    ...P.holds(),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const c = cellOf(ctx.layer);
    const p = ctx.p;
    if (!c || p >= 1) return null;
    const from = clamp(num(ctx, 'desde', 80), c.cell, c.max);
    const stepped = str(ctx, 'modo', 'pasos') === 'pasos';
    const steps = stepped ? Math.round(num(ctx, 'pasos', 5)) : 0;
    const n = Number(ctx.params.pausas ?? 0);
    const k = n > 0 ? withHolds(p, n, num(ctx, 'pausa', 0.3)) : p;
    const cell = Math.round(cellAt(c.cell, from, k, steps) * 100) / 100;
    const eff: ClipEffect = { set: { [c.path]: cell } };
    if (stepped && bool(ctx, 'destello')) {
      const f = k * steps - Math.floor(k * steps);
      eff.finishes = [{ kind: 'glow', on: true, amount: 0.8 * (1 - smooth(f * 3)), params: { threshold: 0.3, radius: 30, strength: 1.5, tint: '#ffffff', blend: 'screen' } }];
    }
    return eff;
  },
});

/* ------------------------------------------------------------------ Hasta un solo glifo */

/** The cell a single glyph grows from: the brightest filled cell near a point (frame units). */
function seedCell(g: CellGrid, px: number, py: number): number {
  const G = geo(g);
  const c0 = clamp(Math.floor(px * G.cols), 0, G.cols - 1), r0 = clamp(Math.floor(py * G.rows), 0, G.rows - 1);
  let best = r0 * G.cols + c0, score = -Infinity;
  const R = 3;
  for (let r = Math.max(0, r0 - R); r <= Math.min(G.rows - 1, r0 + R); r++) for (let c = Math.max(0, c0 - R); c <= Math.min(G.cols - 1, c0 + R); c++) {
    const i = r * G.cols + c;
    const full = !g.chars || (g.chars[i] ?? ' ') !== ' ';
    const s = (full ? 1 : 0) + lumAt(g, i) - Math.hypot(c - c0, r - r0) * 0.05;
    if (s > score) { score = s; best = i; }
  }
  return best;
}

registerTemplate({
  id: 'un-glifo',
  name: 'Hasta un solo glifo',
  blurb: 'Las celdas crecen, la imagen pierde detalle y al final todo se pliega en un único glifo que llena el cuadro.',
  group: 'salida',
  kinds: ['glyphs', 'ascii'],
  dur: 3,
  params: [
    { key: 'hasta', label: 'Celda más grande', type: 'range', min: 16, max: 256, step: 1, def: 120, unit: 'px', help: 'Antes de plegarse. En capas ASCII el máximo es 96 px.' },
    { key: 'pliegue', label: 'Cuándo se pliega', type: 'range', min: 0.3, max: 0.9, step: 0.05, def: 0.6, help: 'Parte del clip que se va en crecer; el resto, en plegarse.' },
    { key: 'glifo', label: 'Glifo final', type: 'text', def: '', max: 2, help: 'Vacío: el carácter de la celda central.' },
    { key: 'pasos', label: 'Saltos al crecer', type: 'range', min: 0, max: 10, step: 1, def: 4, help: '0: continuo.' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const c = cellOf(ctx.layer);
    const p = ctx.p;
    if (!c || p <= 0) return null;
    const split = num(ctx, 'pliegue', 0.6);
    const to = clamp(num(ctx, 'hasta', 120), c.cell, c.max);
    const a = span01(p, 0, split);
    // growing: from own to `to` (the inverse direction of «De grueso a fino»)
    const cell = Math.round(cellAt(to, c.cell, a, Math.round(num(ctx, 'pasos', 4))) * 100) / 100;
    const eff: ClipEffect = { set: { [c.path]: cell } };
    const b = span01(p, split, 1);
    if (b <= 0) return eff;
    const glyph = str(ctx, 'glifo', '');
    const e = easeInOutCubic(b);
    const make = (g: CellGrid) => {
      const G = geo(g);
      const s = seedCell(g, 0.5, 0.5);
      const sc = s % G.cols, sr = (s / G.cols) | 0;
      const big = (Math.min(G.w, G.h) * 0.8) / Math.max(G.cw, G.ch);
      return (i: number, col: number, row: number) => {
        const tx = G.w / 2 - cellX(G, col), ty = G.h / 2 - cellY(G, row);
        if (i === s) {
          const f = { dx: tx * e, dy: ty * e, scale: 1 + (big - 1) * easeInCubic(b) };
          return glyph && b > 0.5 ? { ...f, glyph, visible: 1 } : f;
        }
        // the others fold into the centre and fade (the ones nearer the seed last)
        const d = Math.hypot(col - sc, row - sr) / Math.hypot(G.cols, G.rows);
        const q = clamp01(e * 1.35 - (1 - d) * 0.35);
        return { dx: tx * q, dy: ty * q, visible: 1 - smooth(q * 1.2), scale: 1 - q * 0.6 };
      };
    };
    return { ...eff, ...perCell(ctx, make, glyph ? { glyphs: glyph } : {}) };
  },
});

/* ------------------------------------------------------------------ Nace de un glifo */

registerTemplate({
  id: 'nace-de-un-glifo',
  name: 'Nace de un glifo',
  blurb: 'Primero hay un solo glifo grande; se encoge y de él brotan las demás celdas, que se van a su lugar en ondas, ramas o espiral.',
  group: 'entrada',
  kinds: ['glyphs', 'ascii'],
  dur: 3,
  params: [
    { key: 'glifo', label: 'Glifo inicial', type: 'text', def: '@', max: 2, help: 'Solo en capas de caracteres; en ASCII, la celda más clara cerca del punto.' },
    ...P.center(),
    { key: 'crecimiento', label: 'Cómo brota', type: 'select', options: [['ondas', 'En ondas'], ['ramas', 'En ramas'], ['espiral', 'En espiral']], def: 'ramas' },
    { key: 'vuelo', label: 'Vuelo de cada celda', type: 'range', min: 0.05, max: 0.6, step: 0.05, def: 0.25 },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const seed = hashString(ctx.seed);
    const px = num(ctx, 'x', 0.5), py = num(ctx, 'y', 0.5);
    const glyph = str(ctx, 'glifo', '@');
    const how = str(ctx, 'crecimiento', 'ramas');
    const fly = num(ctx, 'vuelo', 0.25);
    const shrink = span01(p, 0, 0.3);
    const grow = span01(p, 0.18, 1);
    return perCell(ctx, g => {
      const G = geo(g);
      const s = seedCell(g, px, py);
      const sx = cellX(G, s % G.cols), sy = cellY(G, (s / G.cols) | 0);
      // a picture tile (ASCII) blown up past 8× is only blocks: it stays a chunky pixel glyph instead
      const big = Math.min(ctx.layer.kind === 'glyphs' ? Infinity : 8, (Math.min(G.w, G.h) * 0.7) / Math.max(G.cw, G.ch));
      const diag = Math.hypot(G.w, G.h);
      return (i, c, r) => {
        if (i === s) {
          // the seed: big at the point, then back to its cell
          const k = easeInOutCubic(shrink);
          const f = { visible: 1, scale: big + (1 - big) * k, dx: (G.w * px - sx) * (1 - k), dy: (G.h * py - sy) * (1 - k) };
          return glyph && ctx.layer.kind === 'glyphs' && shrink < 1 ? { ...f, glyph } : shrink >= 1 ? null : f;
        }
        const x = cellX(G, c), y = cellY(G, r);
        let d = Math.hypot(x - sx, y - sy) / diag;
        if (how === 'ramas') d = d * (0.55 + 0.9 * (noise2(seed, x / diag * 7, y / diag * 7) * 0.5 + 0.5));
        else if (how === 'espiral') d = d * 0.7 + (((Math.atan2(y - sy, x - sx) / TAU) + 1) % 1) * 0.3;
        const start = clamp01(d) * (1 - fly);
        const q = clamp01((grow - start) / fly);
        if (q >= 1) return null;
        if (q <= 0) return { visible: 0 };
        const e = easeOutCubic(q);
        return { visible: Math.min(1, q * 3), dx: (sx - x) * (1 - e), dy: (sy - y) * (1 - e), scale: 0.3 + 0.7 * easeOutBack(q, 1.6) };
      };
    }, glyph ? { glyphs: glyph } : {});
  },
});

/* ------------------------------------------------------------------ Pixelado a nítido */

registerTemplate({
  id: 'pixelado',
  name: 'Pixelado a nítido',
  blurb: 'La capa llega en bloques grandes que se parten a la mitad una y otra vez hasta verse nítida. Funciona en cualquier capa.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 1.5,
  params: [
    { key: 'desde', label: 'Bloque inicial', type: 'range', min: 8, max: 128, step: 1, def: 64, unit: 'px' },
    { key: 'modo', label: 'Cómo cambia', type: 'select', options: [['mitades', 'A la mitad cada vez'], ['continuo', 'Continuo']], def: 'mitades' },
    { key: 'forma', label: 'Forma del bloque', type: 'select', options: [['square', 'Cuadrado'], ['circle', 'Círculo (LED)']], def: 'square' },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const from = num(ctx, 'desde', 64);
    let size: number;
    if (str(ctx, 'modo', 'mitades') === 'mitades') {
      const levels = Math.max(1, Math.floor(Math.log2(from / 2)));
      const k = Math.min(levels, Math.floor(p * (levels + 1)));
      if (k >= levels) return null;
      size = Math.max(2, Math.round(from / 2 ** k));
    } else {
      size = from * Math.pow(2 / from, p);
      if (size < 2.05) return null;
    }
    const f: Finish = { kind: 'pixelate', on: true, amount: 1, params: { size: Math.round(size * 10) / 10, shape: str(ctx, 'forma', 'square'), gap: 0 } };
    return { finishes: [f] };
  },
});

/* ------------------------------------------------------------------ Semitono que se afina */

registerTemplate({
  id: 'semitono',
  name: 'Semitono que se afina',
  blurb: 'Puntos de imprenta enormes que se hacen cada vez más finos y al final se funden con la imagen.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 2.5,
  params: [
    { key: 'forma', label: 'Forma', type: 'select', options: [['dot', 'Punto'], ['ellipse', 'Elipse'], ['square', 'Cuadrado'], ['line', 'Línea'], ['cross', 'Cruz']], def: 'dot' },
    { key: 'color', label: 'Color', type: 'select', options: [['tinta', 'Tinta sobre papel'], ['fuente', 'Color de la imagen'], ['cmyk', 'CMYK']], def: 'fuente' },
    { key: 'angulo', label: 'Ángulo', type: 'range', min: 0, max: 180, step: 1, def: 45, unit: '°' },
    { key: 'giro', label: 'Gira al afinarse', type: 'range', min: 0, max: 90, step: 1, def: 0, unit: '°' },
    { key: 'transparente', label: 'Papel transparente', type: 'toggle', def: false },
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const a = span01(p, 0, 0.8);
    const freq = 2.5 * Math.pow(40 / 2.5, easeInCubic(a) * 0.6 + a * 0.4);
    const amount = 1 - smooth(span01(p, 0.7, 1));
    const f: Finish = {
      kind: 'halftone', on: true, amount, params: {
        shape: str(ctx, 'forma', 'dot'), freq: Math.round(freq * 2) / 2, angle: (num(ctx, 'angulo', 45) + num(ctx, 'giro', 0) * a) % 180,
        color: str(ctx, 'color', 'fuente'), clear: bool(ctx, 'transparente'), paper: '#ede6da', ink: '#0c0b0a', contrast: 1.2, bright: 0,
      },
    };
    return { finishes: [f] };
  },
});

/* ------------------------------------------------------------------ Tramado que se afina */

registerTemplate({
  id: 'tramado',
  name: 'Tramado que se afina',
  blurb: 'Un tramado de 1 bit en píxeles gruesos gana tonos y resolución hasta volverse la imagen.',
  group: 'entrada',
  kinds: ALL_KINDS,
  dur: 2.5,
  params: [
    { key: 'metodo', label: 'Método', type: 'select', options: DITHER_ALGOS.filter(d => d.id !== 'riemersma').map(d => [d.id, d.name] as [string, string]), def: 'atkinson' },
    { key: 'color', label: 'Color', type: 'select', options: [['tonos', 'Tinta y papel'], ['rgb', 'Niveles por canal']], def: 'tonos' },
    { key: 'desde', label: 'Píxel inicial', type: 'range', min: 2, max: 24, step: 1, def: 12, unit: 'px' },
    P.color('tinta', 'Tinta', '#0c0b0a'),
    P.color('papel', 'Papel', '#ede6da'),
  ],
  apply(ctx: ClipContext): ClipEffect | null {
    const p = ctx.p;
    if (p >= 1) return null;
    const a = span01(p, 0, 0.78);
    const from = num(ctx, 'desde', 12);
    const pixel = Math.max(1, Math.round(from * Math.pow(1 / from, a)));
    const levels = Math.round(2 + 6 * a);
    const amount = 1 - smooth(span01(p, 0.72, 1));
    const f: Finish = {
      kind: 'dither', on: true, amount, params: {
        algo: str(ctx, 'metodo', 'atkinson'), color: str(ctx, 'color', 'tonos'), levels, pixel, ink: str(ctx, 'tinta', '#0c0b0a'), paper: str(ctx, 'papel', '#ede6da'),
        clear: false, serpentine: true, bright: 0, contrast: 1.15, linear: false,
      },
    };
    return { finishes: [f] };
  },
});
